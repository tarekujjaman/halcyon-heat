// Side activities around the bay: three street races with checkpoint gates and AI racers, taxi
// fares when Sol drives a Bay Cab, twenty sea-glass shards hidden along the coast, resprays at the
// body shops that wipe the wanted level, and safehouses to buy, rest in and save at.
import { ECONOMY, LANES } from './config.js';
import { createRng } from './rng.js';
import { lanePoint } from './city/layout.js';
import { stepVehicle } from './vehicles/physics.js';
import { PAINTS } from './vehicles/models.js';

export function createActivities(game) {
  const { layout, player, markers, hud, economy, fleet } = game;
  const rng = createRng(layout.seed + 2024);
  const node = (i, j) => layout.nodes[j * (layout.roadX.length) + i];
  const RACES = [
    { id: 'strand', name: 'Ocean Drive Sprint', startNode: [0, 9], path: [[0, 7], [0, 5], [0, 3], [0, 1], [1, 0], [3, 0]], rewards: [2000, 800, 300] },
    { id: 'downtown', name: 'Glasswater Circuit', startNode: [2, 5], path: [[2, 2], [5, 2], [5, 5], [3, 5], [3, 3], [6, 3], [6, 1]], rewards: [2500, 1000, 400] },
    { id: 'docks', name: 'Dockside Dash', startNode: [9, 1], path: [[9, 0], [6, 0], [4, 0], [4, 2], [7, 2], [9, 3], [9, 6], [7, 7]], rewards: [3000, 1200, 500] },
  ];
  const state = {
    race: null,
    racers: [],
    fare: null,
    shards: [],
    collected: [],
    resprayCooldown: 0,
    prompt: null,
  };

  // Shard spots along the coast, pier, canal, plaza, park and docks.
  const shardSpots = [];
  const pierX = layout.pier.x0 + 12;
  const spots = [
    [-40, 40], [-55, 130], [-30, 220], [-60, 300], [pierX, layout.pier.z0 + 3], [layout.pier.x0 + 60, layout.pier.z1 - 2], [-45, 420], [-35, 520], [-58, 640], [-30, 720],
    [layout.placeById.plaza.x - 12, layout.placeById.plaza.z + 16], [layout.placeById.park.x + 10, layout.placeById.park.z + 30],
    [layout.roadX[2] + 20, layout.canal.z0 - 1.5], [layout.roadX[7] - 20, layout.canal.z1 + 1.5], [layout.roadX[4], -CITY_QUAY], [layout.roadX[8] + 30, -CITY_QUAY],
    [layout.placeById.stadium.x - 6, layout.placeById.stadium.z - 30], [layout.placeById.hospital.x + 20, layout.placeById.hospital.z - 2], [layout.placeById.club.x - 2, layout.placeById.club.z + 20], [layout.placeById.marina.x - 2, layout.placeById.marina.z - 20],
  ];
  for (let i = 0; i < 20; i += 1) shardSpots.push({ id: i, x: spots[i][0], z: spots[i][1] });

  const placeShards = () => {
    for (const s of shardSpots) {
      if (state.collected.includes(s.id)) markers.remove(`shard-${s.id}`);
      else markers.set(`shard-${s.id}`, s.x, s.z, '#7cf7d4', 'shard');
    }
  };
  const placeRaceMarkers = () => {
    for (const r of RACES) {
      const n = node(r.startNode[0], r.startNode[1]);
      const p = lanePoint(n.edges[0], n.edges[0].a === n, 10, LANES.park);
      r.start = { x: p.x, z: p.z };
      markers.set(`race-${r.id}`, p.x, p.z, '#c58cff');
    }
  };
  const placeSafehouseMarkers = () => {
    for (const p of layout.places) {
      if (p.kind === 'safehouse') markers.set(`safehouse-${p.id}`, p.x, p.z, economy.ownsSafehouse(p.id) ? '#8dff7a' : '#ffffff');
      if (p.kind === 'garage') {
        const b = p.block;
        const inside = p.id === 'garage' ? { x: b.cx, z: b.z1 - 10 } : { x: b.cx, z: b.z0 + 9 };
        p.respray = inside;
        markers.set(`respray-${p.id}`, inside.x, inside.z, '#ff8a5b');
      }
    }
  };

  const checkpointPoint = (r, index) => {
    const n = node(r.path[index][0], r.path[index][1]);
    return { x: n.x, z: n.z };
  };

  const startRace = (r) => {
    state.race = { def: r, index: 0, time: 0, countdown: 3.5, finished: false, playerDone: false, position: 1 };
    state.racers.length = 0;
    const start = r.start;
    for (let k = 0; k < 2; k += 1) {
      const v = fleet.spawn(k === 0 ? 'coupe' : 'sedan', start.x + (k + 1) * 4.5, start.z + 6, player.vehicle.yaw, rng.pick(PAINTS), 'mission');
      if (v) {
        v.ai = { mode: 'race', index: 0, stuck: 0, reverse: 0, done: false, skill: rng.range(0.78, 0.95) };
        state.racers.push(v);
      }
    }
    markers.clearPrefix('race-');
    const cp = checkpointPoint(r, 0);
    markers.set('gate', cp.x, cp.z, '#c58cff', 'gate');
    hud.notify(`${r.name}: ${r.path.length} checkpoints`, 'reward');
    if (game.audio) game.audio.ui('confirm');
  };

  const endRace = (place) => {
    const r = state.race.def;
    const reward = r.rewards[Math.min(2, place - 1)];
    economy.addMoney(reward, `for ${place === 1 ? 'winning' : `${place}${place === 2 ? 'nd' : 'rd'} place in`} ${r.name}`);
    economy.addRep(place === 1 ? 60 : 25);
    if (place === 1) economy.stat('racesWon');
    for (const v of state.racers) if (v.alive) {
      v.kind = 'parked';
      v.ai = null;
    }
    state.racers.length = 0;
    state.race = null;
    markers.remove('gate');
    hud.setObjective(null);
    hud.setTimer(null);
    placeRaceMarkers();
    if (game.audio) game.audio.ui('complete');
  };

  const driveRacer = (v, dt, r) => {
    const ai = v.ai;
    if (ai.done || ai.index >= r.path.length) {
      stepVehicle(v, dt, { throttle: 0, steer: 0, brake: 1, handbrake: 0 }, layout, game.effects);
      return;
    }
    const cp = checkpointPoint(r, ai.index);
    const dx = cp.x - v.x;
    const dz = cp.z - v.z;
    const d = Math.hypot(dx, dz);
    let diff = Math.atan2(dx, dz) - v.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const ctl = { throttle: Math.abs(diff) > 0.9 && Math.abs(v.speed) > 12 ? -0.4 : ai.skill, steer: Math.max(-1, Math.min(1, diff * 2.2)), brake: 0, handbrake: 0 };
    if (ai.reverse > 0) {
      ai.reverse -= dt;
      ctl.throttle = -1;
      ctl.steer = -ctl.steer;
    } else if (Math.abs(v.speed) < 1 && state.race.time > 2) {
      ai.stuck += dt;
      if (ai.stuck > 1.2) {
        ai.stuck = 0;
        ai.reverse = 1.1;
      }
    } else ai.stuck = 0;
    stepVehicle(v, dt, ctl, layout, game.effects);
    if (d < 10) {
      ai.index += 1;
      if (ai.index >= r.path.length) {
        ai.done = true;
        state.race.finishers = (state.race.finishers || 0) + 1;
      }
    }
  };

  const api = {
    state, RACES, shardSpots,
    init() {
      placeShards();
      placeRaceMarkers();
      placeSafehouseMarkers();
    },
    refreshMarkers() {
      placeShards();
      placeSafehouseMarkers();
      if (!state.race) placeRaceMarkers();
    },
    blips() {
      const out = [];
      for (const p of layout.places) {
        if (p.kind === 'safehouse') out.push({ x: p.x, z: p.z, kind: 'place', color: economy.ownsSafehouse(p.id) ? '#8dff7a' : '#ffffff', letter: 'S', label: p.name });
        if (p.kind === 'garage') out.push({ x: p.x, z: p.z, kind: 'place', color: '#ff8a5b', letter: 'G', label: p.name });
        if (p.kind === 'police') out.push({ x: p.x, z: p.z, kind: 'place', color: '#7fb6ff', letter: 'P', label: p.name });
        if (p.kind === 'hospital') out.push({ x: p.x, z: p.z, kind: 'place', color: '#ffffff', letter: 'H', label: p.name });
      }
      if (!state.race) for (const r of RACES) if (r.start) out.push({ x: r.start.x, z: r.start.z, kind: 'place', color: '#c58cff', letter: 'R', label: r.name });
      if (state.race) {
        const cp = checkpointPoint(state.race.def, Math.min(state.race.index, state.race.def.path.length - 1));
        out.push({ x: cp.x, z: cp.z, kind: 'mission', color: '#c58cff' });
      }
      if (state.fare) out.push({ x: state.fare.x, z: state.fare.z, kind: 'mission', color: '#ffd23f' });
      for (const s of shardSpots) if (!state.collected.includes(s.id)) out.push({ x: s.x, z: s.z, kind: 'place', color: '#7cf7d4', letter: '◆', small: true });
      return out;
    },
    /** The E prompt available right now, if any: { key, text, run }. */
    prompt() {
      const v = player.vehicle;
      for (const p of layout.places) {
        const d = Math.hypot(player.x - p.x, player.z - p.z);
        if (p.kind === 'safehouse' && d < 3.5 && !v) {
          if (economy.ownsSafehouse(p.id)) return { text: 'Rest and save', run: () => game.openSafehouse(p) };
          return { text: `Buy ${p.name} for $${p.price.toLocaleString('en-US')}`, run: () => {
            if (economy.buySafehouse(p)) {
              hud.notify(`${p.name} is yours`, 'reward');
              placeSafehouseMarkers();
            } else hud.notify('Not enough money', 'warn');
          } };
        }
        if (p.kind === 'garage' && p.respray && v && Math.hypot(v.x - p.respray.x, v.z - p.respray.z) < 6 && Math.abs(v.speed) < 2) {
          const cost = ECONOMY.resprayCost;
          return { text: `Respray and repair ($${cost})`, run: () => {
            if (!economy.spend(cost, 'respray')) {
              hud.notify('Not enough money', 'warn');
              return;
            }
            fleet.repaint(v, rng.pick(PAINTS));
            v.health = 100;
            v.wrecked = false;
            v.resprayed = true;
            game.wanted.clear();
            game.police.reset();
            hud.notify('New paint, new car: the cops lost your trail', 'reward');
            if (game.audio) game.audio.ui('cash');
          } };
        }
      }
      if (v && v.model === 'taxi' && !state.fare && !state.race) return { text: 'Start a taxi fare', run: () => api.startFare() };
      if (v && !state.race && !game.missions.isActive()) {
        for (const r of RACES) if (r.start && Math.hypot(player.x - r.start.x, player.z - r.start.z) < 6) return { text: `Race: ${r.name}`, run: () => startRace(r) };
      }
      return null;
    },
    startFare() {
      const pick = randomFarePoint(player.x, player.z, 60, 160);
      if (!pick) return;
      state.fare = { phase: 'pickup', x: pick.x, z: pick.z, timer: null, distance: 0 };
      markers.set('fare', pick.x, pick.z, '#ffd23f');
      hud.notify('Fare: pick up the passenger', 'reward');
    },
    collectShard(s) {
      state.collected.push(s.id);
      markers.remove(`shard-${s.id}`);
      economy.addMoney(ECONOMY.shardReward, `sea-glass shard ${state.collected.length}/20`);
      economy.addRep(15);
      economy.stat('shardsFound');
      if (game.audio) game.audio.pickup();
      if (state.collected.length === 20) {
        economy.addMoney(ECONOMY.shardSetBonus, 'for the full sea-glass set');
        economy.addRep(150);
      }
    },
    serialize() {
      return { collected: [...state.collected] };
    },
    restore(data) {
      state.collected = (data && data.collected) || [];
      placeShards();
      placeSafehouseMarkers();
    },
    update(dt) {
      const v = player.vehicle;
      // Shards.
      for (const s of shardSpots) {
        if (state.collected.includes(s.id)) continue;
        if (Math.hypot(player.x - s.x, player.z - s.z) < (v ? 2.6 : 1.5)) api.collectShard(s);
      }
      // Race.
      if (state.race) {
        const r = state.race;
        if (r.countdown > 0) {
          r.countdown -= dt;
          hud.setObjective(r.countdown > 0.5 ? `Get ready... ${Math.ceil(r.countdown - 0.5)}` : 'GO!');
          if (r.countdown <= 0) hud.notify('GO!', 'reward');
        } else {
          r.time += dt;
          hud.setTimer(r.time);
          for (const racer of state.racers) if (racer.alive) driveRacer(racer, dt, r.def);
          if (!r.playerDone) {
            const cp = checkpointPoint(r.def, r.index);
            const ahead = state.racers.filter((x) => x.ai && (x.ai.index > r.index || x.ai.done)).length;
            hud.setObjective(`${r.def.name}: checkpoint ${r.index + 1}/${r.def.path.length} — position ${ahead + 1}/3`);
            if (Math.hypot(player.x - cp.x, player.z - cp.z) < 9) {
              r.index += 1;
              if (game.audio) game.audio.ui('select');
              if (r.index >= r.def.path.length) {
                r.playerDone = true;
                endRace((r.finishers || 0) + 1);
                return;
              }
              const next = checkpointPoint(r.def, r.index);
              markers.set('gate', next.x, next.z, '#c58cff', 'gate');
            }
          }
          if (!v) {
            hud.notify('Race abandoned', 'warn');
            for (const racer of state.racers) if (racer.alive) fleet.remove(racer);
            state.racers.length = 0;
            state.race = null;
            markers.remove('gate');
            hud.setObjective(null);
            hud.setTimer(null);
            placeRaceMarkers();
          }
        }
      }
      // Taxi fare.
      if (state.fare) {
        const f = state.fare;
        if (!v || v.model !== 'taxi') {
          state.fare = null;
          markers.remove('fare');
          hud.setObjective(null);
          hud.setTimer(null);
          hud.notify('Fare cancelled', 'warn');
        } else {
          const d = Math.hypot(player.x - f.x, player.z - f.z);
          if (f.phase === 'pickup') {
            hud.setObjective('Pick up the passenger');
            if (d < 6 && Math.abs(v.speed) < 1) {
              const dest = randomFarePoint(player.x, player.z, 180, 420);
              if (dest) {
                f.phase = 'drive';
                f.x = dest.x;
                f.z = dest.z;
                f.distance = Math.hypot(dest.x - player.x, dest.z - player.z);
                f.timer = f.distance / 9 + 25;
                markers.set('fare', dest.x, dest.z, '#ffd23f');
                hud.notify('Passenger aboard. Drive!', 'reward');
              }
            }
          } else {
            f.timer -= dt;
            hud.setTimer(f.timer);
            hud.setObjective('Drop the passenger at the marker');
            if (f.timer <= 0) {
              state.fare = null;
              markers.remove('fare');
              hud.setObjective(null);
              hud.setTimer(null);
              hud.notify('Too slow: the passenger walked', 'warn');
            } else if (d < 6 && Math.abs(v.speed) < 1) {
              const pay = Math.round(60 + f.distance * 2.2 + Math.max(0, f.timer) * 3);
              economy.addMoney(pay, 'taxi fare');
              economy.addRep(20);
              economy.stat('faresDone');
              state.fare = null;
              markers.remove('fare');
              hud.setObjective(null);
              hud.setTimer(null);
            }
          }
        }
      }
    },
  };

  function randomFarePoint(px, pz, minD, maxD) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const e = rng.pick(layout.edges);
      const t = rng.range(10, e.len - 10);
      const p = lanePoint(e, true, t, LANES.park);
      if (layout.isWater(p.x, p.z)) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < minD || d > maxD) continue;
      return p;
    }
    return null;
  }

  return api;
}

const CITY_QUAY = 13;
