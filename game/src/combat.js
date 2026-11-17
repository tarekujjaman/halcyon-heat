// Shooting and fighting: a shot from anyone (Sol, an officer, a gang member, the helicopter) is a
// ray across the city that stops at the first building, car or person; hits spark, bleed, dent
// cars and hurt whoever is standing there. Punches land on the nearest person in front of Sol.
import { lineOfSight, raycastObstacles } from './collision.js';
import { damageVehicle } from './vehicles/physics.js';
import { WEAPONS } from './weapons.js';

export function createCombat(game) {
  const { effects, layout, fleet, player } = game;

  /** Every person who can be hit: pedestrians, officers and gang members, with their lists' hurt hooks. */
  const people = () => {
    const out = [];
    for (const p of game.pedestrians.peds) if (p.state !== 'dead') out.push({ npc: p, kind: 'ped', hurt: (d, fx, fz) => game.pedestrians.hurt(p, d, fx, fz) });
    if (game.police) for (const o of game.police.officers) if (o.state !== 'dead') out.push({ npc: o, kind: 'police', hurt: (d, fx, fz) => game.police.hurtOfficer(o, d, fx, fz) });
    if (game.gangs) for (const m of game.gangs.members) if (m.state !== 'dead') out.push({ npc: m, kind: 'gang', hurt: (d, fx, fz) => game.gangs.hurt(m, d, fx, fz) });
    return out;
  };

  /**
   * Trace one bullet from (x, y, z) along the unit direction; returns what it hit. `shooter` is
   * skipped. Pedestrians are 0.5 m wide and 1.8 m tall; cars are their width circle and 1.6 m tall.
   */
  const trace = (x, y, z, dx, dy, dz, range, shooter, damage, skipPlayer) => {
    const horiz = Math.hypot(dx, dz) || 1e-6;
    const hx = dx / horiz;
    const hz = dz / horiz;
    const wall = raycastObstacles(layout.obstacles, x, z, hx, hz, range * horiz, 0.9);
    let best = { dist: Math.min(range, wall.dist / horiz), kind: wall.dist < range * horiz ? 'wall' : 'none', target: null };
    const hitAtHeight = (dist, radius, top, tx, tz) => {
      // Height of the ray where it passes the target.
      const yAt = y + dy * dist;
      return yAt >= -0.2 && yAt <= top + 0.3 && Math.hypot(tx - (x + hx * dist * horiz), tz - (z + hz * dist * horiz)) <= radius;
    };
    const testCircle = (tx, tz, radius, top) => {
      const fx = tx - x;
      const fz = tz - z;
      const along = fx * hx + fz * hz;
      if (along < 0) return -1;
      const side = Math.abs(-fx * hz + fz * hx);
      if (side > radius) return -1;
      const dist = along / horiz;
      if (dist > best.dist) return -1;
      if (!hitAtHeight(dist, radius + 0.01, top, tx, tz)) return -1;
      return dist;
    };
    for (const person of people()) {
      if (person.npc === shooter) continue;
      const d = testCircle(person.npc.x, person.npc.z, 0.5, 1.85);
      if (d >= 0) best = { dist: d, kind: person.kind, target: person };
    }
    for (const v of fleet.vehicles) {
      if (v === shooter || (v.occupant === 'player' && skipPlayer)) continue;
      const d = testCircle(v.x, v.z, v.spec.width / 2 + 0.35, 1.7);
      if (d >= 0) best = { dist: d, kind: 'vehicle', target: v };
    }
    if (!skipPlayer && shooter !== player && !player.dead) {
      const d = testCircle(player.x, player.z, player.vehicle ? 1.2 : 0.5, 1.85);
      if (d >= 0) best = { dist: d, kind: 'player', target: player };
    }
    const ex = x + dx * best.dist;
    const ey = y + dy * best.dist;
    const ez = z + dz * best.dist;
    effects.tracer(x, y, z, ex, ey, ez);
    if (best.kind === 'wall' || best.kind === 'vehicle') effects.hitSparks(ex, ey, ez);
    if (best.kind === 'vehicle') {
      damageVehicle(best.target, damage * 0.6, effects, { onWreck: (v) => game.onVehicleWrecked && game.onVehicleWrecked(v, shooter) });
      if (best.target.ai && game.traffic) game.traffic.disturb(best.target);
      if (best.target.occupant === 'player') player.damage(damage * 0.35);
    } else if (best.kind === 'ped' || best.kind === 'police' || best.kind === 'gang') {
      best.target.hurt(damage, x, z);
      if (shooter === player && game.onPlayerShotPerson) game.onPlayerShotPerson(best.target.npc, best.kind, best.target.npc.state === 'dead');
    } else if (best.kind === 'player') {
      effects.blood(player.x, 1.3, player.z, 3);
      const killed = player.damage(damage);
      if (game.audio) game.audio.hit();
      if (killed && game.onPlayerDeath) game.onPlayerDeath('shot');
    }
    return best;
  };

  const api = {
    trace,
    /** Sol fires her current weapon toward the aim direction (yaw, pitch). */
    playerShoot(arsenal, yaw, pitch) {
      const w = arsenal.spec;
      if (w.melee) return api.punch();
      if (!arsenal.fire()) return false;
      const ox = player.x + Math.sin(player.yaw) * 0.35 + Math.cos(player.yaw) * -0.3;
      const oz = player.z + Math.cos(player.yaw) * 0.35 - Math.sin(player.yaw) * -0.3;
      const oy = player.y + 1.35;
      const dirX = Math.sin(yaw) * Math.cos(pitch);
      const dirZ = Math.cos(yaw) * Math.cos(pitch);
      const dirY = Math.sin(pitch);
      for (let k = 0; k < w.pellets; k += 1) {
        const sx = (Math.random() - 0.5) * 2 * w.spread;
        const sy = (Math.random() - 0.5) * 2 * w.spread;
        const dx = dirX + Math.cos(yaw) * sx;
        const dz = dirZ - Math.sin(yaw) * sx;
        const dy = dirY + sy;
        const len = Math.hypot(dx, dy, dz);
        trace(ox, oy, oz, dx / len, dy / len, dz / len, w.range, player, w.damage, true);
      }
      effects.muzzleFlash(ox, oy, oz, dirX, dirZ);
      if (game.audio) game.audio.gunshot(w.id);
      game.camera.state.shake = Math.max(game.camera.state.shake, w.id === 'shotgun' ? 0.35 : 0.12);
      game.pedestrians.panic(player.x, player.z, 45);
      if (game.onPlayerShot) game.onPlayerShot();
      return true;
    },
    /** An NPC shoots at a point; accuracy is the chance the ray is aimed true. */
    npcShoot(npc, tx, ty, tz, weaponId, accuracy, damageScale = 1) {
      const w = WEAPONS[weaponId] || WEAPONS.pistol;
      const ox = npc.x;
      const oy = (npc.y || 0) + (npc.height || 1.35);
      const oz = npc.z;
      let dx = tx - ox;
      let dy = ty - oy;
      let dz = tz - oz;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      if (Math.random() > accuracy) {
        const miss = 0.06 + Math.random() * 0.12;
        const side = Math.random() < 0.5 ? -1 : 1;
        dx += -dz * miss * side;
        dz += dx * miss * side;
        dy += (Math.random() - 0.5) * 0.05;
        const l2 = Math.hypot(dx, dy, dz);
        dx /= l2;
        dy /= l2;
        dz /= l2;
      }
      trace(ox, oy, oz, dx, dy, dz, w.range + 20, npc, w.damage * damageScale, false);
      effects.muzzleFlash(ox, oy, oz, dx, dz);
      if (game.audio) game.audio.gunshot(weaponId, Math.min(1, 40 / (len + 10)));
      game.pedestrians.panic(ox, oz, 30);
    },
    /** A punch hits the nearest person within reach in front of Sol. */
    punch() {
      if (!player.punch()) return false;
      if (game.audio) game.audio.punch();
      const fx = Math.sin(player.yaw);
      const fz = Math.cos(player.yaw);
      let best = null;
      let bestD = 2.1;
      for (const person of people()) {
        const dx = person.npc.x - player.x;
        const dz = person.npc.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d < bestD && (dx * fx + dz * fz) / (d || 1) > 0.4) {
          best = person;
          bestD = d;
        }
      }
      if (best) {
        best.hurt(WEAPONS.fists.damage, player.x, player.z);
        effects.hitSparks(best.npc.x, 1.3, best.npc.z);
        if (game.audio) game.audio.hit();
        if (game.onPlayerPunched) game.onPlayerPunched(best.npc, best.kind, best.npc.state === 'dead');
        return true;
      }
      // Punching a car dents it.
      const car = fleet.nearest(player.x + fx, player.z + fz, 2.2);
      if (car) {
        damageVehicle(car, 4, effects);
        effects.hitSparks(car.x, 0.9, car.z);
        if (car.ai) game.traffic.disturb(car);
      }
      return false;
    },
    canSee(x0, z0, x1, z1) {
      return lineOfSight(layout.obstacles, x0, z0, x1, z1, 1.6);
    },
  };
  return api;
}
