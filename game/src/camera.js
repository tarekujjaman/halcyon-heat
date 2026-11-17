// The third-person camera: a mouse-look orbit around Sol on foot, an over-the-shoulder view when
// she aims, and a chase camera that trails the car and settles behind it, all kept out of walls.
import * as THREE from 'three';
import { CAMERA } from './config.js';
import { raycastObstacles } from './collision.js';

export function createCamera(layout) {
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
  const state = {
    yaw: Math.PI,
    pitch: 0.22,
    distance: CAMERA.footDistance,
    sensitivity: CAMERA.sensitivity,
    shake: 0,
    mode: 'foot',
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    returnTimer: 0,
  };
  const desired = new THREE.Vector3();
  const look = new THREE.Vector3();

  return {
    camera,
    state,
    /** Turn from mouse deltas. */
    look(dx, dy) {
      if (dx === 0 && dy === 0) return;
      state.yaw -= dx * state.sensitivity;
      state.pitch = Math.max(-0.35, Math.min(1.1, state.pitch + dy * state.sensitivity));
      state.returnTimer = 2.2;
    },
    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    },
    /** Follow the player on foot (aiming pulls in over the shoulder) or the car with a chase view. */
    update(dt, player, vehicle, aiming, speed) {
      let tx;
      let ty;
      let tz;
      let dist;
      let height;
      if (vehicle) {
        state.mode = 'car';
        // Settle behind the car unless the mouse recently moved the view.
        state.returnTimer -= dt;
        if (state.returnTimer <= 0) {
          const back = vehicle.speed < -2 ? vehicle.yaw : vehicle.yaw + Math.PI;
          state.yaw = lerpAngle(state.yaw, back, Math.min(1, dt * 3.2));
          state.pitch += (0.2 - state.pitch) * Math.min(1, dt * 2);
        }
        tx = vehicle.x;
        ty = vehicle.y + 1.2;
        tz = vehicle.z;
        dist = CAMERA.carDistance + Math.min(4, Math.abs(speed) * 0.08);
        height = CAMERA.carHeight;
      } else {
        state.mode = aiming ? 'aim' : 'foot';
        state.returnTimer = 0;
        tx = player.x;
        ty = player.y + 1.45;
        tz = player.z;
        dist = aiming ? CAMERA.aimDistance : CAMERA.footDistance;
        height = aiming ? 0.3 : 0.6;
      }
      const targetDist = dist;
      state.distance += (targetDist - state.distance) * Math.min(1, dt * 6);
      const d = state.distance;
      const cy = Math.cos(state.pitch);
      let ox = -Math.sin(state.yaw) * cy * d;
      let oz = -Math.cos(state.yaw) * cy * d;
      let oy = Math.sin(state.pitch) * d + height;
      if (aiming && !vehicle) {
        // Over the right shoulder.
        const rx = Math.cos(state.yaw);
        const rz = -Math.sin(state.yaw);
        ox += rx * 0.7;
        oz += rz * 0.7;
      }
      desired.set(tx + ox, ty + oy, tz + oz);
      // Pull the camera in when a wall is between it and the target.
      const ddx = desired.x - tx;
      const ddz = desired.z - tz;
      const horiz = Math.hypot(ddx, ddz);
      if (horiz > 0.5) {
        const hit = raycastObstacles(layout.obstacles, tx, tz, ddx / horiz, ddz / horiz, horiz, 1.0);
        if (hit.dist < horiz) {
          const k = Math.max(0.15, (hit.dist - 0.5) / horiz);
          desired.set(tx + ddx * k, ty + (desired.y - ty) * k, tz + ddz * k);
        }
      }
      if (desired.y < 0.6) desired.y = 0.6;
      const follow = vehicle ? Math.min(1, dt * 10) : Math.min(1, dt * 16);
      state.position.lerp(desired, follow);
      look.set(tx, ty + (vehicle ? 0.4 : 0.1), tz);
      if (state.shake > 0) {
        state.position.x += (Math.random() - 0.5) * state.shake;
        state.position.y += (Math.random() - 0.5) * state.shake;
        state.shake = Math.max(0, state.shake - dt * 1.5);
      }
      camera.position.copy(state.position);
      camera.lookAt(look);
      state.target.copy(look);
    },
    /** Place the camera outright (scene setup and screenshots). */
    snap(x, y, z, lookX, lookY, lookZ) {
      state.position.set(x, y, z);
      camera.position.set(x, y, z);
      camera.lookAt(lookX, lookY, lookZ);
      state.yaw = Math.atan2(lookX - x, lookZ - z);
    },
    /** Set the orbit so the next update lands right behind `yaw`. */
    settleBehind(yaw, pitch = 0.2) {
      state.yaw = yaw + Math.PI;
      state.pitch = pitch;
      state.returnTimer = 0;
    },
  };
}

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
