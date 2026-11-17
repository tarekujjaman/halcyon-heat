// Shared plumbing for the screenshot and playtest tools (Node standard library only): a static
// server for game/, a headless Chrome launcher with software WebGL, and a tiny DevTools protocol
// client over Node's built-in WebSocket.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

export const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
};

/** Serve `root` on 127.0.0.1 at a free port; resolves to { port, close }. */
export function serveStatic(root) {
  const base = resolve(root);
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(join(base, normalize(pathname)));
    if (file !== base && !file.startsWith(base + sep)) {
      response.writeHead(403).end();
      return;
    }
    let size;
    try {
      const st = statSync(file);
      if (!st.isFile()) throw new Error('not a file');
      size = st.size;
    } catch {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': size, 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      resolveServer({ port: server.address().port, close: () => server.close() });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Launch headless Chrome with software WebGL and connect to its first page; resolves to a CDP client. */
export async function launchChrome({ width = 1280, height = 800 } = {}) {
  const userData = mkdtempSync(join(tmpdir(), 'halcyon-chrome-'));
  const debugPort = 9222 + Math.floor(Math.random() * 1000);
  const args = [
    '--headless=new', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${userData}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-unsafe-webgpu',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', `--window-size=${width},${height}`, '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', 'about:blank',
  ];
  const proc = spawn(CHROME_PATH, args, { stdio: 'ignore' });
  let version = null;
  for (let attempt = 0; attempt < 100 && !version; attempt += 1) {
    await sleep(150);
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (res.ok) version = await res.json();
    } catch {
      // Chrome is still starting.
    }
  }
  if (!version) {
    proc.kill();
    throw new Error('Chrome did not start (is CHROME_PATH right?)');
  }
  const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const client = await connect(page.webSocketDebuggerUrl);
  client.close = () => {
    try {
      client.ws.close();
    } catch {
      // Already closed.
    }
    proc.kill();
    setTimeout(() => {
      try {
        rmSync(userData, { recursive: true, force: true });
      } catch {
        // The profile directory may still be locked for a moment; it lives in the temp folder anyway.
      }
    }, 500);
  };
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return client;
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', rejectOpen, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolveCall, rejectCall } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rejectCall(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolveCall(msg.result);
    } else if (msg.method) {
      const list = listeners.get(msg.method);
      if (list) for (const fn of list) fn(msg.params);
    }
  });
  return {
    ws,
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolveCall, rejectCall) => {
        pending.set(id, { resolveCall, rejectCall });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    },
    /** Evaluate an expression in the page and return its value. */
    async eval(expression, awaitPromise = false) {
      const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
      if (result.exceptionDetails) throw new Error(`page threw: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`);
      return result.result.value;
    },
    /** Poll until `expression` is truthy or `timeoutMs` passes. */
    async waitFor(expression, timeoutMs = 120000, every = 250) {
      const start = Date.now();
      for (;;) {
        let value = false;
        try {
          value = await this.eval(expression);
        } catch {
          value = false;
        }
        if (value) return value;
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${expression}`);
        await sleep(every);
      }
    },
  };
}

/** Collect console errors, uncaught exceptions and failed loads; returns the list (filled as they happen). */
export async function watchErrors(client) {
  const errors = [];
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  client.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  });
  client.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    errors.push(`exception: ${d.exception?.description ?? d.text} at ${d.url ?? ''}:${d.lineNumber ?? ''}`);
  });
  client.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') errors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`);
  });
  return errors;
}

export { sleep };
