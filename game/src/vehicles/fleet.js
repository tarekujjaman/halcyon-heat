// The fleet: every car in the city (traffic, parked, police, the player's) lives in one pool and is
// drawn through one InstancedMesh per model, one for all the wheels (spinning and steering) and one
// for the lights (headlights, brake lights, the cruisers' flashing bars). Also car-to-car collisions.
import * as THREE from 'three';
import { buildVehicleModels, wheelGeometry, SPECS } from './models.js';
import { coloredMaterial, setInstance, hideInstance } from '../meshkit.js';

const CAPACITY = 48;
const LIGHTS_PER_CAR = 6;
const tmpColor = new THREE.Color();
const RED = new THREE.Color('#ff2a2a');
const BLUE = new THREE.Color('#2a6bff');
const RED_DIM = new THREE.Color('#4a0c0c');
const BLUE_DIM = new THREE.Color('#0c1a4a');
const OFF = new THREE.Color('#1a1a1a');
const HEAD_DAY = new THREE.Color('#d8dde2');
const HEAD_NIGHT = new THREE.Color('#fff6d0');
const TAIL = new THREE.Color('#6a1010');
const TAIL_BRAKE = new THREE.Color('#ff2020');
const TAIL_NIGHT = new THREE.Color('#ff3030');

export function createFleet(scene, effectsRef = null) {
  const models = buildVehicleModels();
  const material = coloredMaterial({ roughness: 0.35, metalness: 0.45 });
  const bodies = {};
  const freeSlots = {};
  for (const [name, m] of Object.entries(models)) {
    const mesh = new THREE.InstancedMesh(m.geometry, material, CAPACITY);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = CAPACITY;
    for (let i = 0; i < CAPACITY; i += 1) {
      hideInstance(mesh, i);
      mesh.setColorAt(i, tmpColor.set('#ffffff'));
    }
    scene.add(mesh);
    bodies[name] = mesh;
    freeSlots[name] = [];
    for (let i = CAPACITY - 1; i >= 0; i -= 1) freeSlots[name].push(i);
  }
  const modelCount = Object.keys(models).length;
  const wheelMesh = new THREE.InstancedMesh(wheelGeometry(), coloredMaterial({ roughness: 0.8 }), CAPACITY * modelCount * 4);
  wheelMesh.castShadow = true;
  wheelMesh.frustumCulled = false;
  for (let i = 0; i < wheelMesh.count; i += 1) hideInstance(wheelMesh, i);
  scene.add(wheelMesh);
  const lightGeom = new THREE.BoxGeometry(0.36, 0.16, 0.1);
  const lightMesh = new THREE.InstancedMesh(lightGeom, new THREE.MeshBasicMaterial({ toneMapped: false }), CAPACITY * modelCount * LIGHTS_PER_CAR);
  lightMesh.frustumCulled = false;
  for (let i = 0; i < lightMesh.count; i += 1) {
    hideInstance(lightMesh, i);
    lightMesh.setColorAt(i, OFF);
  }
  scene.add(lightMesh);
  const modelIndex = Object.fromEntries(Object.keys(models).map((n, i) => [n, i]));

  const vehicles = [];
  let nextId = 1;
  let lastTouching = new Set();

  const fleet = {
    models,
    vehicles,
    /** Put a car of `model` at (x, z) facing `yaw`, painted `color`; kind is traffic, parked, police, player or mission. */
    spawn(model, x, z, yaw, color, kind = 'traffic') {
      const free = freeSlots[model];
      if (!free || free.length === 0) return null;
      const slot = free.pop();
      const spec = SPECS[model];
      const v = {
        id: nextId, model, slot, spec, kind,
        x, y: 0, z, yaw, speed: 0, vLat: 0, steer: 0, wheelSpin: 0,
        throttle: 0, brake: 0, handbrake: 0, braking: false,
        color: new THREE.Color(color), health: 100, alive: true, wrecked: false, burnTimer: 0,
        siren: false, lightsOn: false, flashPhase: Math.random() * 10,
        ai: null, occupant: null, driverFigure: -1, locked: false,
        roll: 0, pitch: 0, lastImpact: 0, horn: 0, resprayed: false, radioStation: 0,
      };
      nextId += 1;
      bodies[model].setColorAt(slot, v.color);
      bodies[model].instanceColor.needsUpdate = true;
      vehicles.push(v);
      return v;
    },
    remove(v) {
      const i = vehicles.indexOf(v);
      if (i === -1) return;
      vehicles.splice(i, 1);
      hideInstance(bodies[v.model], v.slot);
      const base = (modelIndex[v.model] * CAPACITY + v.slot);
      for (let k = 0; k < 4; k += 1) hideInstance(wheelMesh, base * 4 + k);
      for (let k = 0; k < LIGHTS_PER_CAR; k += 1) hideInstance(lightMesh, base * LIGHTS_PER_CAR + k);
      freeSlots[v.model].push(v.slot);
      v.alive = false;
    },
    repaint(v, color) {
      v.color.set(color);
      bodies[v.model].setColorAt(v.slot, v.color);
      bodies[v.model].instanceColor.needsUpdate = true;
    },
    /** Write every instance matrix: bodies with roll and pitch, wheels with spin and steer, lights by state. */
    render(dt, night, time) {
      for (const v of vehicles) {
        const m = models[v.model];
        const body = bodies[v.model];
        const bob = v.wrecked ? -0.08 : 0;
        setInstance(body, v.slot, v.x, v.y + bob, v.z, v.yaw, 1, 1, 1, v.pitch, v.roll);
        const base = (modelIndex[v.model] * CAPACITY + v.slot);
        const sinY = Math.sin(v.yaw);
        const cosY = Math.cos(v.yaw);
        const r = m.spec.wheelRadius;
        v.wheelSpin += (v.speed / r) * dt;
        m.wheels.forEach(([wx, wz], k) => {
          const px = v.x + wx * cosY + wz * sinY;
          const pz = v.z - wx * sinY + wz * cosY;
          const steer = wz > 0 ? v.steer : 0;
          setInstance(wheelMesh, base * 4 + k, px, v.y + r, pz, v.yaw + steer, r, r, r, v.wheelSpin, 0);
        });
        for (let k = 4; k < (m.wheels.length < 4 ? 4 : 0); k += 1) hideInstance(wheelMesh, base * 4 + k);
        if (m.wheels.length < 4) for (let k = m.wheels.length; k < 4; k += 1) hideInstance(wheelMesh, base * 4 + k);
        const L = m.lights;
        const place = (idx, lx, ly, lz, color, sx = 1, sy = 1, sz = 1) => {
          const px = v.x + lx * cosY + lz * sinY;
          const pz = v.z - lx * sinY + lz * cosY;
          setInstance(lightMesh, base * LIGHTS_PER_CAR + idx, px, v.y + ly, pz, v.yaw, sx, sy, sz);
          lightMesh.setColorAt(base * LIGHTS_PER_CAR + idx, color);
        };
        const headColor = v.wrecked ? OFF : night > 0.4 || v.lightsOn ? HEAD_NIGHT : HEAD_DAY;
        const tailColor = v.wrecked ? OFF : v.braking ? TAIL_BRAKE : night > 0.4 || v.lightsOn ? TAIL_NIGHT : TAIL;
        place(0, L.headX, L.headY, L.front, headColor);
        place(1, -L.headX, L.headY, L.front, headColor);
        place(2, L.tailX, L.tailY, L.back, tailColor);
        place(3, -L.tailX, L.tailY, L.back, tailColor);
        if (L.bar) {
          const flash = v.siren ? Math.floor((time + v.flashPhase) * 6) % 2 === 0 : false;
          place(4, L.bar.x, L.bar.y, L.bar.z, v.siren ? (flash ? RED : RED_DIM) : RED_DIM, 1.5, 1.4, 3.2);
          place(5, -L.bar.x, L.bar.y, L.bar.z, v.siren ? (flash ? BLUE_DIM : BLUE) : BLUE_DIM, 1.5, 1.4, 3.2);
          if (v.siren && effectsRef) {
            const bx = v.x + (flash ? L.bar.x : -L.bar.x) * cosY + L.bar.z * sinY;
            const bz = v.z - (flash ? L.bar.x : -L.bar.x) * sinY + L.bar.z * cosY;
            if (flash) effectsRef.flash(bx, v.y + L.bar.y + 0.1, bz, 1, 0.15, 0.1, 2.6);
            else effectsRef.flash(bx, v.y + L.bar.y + 0.1, bz, 0.2, 0.4, 1, 2.6);
          }
        } else {
          hideInstance(lightMesh, base * LIGHTS_PER_CAR + 4);
          hideInstance(lightMesh, base * LIGHTS_PER_CAR + 5);
        }
      }
      for (const body of Object.values(bodies)) body.instanceMatrix.needsUpdate = true;
      wheelMesh.instanceMatrix.needsUpdate = true;
      lightMesh.instanceMatrix.needsUpdate = true;
      lightMesh.instanceColor.needsUpdate = true;
    },
    /** Push overlapping cars apart and trade momentum; `hooks` fires once per fresh contact. */
    collide(hooks) {
      const n = vehicles.length;
      const touching = new Set();
      for (let i = 0; i < n; i += 1) {
        const a = vehicles[i];
        for (let j = i + 1; j < n; j += 1) {
          const b = vehicles[j];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          if (Math.abs(dx) > 7 || Math.abs(dz) > 7) continue;
          const pairKey = a.id * 100000 + b.id;
          // Two circles per car along its axis.
          const ha = a.spec.length / 2 - a.spec.width / 2;
          const hb = b.spec.length / 2 - b.spec.width / 2;
          const ra = a.spec.width / 2 + 0.05;
          const rb = b.spec.width / 2 + 0.05;
          for (const sa of [-ha, ha]) {
            const ax = a.x + Math.sin(a.yaw) * sa;
            const az = a.z + Math.cos(a.yaw) * sa;
            for (const sb of [-hb, hb]) {
              const bx = b.x + Math.sin(b.yaw) * sb;
              const bz = b.z + Math.cos(b.yaw) * sb;
              let ddx = bx - ax;
              let ddz = bz - az;
              const d = Math.hypot(ddx, ddz);
              const minD = ra + rb;
              if (d >= minD || d < 1e-4) continue;
              ddx /= d;
              ddz /= d;
              const push = (minD - d);
              const ma = a.spec.mass;
              const mb = b.spec.mass;
              const total = ma + mb;
              const aStatic = a.kind === 'parked' && !a.ai;
              const bStatic = b.kind === 'parked' && !b.ai;
              const wa = bStatic ? 1 : aStatic ? 0 : mb / total;
              const wb = aStatic ? 1 : bStatic ? 0 : ma / total;
              a.x -= ddx * push * wa;
              a.z -= ddz * push * wa;
              b.x += ddx * push * wb;
              b.z += ddz * push * wb;
              // Relative velocity along the contact normal.
              const avx = Math.sin(a.yaw) * a.speed;
              const avz = Math.cos(a.yaw) * a.speed;
              const bvx = Math.sin(b.yaw) * b.speed;
              const bvz = Math.cos(b.yaw) * b.speed;
              const rel = (avx - bvx) * ddx + (avz - bvz) * ddz;
              if (rel > 0) {
                const impulse = rel * 0.6;
                a.speed -= impulse * (Math.sin(a.yaw) * ddx + Math.cos(a.yaw) * ddz) * wa * 1.4;
                b.speed += impulse * (Math.sin(b.yaw) * ddx + Math.cos(b.yaw) * ddz) * wb * 1.4;
                touching.add(pairKey);
                if (hooks && rel > 2.5 && !lastTouching.has(pairKey)) hooks(a, b, rel, (ax + bx) / 2, (az + bz) / 2);
              }
            }
          }
        }
      }
      lastTouching = touching;
    },
    nearest(x, z, maxDist = 6, filter = null) {
      let best = null;
      let bestD = maxDist;
      for (const v of vehicles) {
        if (filter && !filter(v)) continue;
        const d = Math.hypot(v.x - x, v.z - z);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      return best;
    },
  };
  return fleet;
}
