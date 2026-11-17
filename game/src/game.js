// The game itself: bootHalcyonHeat builds the renderer, the city and every system, then runs one
// loop: read input, advance the clock, step Sol or her car, traffic, pedestrians, police, gangs,
// missions and activities, update the HUD and camera, render. It owns the game states (title,
// playing, paused, map, mission passed, busted), the crime callbacks that feed the wanted level,
// saving and loading, and the screenshot mode (?shot=<name>&seed=<n> sets window.__shotReady).
import * as THREE from 'three';
import { DISTRICTS, TIME, ECONOMY, CAMERA } from './config.js';
import { MISSIONS } from './missions/story.js';
import { createWanted } from './wanted.js';
import { createArsenal, WEAPON_ORDER } from './weapons.js';
import { createEconomy } from './economy.js';
import { saveSystem } from './save.js';
import { createRadio } from './radio.js';
import { createAudio } from './audio.js';
import { createMissions } from './missions/missions.js';
import { createPolice } from './police.js';
import { createGangs } from './gangs.js';
import { createCombat } from './combat.js';
import { createActivities } from './activities.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createDriving } from './driving.js';
import { createFleet } from './vehicles/fleet.js';
import { kmh } from './vehicles/physics.js';
import { createHud } from './hud/hud.js';
import { createMinimap } from './hud/minimap.js';
import { createMapScreen } from './mapscreen.js';
import { createMenus } from './menus.js';
import { createPlayer } from './player.js';
import { createCamera } from './camera.js';
import { createFigures } from './figures.js';
import { createEffects } from './effects.js';
import { createMarkers } from './markers.js';
import { createInput } from './input.js';
import { createSky } from './sky.js';
import { createLayout } from './city/layout.js';
import { buildRoads } from './city/roads.js';
import { buildBuildings } from './city/buildings.js';
import { buildProps } from './city/props.js';
import { buildBeach } from './city/beach.js';
import { createTextures } from './textures.js';
import { createRng } from './rng.js';
import { stageShot } from './shots.js';

