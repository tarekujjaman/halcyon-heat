// Street furniture: palms along the ocean drive, the plaza and the villa streets, street lamps on
// every road (lit at night with a pool of light), traffic lights at every inner crossing whose lamps
// follow the layout's light phases, benches, hydrants, bus shelters and bins. Trunks, crowns, poles
// and lamps are InstancedMeshes; the rest is merged once.
import * as THREE from 'three';
import { CITY, LANES } from '../config.js';
import { createRng } from '../rng.js';
import { box, cylinder, merge, colorize, coloredMaterial, setInstance } from '../meshkit.js';
import { SLAB_HEIGHT } from './roads.js';

const GREEN = new THREE.Color('#37e36a');
const YELLOW = new THREE.Color('#ffd23f');
const RED = new THREE.Color('#ff3b3b');
const DARK = new THREE.Color('#1c1c1c');

export function buildProps(layout, textures) {
  const group = new THREE.Group();
  group.name = 'props';
  const rng = createRng(layout.seed + 991);
  const palms = [];
  const lamps = [];
  const furniture = [];
  const obstacles = layout.obstacles;

  const addPalm = (x, z, scale = 1) => {
    palms.push({ x, z, scale, lean: rng.range(-0.08, 0.08), yaw: rng.range(0, Math.PI * 2) });
    obstacles.addCircle(x, z, 0.35 * scale, 8 * scale, 'palm');
  };
  const addLamp = (x, z, yaw) => {
    lamps.push({ x, z, yaw });
    obstacles.addCircle(x, z, 0.22, 7, 'lamp');
  };

  // Palms along the beach side of ocean drive and the boardwalk, in the plaza and on villa streets.
  for (let z = -4; z <= layout.depth + 4; z += 11) {
    addPalm(-7.6, z + rng.range(-1, 1), rng.range(0.9, 1.25));
    addPalm(-15.5, z + 5 + rng.range(-1, 1), rng.range(0.8, 1.1));
    if (!layout.isWater(10, z)) addPalm(layout.roadX[0] + LANES.sidewalk - 0.2, z + 5.5 + rng.range(-1, 1), rng.range(0.9, 1.2));
  }
  for (let k = 0; k < 90; k += 1) addPalm(rng.range(-70, -22), rng.range(-6, layout.depth + 10), rng.range(0.7, 1.2));
  for (const b of layout.blocks) {
    if (b.district === 'palmetto' || b.district === 'coral') {
      for (let t = 6; t < b.w; t += 13) {
        if (rng.chance(0.8)) addPalm(b.x0 + t, b.z0 - 1.6, rng.range(0.8, 1.1));
        if (rng.chance(0.8)) addPalm(b.x0 + t, b.z1 + 1.6, rng.range(0.8, 1.1));
      }
    }
    if (b.special === 'plaza') {
      for (let k = 0; k < 10; k += 1) {
        const a = (k / 10) * Math.PI * 2;
        addPalm(b.cx + Math.cos(a) * 20, b.cz + Math.sin(a) * 20, 1.0);
      }
    }
    if (b.special === 'park') {
      for (let k = 0; k < 18; k += 1) addPalm(b.x0 + 4 + rng.range(0, b.w - 8), b.z0 + 4 + rng.range(0, b.d - 8), rng.range(0.8, 1.3));
    }
    if (b.district === 'glasswater' && !b.special) {
      for (let t = 8; t < b.w; t += 16) if (rng.chance(0.5)) addPalm(b.x0 + t, b.z1 + 1.6, 0.9);
    }
  }

  // Street lamps on both sides of every road segment, every 24 m, pointing at the road.
  for (const e of layout.edges) {
    const r = { x: -e.dz, z: e.dx };
    for (let t = 15; t < e.len - 10; t += 24) {
      for (const side of [1, -1]) {
        const x = e.a.x + e.dx * t + r.x * (LANES.curb + 0.8) * side;
        const z = e.a.z + e.dz * t + r.z * (LANES.curb + 0.8) * side;
        if (layout.isWater(x, z)) continue;
        addLamp(x, z, Math.atan2(-r.x * side, -r.z * side));
      }
    }
  }

  // Traffic lights: one post at each corner of an inner crossing, its lamps facing the approach.
  const lights = [];
  for (const n of layout.nodes) {
    if (!n.hasLights) continue;
    const c = CITY.asphalt / 2 + 0.9;
    // Corners: the post stands on the near-right corner of each approach.
    lights.push({ node: n, x: n.x + c, z: n.z - c, yaw: Math.PI, horizontal: false });
    lights.push({ node: n, x: n.x - c, z: n.z + c, yaw: 0, horizontal: false });
    lights.push({ node: n, x: n.x - c, z: n.z - c, yaw: Math.PI / 2, horizontal: true });
    lights.push({ node: n, x: n.x + c, z: n.z + c, yaw: -Math.PI / 2, horizontal: true });
  }
  for (const l of lights) obstacles.addCircle(l.x, l.z, 0.2, 6, 'post');

  // Benches, hydrants, bins and bus shelters along the blocks.
  for (const b of layout.blocks) {
    if (b.district === 'canal') continue;
    const r2 = createRng(b.seed + 5);
    const y = SLAB_HEIGHT;
    const edgeZ = b.z1 + 1.5;
    if (r2.chance(0.6)) {
      const x = b.x0 + r2.range(8, b.w - 8);
      furniture.push(box(1.8, 0.08, 0.5, '#8b5a2b', x, y + 0.45, edgeZ));
      furniture.push(box(1.8, 0.5, 0.08, '#8b5a2b', x, y + 0.75, edgeZ - 0.24));
      furniture.push(box(0.1, 0.45, 0.5, '#333', x - 0.8, y + 0.22, edgeZ));
      furniture.push(box(0.1, 0.45, 0.5, '#333', x + 0.8, y + 0.22, edgeZ));
    }
    if (r2.chance(0.5)) {
      const x = b.x0 + r2.range(4, b.w - 4);
      furniture.push(cylinder(0.18, 0.2, 0.7, '#e0392b', x, y + 0.35, b.z0 - 1.2, 8));
      furniture.push(cylinder(0.22, 0.22, 0.2, '#e0392b', x, y + 0.78, b.z0 - 1.2, 8));
    }
    if (r2.chance(0.5)) {
      const z = b.z0 + r2.range(4, b.d - 4);
      furniture.push(cylinder(0.32, 0.3, 0.9, '#3a5f4a', b.x1 + 1.4, y + 0.45, z, 8));
    }
    if (r2.chance(0.25) && b.district !== 'palmetto') {
      const x = b.x0 + r2.range(10, b.w - 10);
      furniture.push(box(4, 0.15, 1.6, '#2a6fb5', x, y + 2.6, edgeZ));
      furniture.push(box(0.12, 2.5, 0.12, '#444', x - 1.9, y + 1.3, edgeZ - 0.7));
      furniture.push(box(0.12, 2.5, 0.12, '#444', x + 1.9, y + 1.3, edgeZ - 0.7));
      furniture.push(box(4, 1.6, 0.06, '#9fd3f0', x, y + 1.6, edgeZ - 0.7));
      furniture.push(box(3.6, 0.08, 0.4, '#555', x, y + 0.5, edgeZ - 0.4));
    }
  }

  // Palm instanced meshes: tapered trunk and a crown of frond planes.
  const trunkGeom = colorize(new THREE.CylinderGeometry(0.16, 0.3, 7, 7), '#8a6a44');
  trunkGeom.translate(0, 3.5, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeom, coloredMaterial({ roughness: 0.9 }), palms.length);
  trunkMesh.castShadow = true;
  const crownParts = [];
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(1.7, 4.6);
    g.translate(0, 2.1, 0);
    g.rotateX(-1.25);
    g.rotateY(a);
    crownParts.push(g);
  }
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    const g = new THREE.PlaneGeometry(1.4, 3.4);
    g.translate(0, 1.6, 0);
    g.rotateX(-0.7);
    g.rotateY(a);
    crownParts.push(g);
  }
  const crownGeom = merge(crownParts);
  const crownMaterial = new THREE.MeshStandardMaterial({ map: textures.frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, color: '#ffffff' });
  const crownMesh = new THREE.InstancedMesh(crownGeom, crownMaterial, palms.length);
  crownMesh.castShadow = true;
  const coconuts = colorize(new THREE.SphereGeometry(0.22, 6, 5), '#5a4a2a');
  const coconutMesh = new THREE.InstancedMesh(coconuts, coloredMaterial(), palms.length);
  palms.forEach((p, i) => {
    setInstance(trunkMesh, i, p.x, 0, p.z, p.yaw, p.scale, p.scale, p.scale, p.lean, p.lean * 0.5);
    const top = 7 * p.scale;
    setInstance(crownMesh, i, p.x + p.lean * top * 0.6, top - 0.4 * p.scale, p.z, p.yaw, p.scale, p.scale, p.scale);
    setInstance(coconutMesh, i, p.x + p.lean * top * 0.6, top - 0.5 * p.scale, p.z, 0, p.scale, p.scale, p.scale);
  });
  group.add(trunkMesh, crownMesh, coconutMesh);

  // Lamp posts: pole with an arm and a lamp head; the heads glow at night.
  const poleGeom = merge([
    colorize(new THREE.CylinderGeometry(0.09, 0.14, 6.5, 6), '#3b4149').translate(0, 3.25, 0),
    box(0.12, 0.12, 2.2, '#3b4149', 0, 6.4, 1.0),
    box(0.9, 0.22, 0.6, '#2d3238', 0, 6.3, 2.0),
  ]);
  const poleMesh = new THREE.InstancedMesh(poleGeom, coloredMaterial({ roughness: 0.6, metalness: 0.4 }), lamps.length);
  poleMesh.castShadow = true;
  const headGeom = box(0.7, 0.1, 0.45, '#fff2cc', 0, 6.18, 2.0);
  const headMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.9 });
  const headMesh = new THREE.InstancedMesh(headGeom, headMaterial, lamps.length);
  const poolGeom = new THREE.CircleGeometry(5, 16);
  poolGeom.rotateX(-Math.PI / 2);
  poolGeom.translate(0, 0.08, 2.0);
  const poolMaterial = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolMesh = new THREE.InstancedMesh(poolGeom, poolMaterial, lamps.length);
  lamps.forEach((l, i) => {
    setInstance(poleMesh, i, l.x, SLAB_HEIGHT, l.z, l.yaw);
    setInstance(headMesh, i, l.x, SLAB_HEIGHT, l.z, l.yaw);
    setInstance(poolMesh, i, l.x, SLAB_HEIGHT, l.z, l.yaw);
  });
  group.add(poleMesh, headMesh, poolMesh);

  // Traffic light posts and lamps.
  const postGeom = merge([
    colorize(new THREE.CylinderGeometry(0.1, 0.12, 5.2, 6), '#2b2f33').translate(0, 2.6, 0),
    box(0.1, 0.1, 2.6, '#2b2f33', 0, 5.1, 1.2),
    box(0.5, 1.3, 0.4, '#1f2225', 0, 4.65, 2.3),
  ]);
  const postMesh = new THREE.InstancedMesh(postGeom, coloredMaterial({ roughness: 0.6 }), lights.length);
  postMesh.castShadow = true;
  const lampGeom = new THREE.BoxGeometry(0.3, 0.3, 0.12);
  const lampMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const lampMesh = new THREE.InstancedMesh(lampGeom, lampMaterial, lights.length * 3);
  lights.forEach((l, i) => {
    setInstance(postMesh, i, l.x, SLAB_HEIGHT, l.z, l.yaw);
    for (let k = 0; k < 3; k += 1) {
      const lz = 2.3 + 0.2;
      const ly = 5.1 - k * 0.4;
      const wx = l.x + Math.sin(l.yaw) * lz;
      const wz = l.z + Math.cos(l.yaw) * lz;
      setInstance(lampMesh, i * 3 + k, wx, SLAB_HEIGHT + ly, wz, l.yaw);
      lampMesh.setColorAt(i * 3 + k, DARK);
    }
  });
  group.add(postMesh, lampMesh);

  const furnitureMesh = new THREE.Mesh(merge(furniture), coloredMaterial({ roughness: 0.8 }));
  furnitureMesh.castShadow = true;
  furnitureMesh.receiveShadow = true;
  group.add(furnitureMesh);

  return {
    group,
    palms,
    lamps,
    /** Colour every traffic lamp from the layout's phase at game time `t`. */
    updateLights(t) {
      lights.forEach((l, i) => {
        const state = layout.lightFor(l.node, l.horizontal, t);
        lampMesh.setColorAt(i * 3, state === 'red' ? RED : DARK);
        lampMesh.setColorAt(i * 3 + 1, state === 'yellow' ? YELLOW : DARK);
        lampMesh.setColorAt(i * 3 + 2, state === 'green' ? GREEN : DARK);
      });
      lampMesh.instanceColor.needsUpdate = true;
    },
    setNight(amount) {
      poolMaterial.opacity = amount * 0.35;
      headMaterial.opacity = 0.5 + amount * 0.5;
    },
  };
}
