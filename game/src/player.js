// Marisol "Sol" Vega on foot: her figure built from primitives with a walk, run, jump, punch and
// aim animation, movement relative to the camera with collision against the city, gravity, the
// ground height under her, health and armour, and the hooks for footsteps and damage.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { box, sphere, cylinder, merge, coloredMaterial } from './meshkit.js';
import { resolveCircle, clampToWorld } from './collision.js';
import { groundHeightAt } from './city/roads.js';

export function createPlayer(scene, layout) {
  const group = new THREE.Group();
  group.name = 'player';
  const material = coloredMaterial({ roughness: 0.8 });
  const skin = '#c68642';
  const jacket = '#1f9aa8';
  const tee = '#f7f1e3';
  const jeans = '#263a5e';

  const torso = new THREE.Mesh(merge([
    box(0.44, 0.58, 0.26, jacket, 0, 0.29, 0),
    box(0.2, 0.5, 0.02, tee, 0, 0.28, 0.135),
    box(0.46, 0.08, 0.28, '#3b2a1e', 0, -0.02, 0),
  ]), material);
  torso.castShadow = true;
  const headMesh = new THREE.Mesh(merge([
    sphere(0.16, skin, 0, 0, 0, 10, 8),
    box(0.32, 0.12, 0.34, '#1b1b1b', 0, 0.08, -0.02),
    sphere(0.09, '#1b1b1b', 0, 0.1, -0.16, 8, 6),
    box(0.26, 0.05, 0.02, '#2a1a12', 0, 0.02, 0.15),
  ]), material);
  headMesh.castShadow = true;
  const hips = new THREE.Group();
  const makeLeg = (side) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(merge([
      box(0.18, 0.82, 0.2, jeans, 0, -0.41, 0),
      box(0.2, 0.12, 0.3, '#f4f4f0', 0, -0.86, 0.04),
    ]), material);
    mesh.castShadow = true;
    pivot.add(mesh);
    pivot.position.set(side * 0.12, 0, 0);
    return pivot;
  };
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(merge([
      box(0.13, 0.3, 0.15, jacket, 0, -0.15, 0),
      box(0.11, 0.3, 0.13, skin, 0, -0.44, 0),
    ]), material);
    mesh.castShadow = true;
    pivot.add(mesh);
    pivot.position.set(side * 0.29, 0.52, 0);
    return pivot;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);
  const armL = makeArm(1);
  const armR = makeArm(-1);
  const hand = new THREE.Group();
  hand.position.set(0, -0.58, 0.05);
  armR.add(hand);
  const weaponMesh = new THREE.Mesh(merge([
    box(0.07, 0.12, 0.5, '#2b2b30', 0, 0.06, 0.22),
    box(0.05, 0.16, 0.08, '#3a3a40', 0, -0.04, 0.0),
    box(0.04, 0.2, 0.06, '#1b1b1f', 0, -0.1, 0.16),
    box(0.03, 0.03, 0.2, '#6a6a70', 0, 0.13, 0.3),
  ]), material);
  weaponMesh.visible = false;
  hand.add(weaponMesh);

  const body = new THREE.Group();
  body.position.y = 0.88;
  body.add(torso, legL, legR, armL, armR);
  headMesh.position.y = 0.88 + 0.74;
  group.add(body, headMesh);
  scene.add(group);

  const player = {
    group,
    x: 0, y: 0, z: 0, yaw: 0, vy: 0, onGround: true,
    health: PLAYER.maxHealth, armor: 0, maxHealth: PLAYER.maxHealth,
    moving: false, running: false, speed: 0, phase: 0,
    punchTimer: 0, aiming: false, holdingGun: false, hurtTimer: 0, dead: false,
    vehicle: null,
    stepAccumulator: 0,
    onStep: null,
    lastDx: 0, lastDz: 0,
    setPosition(x, z, yaw = 0) {
      player.x = x;
      player.z = z;
      player.yaw = yaw;
      player.y = groundHeightAt(layout, x, z);
      player.vy = 0;
      player.sync();
    },
    showWeapon(visible) {
      weaponMesh.visible = visible;
      player.holdingGun = visible;
    },
    /** Deal damage through armour first; returns true when it killed her. */
    damage(amount) {
      if (player.dead) return false;
      let left = amount;
      if (player.armor > 0) {
        const absorbed = Math.min(player.armor, left * 0.7);
        player.armor -= absorbed;
        left -= absorbed;
      }
      player.health = Math.max(0, player.health - left);
      player.hurtTimer = 0.25;
      if (player.health <= 0) {
        player.dead = true;
        return true;
      }
      return false;
    },
    punch() {
      if (player.punchTimer <= 0) {
        player.punchTimer = 0.42;
        return true;
      }
      return false;
    },
    sync() {
      group.position.set(player.x, player.y, player.z);
      group.rotation.y = player.yaw;
    },
    /** Move from the input axes relative to the camera yaw. */
    update(dt, axes, cameraYaw, wantRun, wantJump, aiming) {
      player.aiming = aiming;
      let mx = axes.x;
      let mz = axes.y;
      const len = Math.hypot(mx, mz);
      player.moving = len > 0.01 && !player.dead;
      player.running = player.moving && wantRun && !aiming;
      const target = player.dead ? 0 : player.running ? PLAYER.runSpeed : aiming ? PLAYER.walkSpeed * 0.8 : PLAYER.walkSpeed;
      player.speed += ((player.moving ? target : 0) - player.speed) * Math.min(1, dt * 9);
      if (player.moving) {
        mx /= len;
        mz /= len;
        // Camera-relative: forward is the direction the camera looks along the ground.
        const fx = Math.sin(cameraYaw);
        const fz = Math.cos(cameraYaw);
        const rx = fz;
        const rz = -fx;
        const dx = fx * mz + rx * mx;
        const dz = fz * mz + rz * mx;
        player.lastDx = dx;
        player.lastDz = dz;
        const wantYaw = aiming ? cameraYaw : Math.atan2(dx, dz);
        player.yaw = turnToward(player.yaw, wantYaw, dt * (aiming ? 20 : 11));
        const nx = player.x + dx * player.speed * dt;
        const nz = player.z + dz * player.speed * dt;
        const pushed = resolveCircle(layout.obstacles, nx, nz, PLAYER.radius, 0.3);
        const clamped = clampToWorld(layout, pushed.x, pushed.z);
        player.x = clamped.x;
        player.z = clamped.z;
      } else if (aiming) {
        player.yaw = turnToward(player.yaw, cameraYaw, dt * 20);
      }
      // Gravity and the ground.
      const ground = groundHeightAt(layout, player.x, player.z);
      if (wantJump && player.onGround && !player.dead) {
        player.vy = PLAYER.jumpSpeed;
        player.onGround = false;
      }
      player.vy -= PLAYER.gravity * dt;
      player.y += player.vy * dt;
      if (player.y <= ground) {
        player.y = ground;
        player.vy = 0;
        player.onGround = true;
      } else player.onGround = false;
      // Animation.
      const cycle = player.running ? 11 : 7.5;
      if (player.moving && player.onGround) {
        player.phase += dt * cycle;
        player.stepAccumulator += dt * cycle;
        if (player.stepAccumulator > Math.PI) {
          player.stepAccumulator -= Math.PI;
          if (player.onStep) player.onStep(player.running);
        }
      } else player.phase += dt * 2;
      if (player.punchTimer > 0) player.punchTimer -= dt;
      if (player.hurtTimer > 0) player.hurtTimer -= dt;
      const swing = player.moving ? (player.running ? 1.05 : 0.6) : 0;
      const s = Math.sin(player.phase) * swing;
      legL.rotation.x = player.onGround ? s : 0.5;
      legR.rotation.x = player.onGround ? -s : -0.3;
      if (player.dead) {
        group.rotation.x = -Math.PI / 2;
        group.position.y = player.y + 0.3;
      } else {
        group.rotation.x = 0;
      }
      if (aiming || (player.holdingGun && player.punchTimer > 0)) {
        armR.rotation.x = -1.5;
        armR.rotation.z = 0.18;
        armL.rotation.x = -1.35;
        armL.rotation.z = -0.3;
      } else if (player.punchTimer > 0) {
        const k = Math.sin((0.42 - player.punchTimer) / 0.42 * Math.PI);
        armR.rotation.x = -1.6 * k;
        armR.rotation.z = -0.05;
        armL.rotation.x = 0.4 * k;
        armL.rotation.z = 0.1;
      } else {
        armR.rotation.x = s;
        armR.rotation.z = -0.08;
        armL.rotation.x = -s;
        armL.rotation.z = 0.08;
      }
      body.position.y = 0.88 + (player.moving ? Math.abs(Math.cos(player.phase)) * 0.04 : 0);
      headMesh.position.y = body.position.y + 0.74;
      player.sync();
    },
  };
  return player;
}

/** Rotate yaw toward target along the short way by at most `step` radians. */
export function turnToward(yaw, target, step) {
  let d = target - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= step) return target;
  return yaw + Math.sign(d) * step;
}
