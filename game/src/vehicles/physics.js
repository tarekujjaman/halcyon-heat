// Arcade car handling: throttle, brakes, speed-sensitive steering, lateral grip that breaks into a
// handbrake drift (with tire smoke), body roll, collisions with buildings and street furniture
// (sparks, damage, a bounce), wrecks that burn and explode, and the ground height under the wheels.
import { resolveCircle, clampToWorld } from '../collision.js';
import { groundHeightAt } from '../city/roads.js';

/** Advance `v` by `dt` under `ctl` {throttle -1..1, steer -1..1, brake 0|1, handbrake 0|1}. */
export function stepVehicle(v, dt, ctl, layout, effects, hooks = {}) {
  const spec = v.spec;
  if (v.wrecked) {
    v.speed *= Math.max(0, 1 - dt * 3);
    v.vLat *= Math.max(0, 1 - dt * 3);
    ctl = { throttle: 0, steer: 0, brake: 0, handbrake: 0 };
  }
  const absSpeed = Math.abs(v.speed);
  const speedFrac = Math.min(1, absSpeed / spec.maxSpeed);
  // The wheel angle (for the front wheels) sharpens at low speed and relaxes at high speed.
  const maxSteer = 0.5 * (1 - 0.7 * speedFrac);
  const steerInput = Math.max(-1, Math.min(1, ctl.steer || 0));
  const targetSteer = steerInput * maxSteer;
  v.steer += (targetSteer - v.steer) * Math.min(1, dt * 9);
  v.steerInput = (v.steerInput || 0) + (steerInput - (v.steerInput || 0)) * Math.min(1, dt * 9);
  // Longitudinal.
  let accel = 0;
  const throttle = ctl.throttle || 0;
  if (throttle > 0) accel = spec.accel * throttle * (1.15 - speedFrac);
  else if (throttle < 0) accel = v.speed > 0.5 ? -spec.brake * 0.8 : -spec.accel * 0.6 * (1 - Math.min(1, absSpeed / (spec.maxSpeed * 0.3)));
  if (ctl.brake) accel = -Math.sign(v.speed) * spec.brake;
  v.braking = throttle < 0 && v.speed > 0.5 || ctl.brake === 1 || (ctl.handbrake && absSpeed > 1);
  v.speed += accel * dt;
  // Drag and rolling resistance.
  const drag = 0.012 * v.speed * absSpeed + (throttle === 0 ? 1.6 * Math.sign(v.speed) : 0);
  if (Math.abs(drag * dt) > absSpeed) v.speed = 0;
  else v.speed -= drag * dt;
  if (ctl.handbrake && absSpeed < 1.5 && throttle === 0) v.speed = 0;
  // Yaw: quick at parking speed, calmer flat out; the handbrake loosens the rear and the tail swings.
  const handbrake = ctl.handbrake ? 1 : 0;
  const turnRate = (2.4 - 1.5 * speedFrac) * Math.min(1, absSpeed / 5) * Math.sign(v.speed || 1);
  const yawRate = v.steerInput * turnRate * (1 + handbrake * 0.35) * (spec.length > 4.9 ? 0.85 : 1);
  v.yaw += yawRate * dt;
  // Turning the nose leaves the velocity pointing where the car was going: that becomes lateral
  // slip, which the tyres' grip pulls back in line. Low grip under the handbrake is the drift.
  v.vLat += v.speed * yawRate * dt;
  v.speed -= Math.abs(v.vLat * yawRate) * dt * 0.3;
  const grip = handbrake ? 1.6 : spec.grip * 1.5;
  v.vLat -= v.vLat * Math.min(1, grip * dt);
  const drifting = Math.abs(v.vLat) > 3.2 && absSpeed > 6;
  v.drifting = drifting;
  if (drifting && effects) {
    const rx = -Math.cos(v.yaw);
    const rz = Math.sin(v.yaw);
    const bx = v.x - Math.sin(v.yaw) * (spec.length / 2 - 0.6);
    const bz = v.z - Math.cos(v.yaw) * (spec.length / 2 - 0.6);
    const amount = Math.min(2.5, Math.abs(v.vLat) * 0.35);
    effects.tireSmoke(bx + rx * 0.8, bz + rz * 0.8, -rx * v.vLat, -rz * v.vLat, amount);
    effects.tireSmoke(bx - rx * 0.8, bz - rz * 0.8, -rx * v.vLat, -rz * v.vLat, amount);
    if (hooks.onSkid) hooks.onSkid(v, Math.abs(v.vLat));
  }
  // Move.
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const rx = -fz;
  const rz = fx;
  const nx = v.x + (fx * v.speed + rx * v.vLat) * dt;
  const nz = v.z + (fz * v.speed + rz * v.vLat) * dt;
  v.x = nx;
  v.z = nz;
  // Collide three circles along the axis with the city.
  const half = spec.length / 2 - spec.width / 2;
  const radius = spec.width / 2 + 0.1;
  let pushX = 0;
  let pushZ = 0;
  let worstImpact = 0;
  let hitNormalX = 0;
  let hitNormalZ = 0;
  let hitTag = null;
  for (const offset of [-half, 0, half]) {
    const px = v.x + fx * offset;
    const pz = v.z + fz * offset;
    const res = resolveCircle(layout.obstacles, px, pz, radius, 0.3);
    if (res.hit) {
      pushX += res.x - px;
      pushZ += res.z - pz;
      const vx = fx * v.speed + rx * v.vLat;
      const vz = fz * v.speed + rz * v.vLat;
      const impact = -(vx * res.nx + vz * res.nz);
      if (impact > worstImpact) {
        worstImpact = impact;
        hitNormalX = res.nx;
        hitNormalZ = res.nz;
        hitTag = res.tag;
      }
    }
  }
  if (pushX !== 0 || pushZ !== 0) {
    v.x += pushX;
    v.z += pushZ;
    if (worstImpact > 0.5) {
      // Remove the velocity into the wall, keep the sliding part, bounce a little.
      const vx = fx * v.speed + rx * v.vLat;
      const vz = fz * v.speed + rz * v.vLat;
      const into = vx * hitNormalX + vz * hitNormalZ;
      const nvx = vx - into * hitNormalX * 1.35;
      const nvz = vz - into * hitNormalZ * 1.35;
      v.speed = nvx * fx + nvz * fz;
      v.vLat = (nvx * rx + nvz * rz) * 0.5;
      if (worstImpact > 3) {
        const dmg = worstImpact * 1.8 * (hitTag === 'palm' || hitTag === 'lamp' || hitTag === 'post' ? 0.5 : 1);
        damageVehicle(v, dmg, effects);
        if (effects) {
          effects.sparks(v.x + fx * half * Math.sign(into < 0 ? 1 : -1), 0.6, v.z + fz * half * Math.sign(into < 0 ? 1 : -1), 10, 5);
          effects.dust(v.x, v.z, 3);
        }
        v.lastImpact = worstImpact;
        if (hooks.onCrash) hooks.onCrash(v, worstImpact, hitTag);
      }
    }
  }
  const clamped = clampToWorld(layout, v.x, v.z, 1);
  if (clamped.x !== v.x || clamped.z !== v.z) {
    v.x = clamped.x;
    v.z = clamped.z;
    v.speed *= 0.5;
  }
  // Ground and body motion.
  const ground = groundHeightAt(layout, v.x, v.z);
  v.y += (ground - v.y) * Math.min(1, dt * 10);
  const targetRoll = -v.steer * speedFrac * 0.12 - v.vLat * 0.012;
  const targetPitch = -accel * 0.004;
  v.roll += (targetRoll - v.roll) * Math.min(1, dt * 6);
  v.pitch += (targetPitch - v.pitch) * Math.min(1, dt * 6);
  // Burning wrecks explode once.
  if (v.wrecked) {
    v.burnTimer += dt;
    if (effects && Math.random() < dt * 14) effects.fire(v.x, v.y + 1.1, v.z, 1.2);
  }
}

/** Take damage; at zero the car becomes a burning wreck and, if `effects` is given, explodes once. */
export function damageVehicle(v, amount, effects, hooks = {}) {
  if (v.wrecked) return false;
  v.health = Math.max(0, v.health - amount);
  if (effects && v.health < 40 && Math.random() < 0.5) effects.smoke(v.x + Math.sin(v.yaw) * 1.5, v.y + 1, v.z + Math.cos(v.yaw) * 1.5, 0, 1.2, 0, 0.8, 1.2, 0.3, 0.5);
  if (v.health <= 0) {
    v.wrecked = true;
    v.health = 0;
    if (effects) effects.explosion(v.x, v.y, v.z);
    if (hooks.onWreck) hooks.onWreck(v);
    return true;
  }
  return false;
}

/** Speed in km/h for the HUD. */
export function kmh(v) {
  return Math.abs(v.speed) * 3.6;
}