/** Build Halcyon Bay and start the game (or a screenshot scene). Returns the game object. */
export function bootHalcyonHeat() {

  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
  const shotName = params.get('shot');
  if (shotName) {
    // Screenshots are reproducible: every Math.random in the game draws from the seed.
    const rng = createRng(seed * 7919 + 13);
    Math.random = () => rng.next();
  }

  const canvas = document.getElementById('game');
  const ui = document.getElementById('ui');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // ?lowfx drops resolution and shadows (software renderers and the playtest).
  const lowfx = params.has('lowfx');
  renderer.setPixelRatio(lowfx ? 0.5 : Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = !lowfx;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const layout = createLayout(seed);
  const textures = createTextures();
  scene.add(buildRoads(layout, textures));
  const buildings = buildBuildings(layout, textures);
  scene.add(buildings.group);
  const props = buildProps(layout, textures);
  scene.add(props.group);
  const beach = buildBeach(layout, textures);
  scene.add(beach.group);
  const sky = createSky(scene, renderer);
  const input = createInput(canvas);
  const player = createPlayer(scene, layout);
  const cam = createCamera(layout);
  const figures = createFigures(scene, 180);
  const effects = createEffects(scene, textures);
  const fleet = createFleet(scene, effects);
  const traffic = createTraffic(layout, fleet, effects);
  const pedestrians = createPedestrians(layout, figures, effects);
  const minimap = createMinimap(layout);
  const hud = createHud(ui, minimap);
  const markers = createMarkers(scene);
  const audio = createAudio();
  const radio = createRadio(audio);

  const game = {
    scene, renderer, layout, textures, sky, input, player, camera: cam, figures, effects, fleet, traffic, pedestrians, hud, minimap, markers,
    buildings, props, beach, audio, radio,
    time: 0,
    frames: 0,
    state: 'title',
    settings: { volume: 0.8, music: 0.6, sfx: 0.9, sensitivity: 1, shadows: true, ...saveSystem.loadSettings() },
    timers: [],
    shot: null,
  };
  game.arsenal = createArsenal();
  game.combat = createCombat(game);
  game.wanted = createWanted(game);
  game.police = createPolice(game);
  game.gangs = createGangs(game);
  game.economy = createEconomy(game);
  game.driving = createDriving(game);
  game.missions = createMissions(game);
  game.activities = createActivities(game);
  game.mapScreen = createMapScreen(ui, game);
  const { driving, wanted, police, gangs, economy, missions, activities, arsenal, combat, mapScreen } = game;

  /** Run `fn` after `seconds` of game time (pauses with the game). */
  const after = (seconds, fn) => game.timers.push({ at: game.time + seconds, fn });

  // ------------------------------------------------------------------ settings and audio
  function applySettings(s) {
    Object.assign(game.settings, s);
    audio.setVolumes({ volume: s.volume, music: s.music, sfx: s.sfx });
    cam.state.sensitivity = CAMERA.sensitivity * s.sensitivity;
    renderer.shadowMap.enabled = s.shadows !== false && !lowfx;
    sky.sun.castShadow = s.shadows !== false && !lowfx;
    saveSystem.saveSettings(game.settings);
  }
  applySettings(game.settings);
  const unlockAudio = () => {
    if (audio.unlock()) audio.setVolumes({ volume: game.settings.volume, music: game.settings.music, sfx: game.settings.sfx });
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // ------------------------------------------------------------------ menus and states
  const menus = createMenus(ui, {
    newGame: () => newGame(),
    continueGame: () => {
      const data = saveSystem.latest();
      if (data) loadFrom(data);
    },
    loadSlot: (slot) => {
      const data = saveSystem.load(slot);
      if (data) loadFrom(data);
      else hud.notify('That slot is empty', 'warn');
    },
    saveSlot: (slot) => {
      if (saveSystem.save(slot, serialize())) hud.notify(`Saved to slot ${slot}`, 'reward');
      else hud.notify('Could not save (storage unavailable)', 'warn');
      resume();
    },
    resume: () => resume(),
    openMap: () => openMap(),
    quitToTitle: () => showTitle(),
    getSettings: () => game.settings,
    applySettings,
    sound: (kind) => audio.ui(kind),
  });
  game.menus = menus;

  function setState(s) {
    game.state = s;
    const playing = s === 'playing';
    input.setLockWanted(playing);
    hud.show(s !== 'title');
    if (!playing && player.vehicle) audio.engine(0, 0, false);
    radio.setPlaying(playing && !!player.vehicle && radio.state.station !== 3);
  }
  function showTitle() {
    menus.hide();
    mapScreen.close();
    if (player.vehicle) driving.exit();
    hud.setObjective(null);
    hud.bigText(null);
    menus.show('title');
    setState('title');
  }
  game.showTitle = showTitle;
  function resume() {
    menus.hide();
    mapScreen.close();
    setState('playing');
  }
  function pause() {
    menus.show('pause');
    setState('paused');
  }
  function openMap() {
    menus.hide();
    mapScreen.open();
    setState('map');
  }
  game.openMap = openMap;

  // ------------------------------------------------------------------ a new game, saving, loading
  function resetWorld() {
    if (player.vehicle) driving.exit();
    missions.abort();
    police.reset();
    gangs.reset();
    wanted.clear();
    for (const v of [...fleet.vehicles]) if (v.kind !== 'parked' || v.resprayed) fleet.remove(v);
    for (const p of traffic.parked) if (!fleet.vehicles.includes(p)) {
      // Parked cars that were driven off come back to their spots on a fresh game.
    }
    for (const p of [...pedestrians.peds]) {
      figures.release(p.slot);
    }
    pedestrians.peds.length = 0;
    game.timers.length = 0;
    player.dead = false;
    player.health = player.maxHealth;
    player.armor = 0;
    hud.bigText(null);
    hud.fade(0, 0.3);
  }
  function prewarm(seconds) {
    for (let t = 0; t < seconds; t += 0.1) {
      traffic.update(0.1, player, game.time + t);
      pedestrians.update(0.1, player, player.vehicle);
    }
  }
  function newGame() {
    resetWorld();
    economy.restore({ money: ECONOMY.startMoney, rep: 0, safehouses: ['motel'], stats: {} });
    arsenal.restore({ current: 'fists', owned: { fists: true, pistol: true }, ammo: { pistol: 60, smg: 0, shotgun: 0 }, clip: { pistol: 12, smg: 0, shotgun: 0 } });
    missions.markComplete([]);
    activities.restore({ collected: [] });
    sky.setHour(TIME.startHour);
    const start = layout.placeById.motel;
    player.setPosition(start.x - 2, start.z + 6, Math.PI);
    cam.settleBehind(player.yaw, 0.25);
    prewarm(5);
    hud.setMoney(economy.money, true);
    resume();
    hud.notify('Welcome to Halcyon Bay, Sol', 'reward');
    after(2, () => hud.subtitle('Sol', 'Three years away. Same sun, same sea. Let me find Uncle Teo.', 5));
    after(4, () => hud.notify('Follow the M marker to start a mission', ''));
  }
  function serialize() {
    return {
      summary: { missions: missions.state.completed.length, total: MISSIONS.length, money: economy.money, title: economy.title() },
      player: { x: player.x, z: player.z, yaw: player.yaw, health: player.health, armor: player.armor },
      economy: economy.serialize(),
      arsenal: arsenal.serialize(),
      missions: { completed: [...missions.state.completed] },
      activities: activities.serialize(),
      hour: sky.hour,
      radio: radio.state.station,
    };
  }
  game.serialize = serialize;
  function loadFrom(data) {
    resetWorld();
    economy.restore(data.economy);
    arsenal.restore(data.arsenal);
    missions.markComplete(data.missions ? data.missions.completed : []);
    activities.restore(data.activities);
    if (typeof data.hour === 'number') sky.setHour(data.hour);
    if (typeof data.radio === 'number') radio.setStation(data.radio);
    const p = data.player || {};
    player.setPosition(p.x ?? layout.placeById.motel.x, p.z ?? layout.placeById.motel.z, p.yaw ?? 0);
    player.health = p.health ?? player.maxHealth;
    player.armor = p.armor ?? 0;
    cam.settleBehind(player.yaw, 0.25);
    prewarm(4);
    hud.setMoney(economy.money, true);
    resume();
    hud.notify('Game loaded', 'reward');
  }
  game.loadFrom = loadFrom;
  function autosave() {
    if (saveSystem.autosave(serialize())) hud.notify('Autosaved', '');
  }

  // ------------------------------------------------------------------ busted: arrest and hospital
  function busted(kind) {
    if (game.state === 'busted') return;
    setState('busted');
    hud.fade(1, 0.7);
    const fee = Math.min(economy.money, Math.round(economy.money * (kind === 'arrest' ? ECONOMY.arrestFee : ECONOMY.hospitalFee) + 100));
    after(0.8, () => {
      hud.bigText(kind === 'arrest' ? 'ARRESTED' : 'HOSPITALIZED', kind === 'arrest' ? `Bail and impound: $${fee.toLocaleString('en-US')}` : `Medical fees: $${fee.toLocaleString('en-US')}`);
      if (audio) audio.ui('fail');
    });
    after(3.2, () => {
      if (missions.isActive()) missions.fail(kind === 'arrest' ? 'You were arrested' : 'You were hospitalized');
      if (player.vehicle) driving.exit();
      economy.spend(fee);
      economy.stat(kind === 'arrest' ? 'timesArrested' : 'timesHospitalized');
      wanted.clear();
      police.reset();
      gangs.state.hostile = false;
      player.dead = false;
      player.health = player.maxHealth;
      if (kind === 'arrest') arsenal.restore({ current: 'fists', owned: arsenal.owned, ammo: { pistol: Math.min(arsenal.ammo.pistol, 24), smg: Math.min(arsenal.ammo.smg, 60), shotgun: Math.min(arsenal.ammo.shotgun, 12) }, clip: arsenal.clip });
      const spot = layout.placeById[kind === 'arrest' ? 'police' : 'hospital'];
      player.setPosition(spot.x + Math.sin(spot.heading) * -2, spot.z + Math.cos(spot.heading) * -2, spot.heading + Math.PI);
      cam.settleBehind(player.yaw, 0.25);
      for (const p of [...pedestrians.peds]) {
        figures.release(p.slot);
      }
      pedestrians.peds.length = 0;
      prewarm(3);
    });
    after(4.2, () => {
      hud.bigText(null);
      hud.fade(0, 0.8);
      setState('playing');
    });
  }
  game.onArrested = () => busted('arrest');
  game.onPlayerDeath = () => busted('hospital');

  // ------------------------------------------------------------------ crime and event callbacks
  let shootHeatCooldown = 0;
  const witnessNear = (r) => pedestrians.peds.some((p) => p.state !== 'dead' && Math.hypot(p.x - player.x, p.z - player.z) < r)
    || police.officers.some((o) => Math.hypot(o.x - player.x, o.z - player.z) < r * 1.6)
    || police.cruisers.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < r * 1.6);
  game.onEnterVehicle = (v, wasKind, hadDriver) => {
    if (wasKind !== 'player' && wasKind !== 'mission') economy.stat('carsStolen');
    if (wasKind === 'police') wanted.crime('stealCar', 1.6);
    else if (hadDriver) wanted.crime('stealCar');
    else if (wasKind === 'parked' && witnessNear(22)) wanted.crime('stealCar', 0.5);
    hud.notify(`${v.spec.name}`, '');
    radio.setPlaying(game.state === 'playing' && radio.state.station !== 3);
    hud.setRadio(radio.stationName);
    player.showWeapon(false);
  };
  game.onExitVehicle = () => {
    radio.setPlaying(false);
    hud.setRadio(null);
    audio.engine(0, 0, false);
    player.showWeapon(arsenal.current !== 'fists');
  };
  game.onPlayerHitPed = () => {
    wanted.crime('hitPedestrian');
    economy.stat('kills');
  };
  game.onPlayerHitCar = () => {};
  game.onPlayerShot = () => {
    if (shootHeatCooldown <= 0 && witnessNear(45)) {
      wanted.crime('shoot');
      shootHeatCooldown = 2.5;
    }
  };
  game.onPlayerShotPerson = (npc, kind, died) => {
    if (kind === 'police') wanted.crime('attackPolice', died ? 1 : 0.5);
    else if (kind === 'ped') {
      if (died) {
        wanted.crime('killPedestrian');
        economy.stat('kills');
      } else wanted.crime('shoot', 0.5);
    }
  };
  game.onPlayerPunched = (npc, kind, died) => {
    if (kind === 'police') wanted.crime('attackPolice', 0.5);
    else if (kind === 'ped' && witnessNear(30)) wanted.crime(25);
    if (died && kind === 'ped') economy.stat('kills');
  };
  game.onGangKilled = (m) => {
    economy.stat('gangKills');
    economy.addRep(m.boss ? 60 : 6);
    if (m.cash) economy.addMoney(m.cash, m.boss ? "from Kane's pockets" : 'from a Tidebreaker');
  };
  game.onVehicleWrecked = (v, shooter) => {
    if (shooter === player && witnessNear(60)) wanted.crime('destroyCar');
    if (audio) audio.explosion();
    if (v.kind === 'police') wanted.crime('attackPolice', 0.6);
  };
  game.onEvaded = () => economy.stat('copsEvaded');
  game.onMissionComplete = (info) => {
    autosave();
    menus.show('mission-complete', info);
    setState('missionComplete');
  };
  game.openSafehouse = (place) => {
    player.health = player.maxHealth;
    player.armor = Math.max(player.armor, 50);
    arsenal.restock();
    hud.notify(`Rested at ${place.name}: health, armour and ammo restored`, 'reward');
    menus.show('save');
    setState('paused');
  };
  player.onStep = (running) => audio.footstep(running);

  // ------------------------------------------------------------------ setup
  traffic.init();
  activities.init();
  missions.placeGivers();
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    cam.resize();
  });

  const titleOrbit = { angle: 0 };
  const titleFocus = { x: layout.placeById.plaza.x, z: layout.placeById.plaza.z };

  function handleGlobalKeys() {
    const code = input.state.lastCode;
    if (!input.state.anyKey) return;
    if (game.state === 'map') {
      if (input.justPressed('map') || input.justPressed('pause')) resume();
      return;
    }
    if (menus.current) {
      if (menus.key(code)) return;
    }
    if (game.state === 'playing') {
      if (input.justPressed('pause')) pause();
      else if (input.justPressed('map')) openMap();
      else if (input.justPressed('quickSave')) {
        if (saveSystem.autosave(serialize())) hud.notify('Quick saved', 'reward');
      }
    } else if (game.state === 'paused' && input.justPressed('pause') && !menus.current) resume();
  }

  function stepPlaying(dt, controls) {
    const axes = controls && controls.axes ? controls.axes : input.axes();
    cam.look(input.state.mouseDX, input.state.mouseDY);
    shootHeatCooldown -= dt;
    arsenal.update(dt);
    if (player.vehicle) {
      if (input.justPressed('enterCar')) driving.exit();
      else driving.update(dt, input, controls);
      if (input.justPressed('radio') && player.vehicle) {
        radio.next();
        radio.setPlaying(radio.state.station !== 3);
        hud.setRadio(radio.stationName);
        hud.notify(radio.stationName, '');
      }
      if (player.vehicle) {
        const v = player.vehicle;
        const frac = Math.min(1, Math.abs(v.speed) / v.spec.maxSpeed);
        const rpm = ((frac * 3.2) % 1) * 0.55 + frac * 0.45;
        audio.engine(rpm, Math.abs(axes.y), true);
        economy.stat('distanceDriven', Math.abs(v.speed) * dt);
      }
    } else {
      const aiming = (controls && controls.aim) || input.state.mouseDown[2];
      player.update(dt, axes, cam.state.yaw, input.isDown('run'), input.justPressed('jump'), aiming);
      driving.pushPlayerOutOfCars();
      economy.stat('distanceWalked', player.speed * dt);
      if (input.justPressed('enterCar')) {
        const car = driving.nearestCar();
        if (car) driving.enter(car);
      }
      // Weapons: select with 1-4 or the wheel, reload with Q, fire with the left button.
      for (let k = 0; k < 4; k += 1) if (input.justPressed(`weapon${k + 1}`)) arsenal.select(WEAPON_ORDER[k]);
      if (input.state.wheel !== 0) arsenal.cycle(input.state.wheel > 0 ? 1 : -1);
      if (input.justPressed('reload')) arsenal.reload();
      player.showWeapon(arsenal.current !== 'fists');
      const wantFire = (controls && controls.fire) || (arsenal.spec.auto ? input.state.mouseDown[0] : input.state.mousePressed[0]);
      if (wantFire) {
        if (arsenal.spec.melee) combat.punch();
        else combat.playerShoot(arsenal, cam.state.yaw, -cam.state.pitch + 0.03);
      }
      hud.showCrosshair(aiming || (controls && controls.aim));
      // E: the context action.
      const prompt = activities.prompt();
      const near = driving.nearestCar();
      if (prompt) hud.showInteract('E', prompt.text);
      else if (near) hud.showInteract('F', `Take the ${near.spec.name}`);
      else hud.hideInteract();
      if (prompt && input.justPressed('interact')) prompt.run();
    }
    if (player.vehicle) {
      const prompt = activities.prompt();
      if (prompt) {
        hud.showInteract('E', prompt.text);
        if (input.justPressed('interact')) prompt.run();
      } else hud.hideInteract();
    }
    traffic.update(dt, player, game.time);
    pedestrians.update(dt, player, player.vehicle);
    driving.collide();
    police.update(dt);
    gangs.update(dt);
    wanted.update(dt, police.state.seen, player.x, player.z);
    missions.update(dt);
    activities.update(dt);
    markers.update(dt, game.time);
    economy.stat('playTime', dt);
  }

  function updateHud(dt) {
    const v = player.vehicle;
    hud.setHealth(player.health, player.maxHealth);
    hud.setArmor(player.armor, 100);
    hud.setStars(wanted.stars, wanted.state.seen && !wanted.state.searching);
    hud.setWantedBanner(wanted.stars > 0 ? (wanted.state.searching ? 'EVADING: STAY OUT OF THE SEARCH ZONE' : 'WANTED') : null);
    hud.setSpeed(v ? kmh(v) : null);
    const w = arsenal.hudInfo();
    hud.setWeapon(w.name, w.ammo, w.clip);
    hud.setDistrict(DISTRICTS[layout.districtAt(player.x, player.z)].name);
    if (!missions.isActive() && !activities.state.race && !activities.state.fare) {
      const next = missions.nextMission();
      hud.setObjective(next ? `${next.title} at ${next.giverLabel}` : null, 'Next job');
    }
    const blips = [...missions.blips(), ...activities.blips()];
    for (const c of police.cruisers) if (!c.wrecked) blips.push({ x: c.x, z: c.z, kind: 'police', color: '#3b7bff' });
    for (const o of police.officers) if (o.state !== 'dead') blips.push({ x: o.x, z: o.z, kind: 'police', color: '#7fb6ff' });
    if (police.heliState.active) blips.push({ x: police.heliState.x, z: police.heliState.z, kind: 'heli', color: '#3b7bff' });
    if (mapScreen.waypoint) blips.push({ x: mapScreen.waypoint.x, z: mapScreen.waypoint.z, kind: 'waypoint', color: '#c58cff' });
    if (game.shot) game.shot.beforeHud();
    hud.drawMinimap(player.x, player.z, cam.state.yaw, blips, wanted.searchCircle(), v ? 0.7 : 0.95);
    hud.update(dt);
  }

  function step(dt, controls = null) {
    game.time += dt;
    for (let i = game.timers.length - 1; i >= 0; i -= 1) {
      if (game.time >= game.timers[i].at) {
        const t = game.timers.splice(i, 1)[0];
        t.fn();
      }
    }
    handleGlobalKeys();
    if (game.state === 'playing') {
      sky.advance(dt);
      stepPlaying(dt, controls);
    } else if (game.state === 'title') {
      titleOrbit.angle += dt * 0.05;
      const r = 180;
      cam.camera.position.set(titleFocus.x + Math.cos(titleOrbit.angle) * r, 70 + Math.sin(titleOrbit.angle * 0.7) * 10, titleFocus.z + Math.sin(titleOrbit.angle) * r);
      cam.camera.lookAt(titleFocus.x, 20, titleFocus.z);
      traffic.update(dt, { x: titleFocus.x, z: titleFocus.z, vehicle: null }, game.time);
      pedestrians.update(dt, { x: titleFocus.x, z: titleFocus.z, vehicle: null }, null);
    } else if (game.state === 'busted') {
      police.update(dt);
      traffic.update(dt, player, game.time);
      pedestrians.update(dt, player, player.vehicle);
    }
    props.updateLights(game.time);
    const v = player.vehicle;
    if (game.state !== 'title') cam.update(dt, player, v, !v && (input.state.mouseDown[2] || (controls && controls.aim)), v ? v.speed : 0);
    fleet.render(dt, sky.night, game.time);
    figures.commit();
    effects.update(dt, cam.camera);
    beach.update(game.time);
    beach.setSun(sky.sunDir, sky.sunColor, sky.fogColor, sky.night);
    buildings.setNight(sky.night);
    props.setNight(sky.night);
    sky.update(dt, game.state === 'title' ? titleFocus : player, game.time);
    audio.update(dt);
    radio.update();
    updateHud(dt);
    input.endFrame();
  }

  let last = performance.now();
  let frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    // Slow frames are split into substeps of at most 50 ms so the clock keeps real time down to 5 fps.
    const elapsed = Math.min(0.2, (now - last) / 1000);
    last = now;
    const substeps = Math.min(4, Math.max(1, Math.ceil(elapsed / 0.05)));
    for (let i = 0; i < substeps; i += 1) step(elapsed / substeps);
    game.frames += 1;
    renderer.render(scene, cam.camera);
  }

  function runShot(name) {
    const start = layout.placeById.motel;
    player.setPosition(start.x - 2, start.z + 6, Math.PI);
    setState('playing');
    const shot = stageShot(name, game);
    game.shot = shot;
    input.setLockWanted(false);
    for (let i = 0; i < shot.steps; i += 1) step(shot.dt, shot.controls());
    hud.clearNotes();
    shot.finish();
    const hourOverride = Number(params.get('hour'));
    if (params.get('hour') && Number.isFinite(hourOverride)) {
      sky.setHour(hourOverride);
      buildings.setNight(sky.night);
      props.setNight(sky.night);
      beach.setSun(sky.sunDir, sky.sunColor, sky.fogColor, sky.night);
    }
    // Refresh what the staging touched after the last step: effects, car instances, figures, markers.
    effects.update(1 / 60, cam.camera);
    fleet.render(0, sky.night, game.time);
    figures.commit();
    markers.update(0, game.time);
    updateHud(0);
    const paint = () => {
      renderer.render(scene, cam.camera);
      frames += 1;
      if (frames < 3) requestAnimationFrame(paint);
      else window.__shotReady = true;
    };
    requestAnimationFrame(paint);
  }

  window.__game = game;
  if (shotName) runShot(shotName);
  else {
    const hourParam = Number(params.get('hour'));
    if (Number.isFinite(hourParam) && params.get('hour')) sky.setHour(hourParam);
    showTitle();
    requestAnimationFrame(frame);
  }

  return game;
}
