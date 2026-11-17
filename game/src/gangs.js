// Kane Okafor's crew, the Tidebreakers: they hold the container yard at the docks and the east end
// of Neon Row, loiter in their colours, turn hostile when Sol draws a weapon on their turf or a
// mission sends her in, and fight with pistols and SMGs, strafing to keep their distance. Missions
// can drop a squad anywhere and count who is still standing.
import { createRng } from './rng.js';
import { POSE_RUN, POSE_AIM, POSE_DEAD, POSE_IDLE, POSE_WALK } from './figures.js';
import { groundHeightAt } from './city/roads.js';
import { resolveCircle, clampToWorld, lineOfSight } from './collision.js';
import { turnToward } from './player.js';

const GANG_COLORS = { skin: ['#8d5524', '#5c3a1e', '#c68642', '#a56f43'], shirt: ['#b0202a', '#8f1d24', '#d12a35'], pants: ['#1b1b1b', '#2b2b30'], hair: ['#1b1b1b', '#3b2416'] };

export function createGangs(game) {
  const { layout, figures, effects, player } = game;
  const rng = createRng(layout.seed + 999);
  const members = [];
  const territories = [];
  const yard = layout.placeById.kaneYard.block;
  territories.push({ x: yard.cx, z: yard.cz - 8, radius: 34, name: 'Container Yard' });
  const neonEast = layout.blockAt(9, 2);
  territories.push({ x: neonEast.cx, z: neonEast.z1 + 1.5, radius: 30, name: 'East Neon Row' });
  const state = { hostile: false };

  const spawnMember = (x, z, hostile, weapon = 'pistol', boss = false) => {
    const slot = figures.alloc(rng.pick(GANG_COLORS.skin), boss ? '#ffd23f' : rng.pick(GANG_COLORS.shirt), rng.pick(GANG_COLORS.pants), rng.pick(GANG_COLORS.hair));
    if (slot < 0) return null;
    const m = {
      slot, x, z, y: 0, yaw: rng.range(0, Math.PI * 2), state: hostile ? 'hostile' : 'idle', health: boss ? 200 : 60, phase: rng.range(0, 6),
      shootTimer: rng.range(0.4, 1.2), pose: POSE_IDLE, deadTimer: 0, kind: 'gang', name: boss ? 'Kane Okafor' : 'Tidebreaker', height: 1.35,
      weapon, cash: rng.int(30, 120), strafe: rng.sign(), strafeTimer: 0, wanderX: x, wanderZ: z, homeX: x, homeZ: z, idleTimer: rng.range(1, 4), boss, mission: false,
    };
    members.push(m);
    return m;
  };

  const updateMember = (m, dt) => {
    if (m.state === 'dead') {
      m.deadTimer += dt;
      figures.pose(m.slot, m.x, m.y, m.z, m.yaw, 0, POSE_DEAD);
      return;
    }
    const dx = player.x - m.x;
    const dz = player.z - m.z;
    const dist = Math.hypot(dx, dz);
    if (m.state === 'idle') {
      // Loiter around home; turn hostile when Sol points a gun at them nearby or hits a crew member.
      m.idleTimer -= dt;
      if (m.idleTimer <= 0) {
        m.idleTimer = rng.range(2, 6);
        m.wanderX = m.homeX + rng.range(-6, 6);
        m.wanderZ = m.homeZ + rng.range(-6, 6);
      }
      const wx = m.wanderX - m.x;
      const wz = m.wanderZ - m.z;
      const wd = Math.hypot(wx, wz);
      if (wd > 0.5) {
        m.yaw = turnToward(m.yaw, Math.atan2(wx, wz), dt * 4);
        const res = resolveCircle(layout.obstacles, m.x + (wx / wd) * 1.2 * dt, m.z + (wz / wd) * 1.2 * dt, 0.35, 0.3);
        m.x = res.x;
        m.z = res.z;
        m.phase += dt * 7;
        m.pose = POSE_WALK;
      } else {
        m.phase += dt * 2;
        m.pose = POSE_IDLE;
      }
      const threatened = dist < 18 && player.holdingGun && player.aiming;
      if (threatened || (state.hostile && dist < 40)) m.state = 'hostile';
    } else {
      const sees = dist < 60 && lineOfSight(layout.obstacles, m.x, m.z, player.x, player.z, 1.5);
      m.yaw = turnToward(m.yaw, Math.atan2(dx, dz), dt * 8);
      m.strafeTimer -= dt;
      if (m.strafeTimer <= 0) {
        m.strafeTimer = rng.range(0.8, 2.2);
        m.strafe = rng.sign();
      }
      let mx = 0;
      let mz = 0;
      const ideal = m.weapon === 'smg' ? 11 : 14;
      if (dist > ideal + 3 || !sees) {
        mx = dx / dist;
        mz = dz / dist;
      } else if (dist < ideal - 4) {
        mx = -dx / dist;
        mz = -dz / dist;
      } else {
        mx = (-dz / dist) * m.strafe;
        mz = (dx / dist) * m.strafe;
      }
      const speed = sees ? 3.6 : 5;
      const res = resolveCircle(layout.obstacles, m.x + mx * speed * dt, m.z + mz * speed * dt, 0.35, 0.3);
      const c = clampToWorld(layout, res.x, res.z);
      m.x = c.x;
      m.z = c.z;
      m.phase += dt * 10;
      m.pose = sees ? POSE_AIM : POSE_RUN;
      m.shootTimer -= dt;
      if (sees && m.shootTimer <= 0 && !player.dead && dist > 1.5) {
        m.shootTimer = m.weapon === 'smg' ? 0.16 + (rng.chance(0.3) ? 0.9 : 0) : 0.8 + rng.range(0, 0.6);
        const accuracy = Math.max(0.12, 0.42 - dist / 120);
        game.combat.npcShoot(m, player.x, player.y + 1.2, player.z, m.weapon, accuracy, m.weapon === 'smg' ? 0.4 : 0.55);
      }
      if (dist > 160) m.state = 'idle';
    }
    m.y = groundHeightAt(layout, m.x, m.z);
    figures.pose(m.slot, m.x, m.y, m.z, m.yaw, m.phase, m.pose);
  };

  const api = {
    members, territories, state,
    spawnMember,
    /** A squad of `n` around (x, z); mission squads are tracked by `tag`. */
    spawnSquad(x, z, n, hostile = true, weapon = 'pistol', tag = null) {
      const squad = [];
      for (let k = 0; k < n; k += 1) {
        const a = (k / n) * Math.PI * 2;
        const m = spawnMember(x + Math.cos(a) * (3 + k), z + Math.sin(a) * (3 + k), hostile, k % 3 === 2 ? 'smg' : weapon);
        if (m) {
          m.tag = tag;
          m.mission = true;
          squad.push(m);
        }
      }
      return squad;
    },
    aliveWithTag(tag) {
      return members.filter((m) => m.tag === tag && m.state !== 'dead').length;
    },
    hurt(m, amount, fromX, fromZ) {
      if (m.state === 'dead') return;
      m.health -= amount;
      effects.blood(m.x, 1.2, m.z, 4);
      if (m.health <= 0) {
        m.state = 'dead';
        m.deadTimer = 0;
        if (game.onGangKilled) game.onGangKilled(m);
      } else {
        m.state = 'hostile';
        // The crew backs each other up.
        for (const o of members) if (o.state === 'idle' && Math.hypot(o.x - m.x, o.z - m.z) < 40) o.state = 'hostile';
      }
      void fromX;
      void fromZ;
    },
    /** Whether (x, z) lies in gang turf. */
    inTerritory(x, z) {
      return territories.some((t) => Math.hypot(t.x - x, t.z - z) < t.radius);
    },
    clearMission(tag) {
      for (let i = members.length - 1; i >= 0; i -= 1) {
        if (members[i].tag === tag) {
          figures.release(members[i].slot);
          members.splice(i, 1);
        }
      }
    },
    reset() {
      for (const m of members) figures.release(m.slot);
      members.length = 0;
    },
    update(dt) {
      // Keep each territory populated while Sol is near.
      for (const t of territories) {
        const d = Math.hypot(t.x - player.x, t.z - player.z);
        const here = members.filter((m) => !m.mission && Math.hypot(m.homeX - t.x, m.homeZ - t.z) < t.radius + 5).length;
        if (d < 140 && here < 5 && rng.chance(dt * 0.6)) {
          const a = rng.range(0, Math.PI * 2);
          const r = rng.range(2, t.radius * 0.6);
          const x = t.x + Math.cos(a) * r;
          const z = t.z + Math.sin(a) * r;
          const res = resolveCircle(layout.obstacles, x, z, 0.4, 0.3);
          spawnMember(res.x, res.z, false, rng.chance(0.3) ? 'smg' : 'pistol');
        }
      }
      for (let i = members.length - 1; i >= 0; i -= 1) {
        const m = members[i];
        const d = Math.hypot(m.x - player.x, m.z - player.z);
        if ((m.state === 'dead' && m.deadTimer > 22) || (d > 220 && !m.mission)) {
          figures.release(m.slot);
          members.splice(i, 1);
          continue;
        }
        updateMember(m, dt);
      }
    },
  };
  return api;
}
