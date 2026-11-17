// The coast: sand, the sea with rolling shader waves and a foam line, the wooden boardwalk with
// kiosks and lifeguard towers, Coral Pier running out to the lighthouse, umbrellas on the strand,
// the harbour with a moored freighter at the docks, and the green hills that close the horizon.
import * as THREE from 'three';
import { BEACH, CITY } from '../config.js';
import { createRng } from '../rng.js';
import { box, cylinder, cone, sphere, merge, colorize, coloredMaterial } from '../meshkit.js';
import { signTexture } from '../textures.js';

const SEA_VERTEX = `
uniform float time;
varying vec3 vWorld;
varying float vWave;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float w = sin(world.x * 0.08 + time * 1.1) * 0.22 + sin(world.z * 0.05 - time * 0.7) * 0.16 + sin((world.x + world.z) * 0.021 + time * 0.5) * 0.24;
  world.y += w;
  vWave = w;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const SEA_FRAGMENT = `
uniform float time;
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float shoreX;
uniform float shoreZ;
uniform float night;
varying vec3 vWorld;
varying float vWave;
void main() {
  float dShore = min(shoreX - vWorld.x, vWorld.z - shoreZ);
  float shallow = 1.0 - smoothstep(0.0, 60.0, dShore);
  vec3 col = mix(deepColor, shallowColor, shallow);
  // Analytic-ish normal from the wave slopes.
  float sx = cos(vWorld.x * 0.08 + time * 1.1) * 0.018 + cos((vWorld.x + vWorld.z) * 0.021 + time * 0.5) * 0.005;
  float sz = -cos(vWorld.z * 0.05 - time * 0.7) * 0.008 + cos((vWorld.x + vWorld.z) * 0.021 + time * 0.5) * 0.005;
  vec3 n = normalize(vec3(-sx * 6.0, 1.0, -sz * 6.0));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 h = normalize(viewDir + sunDir);
  float spec = pow(max(dot(n, h), 0.0), 140.0) * 2.2;
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  col += sunColor * spec * (1.0 - night * 0.6);
  col = mix(col, fogColor * 0.9 + vec3(0.05), fres * 0.5);
  // Foam near the shore, moving with the waves.
  float foam = smoothstep(4.0, 0.0, dShore) * (0.5 + 0.5 * sin(dShore * 1.4 - time * 2.2));
  foam += smoothstep(12.0, 6.0, dShore) * smoothstep(0.25, 0.45, vWave) * 0.7;
  col = mix(col, vec3(0.95, 0.98, 1.0), clamp(foam, 0.0, 1.0));
  float depth = gl_FragCoord.z / gl_FragCoord.w;
  float fogAmount = smoothstep(fogNear, fogFar, depth);
  col = mix(col, fogColor, fogAmount);
  gl_FragColor = vec4(col, 0.96 - shallow * 0.15);
}`;

export function buildBeach(layout, textures) {
  const group = new THREE.Group();
  group.name = 'beach';
  const rng = createRng(layout.seed + 4242);
  const parts = [];
  const obstacles = layout.obstacles;

  // Sand from the boardwalk sloping gently down into the sea, so the waves wash up the strand.
  const sandWidth = BEACH.boardwalkTo - (BEACH.sandTo - 70);
  const sand = new THREE.PlaneGeometry(sandWidth, layout.depth + 160, 24, 1);
  sand.rotateX(-Math.PI / 2);
  sand.translate(BEACH.boardwalkTo - sandWidth / 2, 0, layout.depth / 2 + 10);
  {
    const uv = sand.attributes.uv;
    const pos = sand.attributes.position;
    for (let i = 0; i < uv.count; i += 1) {
      const x = pos.getX(i);
      const beyond = Math.max(0, BEACH.seaEdge - x);
      const y = -0.02 - Math.max(0, BEACH.boardwalkTo - x) * 0.006 - beyond * 0.09 - beyond * beyond * 0.0015;
      pos.setY(i, y);
      uv.setXY(i, x / 6, pos.getZ(i) / 6);
    }
    sand.computeVertexNormals();
  }
  const sandMesh = new THREE.Mesh(sand, new THREE.MeshStandardMaterial({ map: textures.sand, roughness: 1 }));
  sandMesh.receiveShadow = true;
  group.add(sandMesh);

  // Ground under the city and the lawns east and south of it; it stops at the boardwalk and the quay.
  const groundW = layout.width + 17 + 600;
  const groundD = layout.depth + CITY.road / 2 + 9 + 600;
  const groundGeom = new THREE.PlaneGeometry(groundW, groundD);
  groundGeom.rotateX(-Math.PI / 2);
  groundGeom.translate(-17 + groundW / 2, -0.05, -CITY.road / 2 - 9 + groundD / 2);
  {
    const uv = groundGeom.attributes.uv;
    const pos = groundGeom.attributes.position;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, pos.getX(i) / 10, pos.getZ(i) / 10);
  }
  const ground = new THREE.Mesh(groundGeom, new THREE.MeshStandardMaterial({ map: textures.grass, roughness: 1 }));
  ground.receiveShadow = true;
  group.add(ground);

  // The sea: a west sheet and a north sheet (the harbour), one shader.
  const seaUniforms = {
    time: { value: 0 },
    deepColor: { value: new THREE.Color('#1f6f9c') },
    shallowColor: { value: new THREE.Color('#49c0d8') },
    sunDir: { value: new THREE.Vector3(-0.7, 0.2, 0.3).normalize() },
    sunColor: { value: new THREE.Color('#ffd9a0') },
    fogColor: { value: new THREE.Color('#f7c9a0') },
    fogNear: { value: 300 },
    fogFar: { value: 1800 },
    shoreX: { value: BEACH.seaEdge },
    shoreZ: { value: -CITY.road / 2 - 10 },
    night: { value: 0 },
  };
  const seaMaterial = new THREE.ShaderMaterial({ uniforms: seaUniforms, vertexShader: SEA_VERTEX, fragmentShader: SEA_FRAGMENT, transparent: true });
  const west = new THREE.PlaneGeometry(1800, layout.depth + 3600, 150, 120);
  west.rotateX(-Math.PI / 2);
  west.translate(BEACH.seaEdge + 8 - 900, -0.6, layout.depth / 2);
  const north = new THREE.PlaneGeometry(layout.width + 1800, 1800, 120, 60);
  north.rotateX(-Math.PI / 2);
  north.translate(BEACH.seaEdge + 8 + (layout.width + 1800) / 2, -0.6, -CITY.road / 2 - 10 - 900);
  const seaMesh = new THREE.Mesh(merge([west, north]), seaMaterial);
  seaMesh.frustumCulled = false;
  group.add(seaMesh);

  // Boardwalk: a plank deck with a rail toward the sand, kiosks and lifeguard towers.
  const deckGeom = new THREE.BoxGeometry(BEACH.boardwalkFrom - BEACH.boardwalkTo, 0.22, layout.depth + 40);
  deckGeom.translate((BEACH.boardwalkFrom + BEACH.boardwalkTo) / 2, 0.11, layout.depth / 2 + 10);
  {
    const uv = deckGeom.attributes.uv;
    const pos = deckGeom.attributes.position;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
  }
  const deck = new THREE.Mesh(deckGeom, new THREE.MeshStandardMaterial({ map: textures.plank, roughness: 0.9 }));
  deck.receiveShadow = true;
  group.add(deck);
  for (let z = -8; z <= layout.depth + 28; z += 3) {
    if (Math.abs(z - BEACH.pierZ) < 8) continue;
    parts.push(box(0.12, 1.0, 0.12, '#e8e4dc', BEACH.boardwalkTo + 0.3, 0.7, z));
  }
  parts.push(box(0.1, 0.08, BEACH.pierZ - 8 + 8, '#e8e4dc', BEACH.boardwalkTo + 0.3, 1.2, (BEACH.pierZ - 8 - 8) / 2));
  parts.push(box(0.1, 0.08, layout.depth + 28 - BEACH.pierZ - 8, '#e8e4dc', BEACH.boardwalkTo + 0.3, 1.2, (layout.depth + 28 + BEACH.pierZ + 8) / 2));

  const kiosks = [['CORAL ICES', '#ff6fb5', 120], ['RIPTIDE SURF', '#7fd3e8', 250], ['SHELL SHACK', '#ffd36e', 470], ['TACO TIDE', '#ff8a5b', 620]];
  const kioskSigns = [];
  for (const [name, color, z] of kiosks) {
    const x = -24;
    parts.push(box(6, 3.2, 4, rng.pick(['#f6e7c1', '#e9f5ff', '#ffe3ec']), x, 1.8, z));
    parts.push(box(7, 0.3, 5, color, x, 3.55, z));
    parts.push(box(6.6, 0.15, 2.4, color, x + 3.6, 2.9, z));
    obstacles.addBox(x - 3, z - 2, x + 3, z + 2, 3.2, 'kiosk');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: signTexture(name, color, '#1b2430'), toneMapped: false }));
    sign.position.set(x + 3.05, 2.1, z);
    sign.rotation.y = Math.PI / 2;
    kioskSigns.push(sign);
  }
  for (const z of [60, 300, 560]) {
    const x = -46;
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) parts.push(box(0.25, 3.2, 0.25, '#e7d9b8', x + dx, 1.6, z + dz));
    parts.push(box(3.2, 2.2, 3.2, '#f4f4f0', x, 4.3, z));
    parts.push(box(3.6, 0.3, 3.6, '#e0392b', x, 5.55, z));
    parts.push(box(1.0, 0.9, 0.1, '#e0392b', x, 4.3, z + 1.65));
    obstacles.addBox(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 5, 'tower');
  }
  for (let k = 0; k < 40; k += 1) {
    const x = rng.range(-66, -26);
    const z = rng.range(-2, layout.depth + 12);
    if (Math.abs(z - BEACH.pierZ) < 12) continue;
    const color = rng.pick(['#ff6fb5', '#ffd36e', '#7fd3e8', '#ff8a5b', '#9fd98a', '#ffffff']);
    parts.push(cylinder(0.04, 0.04, 2.2, '#f4f4f0', x, 1.1, z, 4));
    parts.push(cone(1.6, 0.7, color, x, 2.3, z, 10));
    parts.push(box(1.8, 0.04, 0.9, rng.pick(['#ff8a5b', '#7fd3e8', '#ffffff']), x + rng.range(-1, 1), 0.02, z + rng.range(1.2, 2.2), rng.range(0, 1)));
  }
  // A volleyball net.
  parts.push(box(0.1, 2.4, 0.1, '#444', -40, 1.2, 200));
  parts.push(box(0.1, 2.4, 0.1, '#444', -40, 1.2, 208));
  parts.push(box(0.04, 1.0, 8, '#f4f4f0', -40, 1.9, 204));

  // Coral Pier: deck on piles, rails, lamps, and the lighthouse at the end.
  const pier = layout.pier;
  const pierDeck = new THREE.BoxGeometry(pier.x1 - pier.x0, 0.4, pier.z1 - pier.z0);
  pierDeck.translate((pier.x0 + pier.x1) / 2, 0.3, (pier.z0 + pier.z1) / 2);
  {
    const uv = pierDeck.attributes.uv;
    const pos = pierDeck.attributes.position;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
  }
  const pierMesh = new THREE.Mesh(pierDeck, deck.material);
  pierMesh.receiveShadow = true;
  pierMesh.castShadow = true;
  group.add(pierMesh);
  for (let x = pier.x0 + 3; x < pier.x1; x += 8) {
    parts.push(cylinder(0.3, 0.3, 4, '#5b4a3a', x, -1.6, pier.z0 + 1.5, 6));
    parts.push(cylinder(0.3, 0.3, 4, '#5b4a3a', x, -1.6, pier.z1 - 1.5, 6));
    parts.push(box(0.12, 1.1, 0.12, '#e8e4dc', x, 1.05, pier.z0 + 0.4));
    parts.push(box(0.12, 1.1, 0.12, '#e8e4dc', x, 1.05, pier.z1 - 0.4));
  }
  parts.push(box(pier.x1 - pier.x0, 0.08, 0.1, '#e8e4dc', (pier.x0 + pier.x1) / 2, 1.6, pier.z0 + 0.4));
  parts.push(box(pier.x1 - pier.x0, 0.08, 0.1, '#e8e4dc', (pier.x0 + pier.x1) / 2, 1.6, pier.z1 - 0.4));
  const lx = pier.x0 + 6;
  parts.push(cylinder(2.2, 2.8, 16, '#f7f3ea', lx, 8.5, BEACH.pierZ, 14));
  parts.push(cylinder(2.3, 2.3, 2.4, '#e0392b', lx, 6, BEACH.pierZ, 14));
  parts.push(cylinder(2.3, 2.3, 2.4, '#e0392b', lx, 12, BEACH.pierZ, 14));
  parts.push(cylinder(1.6, 1.6, 2.2, '#ffe9a8', lx, 17.6, BEACH.pierZ, 10));
  parts.push(cone(2.2, 2.0, '#2a3b4c', lx, 19.6, BEACH.pierZ, 14));
  obstacles.addCircle(lx, BEACH.pierZ, 2.9, 18, 'lighthouse');
  parts.push(box(8, 3, 6, '#f6e7c1', pier.x0 + 20, 1.9, BEACH.pierZ));
  parts.push(box(9, 0.3, 7, '#7fd3e8', pier.x0 + 20, 3.5, BEACH.pierZ));
  obstacles.addBox(pier.x0 + 16, BEACH.pierZ - 3, pier.x0 + 24, BEACH.pierZ + 3, 3, 'kiosk');

  // The harbour: a freighter moored off the docks, buoys, and a breakwater.
  const shipX = layout.width * 0.55;
  const shipZ = -CITY.road / 2 - 36;
  parts.push(box(120, 9, 22, '#3b4a5a', shipX, 2.5, shipZ));
  parts.push(box(124, 1.2, 24, '#c84a3a', shipX, -1.4, shipZ));
  parts.push(box(118, 0.5, 20, '#8f8f8f', shipX, 7.2, shipZ));
  parts.push(box(16, 12, 18, '#e8e8e8', shipX + 44, 13, shipZ));
  parts.push(box(10, 4, 10, '#d9d9d9', shipX + 44, 21, shipZ));
  parts.push(cylinder(1.2, 1.4, 6, '#c84a3a', shipX + 46, 25.5, shipZ, 8));
  const cColors = ['#c8502e', '#2e6fb5', '#2f8f5a', '#d6a63a', '#8c8c8c'];
  for (let k = 0; k < 8; k += 1) {
    for (let s = 0; s < 3; s += 1) parts.push(box(12, 2.6, 2.4, rng.pick(cColors), shipX - 50 + k * 12.5, 8.8 + s * 2.6, shipZ + (s % 2 ? 3 : -3)));
  }
  for (let k = 0; k < 6; k += 1) {
    parts.push(sphere(1.1, '#e0392b', BEACH.seaEdge - 40 - k * 25, 0, 120 + k * 90, 8, 6));
  }
  parts.push(box(260, 2.2, 6, '#8d8778', layout.width * 0.4, 0.3, -CITY.road / 2 - 95));

  // Hills to the south and east: flattened green domes fading into the haze.
  const hills = [];
  const hillSpots = [
    [layout.width * 0.2, layout.depth + 520, 420, 130], [layout.width * 0.65, layout.depth + 600, 520, 170],
    [layout.width + 460, layout.depth * 0.4, 380, 120], [layout.width + 560, layout.depth * 0.9, 480, 160],
    [layout.width + 420, -120, 330, 100], [layout.width * 1.05, layout.depth + 420, 300, 90],
  ];
  for (const [x, z, r, h] of hillSpots) {
    const g = new THREE.SphereGeometry(1, 20, 12);
    const colors = new Float32Array(g.attributes.position.count * 3);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const t = Math.max(0, pos.getY(i));
      const c = new THREE.Color().setHSL(0.26 - t * 0.08, 0.45, 0.28 + t * 0.2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.scale(r, h, r * 0.8);
    g.translate(x, -h * 0.25, z);
    hills.push(g);
  }
  const hillMesh = new THREE.Mesh(merge(hills), coloredMaterial({ roughness: 1 }));
  group.add(hillMesh);

  const partsMesh = new THREE.Mesh(merge(parts), coloredMaterial({ roughness: 0.8 }));
  partsMesh.castShadow = true;
  partsMesh.receiveShadow = true;
  group.add(partsMesh);
  for (const s of kioskSigns) group.add(s);

  return {
    group,
    seaUniforms,
    update(time) {
      seaUniforms.time.value = time;
    },
    setSun(dir, color, fogColor, night) {
      seaUniforms.sunDir.value.copy(dir);
      seaUniforms.sunColor.value.copy(color);
      seaUniforms.fogColor.value.copy(fogColor);
      seaUniforms.night.value = night;
    },
  };
}
