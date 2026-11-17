// Particles and tracers: tire smoke, dust, sparks, muzzle flashes, blood puffs, car fire and
// explosions and water splashes drawn as camera-facing quads from two InstancedMeshes (soft smoke
// and additive glow) with per-particle colour and alpha, plus a pool of bright tracer lines.
import * as THREE from 'three';

const MAX_SMOKE = 600;
const MAX_GLOW = 400;
const MAX_TRACERS = 48;

const PARTICLE_VERTEX = `
attribute vec3 aColor;
attribute float aAlpha;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vUv = uv;
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAGMENT = `
uniform sampler2D map;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = texture2D(map, vUv).a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`;

function particleLayer(scene, texture, max, additive) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const colors = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const alphas = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  geometry.setAttribute('aColor', colors);
  geometry.setAttribute('aAlpha', alphas);
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture } },
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 6 : 5;
  mesh.count = 0;
  scene.add(mesh);
  return { mesh, colors, alphas, list: [], max };
}

export function createEffects(scene, textures) {
  const smoke = particleLayer(scene, textures.particle, MAX_SMOKE, false);
  const glow = particleLayer(scene, textures.particle, MAX_GLOW, true);
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();

  const tracerGeom = new THREE.BufferGeometry();
  const tracerPositions = new Float32Array(MAX_TRACERS * 2 * 3);
  tracerGeom.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3));
  const tracerMaterial = new THREE.LineBasicMaterial({ color: '#ffe6a0', transparent: true, opacity: 0.9, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = new THREE.LineSegments(tracerGeom, tracerMaterial);
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerList = [];

  const spawn = (layer, p) => {
    if (layer.list.length >= layer.max) layer.list.shift();
    layer.list.push(p);
  };

  const api = {
    /** Grey puff that grows and fades: drifting tires, dust under a crash. */
    smoke(x, y, z, vx = 0, vy = 0.6, vz = 0, size = 1.2, life = 1.3, tint = 0.82, alpha = 0.5) {
      spawn(smoke, { x, y, z, vx, vy, vz, size, grow: size * 1.4, life, max: life, r: tint, g: tint, b: tint, alpha });
    },
    tireSmoke(x, z, vx, vz, amount = 1) {
      if (Math.random() > 0.7 * amount) return;
      api.smoke(x + (Math.random() - 0.5) * 0.8, 0.35, z + (Math.random() - 0.5) * 0.8, vx * 0.12 + (Math.random() - 0.5) * 1.4, 0.8 + Math.random() * 0.6, vz * 0.12 + (Math.random() - 0.5) * 1.4, 1.4 + Math.random() * 1.0, 1.3 + Math.random() * 0.9, 0.8, 0.34);
    },
    /** A one-frame halo (police lights, neon) drawn in the additive layer. */
    flash(x, y, z, r, g, b, size = 1.2) {
      spawn(glow, { x, y, z, vx: 0, vy: 0, vz: 0, size, grow: 0, life: 0.03, max: 0.03, r, g, b, alpha: 0.8 });
    },
    dust(x, z, n = 4) {
      for (let i = 0; i < n; i += 1) api.smoke(x + (Math.random() - 0.5) * 2, 0.3, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2, 1.2, 1.0, 0.72, 0.4);
    },
    sparks(x, y, z, n = 10, speed = 6) {
      for (let i = 0; i < n; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.8);
        spawn(glow, { x, y, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s, size: 0.22, grow: -0.1, life: 0.45, max: 0.45, r: 1, g: 0.75, b: 0.3, alpha: 1, gravity: 12 });
      }
    },
    muzzleFlash(x, y, z, dx, dz) {
      spawn(glow, { x: x + dx * 0.5, y, z: z + dz * 0.5, vx: 0, vy: 0, vz: 0, size: 1.2, grow: 3, life: 0.07, max: 0.07, r: 1, g: 0.8, b: 0.4, alpha: 1 });
      spawn(glow, { x: x + dx * 0.9, y, z: z + dz * 0.9, vx: 0, vy: 0, vz: 0, size: 0.7, grow: 1, life: 0.06, max: 0.06, r: 1, g: 0.97, b: 0.85, alpha: 1 });
      api.smoke(x + dx * 0.6, y, z + dz * 0.6, dx * 1.5, 0.8, dz * 1.5, 0.35, 0.5, 0.9, 0.35);
    },
    hitSparks(x, y, z) {
      api.sparks(x, y, z, 7, 3);
      api.smoke(x, y, z, 0, 0.6, 0, 0.45, 0.5, 0.75, 0.5);
    },
    blood(x, y, z, n = 5) {
      for (let i = 0; i < n; i += 1) {
        spawn(smoke, { x, y, z, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 2, size: 0.25, grow: 0.3, life: 0.5, max: 0.5, r: 0.55, g: 0.04, b: 0.04, alpha: 0.9, gravity: 6 });
      }
    },
    fire(x, y, z, size = 1) {
      spawn(glow, { x: x + (Math.random() - 0.5) * size, y, z: z + (Math.random() - 0.5) * size, vx: 0, vy: 2.5, vz: 0, size: size * 1.4, grow: -0.6, life: 0.6, max: 0.6, r: 1, g: 0.45, b: 0.1, alpha: 0.9 });
      api.smoke(x, y + 0.5, z, (Math.random() - 0.5), 2.2, (Math.random() - 0.5), size * 1.2, 1.8, 0.2, 0.6);
    },
    explosion(x, y, z) {
      for (let i = 0; i < 14; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = 3 + Math.random() * 6;
        spawn(glow, { x, y: y + 0.5, z, vx: Math.cos(a) * s, vy: 3 + Math.random() * 5, vz: Math.sin(a) * s, size: 2.5, grow: 3, life: 0.7, max: 0.7, r: 1, g: 0.5, b: 0.15, alpha: 1 });
      }
      for (let i = 0; i < 20; i += 1) api.smoke(x + (Math.random() - 0.5) * 3, y + 1, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, 2.5, 2.6, 0.18, 0.7);
      api.sparks(x, y + 1, z, 30, 12);
    },
    splash(x, z) {
      for (let i = 0; i < 12; i += 1) {
        spawn(smoke, { x, y: 0, z, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, size: 0.6, grow: 0.8, life: 0.8, max: 0.8, r: 0.9, g: 0.97, b: 1, alpha: 0.8, gravity: 9 });
      }
    },
    /** A bright line from the muzzle toward the hit, fading over a tenth of a second. */
    tracer(x0, y0, z0, x1, y1, z1) {
      if (tracerList.length >= MAX_TRACERS) tracerList.shift();
      tracerList.push({ x0, y0, z0, x1, y1, z1, life: 0.09 });
    },
    update(dt, camera) {
      const step = (layer) => {
        const { list, mesh, colors, alphas } = layer;
        let i = 0;
        for (let k = list.length - 1; k >= 0; k -= 1) {
          const p = list[k];
          p.life -= dt;
          if (p.life <= 0) {
            list.splice(k, 1);
            continue;
          }
          if (p.gravity) p.vy -= p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y < 0.05 && p.gravity) {
            p.y = 0.05;
            p.vy = 0;
            p.vx *= 0.8;
            p.vz *= 0.8;
          }
          p.size += p.grow * dt;
          const t = p.life / p.max;
          const s = Math.max(0.01, p.size);
          pos.set(p.x, p.y, p.z);
          scale.set(s, s, s);
          matrix.compose(pos, camera.quaternion, scale);
          mesh.setMatrixAt(i, matrix);
          colors.setXYZ(i, p.r, p.g, p.b);
          alphas.setX(i, p.alpha * (layer === smoke ? Math.min(1, t * 2.5) : t));
          i += 1;
        }
        mesh.count = i;
        mesh.instanceMatrix.needsUpdate = true;
        colors.needsUpdate = true;
        alphas.needsUpdate = true;
      };
      step(smoke);
      step(glow);
      let n = 0;
      for (let k = tracerList.length - 1; k >= 0; k -= 1) {
        const t = tracerList[k];
        t.life -= dt;
        if (t.life <= 0) {
          tracerList.splice(k, 1);
          continue;
        }
        tracerPositions.set([t.x0, t.y0, t.z0, t.x1, t.y1, t.z1], n * 6);
        n += 1;
      }
      tracerGeom.setDrawRange(0, n * 2);
      tracerGeom.attributes.position.needsUpdate = true;
    },
  };
  return api;
}
