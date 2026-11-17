// Plays Halcyon Heat in headless Chrome over the DevTools protocol: starts a new game from the
// title screen, walks, steals a car, drives, switches the radio, raises the wanted level and waits
// for the police, opens the map, starts the first mission, saves and loads, and fails on any
// console error, page exception or broken expectation.
//   node tools/playtest.mjs
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, serveStatic, watchErrors, sleep } from './cdp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = { KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyF: ['f', 70], KeyE: ['e', 69], KeyM: ['m', 77], KeyR: ['r', 82], KeyH: ['h', 72], Digit2: ['2', 50], Escape: ['Escape', 27], Enter: ['Enter', 13], F5: ['F5', 116], Space: [' ', 32], ShiftLeft: ['Shift', 16] };

async function main() {
  const server = await serveStatic(join(root, 'game'));
  const client = await launchChrome({ width: 1280, height: 800 });
  const errors = await watchErrors(client);
  await client.send('Page.enable');
  const failures = [];
  const check = (ok, what) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };
  const keyDown = (code) => client.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1] });
  const keyUp = (code) => client.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1] });
  const tap = async (code) => {
    await keyDown(code);
    await sleep(60);
    await keyUp(code);
    await frames(2);
  };
  const hold = async (code, ms) => {
    await keyDown(code);
    await sleep(ms);
    await keyUp(code);
    await frames(2);
  };
  const mouse = async (type, x, y, button = 'left', extra = {}) => client.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1, ...extra });
  const click = async (x, y, button = 'left') => {
    await mouse('mousePressed', x, y, button);
    await sleep(40);
    await mouse('mouseReleased', x, y, button);
  };
  const game = (expr) => client.eval(`(() => { const g = window.__game; return ${expr}; })()`);
  const run = (statements) => client.eval(`(() => { const g = window.__game; ${statements}; return true; })()`);
  /** Wait until the game loop has rendered `n` more frames (the software renderer is slow). */
  const frames = async (n = 2) => {
    const start = await game('g.frames');
    await client.waitFor(`window.__game.frames >= ${start + n}`, 30000, 50);
  };

  try {
    await client.send('Page.navigate', { url: `http://127.0.0.1:${server.port}/index.html?seed=7&lowfx=1` });
    await client.waitFor('window.__game && window.__game.state === "title"', 60000);
    check(true, 'title screen is up');
    // New Game: click the first menu button where it sits.
    const rect = await client.eval('(() => { const b = document.querySelector("#title-menu button"); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
    await click(rect[0], rect[1]);
    await client.waitFor('window.__game.state === "playing"', 10000);
    await frames(3);
    check(true, 'new game started from the title screen');
    const start = await game('({ x: g.player.x, z: g.player.z, money: g.economy.money })');
    check(start.money === 850, `starting cash is $850 (got ${start.money})`);

    // Walk forward with W, run with Shift.
    await hold('KeyW', 2000);
    await keyDown('ShiftLeft');
    await hold('KeyW', 1500);
    await keyUp('ShiftLeft');
    await frames(2);
    const walked = await game('Math.hypot(g.player.x - ' + start.x + ', g.player.z - ' + start.z + ')');
    check(walked > 3, `walked ${walked.toFixed(1)} m on foot`);
    // Look around with the mouse (drag).
    await mouse('mousePressed', 640, 400, 'left');
    for (let i = 0; i < 8; i += 1) await mouse('mouseMoved', 640 + i * 20, 400, 'left', { buttons: 1 });
    await mouse('mouseReleased', 800, 400, 'left');
    await tap('Space');

    // Steal the nearest parked car: step beside it, then F.
    const car = await game('(() => { const v = g.fleet.nearest(g.player.x, g.player.z, 400, (c) => c.kind === "parked" && !c.wrecked && c.model !== "bike"); return v && { x: v.x, z: v.z, yaw: v.yaw, model: v.model }; })()');
    check(!!car, `found a parked ${car && car.model} to steal`);
    await run(`g.player.setPosition(${car.x} + Math.cos(${car.yaw}) * 2.2, ${car.z} - Math.sin(${car.yaw}) * 2.2, ${car.yaw})`);
    await frames(2);
    await tap('KeyF');
    const inCar = await game('!!g.player.vehicle');
    check(inCar, 'pressed F and got into the car');
    check((await game('g.economy.state.stats.carsStolen')) >= 1, 'the theft counted in the stats');
    // Drive: hold W, steer a little, use the handbrake, honk, change the radio station.
    const before = await game('({ x: g.player.x, z: g.player.z })');
    await keyDown('KeyW');
    await sleep(2500);
    await keyDown('KeyA');
    await sleep(600);
    await keyUp('KeyA');
    await keyUp('KeyW');
    await frames(2);
    await tap('KeyH');
    const station0 = await game('g.radio.state.station');
    await tap('KeyR');
    const station1 = await game('g.radio.state.station');
    check(station1 !== station0, `radio switched station (${station0} -> ${station1})`);
    const drive = await game(`({ d: Math.hypot(g.player.x - ${before.x}, g.player.z - ${before.z}), speed: g.player.vehicle ? g.player.vehicle.speed : 0, kmh: Math.round(Math.abs(g.player.vehicle ? g.player.vehicle.speed : 0) * 3.6) })`);
    check(drive.d > 8, `drove ${drive.d.toFixed(1)} m (${drive.kmh} km/h at the end)`);
    await hold('Space', 800);
    // Out of the car, draw the pistol, aim and fire near people until the police take notice.
    await tap('KeyF');
    check(!(await game('!!g.player.vehicle')), 'got out of the car with F');
    await run('for (let k = 0; k < 6; k += 1) g.pedestrians.spawnAt(g.player.x + 6 + k * 2, g.player.z + 4)');
    await tap('Digit2');
    check((await game('g.arsenal.current')) === 'pistol', 'selected the pistol with 2');
    await mouse('mousePressed', 640, 400, 'right');
    for (let k = 0; k < 5; k += 1) {
      await click(640, 400, 'left');
      await frames(2);
    }
    await mouse('mouseReleased', 640, 400, 'right');
    await frames(2);
    const fired = await game('g.arsenal.clip.pistol < 12');
    check(fired, 'fired the pistol');
    const stars = await game('g.wanted.stars');
    check(stars >= 1, `wanted level rose to ${stars} star(s)`);
    let cops = 0;
    for (let t = 0; t < 40 && cops === 0; t += 1) {
      await sleep(500);
      cops = await game('g.police.cruisers.length');
    }
    check(cops > 0, `${cops} police cruiser(s) dispatched`);
    // The map opens and closes with M.
    await tap('KeyM');
    check((await game('g.state')) === 'map', 'M opened the pause map');
    await tap('KeyM');
    check((await game('g.state')) === 'playing', 'M closed the map');
    // Clear the heat and start the first mission by stepping into its marker.
    await run('g.wanted.clear(); g.police.reset()');
    const giver = await game('(() => { const m = g.missions.nextMission(); const p = g.layout.placeById[m.giver]; return { x: p.x, z: p.z, title: m.title }; })()');
    await run(`g.player.setPosition(${giver.x}, ${giver.z} + 4.5, Math.PI); g.camera.state.yaw = Math.PI`);
    await frames(2);
    await hold('KeyW', 900);
    await frames(2);
    const near = await game(`({ d: Math.hypot(g.player.x - ${giver.x}, g.player.z - ${giver.z}), state: g.state, active: g.missions.isActive(), x: g.player.x, z: g.player.z })`);
    check(near.active, `started the mission "${giver.title}" by walking into its marker (${near.d.toFixed(1)} m away, state ${near.state})`);
    check((await game('document.getElementById("objective").textContent.length')) > 10, 'objective line is on the HUD');
    // Save through the pause menu, then load it back.
    const pos = await game('({ x: g.player.x, z: g.player.z, money: g.economy.money })');
    await tap('Escape');
    check((await game('g.state')) === 'paused', 'Escape paused the game');
    const saveBtn = await client.eval('(() => { const b = [...document.querySelectorAll("#pause .menu button")].find((x) => x.textContent.startsWith("Save")); const r = b.getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2]; })()');
    await click(saveBtn[0], saveBtn[1]);
    await frames(2);
    const slot1 = await client.eval('(() => { const b = document.querySelector("#save-slots button"); const r = b.getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2]; })()');
    await click(slot1[0], slot1[1]);
    await frames(2);
    check((await game('g.state')) === 'playing', 'saved to slot 1 and resumed');
    const saved = await client.eval('!!localStorage.getItem("halcyon-heat-slot-1")');
    check(saved, 'slot 1 exists in localStorage');
    await run('g.player.setPosition(g.player.x + 50, g.player.z + 50, 0); g.economy.addMoney(999)');
    await frames(2);
    await tap('Escape');
    const loadBtn = await client.eval('(() => { const b = [...document.querySelectorAll("#pause .menu button")].find((x) => x.textContent.startsWith("Load")); const r = b.getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2]; })()');
    await click(loadBtn[0], loadBtn[1]);
    await frames(2);
    const loadSlot = await client.eval('(() => { const b = document.querySelector("#load-slots button"); const r = b.getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2]; })()');
    await click(loadSlot[0], loadSlot[1]);
    await frames(3);
    const after = await game('({ x: g.player.x, z: g.player.z, money: g.economy.money, state: g.state })');
    check(after.state === 'playing', 'loaded slot 1 and resumed');
    check(Math.hypot(after.x - pos.x, after.z - pos.z) < 3 && after.money === pos.money, `load restored position and $${after.money}`);
    // Quick save with F5 and the autosave.
    await tap('F5');
    check(await client.eval('!!localStorage.getItem("halcyon-heat-autosave")'), 'F5 quick-saved');
    // Let the world run a few seconds more and make sure the frame loop is alive.
    const t0 = await game('g.time');
    await sleep(2000);
    const t1 = await game('g.time');
    check(t1 > t0 + 0.5, `game clock advanced ${(t1 - t0).toFixed(2)} s in 2 s of waiting`);
  } catch (err) {
    failures.push(`exception in the playtest: ${err.message}`);
    console.error(err);
  }
  if (errors.length) {
    console.error(`${errors.length} page error(s):`);
    for (const e of errors) console.error(`  ${e}`);
  }
  client.close();
  server.close();
  const ok = failures.length === 0 && errors.length === 0;
  console.log(ok ? 'PLAYTEST PASSED' : `PLAYTEST FAILED (${failures.length} failed checks, ${errors.length} page errors)`);
  process.exit(ok ? 0 : 1);
}

main();
