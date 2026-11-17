// Pedestrians: beachgoers, office workers and night owls who walk the sidewalks block to block,
// cross at the corners, panic and run from gunfire, punches and speeding cars, get knocked down
// by traffic, and drop a little cash when they fall. They share the instanced crowd figures.
import { LANES } from './config.js';
import { createRng } from './rng.js';
import { lanePoint } from './city/layout.js';
import { POSE_WALK, POSE_RUN, POSE_DEAD, POSE_IDLE, SKINS, SHIRTS, PANTS, HAIRS } from './figures.js';
import { groundHeightAt } from './city/roads.js';
import { resolveCircle, clampToWorld } from './collision.js';

const TARGET = 44;
const SPAWN_MIN = 30;
const SPAWN_MAX = 130;
const DESPAWN = 170;

export function createPedestrians(layout, figures, effects) {
  const rng = createRng(layout.seed + 1234);
  const peds = [];

  const randomSidewalkSpot = (px, pz) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const e = rng.pick(layout.edges);
      const forward = rng.chance(0.5);
      const t = rng.range(4, e.len - 4);
      const p = lanePoint(e, forward, t, LANES.sidewalk);
      if (layout.isWater(p.x, p.z)) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      return { edge: e, forward, t, p };
    }
    return null;
  };

  const nextEdge = (edge, forward) => {
    const node = forward ? edge.b : edge.a;
    // Straight on or a right turn keeps a walker on the sidewalk; a left turn would cut the crossing.
    const options = [];
    for (const e of node.edges) {
      if (e === edge) continue;
      const f = e.a === node;
      const dx = f ? e.dx : -e.dx;
      const dz = f ? e.dz : -e.dz;
      const cdx = forward ? edge.dx : -edge.dx;
      const cdz = forward ? edge.dz : -edge.dz;
      const cross = cdx * dz - cdz * dx;
      const dot = cdx * dx + cdz * dz;
      if (dot > 0.5 || cross > 0.5) options.push({ edge: e, forward: f, weight: dot > 0.5 ? 2 : 1 });
    }
    if (options.length === 0) return { edge, forward: !forward };
    const total = options.reduce((s, o) => s + o.weight, 0);
    let r = rng.range(0, total);
    for (const o of options) {
      r -= o.weight;
      if (r <= 0) return o;
    }
    return options[0];
  };

  const spawnOne = (px, pz, spot = null) => {
    const s = spot || randomSidewalkSpot(px, pz);
    if (!s) return null;
    const slot = figures.alloc(rng.pick(SKINS), rng.pick(SHIRTS), rng.pick(PANTS), rng.pick(HAIRS));
    if (slot < 0) return null;
    const ped = {
      slot, x: s.p.x, z: s.p.z, y: 0, yaw: Math.atan2(s.p.dx, s.p.dz), edge: s.edge, forward: s.forward, t: s.t,
      state: 'walk', speed: rng.range(1.1, 1.8), phase: rng.range(0, 6), fleeTimer: 0, fleeX: 0, fleeZ: 0,
      health: 30, deadTimer: 0, pose: POSE_WALK, vx: 0, vz: 0, cash: rng.int(10, 60), kind: 'ped', name: 'pedestrian',
      idleTimer: rng.chance(0.2) ? rng.range(2, 8) : 0,
    };
    peds.push(ped);
    return ped;
  };

  const api = {
    peds,
    spawnAt(x, z) {
      const near = layout.nearestRoad(x, z);
      if (!near) return null;
      const forward = rng.chance(0.5);
      const t = forward ? near.t : near.edge.len - near.t;
      return spawnOne(x, z, { edge: near.edge, forward, t, p: { x, z, dx: 0, dz: 1 } });
    },
    /** Everyone within `radius` of (x, z) runs away from it. */
    panic(x, z, radius = 40) {
      for (const p of peds) {
        if (p.state === 'dead') continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < radius) {
          p.state = 'flee';
          p.fleeTimer = 5 + rng.range(0, 4);
          p.fleeX = x;
          p.fleeZ = z;
        }
      }
    },
    /** Hurt a pedestrian; returns true when they drop. */
    hurt(p, amount, fromX, fromZ) {
      if (p.state === 'dead') return false;
      p.health -= amount;
      effects.blood(p.x, 1.2, p.z, 4);
      if (p.health <= 0) {
        p.state = 'dead';
        p.deadTimer = 0;
        p.pose = POSE_DEAD;
        return true;
      }
      p.state = 'flee';
      p.fleeTimer = 7;
      p.fleeX = fromX;
      p.fleeZ = fromZ;
      return false;
    },
    /** Run over check: any live pedestrian under a car moving faster than 4 m/s is knocked down. */
    runOver(vehicles, onHit) {
      for (const v of vehicles) {
        const vs = Math.abs(v.speed);
        if (vs < 3) continue;
        const fx = Math.sin(v.yaw);
        const fz = Math.cos(v.yaw);
        for (const p of peds) {
          if (p.state === 'dead') continue;
          const dx = p.x - v.x;
          const dz = p.z - v.z;
          const along = dx * fx + dz * fz;
          const side = Math.abs(-dx * fz + dz * fx);
          if (Math.abs(along) < v.spec.length / 2 + 0.3 && side < v.spec.width / 2 + 0.3) {
            p.state = 'dead';
            p.pose = POSE_DEAD;
            p.deadTimer = 0;
            p.vx = fx * vs * 0.3;
            p.vz = fz * vs * 0.3;
            effects.blood(p.x, 1.0, p.z, 6);
            effects.dust(p.x, p.z, 2);
            if (onHit) onHit(p, v);
          }
        }
      }
    },
    update(dt, player, playerVehicle) {
      const px = player.x;
      const pz = player.z;
      for (let i = peds.length - 1; i >= 0; i -= 1) {
        const p = peds[i];
        const d = Math.hypot(p.x - px, p.z - pz);
        if (d > DESPAWN || (p.state === 'dead' && p.deadTimer > 25)) {
          figures.release(p.slot);
          peds.splice(i, 1);
          continue;
        }
        if (p.state === 'dead') {
          p.deadTimer += dt;
          p.x += p.vx * dt;
          p.z += p.vz * dt;
          p.vx *= 0.9;
          p.vz *= 0.9;
          p.y = groundHeightAt(layout, p.x, p.z);
          figures.pose(p.slot, p.x, p.y, p.z, p.yaw, 0, POSE_DEAD);
          continue;
        }
        // A fast car bearing down on them sends them running.
        if (playerVehicle && Math.abs(playerVehicle.speed) > 9 && p.state !== 'flee') {
          const dx = p.x - playerVehicle.x;
          const dz = p.z - playerVehicle.z;
          const fx = Math.sin(playerVehicle.yaw);
          const fz = Math.cos(playerVehicle.yaw);
          const along = dx * fx + dz * fz;
          const side = Math.abs(-dx * fz + dz * fx);
          if (along > 0 && along < 18 && side < 3.5) {
            p.state = 'flee';
            p.fleeTimer = 3;
            p.fleeX = playerVehicle.x;
            p.fleeZ = playerVehicle.z;
          }
        }
        if (p.state === 'flee') {
          p.fleeTimer -= dt;
          let dx = p.x - p.fleeX;
          let dz = p.z - p.fleeZ;
          const len = Math.hypot(dx, dz) || 1;
          dx /= len;
          dz /= len;
          const run = 5.2;
          const nx = p.x + dx * run * dt;
          const nz = p.z + dz * run * dt;
          const res = resolveCircle(layout.obstacles, nx, nz, 0.35, 0.3);
          const c = clampToWorld(layout, res.x, res.z);
          p.x = c.x;
          p.z = c.z;
          p.yaw = Math.atan2(dx, dz);
          p.phase += dt * 12;
          p.pose = POSE_RUN;
          if (p.fleeTimer <= 0) {
            const near = layout.nearestRoad(p.x, p.z);
            if (near) {
              p.edge = near.edge;
              p.forward = rng.chance(0.5);
              p.t = p.forward ? near.t : near.edge.len - near.t;
            }
            p.state = 'walk';
          }
        } else if (p.idleTimer > 0) {
          p.idleTimer -= dt;
          p.phase += dt * 2;
          p.pose = POSE_IDLE;
        } else {
          p.t += p.speed * dt;
          if (p.t >= p.edge.len) {
            const n = nextEdge(p.edge, p.forward);
            p.t -= p.edge.len;
            p.edge = n.edge;
            p.forward = n.forward;
          }
          const lp = lanePoint(p.edge, p.forward, p.t, LANES.sidewalk);
          const wantYaw = Math.atan2(lp.x - p.x, lp.z - p.z);
          const dist = Math.hypot(lp.x - p.x, lp.z - p.z);
          if (dist > 0.05) {
            p.yaw = wantYaw;
            p.x += (lp.x - p.x) * Math.min(1, dt * 4);
            p.z += (lp.z - p.z) * Math.min(1, dt * 4);
          }
          // Keep out of the player's way on foot.
          if (!playerVehicle) {
            const ddx = p.x - px;
            const ddz = p.z - pz;
            const dd = Math.hypot(ddx, ddz);
            if (dd < 0.9 && dd > 0.01) {
              p.x += (ddx / dd) * (0.9 - dd);
              p.z += (ddz / dd) * (0.9 - dd);
            }
          }
          p.phase += dt * 7;
          p.pose = POSE_WALK;
          if (rng.chance(dt * 0.02)) p.idleTimer = rng.range(2, 6);
        }
        p.y = groundHeightAt(layout, p.x, p.z);
        figures.pose(p.slot, p.x, p.y, p.z, p.yaw, p.phase, p.pose);
      }
      if (peds.length < TARGET && rng.chance(Math.min(1, dt * 5))) spawnOne(px, pz);
    },
  };
  return api;
}
