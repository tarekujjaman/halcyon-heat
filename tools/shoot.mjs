// Takes the entry's screenshots: serves game/, opens each scene of shots.json in headless Chrome
// (software WebGL, 1280x800), waits for the game to report the frame ready (window.__shotReady),
// and saves a JPEG under 256 KiB to screenshots/. Fails loudly on any console error or exception.
//   node tools/shoot.mjs                 every scene in shots.json
//   node tools/shoot.mjs --only 1-chase  one scene by name prefix
//   node tools/shoot.mjs --url "?shot=city&seed=1" --out tmp/test.jpg   an ad hoc frame
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, serveStatic, watchErrors, sleep } from './cdp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 256 * 1024;
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

async function captureUnderCap(client) {
  for (let quality = 88; quality >= 30; quality -= 8) {
    const { data } = await client.send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length <= MAX_BYTES) return { bytes, quality };
  }
  throw new Error('could not fit the screenshot under 256 KiB');
}

async function main() {
  const width = Number(argValue('--width') ?? 1280);
  const height = Number(argValue('--height') ?? 800);
  let scenes;
  const adHoc = argValue('--url');
  if (adHoc) scenes = [{ name: argValue('--out') ?? 'tmp/shot.jpg', query: adHoc, adHoc: true }];
  else {
    scenes = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
    const only = argValue('--only');
    if (only) scenes = scenes.filter((s) => s.name.startsWith(only));
  }
  const server = await serveStatic(join(root, 'game'));
  const client = await launchChrome({ width, height });
  const errors = await watchErrors(client);
  await client.send('Page.enable');
  let failed = false;
  try {
    for (const scene of scenes) {
      const url = `http://127.0.0.1:${server.port}/index.html${scene.query}`;
      const started = Date.now();
      await client.send('Page.navigate', { url });
      await client.waitFor('window.__shotReady === true', 240000, 300);
      await sleep(400);
      const expression = argValue('--eval');
      if (expression) console.log(JSON.stringify(await client.eval(expression), null, 1));
      const { bytes, quality } = await captureUnderCap(client);
      const out = scene.adHoc ? resolve(root, scene.name) : join(root, 'screenshots', scene.name);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, bytes);
      console.log(`${scene.name}: ${bytes.length} bytes at quality ${quality} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    }
  } catch (err) {
    failed = true;
    console.error(`shoot failed: ${err.message}`);
  }
  if (errors.length) {
    failed = true;
    console.error(`${errors.length} page error(s):`);
    for (const e of errors) console.error(`  ${e}`);
  }
  client.close();
  server.close();
  process.exit(failed ? 1 : 0);
}

main();
