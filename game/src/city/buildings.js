// The skyline: every block is split into lots and filled by its district's builder. Glasswater
// gets glass towers on podiums, Neon Row a wall of shops with glowing signs, Coral Strand pastel
// beach hotels, Palmetto Heights villas with pools and hedges, Saltmarsh warehouses, containers
// and cranes. Landmark lots (the bank, the police station, the hospital, Teo's garage, the plaza,
// Club Mirage) get their own fronts. Walls are merged per window style so the city is a few draws.
import * as THREE from 'three';
import { CITY } from '../config.js';
import { createRng } from '../rng.js';
import { box, cylinder, cone, merge, colorize, coloredMaterial, place } from '../meshkit.js';
import { signTexture, billboardTexture } from '../textures.js';
import { SLAB_HEIGHT } from './roads.js';

const TILE = { glass: 9, tower: 10, stucco: 7, deco: 8, villa: 6, warehouse: 12, neon: 7 };

/** Four walls (no roof or floor) of a w by h by d box, texture tiled every `tile` metres. */
function walls(w, h, d, tile, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = g.attributes.position.array;
  const nor = g.attributes.normal.array;
  const uv = g.attributes.uv.array;
  // Non-indexed box: 6 vertices per face, faces in +x -x +y -y +z -z order. Keep faces 0,1,4,5.
  const keep = [0, 1, 4, 5];
  const p = new Float32Array(keep.length * 18);
  const n = new Float32Array(keep.length * 18);
  const u = new Float32Array(keep.length * 12);
  keep.forEach((face, k) => {
    p.set(pos.subarray(face * 18, face * 18 + 18), k * 18);
    n.set(nor.subarray(face * 18, face * 18 + 18), k * 18);
    const fw = face < 2 ? d : w;
    for (let v = 0; v < 6; v += 1) {
      u[k * 12 + v * 2] = uv[face * 12 + v * 2] * (fw / tile);
      u[k * 12 + v * 2 + 1] = uv[face * 12 + v * 2 + 1] * (h / tile);
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  out.translate(x, y + h / 2, z);
  return out;
}

export function buildBuildings(layout, textures) {
  const byStyle = {};
  for (const style of Object.keys(TILE)) byStyle[style] = [];
  const details = [];
  const glowParts = [];
  const signs = [];
  const group = new THREE.Group();
  group.name = 'buildings';
  const obstacles = layout.obstacles;
  const y0 = SLAB_HEIGHT;
  const billboardTexts = [
    ['SUNLINE COLA', 'Taste the bay.', ['#ff8a5b', '#ffd36e']],
    ['PALMETTO REALTY', 'Live higher.', ['#9fd98a', '#e6f5b8']],
    ['HALCYON FM 101.3', 'All night synth.', ['#ff6fb5', '#7fd3e8']],
    ["TEO'S BODY SHOP", 'Any colour, no questions.', ['#f6c177', '#ffeec2']],
    ['CORAL 88', 'Chill since forever.', ['#7fd3e8', '#c8f0ff']],
    ['RIPTIDE SURF', 'Ride the strand.', ['#4aa3c8', '#9fe3f4']],
  ];
  let billboardIndex = 0;

  const addBuilding = (style, x, z, w, d, h, roofColor, opts = {}) => {
    byStyle[style].push(walls(w, h, d, TILE[style], x, y0, z));
    details.push(box(w + 0.2, 0.5, d + 0.2, roofColor, x, y0 + h + 0.25, z));
    details.push(box(w, 0.4, 0.5, opts.parapet || roofColor, x, y0 + h + 0.7, z - d / 2 + 0.25));
    details.push(box(w, 0.4, 0.5, opts.parapet || roofColor, x, y0 + h + 0.7, z + d / 2 - 0.25));
    details.push(box(0.5, 0.4, d, opts.parapet || roofColor, x - w / 2 + 0.25, y0 + h + 0.7, z));
    details.push(box(0.5, 0.4, d, opts.parapet || roofColor, x + w / 2 - 0.25, y0 + h + 0.7, z));
    obstacles.addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h, 'building');
    return { x, z, w, d, h };
  };

  const roofDetails = (rng, b, kind) => {
    const top = y0 + b.h + 0.5;
    if (kind === 'tower') {
      details.push(box(b.w * 0.3, 3, b.d * 0.3, '#8d9399', b.x, top + 1.5, b.z));
      if (rng.chance(0.6)) details.push(cylinder(0.12, 0.12, 9, '#c7ccd1', b.x + b.w * 0.2, top + 4.5, b.z - b.d * 0.2, 6));
      if (rng.chance(0.5)) details.push(cylinder(1.4, 1.4, 2.2, '#9aa3ab', b.x - b.w * 0.25, top + 1.1, b.z + b.d * 0.2, 10));
      for (let k = 0; k < 3; k += 1) details.push(box(1.6, 1.2, 1.2, '#b8bec4', b.x + rng.range(-0.35, 0.35) * b.w, top + 0.6, b.z + rng.range(-0.35, 0.35) * b.d));
      if (b.h > 70) {
        details.push(box(b.w * 0.5, 4, b.d * 0.5, '#5c7f93', b.x, top + 2, b.z));
        details.push(cylinder(0.25, 0.25, 14, '#d8dde2', b.x, top + 11, b.z, 6));
        glowParts.push(box(0.9, 0.9, 0.9, '#ff5a3c', b.x, top + 18.4, b.z));
      }
    } else if (kind === 'low') {
      if (rng.chance(0.7)) details.push(box(1.4, 1.0, 1.0, '#aeb4ba', b.x + rng.range(-0.3, 0.3) * b.w, top + 0.5, b.z + rng.range(-0.3, 0.3) * b.d));
      if (rng.chance(0.4)) details.push(cylinder(1.0, 1.0, 1.6, '#9c8f7a', b.x - b.w * 0.25, top + 0.8, b.z - b.d * 0.2, 8));
      if (rng.chance(0.5)) details.push(box(2.2, 2.4, 2.2, '#8f8275', b.x + b.w * 0.25, top + 1.2, b.z + b.d * 0.25));
    }
  };

  const addSign = (text, color, x, y, z, yaw, w = 10, h = 2.5, background = '#140b1c') => {
    const tex = signTexture(text, color, background);
    const g = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    signs.push(mesh);
    details.push(box(w + 0.4, h + 0.4, 0.3, '#1a1420', x - Math.sin(yaw) * 0.2, y, z - Math.cos(yaw) * 0.2, yaw));
  };

  const addBillboard = (x, z, yaw, rng) => {
    const [headline, tagline, colors] = billboardTexts[billboardIndex % billboardTexts.length];
    billboardIndex += 1;
    const tex = billboardTexture(headline, tagline, colors);
    const w = 12;
    const h = 6;
    const y = 16;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    signs.push(mesh);
    const bx = x - Math.sin(yaw) * 0.3;
    const bz = z - Math.cos(yaw) * 0.3;
    details.push(box(w + 0.6, h + 0.6, 0.4, '#2b2b2e', bx, y, bz, yaw));
    details.push(cylinder(0.35, 0.45, y - h / 2, '#4a4a4e', bx, (y - h / 2) / 2 + y0, bz, 8));
    obstacles.addCircle(bx, bz, 0.5, 4, 'post');
  };

  const neonNames = [
    ['THE LAGOON', '#ff6fb5'], ['TIDEWATER TATTOO', '#7fd3e8'], ['SALT & SMOKE', '#ffb14a'], ['MANGO MANGO', '#ffe66d'],
    ['RIPTIDE RECORDS', '#7cf7d4'], ['CASA LUZ', '#ff8fd0'], ['VELVET REEF', '#c58cff'], ['NIGHTJAR', '#5ee8ff'],
    ['SUGARCANE BAR', '#ff7a7a'], ['PIXEL ARCADE', '#8dff7a'], ['BAYSIDE NOODLES', '#ffd36e'], ['MOTEL LUNA', '#ff6fb5'],
    ['DISCO PELICAN', '#7fd3e8'], ['KARAOKE 88', '#ffb14a'], ['OCEAN DRIVE DINER', '#7cf7d4'], ['PAWN & PEARL', '#c58cff'],
  ];
  let neonIndex = 0;

  for (const b of layout.blocks) {
    const rng = createRng(b.seed);
    if (b.district === 'canal') continue;
    if (b.special) {
      buildSpecial(b, rng);
      continue;
    }
    if (b.district === 'glasswater') buildDowntown(b, rng);
    else if (b.district === 'neon') buildNeonRow(b, rng);
    else if (b.district === 'coral') buildCoral(b, rng);
    else if (b.district === 'palmetto') buildPalmetto(b, rng);
    else if (b.district === 'docks') buildDocks(b, rng);
  }

  function buildDowntown(b, rng) {
    const count = rng.int(1, 3);
    const palettes = [['glass', '#2f4b5b'], ['tower', '#9a9387'], ['glass', '#3b5f70']];
    if (count === 1) {
      const [style, roof] = rng.pick(palettes);
      const w = rng.range(30, 44);
      const d = rng.range(30, 44);
      const h = rng.range(60, 125);
      details.push(box(b.w - 6, 6, b.d - 6, '#b5ada0', b.cx, y0 + 3, b.cz));
      obstacles.addBox(b.x0 + 3, b.z0 + 3, b.x1 - 3, b.z1 - 3, 6, 'building');
      const t = addBuilding(style, b.cx, b.cz, w, d, h, roof, { parapet: '#dde3e8' });
      t.y = 6;
      roofDetails(rng, t, 'tower');
    } else {
      const cols = count === 2 ? [[-1, 0], [1, 0]] : [[-1, -1], [1, -1], [0, 1]];
      for (const [cx, cz] of cols) {
        const [style, roof] = rng.pick(palettes);
        const w = rng.range(18, 26);
        const d = rng.range(18, 26);
        const h = rng.range(28, 90);
        const x = b.cx + cx * (b.w / 4 - 1);
        const z = b.cz + cz * (b.d / 4 - 1);
        const t = addBuilding(style, x, z, w, d, h, roof, { parapet: '#dde3e8' });
        roofDetails(rng, t, 'tower');
      }
    }
    if (rng.chance(0.35)) addBillboard(b.x1 - 4, b.z0 + 3, Math.PI, rng);
  }

  function buildNeonRow(b, rng) {
    // Shops shoulder to shoulder along the west and south faces, taller flats behind.
    const shops = rng.int(3, 4);
    const shopW = (b.w - 4) / shops;
    for (let k = 0; k < shops; k += 1) {
      const x = b.x0 + 2 + shopW * (k + 0.5);
      const h = rng.range(9, 16);
      const style = rng.pick(['neon', 'stucco', 'deco']);
      const t = addBuilding(style, x, b.z1 - 9, shopW - 0.6, 16, h, rng.pick(['#4b2f5a', '#6b4a3a', '#3b3b44']));
      roofDetails(rng, t, 'low');
      const [name, color] = neonNames[neonIndex % neonNames.length];
      neonIndex += 1;
      addSign(name, color, x, y0 + h - 2.2, b.z1 - 0.8, 0, Math.min(shopW - 1.5, 11), 2.4);
      // An awning over the door.
      details.push(box(shopW - 1.6, 0.2, 2.2, rng.pick(['#ff6fb5', '#7fd3e8', '#ffb14a']), x, y0 + 3.4, b.z1 - 0.2));
    }
    const backs = rng.int(2, 3);
    const backW = (b.w - 4) / backs;
    for (let k = 0; k < backs; k += 1) {
      const x = b.x0 + 2 + backW * (k + 0.5);
      const h = rng.range(18, 34);
      const t = addBuilding(rng.pick(['neon', 'stucco', 'tower']), x, b.z0 + 18, backW - 1, 32, h, rng.pick(['#4b2f5a', '#5c4a3a']));
      roofDetails(rng, t, 'low');
    }
    if (rng.chance(0.4)) addBillboard(b.x0 + 4, b.z0 + 3, Math.PI, rng);
  }

  function buildCoral(b, rng) {
    // Pastel beach hotels with a pool deck toward the sea; the north end of the strand gets two
    // landmark towers so the drive has a skyline ahead.
    const landmark = b.i === 0 && (b.j === 1 || b.j === 2);
    const hotels = landmark ? 1 : rng.int(1, 2);
    const hw = (b.d - 6) / hotels;
    for (let k = 0; k < hotels; k += 1) {
      const z = b.z0 + 3 + hw * (k + 0.5);
      const h = landmark ? rng.range(58, 72) : rng.range(22, 42);
      const colorRoof = rng.pick(['#f08ca0', '#8fd6c9', '#f6d58a', '#f3b48c']);
      const t = addBuilding(landmark ? 'glass' : 'deco', b.cx + 8, z, landmark ? 30 : 34, landmark ? 36 : hw - 3, h, colorRoof, { parapet: '#fff4e6' });
      roofDetails(rng, t, landmark ? 'tower' : 'low');
      details.push(box(10, 0.4, hw - 10, '#4fb5d9', b.x0 + 8, y0 + 0.2, z));
      details.push(box(14, 0.3, hw - 6, '#e9d7b4', b.x0 + 8, y0 + 0.05, z));
      if (landmark) {
        details.push(box(50, 6, 46, '#f3d8c4', b.cx + 8, y0 + 3, z));
        obstacles.addBox(b.cx + 8 - 25, z - 23, b.cx + 8 + 25, z + 23, 6, 'building');
      }
      // Hotel name on the facade toward the ocean drive.
      const name = rng.pick(['SEABREEZE', 'HOTEL CORAL', 'THE STRAND', 'PALM COURT', 'SUNDECK INN', 'AZURE SUITES']);
      const faceX = landmark ? b.cx + 8 - 15.3 : b.x0 + 8 - 9.3;
      addSign(name, rng.pick(['#ff6fb5', '#7fd3e8', '#ffd36e']), faceX, y0 + Math.min(h * 0.55, 18), z, -Math.PI / 2, 12, 2.8, '#2a1830');
    }
  }

  function buildPalmetto(b, rng) {
    const n = rng.pick([2, 3]);
    const lw = b.w / n;
    const ld = b.d / n;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (rng.chance(0.12)) continue;
        const x = b.x0 + lw * (i + 0.5);
        const z = b.z0 + ld * (j + 0.5);
        const w = lw * rng.range(0.42, 0.55);
        const d = ld * rng.range(0.42, 0.55);
        const h = rng.pick([4.2, 4.2, 7.6]);
        const roof = rng.pick(['#c8623f', '#b85a3c', '#d9d2c4', '#8b6f55']);
        const wallColor = rng.pick(['#f7f1e3', '#f4e4c8', '#f9d9c0', '#e9f0e4']);
        const vx = x - lw * 0.18;
        const t = addBuilding('villa', vx, z, w, d, h, roof);
        details.push(box(w + 1.5, 0.5, d + 1.5, roof, vx, y0 + h + 0.25, z));
        details.push(box(w * 0.5, 1.4, d * 0.5, wallColor, vx, y0 + h + 1.1, z));
        // Pool and lawn.
        details.push(box(lw - 3, 0.12, ld - 3, '#79b35c', x, y0 + 0.06, z));
        if (rng.chance(0.75)) {
          const px = x + lw * 0.22;
          details.push(box(lw * 0.3, 0.3, ld * 0.3, '#e9e2d0', px, y0 + 0.17, z));
          details.push(box(lw * 0.26, 0.2, ld * 0.26, '#3fc1e6', px, y0 + 0.28, z));
        }
        // Hedges along the lot edge.
        details.push(box(lw - 2.4, 1.2, 0.8, '#3f7a2e', x, y0 + 0.6, z - ld / 2 + 0.8));
        details.push(box(0.8, 1.2, ld - 2.4, '#3f7a2e', x - lw / 2 + 0.8, y0 + 0.6, z));
        void t;
      }
    }
  }

  function buildDocks(b, rng) {
    const n = rng.int(1, 2);
    const ww = (b.w - 4) / n;
    for (let k = 0; k < n; k += 1) {
      const x = b.x0 + 2 + ww * (k + 0.5);
      const h = rng.range(9, 15);
      const t = addBuilding('warehouse', x, b.cz + 8, ww - 3, b.d * 0.55, h, rng.pick(['#7d8287', '#8a6a52', '#6f7a84']));
      details.push(box(ww - 3, 1.2, 1.2, '#5b5f63', x, y0 + h + 1.2, b.cz + 8 - b.d * 0.275 + 0.6));
      details.push(box(6, 5.5, 0.4, '#2d3034', x, y0 + 2.75, b.cz + 8 + b.d * 0.275 + 0.1));
      void t;
    }
    // Container stacks on the north yard.
    const colors = ['#c8502e', '#2e6fb5', '#2f8f5a', '#d6a63a', '#8c8c8c', '#b03a6b'];
    for (let k = 0; k < rng.int(6, 10); k += 1) {
      const cx = b.x0 + 4 + rng.range(0, b.w - 8);
      const cz = b.z0 + 4 + rng.range(0, b.d * 0.3);
      const stack = rng.int(1, 3);
      for (let s = 0; s < stack; s += 1) details.push(box(12.2, 2.6, 2.4, rng.pick(colors), cx, y0 + 1.3 + s * 2.6, cz));
      obstacles.addBox(cx - 6.1, cz - 1.2, cx + 6.1, cz + 1.2, 2.6 * stack, 'container');
    }
    // Fuel tanks or a gantry crane.
    if (rng.chance(0.5)) {
      for (let k = 0; k < 2; k += 1) {
        const tx = b.x1 - 8 - k * 14;
        details.push(cylinder(5, 5, 8, '#d9d4c7', tx, y0 + 4, b.z1 - 9, 16));
        obstacles.addCircle(tx, b.z1 - 9, 5.2, 8, 'tank');
      }
    } else {
      buildCrane(b.cx, b.z0 - 14, rng);
    }
  }

  function buildCrane(x, z, rng) {
    const color = rng.pick(['#d9452c', '#e0a52a', '#2a7fd9']);
    const legs = [[-5, -4], [5, -4], [-5, 4], [5, 4]];
    for (const [lx, lz] of legs) details.push(box(1.2, 26, 1.2, color, x + lx, y0 + 13, z + lz));
    details.push(box(12, 1.6, 10, color, x, y0 + 26.8, z));
    details.push(box(1.4, 1.4, 60, color, x, y0 + 28, z - 14));
    details.push(box(1.2, 3, 2.4, '#3b3b3b', x, y0 + 25.5, z - 30));
    details.push(cylinder(0.08, 0.08, 14, '#222', x, y0 + 19, z - 30, 4));
    details.push(box(3, 2.2, 3, '#f0c040', x, y0 + 12, z - 30));
    for (const [lx, lz] of legs) obstacles.addCircle(x + lx, z + lz, 0.9, 26, 'crane');
  }

  function buildSpecial(b, rng) {
    const name = b.special;
    if (name === 'plaza') {
      details.push(box(b.w, 0.1, b.d, '#d8cfbf', b.cx, y0 + 0.05, b.cz));
      details.push(cylinder(9, 9, 0.8, '#b4aa98', b.cx, y0 + 0.4, b.cz, 24));
      details.push(cylinder(8.2, 8.2, 0.5, '#49b7dd', b.cx, y0 + 0.7, b.cz, 24));
      details.push(cylinder(1.2, 1.6, 6, '#e7e1d3', b.cx, y0 + 3.5, b.cz, 12));
      details.push(cylinder(2.6, 0.4, 0.4, '#49b7dd', b.cx, y0 + 6.3, b.cz, 12));
      obstacles.addCircle(b.cx, b.cz, 9.2, 1, 'fountain');
      for (let k = 0; k < 10; k += 1) {
        const a = (k / 10) * Math.PI * 2;
        const px = b.cx + Math.cos(a) * 20;
        const pz = b.cz + Math.sin(a) * 20;
        details.push(box(2.4, 0.5, 2.4, '#8fa68c', px, y0 + 0.25, pz));
        details.push(box(1.8, 0.9, 1.8, '#3f7a2e', px, y0 + 1.0, pz));
        obstacles.addBox(px - 1.2, pz - 1.2, px + 1.2, pz + 1.2, 1, 'planter');
      }
      const t = addBuilding('glass', b.x0 + 12, b.z0 + 12, 18, 18, 14, '#3b5f70');
      roofDetails(rng, t, 'low');
      addSign('GLASSWATER PLAZA', '#7fd3e8', b.x0 + 12, y0 + 11.8, b.z0 + 21.2, 0, 16, 2.6, '#10202a');
      details.push(box(1.5, 12, 1.5, '#e7e1d3', b.x1 - 10, y0 + 6, b.z1 - 10));
      details.push(cone(1.2, 2.6, '#d6a63a', b.x1 - 10, y0 + 13.3, b.z1 - 10, 4));
      obstacles.addBox(b.x1 - 11, b.z1 - 11, b.x1 - 9, b.z1 - 9, 12, 'obelisk');
    } else if (name === 'bank') {
      const t = addBuilding('tower', b.cx + 6, b.cz, 44, 40, 22, '#c9c2b5', { parapet: '#e2ddd3' });
      details.push(box(50, 1.2, 46, '#d9d2c4', b.cx + 6, y0 + 0.6, b.cz));
      obstacles.addBox(b.cx + 6 - 25, b.cz - 23, b.cx + 6 + 25, b.cz + 23, 1.2, 'steps');
      for (let k = -2; k <= 2; k += 1) details.push(cylinder(0.9, 1.0, 16, '#efe9dc', b.x0 + 4, y0 + 9, b.cz + k * 6.5, 10));
      details.push(box(4, 2.2, 36, '#efe9dc', b.x0 + 4, y0 + 17.5, b.cz));
      details.push(box(50, 3, 46, '#b9b1a3', b.cx + 6, y0 + 24, b.cz));
      details.push(box(14, 4, 14, '#9fb8c4', b.cx + 6, y0 + 27, b.cz));
      addSign('GLASSWATER BANK', '#ffd36e', b.x0 + 2.6, y0 + 20.4, b.cz, -Math.PI / 2, 22, 3, '#1b2430');
      details.push(box(6, 5, 0.5, '#2a3a46', b.x0 + 2.1, y0 + 2.5, b.cz));
      roofDetails(rng, t, 'low');
      // The tower behind the banking hall.
      const t2 = addBuilding('glass', b.x1 - 14, b.z0 + 14, 22, 22, 62, '#2f4b5b', { parapet: '#dde3e8' });
      roofDetails(rng, t2, 'tower');
    } else if (name === 'police') {
      const t = addBuilding('tower', b.cx, b.cz - 4, 40, 30, 16, '#8d9399');
      details.push(box(44, 2.4, 2, '#2a4d8f', b.cx, y0 + 1.2, b.z1 - 1));
      details.push(box(8, 4, 1, '#1f2a3a', b.cx, y0 + 2, b.z1 - 19));
      addSign('HALCYON BAY P.D.', '#8fd0ff', b.cx, y0 + 13, b.z1 - 18.8, 0, 22, 3, '#101c33');
      details.push(box(3, 0.4, 3, '#1f2a3a', b.cx, y0 + 16.7, b.cz - 4));
      details.push(cylinder(0.15, 0.15, 10, '#c7ccd1', b.cx, y0 + 21.5, b.cz - 4, 6));
      for (let k = 0; k < 4; k += 1) {
        details.push(box(2.2, 1.4, 4.8, '#f2f2f2', b.x0 + 6 + k * 6, y0 + 0.7, b.z1 - 6));
      }
      roofDetails(rng, t, 'low');
    } else if (name === 'hospital') {
      const t = addBuilding('tower', b.cx, b.cz + 4, 46, 34, 30, '#e8ecef', { parapet: '#ffffff' });
      details.push(box(10, 10, 1, '#ffffff', b.cx, y0 + 24, b.z0 + 20.5));
      details.push(box(2.4, 7.5, 0.4, '#e03a3a', b.cx, y0 + 24, b.z0 + 19.9));
      details.push(box(7.5, 2.4, 0.4, '#e03a3a', b.cx, y0 + 24, b.z0 + 19.9));
      addSign('BAYVIEW GENERAL', '#ffffff', b.cx, y0 + 15, b.z0 + 20.6, Math.PI, 22, 3, '#2a3b4c');
      details.push(box(14, 3.6, 8, '#d9dee3', b.cx, y0 + 1.8, b.z0 + 4));
      details.push(box(16, 0.3, 16, '#c8ccd0', b.cx, y0 + 30.6, b.cz + 4));
      details.push(cylinder(7, 7, 0.4, '#e03a3a', b.cx, y0 + 30.9, b.cz + 4, 20));
      void t;
    } else if (name === 'garage') {
      const t = addBuilding('warehouse', b.cx, b.cz - 6, 36, 28, 9, '#8a6a52');
      details.push(box(10, 6.5, 0.6, '#1f1f22', b.cx - 6, y0 + 3.25, b.z1 - 20 + 0.3));
      details.push(box(10, 6.5, 0.6, '#1f1f22', b.cx + 8, y0 + 3.25, b.z1 - 20 + 0.3));
      addSign("TEO'S BODY SHOP", '#ffb14a', b.cx, y0 + 8.2, b.z1 - 19.6, 0, 20, 2.8, '#2a1a10');
      details.push(box(b.w - 4, 0.1, 20, '#55585c', b.cx, y0 + 0.05, b.z1 - 10));
      for (let k = 0; k < 4; k += 1) details.push(cylinder(0.5, 0.5, 1.0, '#222', b.x0 + 6 + k * 3, y0 + 0.5, b.z1 - 6, 10));
      details.push(box(3, 1.4, 1.4, '#d9452c', b.x1 - 6, y0 + 0.7, b.z1 - 8));
      roofDetails(rng, t, 'low');
    } else if (name === 'club') {
      const t = addBuilding('neon', b.x0 + 18, b.cz, 30, 36, 14, '#4b2f5a');
      addSign('CLUB MIRAGE', '#ff6fb5', b.x0 + 2.6, y0 + 7.4, b.cz, -Math.PI / 2, 18, 3.2, '#1a0f22');
      details.push(box(0.5, 4, 8, '#2a1c33', b.x0 + 3.2, y0 + 2, b.cz));
      details.push(box(5, 0.2, 10, '#ff6fb5', b.x0 + 2.5, y0 + 4.2, b.cz));
      roofDetails(rng, t, 'low');
      const t2 = addBuilding('stucco', b.x1 - 14, b.cz, 24, 50, 20, '#6b4a3a');
      roofDetails(rng, t2, 'low');
      addSign('NEON ROW', '#5ee8ff', b.x1 - 2.6, y0 + 16, b.cz, Math.PI / 2, 14, 3, '#0f1c24');
    } else if (name === 'pearl') {
      const t = addBuilding('warehouse', b.cx, b.cz + 6, 34, 26, 8, '#6f7a84');
      details.push(box(12, 6, 0.6, '#1f1f22', b.cx, y0 + 3, b.z0 + 19 - 0.3));
      addSign('PEARL AUTO RESPRAY', '#7cf7d4', b.cx, y0 + 7.4, b.z0 + 18.6, Math.PI, 22, 2.8, '#10201c');
      details.push(box(b.w - 4, 0.1, 18, '#55585c', b.cx, y0 + 0.05, b.z0 + 9));
      roofDetails(rng, t, 'low');
    } else if (name === 'motel') {
      const t = addBuilding('deco', b.cx + 6, b.cz, 40, 44, 12, '#f08ca0');
      addSign('SEABREEZE MOTEL', '#7fd3e8', b.x0 + 2.6, y0 + 9.6, b.cz, -Math.PI / 2, 18, 3, '#1b2430');
      details.push(box(10, 0.3, 14, '#4fb5d9', b.x0 + 9, y0 + 0.15, b.z1 - 12));
      details.push(box(14, 0.2, 18, '#e9d7b4', b.x0 + 9, y0 + 0.05, b.z1 - 12));
      details.push(box(0.5, 2.6, 8, '#2a1c33', b.x0 + 3.2, y0 + 1.3, b.cz));
      roofDetails(rng, t, 'low');
    } else if (name === 'villa') {
      const t = addBuilding('villa', b.cx, b.cz + 4, 30, 24, 8, '#c8623f');
      details.push(box(34, 0.5, 28, '#c8623f', b.cx, y0 + 8.25, b.cz + 4));
      details.push(box(b.w - 3, 0.12, b.d - 3, '#79b35c', b.cx, y0 + 0.06, b.cz));
      details.push(box(16, 0.3, 10, '#e9e2d0', b.cx + 16, y0 + 0.17, b.cz - 14));
      details.push(box(14, 0.2, 8, '#3fc1e6', b.cx + 16, y0 + 0.28, b.cz - 14));
      details.push(box(0.6, 2.2, b.d - 2, '#f7f1e3', b.x0 + 0.5, y0 + 1.1, b.cz));
      details.push(box(b.w - 2, 2.2, 0.6, '#f7f1e3', b.cx, y0 + 1.1, b.z1 - 0.5));
      details.push(box(2, 0.1, 10, '#b8b2a6', b.x0 + 8, y0 + 0.13, b.z0 + 5));
      void t;
    } else if (name === 'loft') {
      const t = addBuilding('stucco', b.cx, b.cz, 40, 40, 36, '#6b4a3a');
      addSign('THE LOFTS', '#ffd36e', b.x0 + 2.4, y0 + 8, b.cz, -Math.PI / 2, 12, 2.6, '#2a1a10');
      roofDetails(rng, t, 'low');
    } else if (name === 'kaneYard') {
      const colors = ['#c8502e', '#2e6fb5', '#2f8f5a', '#d6a63a', '#8c8c8c', '#b03a6b'];
      for (let k = 0; k < 14; k += 1) {
        const cx = b.x0 + 8 + (k % 4) * 14;
        const cz = b.z0 + 6 + Math.floor(k / 4) * 9;
        const stack = rng.int(1, 3);
        for (let s = 0; s < stack; s += 1) details.push(box(12.2, 2.6, 2.4, rng.pick(colors), cx, y0 + 1.3 + s * 2.6, cz));
        obstacles.addBox(cx - 6.1, cz - 1.2, cx + 6.1, cz + 1.2, 2.6 * stack, 'container');
      }
      const t = addBuilding('warehouse', b.cx, b.z1 - 12, 30, 18, 8, '#5b3d33');
      addSign('OKAFOR FREIGHT', '#ff5a3c', b.cx, y0 + 7, b.z1 - 2.6, 0, 16, 2.6, '#1b0f0c');
      for (let x = b.x0; x <= b.x1; x += 4) details.push(box(0.2, 2.4, 0.2, '#555', x, y0 + 1.2, b.z1 - 1));
      details.push(box(b.w, 0.1, 0.1, '#777', b.cx, y0 + 2.4, b.z1 - 1));
      void t;
    } else if (name === 'marina') {
      const t = addBuilding('deco', b.cx + 4, b.cz, 30, 24, 10, '#8fd6c9');
      addSign('HALCYON MARINA', '#7cf7d4', b.x0 + 2.6, y0 + 8, b.cz, -Math.PI / 2, 18, 2.8, '#10201c');
      details.push(box(b.w - 4, 0.1, 20, '#55585c', b.cx, y0 + 0.05, b.z1 - 11));
      roofDetails(rng, t, 'low');
      for (let k = 0; k < 3; k += 1) {
        details.push(box(3, 1.6, 8, '#f4f4f0', b.x0 + 8 + k * 10, y0 + 0.9, b.z1 - 10));
        details.push(box(2, 1.2, 3, '#2a4d8f', b.x0 + 8 + k * 10, y0 + 2.3, b.z1 - 11));
        obstacles.addBox(b.x0 + 6.5 + k * 10, b.z1 - 14, b.x0 + 9.5 + k * 10, b.z1 - 6, 2, 'boat');
      }
    } else if (name === 'park') {
      details.push(box(b.w, 0.1, b.d, '#6f9e4a', b.cx, y0 + 0.05, b.cz));
      details.push(cylinder(10, 10, 0.3, '#49b7dd', b.cx + 10, y0 + 0.15, b.cz + 8, 20));
      details.push(box(2.5, 0.1, b.d, '#c9bfa8', b.x0 + 12, y0 + 0.11, b.cz));
      details.push(box(b.w, 0.1, 2.5, '#c9bfa8', b.cx, y0 + 0.11, b.z0 + 14));
      details.push(box(6, 3.2, 6, '#8f6f55', b.x0 + 24, y0 + 1.6, b.z1 - 12));
      details.push(cone(5, 3, '#c8623f', b.x0 + 24, y0 + 4.7, b.z1 - 12, 4));
      obstacles.addBox(b.x0 + 21, b.z1 - 15, b.x0 + 27, b.z1 - 9, 3, 'kiosk');
      obstacles.addCircle(b.cx + 10, b.cz + 8, 10, 0.5, 'pond');
    } else if (name === 'stadium') {
      details.push(cylinder(30, 32, 18, '#d8d3c8', b.cx, y0 + 9, b.cz, 28));
      details.push(cylinder(26, 26, 2, '#4caf50', b.cx, y0 + 18.5, b.cz, 28));
      details.push(cylinder(33, 33, 2, '#f6c177', b.cx, y0 + 18.8, b.cz, 28));
      for (let k = 0; k < 4; k += 1) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const lx = b.cx + Math.cos(a) * 34;
        const lz = b.cz + Math.sin(a) * 34;
        details.push(cylinder(0.4, 0.5, 30, '#c7ccd1', lx, y0 + 15, lz, 8));
        glowParts.push(box(4, 2, 0.6, '#ffffff', lx, y0 + 30, lz, -a));
        obstacles.addCircle(lx, lz, 0.6, 30, 'post');
      }
      addSign('SUNLINE ARENA', '#ffd36e', b.x0 + 1.6, y0 + 14, b.cz, -Math.PI / 2, 22, 3, '#1b2430');
      obstacles.addCircle(b.cx, b.cz, 32.5, 18, 'stadium');
    }
  }

  // Materials and meshes.
  for (const [style, parts] of Object.entries(byStyle)) {
    if (parts.length === 0) continue;
    const tex = textures.windows[style];
    const material = new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.emissiveMap, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.0,
      roughness: style === 'glass' ? 0.35 : 0.75, metalness: style === 'glass' ? 0.25 : 0.05,
    });
    const mesh = new THREE.Mesh(merge(parts), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `walls-${style}`;
    group.add(mesh);
  }
  const detailMesh = new THREE.Mesh(merge(details), coloredMaterial({ roughness: 0.85 }));
  detailMesh.castShadow = true;
  detailMesh.receiveShadow = true;
  detailMesh.name = 'building-details';
  group.add(detailMesh);
  if (glowParts.length) {
    const glowMesh = new THREE.Mesh(merge(glowParts), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    group.add(glowMesh);
  }
  for (const s of signs) group.add(s);

  return {
    group,
    /** Lit windows: brighter as the sun goes down. */
    setNight(amount) {
      for (const child of group.children) {
        if (child.material && child.material.emissiveMap) child.material.emissiveIntensity = 0.05 + amount * 1.1;
      }
    },
  };
}
