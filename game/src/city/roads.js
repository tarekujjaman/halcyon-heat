// Roads, crossings and the canal: asphalt segments between the intersection squares, raised
// sidewalk slabs under every block, double-yellow centre lines, white edge lines and parking
// dashes, zebra crosswalks on each approach, the canal water with its quays and the bridges
// that carry the north-south roads over it. Everything is merged into a handful of meshes.
import * as THREE from 'three';
import { CITY, LANES } from '../config.js';
import { box, merge, colorize, coloredMaterial } from '../meshkit.js';

const ASPHALT_Y = 0.02;
const PAINT_Y = 0.06;
export const SLAB_HEIGHT = 0.16;
export const CANAL_WATER_Y = -1.3;

/** A flat quad in the XZ plane with UVs in world metres divided by `uvScale`. */
function groundQuad(x0, z0, x1, z1, y, uvScale = 8) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale);
  return g;
}

/** A painted stripe: a thin quad centred at (x, z) rotated by `yaw`, `len` along its axis, `wid` across. */
function stripe(x, z, yaw, len, wid, color, y = PAINT_Y) {
  const g = colorize(new THREE.PlaneGeometry(wid, len), color);
  g.rotateX(-Math.PI / 2);
  g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

export function buildRoads(layout, textures) {
  const group = new THREE.Group();
  group.name = 'roads';
  const half = CITY.asphalt / 2;
  const asphalt = [];
  const paint = [];
  const slabs = [];
  const concrete = [];
  const water = [];
  const rails = [];

  // Intersection squares and the road segments between them.
  for (const n of layout.nodes) asphalt.push(groundQuad(n.x - half, n.z - half, n.x + half, n.z + half, ASPHALT_Y));
  for (const e of layout.edges) {
    const yaw = e.horizontal ? Math.PI / 2 : 0;
    const ax = e.a.x + e.dx * half;
    const az = e.a.z + e.dz * half;
    const bx = e.b.x - e.dx * half;
    const bz = e.b.z - e.dz * half;
    const len = e.len - CITY.asphalt;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if (e.horizontal) asphalt.push(groundQuad(ax, az - half, bx, bz + half, ASPHALT_Y));
    else asphalt.push(groundQuad(ax - half, az, bx + half, bz, ASPHALT_Y));
    // Double yellow centre line.
    const rx = -e.dz;
    const rz = e.dx;
    paint.push(stripe(mx + rx * 0.22, mz + rz * 0.22, yaw, len - 4, 0.14, '#f2c94c'));
    paint.push(stripe(mx - rx * 0.22, mz - rz * 0.22, yaw, len - 4, 0.14, '#f2c94c'));
    // White edge lines by the curb, and dashes between the drive lane and the parking strip.
    for (const side of [1, -1]) {
      paint.push(stripe(mx + rx * 5.75 * side, mz + rz * 5.75 * side, yaw, len - 2, 0.14, '#f4f4f0'));
      const dashOffset = (LANES.drive + LANES.park) / 2 * side;
      for (let t = 4; t < len - 4; t += 7) {
        const px = ax + e.dx * t + rx * dashOffset;
        const pz = az + e.dz * t + rz * dashOffset;
        paint.push(stripe(px, pz, yaw, 2.4, 0.12, '#e9e9e4'));
      }
    }
    // Zebra crossings and stop lines on both approaches.
    for (const [node, dir] of [[e.a, 1], [e.b, -1]]) {
      const cx = node.x + e.dx * dir * (half + 1.6);
      const cz = node.z + e.dz * dir * (half + 1.6);
      for (let s = -4; s <= 4; s += 1) {
        paint.push(stripe(cx + rx * s * 1.3, cz + rz * s * 1.3, yaw, 2.4, 0.7, '#f7f7f2', PAINT_Y - 0.005));
      }
      // Stop line across the approaching lane (right of travel toward the node).
      const sx = node.x + e.dx * dir * (half + 3.4);
      const sz = node.z + e.dz * dir * (half + 3.4);
      const rightSide = dir === 1 ? -1 : 1;
      paint.push(stripe(sx + rx * 3 * rightSide, sz + rz * 3 * rightSide, yaw + Math.PI / 2, 5.6, 0.4, '#f7f7f2'));
    }
  }

  // Sidewalk slabs under every lot (the canal row gets quays instead), bridges and the canal.
  const sw = CITY.sidewalk;
  for (const b of layout.blocks) {
    if (b.district === 'canal') continue;
    const g = new THREE.BoxGeometry(b.w + sw * 2, SLAB_HEIGHT, b.d + sw * 2);
    g.translate(b.cx, SLAB_HEIGHT / 2, b.cz);
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
    slabs.push(g);
  }
  // Sidewalk strips along the outer side of the ring roads (beach side, east and south edges).
  const stripSlab = (x0, z0, x1, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, SLAB_HEIGHT, z1 - z0);
    g.translate((x0 + x1) / 2, SLAB_HEIGHT / 2, (z0 + z1) / 2);
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
    slabs.push(g);
  };
  stripSlab(-CITY.road / 2 - sw, -CITY.road / 2 - sw, -CITY.road / 2, layout.depth + CITY.road / 2 + sw);
  stripSlab(layout.width + CITY.road / 2, -CITY.road / 2 - sw, layout.width + CITY.road / 2 + sw, layout.depth + CITY.road / 2 + sw);
  stripSlab(-CITY.road / 2 - sw, layout.depth + CITY.road / 2, layout.width + CITY.road / 2 + sw, layout.depth + CITY.road / 2 + sw);
  const canal = layout.canal;
  water.push(groundQuad(-80, canal.z0 - 2, layout.width + 80, canal.z1 + 2, CANAL_WATER_Y));
  // Quays along both canal banks and the canal walls dropping to the water.
  concrete.push(box(layout.width + 20, SLAB_HEIGHT, sw, '#b8b2a6', layout.width / 2, SLAB_HEIGHT / 2, canal.z0 - sw / 2 + 0.01));
  concrete.push(box(layout.width + 20, SLAB_HEIGHT, sw, '#b8b2a6', layout.width / 2, SLAB_HEIGHT / 2, canal.z1 + sw / 2 - 0.01));
  concrete.push(box(layout.width + 20, 2, 0.6, '#8f8a80', layout.width / 2, -0.9, canal.z0 + 0.3));
  concrete.push(box(layout.width + 20, 2, 0.6, '#8f8a80', layout.width / 2, -0.9, canal.z1 - 0.3));
  for (let x = -6; x <= layout.width + 6; x += 3) {
    rails.push(box(0.12, 1.0, 0.12, '#36404a', x, 0.66, canal.z0 - 0.4));
    rails.push(box(0.12, 1.0, 0.12, '#36404a', x, 0.66, canal.z1 + 0.4));
  }
  rails.push(box(layout.width + 20, 0.08, 0.08, '#36404a', layout.width / 2, 1.16, canal.z0 - 0.4));
  rails.push(box(layout.width + 20, 0.08, 0.08, '#36404a', layout.width / 2, 1.16, canal.z1 + 0.4));
  // Bridges: the north-south roads over the canal get a deck, railings and piers.
  const span = canal.z1 - canal.z0;
  for (const x of layout.roadX) {
    const cz = (canal.z0 + canal.z1) / 2;
    concrete.push(box(CITY.road + 1, 1.0, span + 2, '#9c968b', x, -0.5, cz));
    for (const side of [1, -1]) {
      const rx = x + side * (CITY.road / 2 + 0.3);
      rails.push(box(0.3, 1.1, span + 2, '#dfe3e6', rx, 0.55, cz));
      concrete.push(box(1.6, 0.3, span + 2, '#c9c4ba', x + side * (CITY.road / 2 - 1.2), 0.2, cz));
    }
    for (const pz of [cz - span / 3, cz + span / 3]) {
      concrete.push(box(CITY.road - 4, 3, 2, '#7d786f', x, -2, pz));
    }
    // The road deck itself across the canal (the edge asphalt already spans it, this is the sidewalk).
  }
  // Harbour quay along the docks (north edge) with a wall to the water, and the canal walls as obstacles.
  concrete.push(box(layout.width + 40, SLAB_HEIGHT, 10, '#aaa49a', layout.width / 2, SLAB_HEIGHT / 2, -CITY.road / 2 - 5));
  concrete.push(box(layout.width + 40, 3, 0.8, '#7d786f', layout.width / 2, -1.4, -CITY.road / 2 - 10));
  for (let x = -8; x <= layout.width + 12; x += 4) rails.push(box(0.5, 0.7, 0.5, '#4f4a42', x, 0.5, -CITY.road / 2 - 9.6));
  layout.quays.push({ x0: -10, x1: layout.width + 14, z0: -CITY.road / 2 - 10, z1: 0 });
  layout.obstacles.addBox(-20, -CITY.road / 2 - 11.4, layout.width + 20, -CITY.road / 2 - 9.9, 1, 'wall');
  for (let i = 0; i <= CITY.blocksX; i += 1) {
    const x0 = i === 0 ? -80 : layout.roadX[i - 1] + CITY.road / 2 + 0.6;
    const x1 = layout.roadX[i] - CITY.road / 2 - 0.6;
    if (x1 > x0) {
      layout.obstacles.addBox(x0, canal.z0 - 0.8, x1, canal.z0 + 0.2, 1, 'wall');
      layout.obstacles.addBox(x0, canal.z1 - 0.2, x1, canal.z1 + 0.8, 1, 'wall');
    }
    layout.obstacles.addBox(layout.roadX[i] - CITY.road / 2 - 0.6, canal.z0 - 0.5, layout.roadX[i] - CITY.road / 2 - 0.1, canal.z1 + 0.5, 1, 'wall');
    layout.obstacles.addBox(layout.roadX[i] + CITY.road / 2 + 0.1, canal.z0 - 0.5, layout.roadX[i] + CITY.road / 2 + 0.6, canal.z1 + 0.5, 1, 'wall');
  }
  const lastX = layout.roadX[CITY.blocksX];
  layout.obstacles.addBox(lastX + CITY.road / 2 + 0.6, canal.z0 - 0.8, lastX + 80, canal.z0 + 0.2, 1, 'wall');
  layout.obstacles.addBox(lastX + CITY.road / 2 + 0.6, canal.z1 - 0.2, lastX + 80, canal.z1 + 0.8, 1, 'wall');

  const asphaltMaterial = new THREE.MeshStandardMaterial({ map: textures.asphalt, roughness: 0.95, metalness: 0 });
  const asphaltMesh = new THREE.Mesh(merge(asphalt), asphaltMaterial);
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  const paintMaterial = coloredMaterial({ roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const paintMesh = new THREE.Mesh(merge(paint), paintMaterial);
  paintMesh.receiveShadow = true;
  group.add(paintMesh);

  const slabMaterial = new THREE.MeshStandardMaterial({ map: textures.sidewalk, roughness: 0.9 });
  const slabMesh = new THREE.Mesh(merge(slabs), slabMaterial);
  slabMesh.receiveShadow = true;
  group.add(slabMesh);

  const concreteMesh = new THREE.Mesh(merge(concrete), coloredMaterial({ roughness: 0.9 }));
  concreteMesh.receiveShadow = true;
  concreteMesh.castShadow = true;
  group.add(concreteMesh);

  const railMesh = new THREE.Mesh(merge(rails), coloredMaterial({ roughness: 0.5, metalness: 0.4 }));
  railMesh.castShadow = true;
  group.add(railMesh);

  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#3f8fb5', roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.92 });
  const waterMesh = new THREE.Mesh(merge(water), waterMaterial);
  waterMesh.receiveShadow = true;
  group.add(waterMesh);

  return group;
}

/** The walking height of the ground at (x, z): slab tops over lots, deck over the pier, else the road. */
export function groundHeightAt(layout, x, z) {
  const b = layout.blockOfPoint(x, z);
  if (b && b.district !== 'canal') return SLAB_HEIGHT;
  const sw = CITY.sidewalk;
  for (const blk of layout.blocks) {
    if (blk.district === 'canal') continue;
    if (x >= blk.x0 - sw && x <= blk.x1 + sw && z >= blk.z0 - sw && z <= blk.z1 + sw) return SLAB_HEIGHT;
  }
  const p = layout.pier;
  if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return 0.5;
  if (x < -9 && x > -17.5) return 0.22;
  if (z < -CITY.road / 2) return SLAB_HEIGHT;
  if (z > layout.canal.z0 - sw && z < layout.canal.z1 + sw && !layout.isOnBridge(x)) return SLAB_HEIGHT;
  return 0;
}
