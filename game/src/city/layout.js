// The map of Halcyon Bay: a seeded grid of blocks between roads, each block given to a district
// (Coral Strand on the beach, Glasswater Downtown, Neon Row, Palmetto Heights south of the canal,
// Saltmarsh Docks on the harbour), the road graph that traffic and police drive, the traffic light
// phase of every crossing, the named places missions send you to, and the obstacle hash every
// mover collides against.
import { CITY, LANES, BEACH } from '../config.js';
import { hash2 } from '../rng.js';

const LIGHT_CYCLE = 26;

export function districtOf(i, j) {
  if (j === CITY.canalRow) return 'canal';
  if (j === 0) return 'docks';
  if (j > CITY.canalRow) return 'palmetto';
  if (i <= 1) return 'coral';
  if (i <= 5) return 'glasswater';
  return 'neon';
}

/** A spatial hash of static obstacles: building footprints as boxes, trunks and posts as circles. */
export function createObstacleHash(cell = 32) {
  const cells = new Map();
  const keyOf = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const all = [];
  const insert = (ob, x0, z0, x1, z1) => {
    all.push(ob);
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx += 1) {
      for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz += 1) {
        const key = `${gx},${gz}`;
        let list = cells.get(key);
        if (!list) {
          list = [];
          cells.set(key, list);
        }
        list.push(ob);
      }
    }
  };
  return {
    all,
    addBox(x0, z0, x1, z1, height = 10, tag = 'building') {
      const ob = { type: 'box', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), height, tag };
      insert(ob, ob.x0, ob.z0, ob.x1, ob.z1);
      return ob;
    },
    addCircle(x, z, r, height = 6, tag = 'post') {
      const ob = { type: 'circle', x, z, r, height, tag };
      insert(ob, x - r, z - r, x + r, z + r);
      return ob;
    },
    /** Call `fn(ob)` for every obstacle whose cell overlaps the circle; returns true if fn returned true. */
    query(x, z, r, fn) {
      for (let gx = Math.floor((x - r) / cell); gx <= Math.floor((x + r) / cell); gx += 1) {
        for (let gz = Math.floor((z - r) / cell); gz <= Math.floor((z + r) / cell); gz += 1) {
          const list = cells.get(`${gx},${gz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 1) if (fn(list[k])) return true;
        }
      }
      return false;
    },
    keyOf,
  };
}

export function createLayout(seed = 1) {
  const pitch = CITY.block + CITY.road;
  const roadX = [];
  for (let i = 0; i <= CITY.blocksX; i += 1) roadX.push(i * pitch);
  const roadZ = [];
  let z = 0;
  for (let j = 0; j <= CITY.blocksZ; j += 1) {
    roadZ.push(z);
    z += CITY.road + (j === CITY.canalRow ? CITY.canalWidth : CITY.block);
  }
  const width = roadX[CITY.blocksX];
  const depth = roadZ[CITY.blocksZ];

  const blocks = [];
  const grid = [];
  for (let j = 0; j < CITY.blocksZ; j += 1) {
    grid.push([]);
    for (let i = 0; i < CITY.blocksX; i += 1) {
      const x0 = roadX[i] + CITY.road / 2;
      const x1 = roadX[i + 1] - CITY.road / 2;
      const z0 = roadZ[j] + CITY.road / 2;
      const z1 = roadZ[j + 1] - CITY.road / 2;
      const block = {
        i, j, x0, x1, z0, z1,
        cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0,
        district: districtOf(i, j),
        seed: hash2(seed + i * 7, j * 13 + 1),
        special: null,
      };
      blocks.push(block);
      grid[j].push(block);
    }
  }
  const blockAt = (i, j) => (grid[j] && grid[j][i]) || null;

  // Landmark blocks: the ones missions and activities name.
  const specials = {
    plaza: [3, 3], bank: [4, 3], police: [5, 1], hospital: [2, 4], garage: [3, 0],
    club: [7, 2], pearl: [8, 4], motel: [1, 3], villa: [5, 8], loft: [4, 2], kaneYard: [8, 0],
    marina: [0, 1], park: [6, 8], stadium: [8, 8], lighthouse: null,
  };
  for (const [name, ij] of Object.entries(specials)) if (ij) blockAt(ij[0], ij[1]).special = name;

  const doorAt = (name, side, along = 0.5) => {
    const [i, j] = specials[name];
    const b = blockAt(i, j);
    const sw = LANES.sidewalk - LANES.curb;
    if (side === 'w') return { x: b.x0 - 1.2, z: b.z0 + b.d * along, heading: Math.PI / 2, block: b };
    if (side === 'e') return { x: b.x1 + 1.2, z: b.z0 + b.d * along, heading: -Math.PI / 2, block: b };
    if (side === 'n') return { x: b.x0 + b.w * along, z: b.z0 - 1.2, heading: Math.PI, block: b };
    return { x: b.x0 + b.w * along, z: b.z1 + 1.2 + sw * 0, heading: 0, block: b };
  };

  /** Places: id, display name, kind (for map icons), door position and the side of the block they face. */
  const places = [
    { id: 'motel', name: 'Seabreeze Motel', kind: 'safehouse', owned: true, ...doorAt('motel', 'w') },
    { id: 'garage', name: "Teo's Body Shop", kind: 'garage', ...doorAt('garage', 's', 0.5) },
    { id: 'pearl', name: 'Pearl Auto Respray', kind: 'garage', ...doorAt('pearl', 'n', 0.5) },
    { id: 'bank', name: 'Glasswater Bank', kind: 'bank', ...doorAt('bank', 'w', 0.5) },
    { id: 'plaza', name: 'Glasswater Plaza', kind: 'plaza', ...doorAt('plaza', 'e', 0.5) },
    { id: 'police', name: 'Halcyon Bay P.D.', kind: 'police', ...doorAt('police', 's', 0.5) },
    { id: 'hospital', name: 'Bayview General', kind: 'hospital', ...doorAt('hospital', 'n', 0.5) },
    { id: 'club', name: 'Club Mirage', kind: 'club', ...doorAt('club', 'w', 0.5) },
    { id: 'villa', name: 'Palmetto Villa', kind: 'safehouse', owned: false, price: 25000, ...doorAt('villa', 'n', 0.5) },
    { id: 'loft', name: 'Glasswater Loft', kind: 'safehouse', owned: false, price: 12000, ...doorAt('loft', 'w', 0.5) },
    { id: 'kaneYard', name: "Kane's Container Yard", kind: 'gang', ...doorAt('kaneYard', 's', 0.5) },
    { id: 'marina', name: 'Halcyon Marina', kind: 'marina', ...doorAt('marina', 'w', 0.5) },
    { id: 'park', name: 'Palmetto Park', kind: 'park', ...doorAt('park', 'n', 0.5) },
    { id: 'stadium', name: 'Sunline Arena', kind: 'stadium', ...doorAt('stadium', 'w', 0.5) },
    { id: 'pier', name: 'Coral Pier', kind: 'pier', x: BEACH.boardwalkTo - BEACH.pierLength + 6, z: BEACH.pierZ, heading: Math.PI / 2, block: null },
  ];
  const placeById = Object.fromEntries(places.map((p) => [p.id, p]));

  // The road graph: nodes at every crossing, edges along every road between neighbours.
  const nodes = [];
  const nodeIndex = (i, j) => j * (CITY.blocksX + 1) + i;
  for (let j = 0; j <= CITY.blocksZ; j += 1) {
    for (let i = 0; i <= CITY.blocksX; i += 1) {
      const interior = i > 0 && i < CITY.blocksX && j > 0 && j < CITY.blocksZ;
      nodes.push({
        id: nodeIndex(i, j), i, j, x: roadX[i], z: roadZ[j], edges: [],
        hasLights: interior,
        phase: (hash2(i * 3 + 11, j * 5 + 17) % 1000) / 1000 * LIGHT_CYCLE,
      });
    }
  }
  const edges = [];
  const addEdge = (a, b, horizontal) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const edge = { id: edges.length, a, b, horizontal, len, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len };
    edges.push(edge);
    a.edges.push(edge);
    b.edges.push(edge);
  };
  for (let j = 0; j <= CITY.blocksZ; j += 1) {
    for (let i = 0; i <= CITY.blocksX; i += 1) {
      const n = nodes[nodeIndex(i, j)];
      if (i < CITY.blocksX) addEdge(n, nodes[nodeIndex(i + 1, j)], true);
      if (j < CITY.blocksZ) addEdge(n, nodes[nodeIndex(i, j + 1)], false);
    }
  }

  /** The traffic light shown to traffic travelling along `horizontal` roads at `node`, at game time `t`. */
  const lightFor = (node, horizontal, t) => {
    if (!node.hasLights) return 'green';
    const phase = (t + node.phase) % LIGHT_CYCLE;
    const half = LIGHT_CYCLE / 2;
    const local = horizontal ? phase : (phase + half) % LIGHT_CYCLE;
    if (local < half - 3) return 'green';
    if (local < half) return 'yellow';
    return 'red';
  };

  const canal = { z0: roadZ[CITY.canalRow] + CITY.road / 2, z1: roadZ[CITY.canalRow + 1] - CITY.road / 2 };

  const isOnBridge = (x) => {
    for (let i = 0; i <= CITY.blocksX; i += 1) if (Math.abs(x - roadX[i]) < CITY.road / 2) return true;
    return false;
  };
  const pier = { x0: BEACH.boardwalkTo - BEACH.pierLength, x1: BEACH.boardwalkTo + 2, z0: BEACH.pierZ - 7, z1: BEACH.pierZ + 7 };
  const quays = [];
  const isWater = (x, z) => {
    if (x >= pier.x0 && x <= pier.x1 && z >= pier.z0 && z <= pier.z1) return false;
    for (const q of quays) if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return false;
    if (x < BEACH.seaEdge) return true;
    if (z < -CITY.road / 2 - 1) return true;
    if (z > canal.z0 && z < canal.z1 && !isOnBridge(x)) return true;
    return false;
  };

  const blockOfPoint = (x, z) => {
    for (let k = 0; k < blocks.length; k += 1) {
      const b = blocks[k];
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b;
    }
    return null;
  };

  const districtAt = (x, z) => {
    if (isWater(x, z)) return x < BEACH.seaEdge || z < 0 ? 'sea' : 'canal';
    if (x < roadX[0]) return 'coral';
    let i = 0;
    while (i < CITY.blocksX && x > roadX[i + 1]) i += 1;
    let j = 0;
    while (j < CITY.blocksZ && z > roadZ[j + 1]) j += 1;
    return districtOf(Math.min(i, CITY.blocksX - 1), Math.min(j, CITY.blocksZ - 1));
  };

  /** The closest point on the road network to (x, z): the edge, the distance along it and the lane side. */
  const nearestRoad = (x, z) => {
    let best = null;
    for (const e of edges) {
      const t = Math.max(0, Math.min(e.len, (x - e.a.x) * e.dx + (z - e.a.z) * e.dz));
      const px = e.a.x + e.dx * t;
      const pz = e.a.z + e.dz * t;
      const d = Math.hypot(px - x, pz - z);
      if (!best || d < best.dist) best = { edge: e, t, x: px, z: pz, dist: d };
    }
    return best;
  };

  const bounds = { x0: BEACH.sandTo + 4, x1: width + 60, z0: -CITY.road / 2, z1: depth + 70 };

  return {
    seed, pitch, roadX, roadZ, width, depth, blocks, grid, blockAt, blockOfPoint, districtAt,
    places, placeById, nodes, edges, lightFor, lightCycle: LIGHT_CYCLE, canal, pier, quays, isWater, isOnBridge,
    nearestRoad, bounds, obstacles: createObstacleHash(32),
    lightStates: new Map(),
  };
}

/** The unit vector pointing right of travel direction (dx, dz): right-hand traffic keeps to it. */
export function rightOf(dx, dz) {
  return { x: -dz, z: dx };
}

/** A point on a lane of `edge`, travelling a→b when forward, at `t` metres from the start of travel. */
export function lanePoint(edge, forward, t, offset = LANES.drive, out = {}) {
  const dx = forward ? edge.dx : -edge.dx;
  const dz = forward ? edge.dz : -edge.dz;
  const start = forward ? edge.a : edge.b;
  const r = rightOf(dx, dz);
  out.x = start.x + dx * t + r.x * offset;
  out.z = start.z + dz * t + r.z * offset;
  out.dx = dx;
  out.dz = dz;
  return out;
}
