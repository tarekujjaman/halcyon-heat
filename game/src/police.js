// Halcyon Bay P.D.: cruisers with flashing bars and sirens that chase and ram, officers who get out
// to shoot and make the arrest, roadblocks thrown across the road ahead at three stars and up, and
// the helicopter with its searchlight at four. They report whether they can see Sol; the wanted
// level does the rest.
import * as THREE from 'three';
import { WANTED, LANES } from './config.js';
import { createRng } from './rng.js';
import { lanePoint } from './city/layout.js';
import { stepVehicle } from './vehicles/physics.js';
import { POSE_RUN, POSE_AIM, POSE_DEAD, POSE_IDLE } from './figures.js';
import { groundHeightAt } from './city/roads.js';
import { resolveCircle, clampToWorld, lineOfSight } from './collision.js';
import { turnToward } from './player.js';
import { box, cylinder, merge, coloredMaterial } from './meshkit.js';

const OFFICER_COLORS = { skin: '#d9a77c', shirt: '#1b2f5e', pants: '#14213d', hair: '#1b1b1b' };

export function createPolice(game) {
  const { layout, fleet, figures, effects, player } = game;
  const rng = createRng(layout.seed + 555);
  const cruisers = [];
  const officers = [];
  const state = { seen: false, roadblockTimer: 8, arrestTimer: 0, heliShotTimer: 0, dispatchTimer: 0 };

  // The helicopter: fuselage, tail boom, rotors, skids and a searchlight cone.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(merge([
    box(1.8, 1.5, 4.2, '#1b2f5e', 0, 1.2, 0.3),
    box(1.5, 0.9, 1.4, '#7fb6ff', 0, 1.5, 2.3),
    box(0.5, 0.5, 4.5, '#1b2f5e', 0, 1.5, -3.5),
    box(0.3, 1.2, 0.8, '#f4f4f0', 0, 2.1, -5.4),
    box(0.25, 0.25, 2.2, '#2b2b30', -0.9, 0.2, 0.2),
    box(0.25, 0.25, 2.2, '#2b2b30', 0.9, 0.2, 0.2),
    box(0.1, 0.5, 0.1, '#2b2b30', -0.9, 0.5, 0.8),
    box(0.1, 0.5, 0.1, '#2b2b30', 0.9, 0.5, 0.8),
    box(0.6, 0.3, 0.6, '#f4f4f0', 0, 0.6, 1.9),
    cylinder(0.2, 0.2, 0.5, '#2b2b30', 0, 2.2, 0, 8),
  ]), coloredMaterial({ roughness: 0.5, metalness: 0.4 }));
  heliBody.castShadow = true;
  heli.add(heliBody);
  const rotor = new THREE.Mesh(merge([box(11, 0.06, 0.35, '#1a1a1a', 0, 2.45, 0), box(0.35, 0.06, 11, '#1a1a1a', 0, 2.45, 0)]), coloredMaterial({ roughness: 0.6 }));
  heli.add(rotor);
  const tailRotor = new THREE.Mesh(merge([box(0.05, 1.6, 0.2, '#1a1a1a', 0.3, 2.1, -5.4)]), coloredMaterial());
  heli.add(tailRotor);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 34, 18, 1, true), new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  beam.position.set(0, -16.5, 1.5);
  heli.add(beam);
  const spot = new THREE.SpotLight('#fff1c4', 900, 90, 0.33, 0.5, 1.2);
  spot.position.set(0, 0.5, 1.9);
  heli.add(spot);
  heli.add(spot.target);
  const beacon = new THREE.Mesh(box(0.3, 0.3, 0.3, '#ff2a2a', 0, 2.0, -0.8), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  heli.add(beacon);
  heli.visible = false;
  game.scene.add(heli);
  const heliState = { active: false, x: 0, z: 0, y: 36, yaw: 0, angle: 0, blades: 0 };

  const spawnPointBehind = (minD, maxD) => {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const e = rng.pick(layout.edges);
      const forward = rng.chance(0.5);
      const t = rng.range(8, e.len - 8);
      const p = lanePoint(e, forward, t, LANES.drive);
      if (layout.isWater(p.x, p.z)) continue;
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < minD || d > maxD) continue;
      // Prefer out of sight of the camera: behind the player.
      const cam = game.camera.camera;
      const toP = new THREE.Vector3(p.x - cam.position.x, 0, p.z - cam.position.z).normalize();
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      if (toP.dot(fwd) > 0.3 && attempt < 10) continue;
      return { p, yaw: Math.atan2(p.dx, p.dz) };
    }
    return null;
  };

  const spawnCruiser = (x, z, yaw, mode = 'chase') => {
    const v = fleet.spawn('cruiser', x, z, yaw, '#f4f4f0', 'police');
    if (!v) return null;
    v.siren = true;
    v.lightsOn = true;
    v.ai = { mode, stuck: 0, reverse: 0, deployed: false, blockTimer: 0 };
    cruisers.push(v);
    return v;
  };

  const spawnOfficer = (x, z, yaw = 0) => {
    const slot = figures.alloc(OFFICER_COLORS.skin, OFFICER_COLORS.shirt, OFFICER_COLORS.pants, OFFICER_COLORS.hair);
    if (slot < 0) return null;
    const o = { slot, x, z, y: 0, yaw, state: 'chase', health: 50, phase: rng.range(0, 6), shootTimer: rng.range(0.5, 1.4), pose: POSE_RUN, deadTimer: 0, kind: 'police', name: 'officer', height: 1.35, cash: 0, vx: 0, vz: 0 };
    officers.push(o);
    return o;
  };

  const removeCruiser = (v) => {
    const i = cruisers.indexOf(v);
    if (i >= 0) cruisers.splice(i, 1);
    fleet.remove(v);
  };

  const steerToward = (v, tx, tz, dt) => {
    const dx = tx - v.x;
    const dz = tz - v.z;
    const wantYaw = Math.atan2(dx, dz);
    let diff = wantYaw - v.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.max(-1, Math.min(1, diff * 1.8));
  };

  const driveCruiser = (v, dt) => {
    const ai = v.ai;
    const pv = player.vehicle;
    const px = player.x + (pv ? Math.sin(pv.yaw) * pv.speed * 0.6 : 0);
    const pz = player.z + (pv ? Math.cos(pv.yaw) * pv.speed * 0.6 : 0);
    const dist = Math.hypot(player.x - v.x, player.z - v.z);
    let ctl = { throttle: 1, steer: 0, brake: 0, handbrake: 0 };
    if (ai.mode === 'block') {
      ctl = { throttle: 0, steer: 0, brake: 1, handbrake: 1 };
      ai.blockTimer += dt;
      if (ai.blockTimer > 30 && dist > 120) ai.mode = 'chase';
    } else {
      // Sol on foot and close: stop and let the officers out.
      if (!pv && dist < 16) {
        ctl = { throttle: 0, steer: 0, brake: 1, handbrake: 0 };
        if (!ai.deployed && Math.abs(v.speed) < 3) {
          ai.deployed = true;
          const rx = Math.cos(v.yaw);
          const rz = -Math.sin(v.yaw);
          spawnOfficer(v.x + rx * 1.6, v.z + rz * 1.6, v.yaw);
          spawnOfficer(v.x - rx * 1.6, v.z - rz * 1.6, v.yaw);
        }
      } else {
        ai.deployed = ai.deployed && dist < 40;
        ctl.steer = steerToward(v, px, pz, dt);
        // Ease off when close behind a slow player car to ram rather than overshoot.
        if (pv && dist < 9 && Math.abs(pv.speed) < 4) ctl.throttle = 0.5;
        if (ai.reverse > 0) {
          ai.reverse -= dt;
          ctl = { throttle: -1, steer: -ctl.steer, brake: 0, handbrake: 0 };
        } else if (Math.abs(v.speed) < 1.2) {
          ai.stuck += dt;
          if (ai.stuck > 1.4) {
            ai.stuck = 0;
            ai.reverse = 1.3;
          }
        } else ai.stuck = 0;
      }
    }
    stepVehicle(v, dt, ctl, layout, effects, {
      onCrash: (car, impact) => {
        if (impact > 6 && game.audio && dist < 60) game.audio.impact(Math.min(1, impact / 14) * 0.6);
      },
    });
  };

  const updateOfficer = (o, dt) => {
    if (o.state === 'dead') {
      o.deadTimer += dt;
      figures.pose(o.slot, o.x, o.y, o.z, o.yaw, 0, POSE_DEAD);
      return;
    }
    const dx = player.x - o.x;
    const dz = player.z - o.z;
    const dist = Math.hypot(dx, dz);
    const sees = dist < 55 && lineOfSight(layout.obstacles, o.x, o.z, player.x, player.z, 1.5);
    if (sees) state.seen = true;
    o.yaw = turnToward(o.yaw, Math.atan2(dx, dz), dt * 8);
    const stop = player.vehicle ? 7 : 2.0;
    if (dist > stop + 0.5) {
      const speed = 5.4;
      const nx = o.x + (dx / dist) * speed * dt;
      const nz = o.z + (dz / dist) * speed * dt;
      const res = resolveCircle(layout.obstacles, nx, nz, 0.35, 0.3);
      const c = clampToWorld(layout, res.x, res.z);
      o.x = c.x;
      o.z = c.z;
      o.phase += dt * 11;
      o.pose = POSE_RUN;
    } else o.pose = POSE_IDLE;
    // Shooting: every second or so, when in sight and not point blank.
    o.shootTimer -= dt;
    if (sees && dist > 2.5 && o.shootTimer <= 0 && !player.dead) {
      o.shootTimer = 0.9 + rng.range(0, 0.6);
      o.pose = POSE_AIM;
      const stars = game.wanted.stars;
      const accuracy = Math.min(0.75, 0.2 + stars * 0.08 + Math.max(0, 0.3 - dist / 100));
      game.combat.npcShoot(o, player.x, player.y + 1.2, player.z, 'pistol', accuracy, 0.45);
    }
    // The arrest: standing next to Sol while she is on foot and slow, or sitting in a stopped car.
    const slow = player.vehicle ? Math.abs(player.vehicle.speed) < 1.0 : player.speed < 2.5;
    if (dist < (player.vehicle ? 3.2 : 1.9) && slow && !player.dead) {
      state.arrestTimer += dt;
      if (state.arrestTimer > (player.vehicle ? 2.2 : 1.1) && game.onArrested) {
        state.arrestTimer = 0;
        game.onArrested();
      }
    }
    o.y = groundHeightAt(layout, o.x, o.z);
    figures.pose(o.slot, o.x, o.y, o.z, o.yaw, o.phase, o.pose);
  };

  /** Put the helicopter mesh at its state and aim the searchlight at Sol. */
  const poseHelicopter = (tilt = 0.1) => {
    heli.position.set(heliState.x, heliState.y, heliState.z);
    heli.rotation.set(tilt, heliState.yaw, 0);
    rotor.rotation.y = heliState.blades;
    tailRotor.rotation.x = heliState.blades * 1.7;
    const lx = player.x - heliState.x;
    const ly = player.y - heliState.y;
    const lz = player.z - heliState.z;
    const local = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), -heliState.yaw);
    spot.target.position.copy(local);
    const len = local.length();
    beam.scale.set(1, len / 34, 1);
    beam.position.copy(local).multiplyScalar(0.5);
    beam.position.y += 0.5;
    heli.updateMatrixWorld(true);
    beam.lookAt(player.x, player.y, player.z);
    beam.rotateX(-Math.PI / 2);
  };

  const updateHelicopter = (dt) => {
    const want = game.wanted.stars >= WANTED.helicopterStars && game.state === 'playing';
    if (want && !heliState.active) {
      heliState.active = true;
      heliState.x = player.x - 120;
      heliState.z = player.z + 80;
      heliState.y = 60;
      heli.visible = true;
      if (game.hud) game.hud.notify('Police helicopter inbound', 'warn');
    }
    if (!want && heliState.active) {
      heliState.active = false;
      heli.visible = false;
    }
    if (!heliState.active) return;
    heliState.angle += dt * 0.35;
    const tx = player.x + Math.cos(heliState.angle) * 26;
    const tz = player.z + Math.sin(heliState.angle) * 26;
    const dx = tx - heliState.x;
    const dz = tz - heliState.z;
    const d = Math.hypot(dx, dz);
    const speed = Math.min(38, d * 1.2);
    if (d > 0.5) {
      heliState.x += (dx / d) * speed * dt;
      heliState.z += (dz / d) * speed * dt;
    }
    heliState.y += (36 - heliState.y) * Math.min(1, dt * 0.8);
    heliState.yaw = turnToward(heliState.yaw, Math.atan2(player.x - heliState.x, player.z - heliState.z), dt * 1.5);
    heliState.blades += dt * 40;
    poseHelicopter(Math.min(0.25, speed * 0.006));
    state.seen = state.seen || Math.hypot(player.x - heliState.x, player.z - heliState.z) < 110;
    // Gunner at five stars.
    if (game.wanted.stars >= 5) {
      state.heliShotTimer -= dt;
      if (state.heliShotTimer <= 0 && !player.dead) {
        state.heliShotTimer = 0.5;
        game.combat.npcShoot({ x: heliState.x, y: heliState.y - 2, z: heliState.z, height: 0 }, player.x, player.y + 1, player.z, 'smg', 0.25, 0.5);
      }
    }
  };

  const api = {
    cruisers, officers, state, heli, heliState, poseHelicopter,
    hurtOfficer(o, amount, fromX, fromZ) {
      if (o.state === 'dead') return;
      o.health -= amount;
      effects.blood(o.x, 1.2, o.z, 4);
      if (o.health <= 0) {
        o.state = 'dead';
        o.deadTimer = 0;
        o.cash = 40;
      }
      void fromX;
      void fromZ;
    },
    /** Officers on foot stand near their cruisers at a mission site or roadblock. */
    spawnOfficer,
    spawnCruiser,
    spawnPointBehind,
    /** A roadblock: two cruisers nose to nose across the road ahead, officers behind them. */
    spawnRoadblock() {
      const pv = player.vehicle;
      const fx = pv ? Math.sin(pv.yaw) : Math.sin(player.yaw);
      const fz = pv ? Math.cos(pv.yaw) : Math.cos(player.yaw);
      const ahead = { x: player.x + fx * 150, z: player.z + fz * 150 };
      const near = layout.nearestRoad(ahead.x, ahead.z);
      if (!near || near.dist > 40) return false;
      const e = near.edge;
      const t = Math.max(14, Math.min(e.len - 14, near.t));
      const cx = e.a.x + e.dx * t;
      const cz = e.a.z + e.dz * t;
      const acrossYaw = Math.atan2(-e.dz, e.dx);
      const rx = -e.dz;
      const rz = e.dx;
      const a = spawnCruiser(cx + rx * 2.6, cz + rz * 2.6, acrossYaw, 'block');
      const b = spawnCruiser(cx - rx * 2.6, cz - rz * 2.6, acrossYaw + Math.PI, 'block');
      if (!a || !b) return false;
      const back = Math.hypot(player.x - cx, player.z - cz) > 0 ? 1 : -1;
      const bx = (cx - player.x);
      const bz = (cz - player.z);
      const bl = Math.hypot(bx, bz) || 1;
      for (let k = -1; k <= 1; k += 1) spawnOfficer(cx + (bx / bl) * 4 * back + rx * k * 3, cz + (bz / bl) * 4 * back + rz * k * 3, Math.atan2(-bx, -bz));
      if (game.hud) game.hud.notify('Roadblock ahead', 'warn');
      return true;
    },
    /** Remove every unit (after an arrest, a respray or a loaded game). */
    reset() {
      for (const v of [...cruisers]) removeCruiser(v);
      for (const o of officers) figures.release(o.slot);
      officers.length = 0;
      heliState.active = false;
      heli.visible = false;
      state.arrestTimer = 0;
    },
    update(dt) {
      state.seen = false;
      const stars = game.wanted.stars;
      const want = stars > 0 ? WANTED.copsPerStar[stars] : 0;
      // Dispatch cruisers up to the star count, one every couple of seconds.
      state.dispatchTimer -= dt;
      const chasing = cruisers.filter((c) => c.ai && c.ai.mode === 'chase' && !c.wrecked).length;
      if (stars > 0 && chasing < want && state.dispatchTimer <= 0) {
        const spot = spawnPointBehind(70, 170);
        if (spot) {
          spawnCruiser(spot.p.x, spot.p.z, spot.yaw, 'chase');
          state.dispatchTimer = 2.5;
        }
      }
      if (stars >= WANTED.roadblockStars && player.vehicle && Math.abs(player.vehicle.speed) > 8) {
        state.roadblockTimer -= dt;
        if (state.roadblockTimer <= 0) {
          state.roadblockTimer = 28;
          api.spawnRoadblock();
        }
      }
      for (let i = cruisers.length - 1; i >= 0; i -= 1) {
        const v = cruisers[i];
        if (v.occupant === 'player' || v.kind !== 'police') {
          cruisers.splice(i, 1);
          continue;
        }
        const dist = Math.hypot(v.x - player.x, v.z - player.z);
        if (stars === 0 || dist > 320 || (v.wrecked && v.burnTimer > 12)) {
          if (stars === 0 && dist < 120 && !v.wrecked) {
            // Stand down: becomes an ordinary parked cruiser.
            v.siren = false;
            v.kind = 'parked';
            v.ai = null;
            cruisers.splice(i, 1);
            continue;
          }
          removeCruiser(v);
          continue;
        }
        if (!v.wrecked) {
          driveCruiser(v, dt);
          if (dist < 80 && lineOfSight(layout.obstacles, v.x, v.z, player.x, player.z, 1.5)) state.seen = true;
        }
      }
      for (let i = officers.length - 1; i >= 0; i -= 1) {
        const o = officers[i];
        const dist = Math.hypot(o.x - player.x, o.z - player.z);
        if ((o.state === 'dead' && o.deadTimer > 20) || dist > 140 || (stars === 0 && dist > 30)) {
          figures.release(o.slot);
          officers.splice(i, 1);
          continue;
        }
        updateOfficer(o, dt);
      }
      if (officers.every((o) => o.state === 'dead' || Math.hypot(o.x - player.x, o.z - player.z) > 2.2)) state.arrestTimer = Math.max(0, state.arrestTimer - dt * 2);
      updateHelicopter(dt);
      if (game.audio) {
        let nearest = Infinity;
        for (const v of cruisers) if (v.siren && !v.wrecked) nearest = Math.min(nearest, Math.hypot(v.x - player.x, v.z - player.z));
        game.audio.siren(nearest < 200 ? Math.max(0.05, 1 - nearest / 200) : 0);
        game.audio.helicopter(heliState.active ? Math.max(0.1, 1 - Math.hypot(heliState.x - player.x, heliState.z - player.z) / 150) : 0);
      }
    },
  };
  return api;
}
