// Traffic: AI cars that follow the right-hand lane of the road graph, pick a turn at every crossing,
// stop for red lights, queue behind the car ahead and brake for the player, plus parked cars along
// the curbs to steal. Cars the player hits break out of their lane into physics, then clear away
// when they are far behind, so the streets stay busy near the player and empty elsewhere.
import { LANES } from './config.js';
import { createRng } from './rng.js';
import { lanePoint } from './city/layout.js';
import { PAINTS } from './vehicles/models.js';
import { stepVehicle } from './vehicles/physics.js';
import { lerpAngle } from './camera.js';

const TRAFFIC_TARGET = 26;
const SPAWN_MIN = 90;
const SPAWN_MAX = 200;
const DESPAWN = 260;
const CRUISE = 12.5;

export function createTraffic(layout, fleet, effects) {
  const rng = createRng(layout.seed + 77);
  const models = ['sedan', 'sedan', 'coupe', 'taxi', 'pickup', 'van', 'sedan', 'coupe'];
  const parked = [];

  const paintFor = (model) => (model === 'taxi' ? '#ffd23f' : rng.pick(PAINTS));

  /** Parked cars at fixed seeded spots along the curbs across the whole city. */
  const placeParked = () => {
    const prng = createRng(layout.seed + 303);
    const perModel = {};
    for (const e of layout.edges) {
      for (const forward of [true, false]) {
        const slots = Math.floor((e.len - 24) / 9);
        for (let k = 0; k < slots; k += 1) {
          if (!prng.chance(0.05)) continue;
          const t = 14 + k * 9 + prng.range(0, 2);
          const p = lanePoint(e, forward, t, LANES.park);
          if (layout.isWater(p.x, p.z)) continue;
          const model = prng.pick(['sedan', 'coupe', 'pickup', 'van', 'sedan', 'taxi', 'bike']);
          perModel[model] = (perModel[model] || 0) + 1;
          if (perModel[model] > 12) continue;
          const v = fleet.spawn(model, p.x, p.z, Math.atan2(p.dx, p.dz), model === 'taxi' ? '#ffd23f' : prng.pick(PAINTS), 'parked');
          if (v) parked.push(v);
        }
      }
    }
    // A few cars always wait near the starting motel so the first steal is a short walk.
    const motel = layout.placeById.motel;
    const near = layout.nearestRoad(motel.x, motel.z);
    for (const [model, color, offset] of [['sedan', '#1f6fd0', 12], ['coupe', '#ffd23f', -14], ['bike', '#e3342f', 24]]) {
      const p = lanePoint(near.edge, true, near.t + offset, LANES.park);
      const v = fleet.spawn(model, p.x, p.z, Math.atan2(p.dx, p.dz), color, 'parked');
      if (v) parked.push(v);
    }
  };

  const randomSpawnPoint = (px, pz) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const e = rng.pick(layout.edges);
      const forward = rng.chance(0.5);
      const t = rng.range(8, e.len - 8);
      const p = lanePoint(e, forward, t, LANES.drive);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      if (layout.isWater(p.x, p.z)) continue;
      let blocked = false;
      for (const v of fleet.vehicles) {
        if (Math.hypot(v.x - p.x, v.z - p.z) < 9) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      return { edge: e, forward, t, p };
    }
    return null;
  };

  const chooseNext = (edge, forward) => {
    const node = forward ? edge.b : edge.a;
    const options = node.edges.filter((e) => e !== edge);
    if (options.length === 0) return { edge, forward: !forward };
    const next = rng.pick(options);
    return { edge: next, forward: next.a === node };
  };

  const spawnOne = (px, pz) => {
    const spot = randomSpawnPoint(px, pz);
    if (!spot) return;
    const model = rng.pick(models);
    const v = fleet.spawn(model, spot.p.x, spot.p.z, Math.atan2(spot.p.dx, spot.p.dz), paintFor(model), 'traffic');
    if (!v) return;
    v.ai = { mode: 'lane', edge: spot.edge, forward: spot.forward, t: spot.t, speed: CRUISE * rng.range(0.85, 1.1), cruise: CRUISE * rng.range(0.85, 1.1), stuck: 0, next: null, physicsTimer: 0 };
    v.speed = v.ai.speed;
  };

  /** Clearance ahead on the same lane: the nearest car (or the player's) within `maxAhead` metres. */
  const gapAhead = (v, fx, fz, maxAhead, player) => {
    let gap = maxAhead;
    for (const o of fleet.vehicles) {
      if (o === v) continue;
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const along = dx * fx + dz * fz;
      if (along < 1 || along > maxAhead) continue;
      const side = Math.abs(-dx * fz + dz * fx);
      if (side > 2.4) continue;
      gap = Math.min(gap, along - o.spec.length / 2);
    }
    if (player && !player.vehicle) {
      const dx = player.x - v.x;
      const dz = player.z - v.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(-dx * fz + dz * fx);
      if (along > 0.5 && along < maxAhead && side < 1.8) gap = Math.min(gap, along - 1);
    }
    return gap;
  };

  const laneDrive = (v, dt, gameTime, player) => {
    const ai = v.ai;
    const e = ai.edge;
    const p = lanePoint(e, ai.forward, ai.t, LANES.drive);
    const fx = p.dx;
    const fz = p.dz;
    const node = ai.forward ? e.b : e.a;
    const toNode = e.len - ai.t;
    let target = ai.cruise;
    // Traffic lights: stop at the line unless already in the crossing.
    const light = layout.lightFor(node, e.horizontal, gameTime);
    const stopLine = e.len - 7.5;
    if (light !== 'green' && ai.t < stopLine && toNode < 26) {
      const dist = stopLine - ai.t;
      if (light === 'red' || dist > 6) target = Math.min(target, Math.max(0, (dist - 1) * 1.6));
    }
    // Slow for the corner.
    if (toNode < 14 && ai.next && ai.next.edge.horizontal !== e.horizontal) target = Math.min(target, 6.5);
    // Keep a gap to the car in front.
    const gap = gapAhead(v, fx, fz, 24, player);
    if (gap < 24) target = Math.min(target, Math.max(0, (gap - 4.5) * 1.3));
    const rate = target > ai.speed ? 5 : 14;
    ai.speed += Math.max(-rate * dt, Math.min(rate * dt, target - ai.speed));
    if (ai.speed < 0.05) ai.speed = 0;
    ai.t += ai.speed * dt;
    v.braking = target < ai.speed - 0.5;
    if (ai.t >= e.len) {
      const next = ai.next || chooseNext(e, ai.forward);
      ai.t -= e.len;
      ai.edge = next.edge;
      ai.forward = next.forward;
      ai.next = null;
    }
    if (!ai.next && toNode < 30) ai.next = chooseNext(e, ai.forward);
    const np = lanePoint(ai.edge, ai.forward, ai.t, LANES.drive);
    // Ease into the new lane heading so corners are rounded rather than snapped.
    const wantYaw = Math.atan2(np.dx, np.dz);
    v.yaw = lerpAngle(v.yaw, wantYaw, Math.min(1, dt * 4));
    v.x += (np.x - v.x) * Math.min(1, dt * 4);
    v.z += (np.z - v.z) * Math.min(1, dt * 4);
    v.speed = ai.speed;
    v.steer = Math.max(-0.5, Math.min(0.5, (wantYaw - v.yaw) * 2));
  };

  return {
    parked,
    init() {
      placeParked();
    },
    /** Put a traffic car into free physics after a hit; it coasts and stops. */
    disturb(v) {
      if (v.ai && v.ai.mode === 'lane') {
        v.ai.mode = 'physics';
        v.ai.physicsTimer = 0;
      }
    },
    update(dt, player, gameTime) {
      const px = player.x;
      const pz = player.z;
      let count = 0;
      for (let i = fleet.vehicles.length - 1; i >= 0; i -= 1) {
        const v = fleet.vehicles[i];
        if (v.kind !== 'traffic' || !v.ai) continue;
        count += 1;
        const d = Math.hypot(v.x - px, v.z - pz);
        if (d > DESPAWN) {
          fleet.remove(v);
          continue;
        }
        if (v.ai.mode === 'lane') laneDrive(v, dt, gameTime, player);
        else {
          v.ai.physicsTimer += dt;
          stepVehicle(v, dt, { throttle: 0, steer: 0, brake: v.ai.physicsTimer > 1.5 ? 1 : 0, handbrake: 0 }, layout, effects);
          if (v.ai.physicsTimer > 6 && Math.abs(v.speed) < 0.5 && d > 70) {
            fleet.remove(v);
            continue;
          }
          // Back into the lane once stopped, if the car is still whole.
          if (v.ai.physicsTimer > 4 && Math.abs(v.speed) < 0.3 && !v.wrecked) {
            const near = layout.nearestRoad(v.x, v.z);
            if (near && near.dist < 7) {
              const forward = (near.edge.dx * Math.sin(v.yaw) + near.edge.dz * Math.cos(v.yaw)) >= 0;
              v.ai.mode = 'lane';
              v.ai.edge = near.edge;
              v.ai.forward = forward;
              v.ai.t = forward ? near.t : near.edge.len - near.t;
              v.ai.speed = 0;
              v.ai.next = null;
            }
          }
        }
      }
      if (count < TRAFFIC_TARGET && rng.chance(Math.min(1, dt * 4))) spawnOne(px, pz);
    },
  };
}
