// Seeded random numbers: the city is laid out once from a seed, so every visit to Halcyon Bay
// finds the same streets, the same towers and the same parked cars. Mulberry32 keeps it tiny.

export function createRng(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
    fork: (salt) => createRng(hash2(state, salt)),
  };
}

/** A stable integer hash of two integers, for per-cell seeds. */
export function hash2(a, b) {
  let h = (Math.imul(a | 0, 0x85ebca6b) ^ Math.imul((b | 0) + 0x9e3779b9, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** A unit value in [0, 1) from two integers. */
export function noise2(a, b) {
  return hash2(a, b) / 4294967296;
}
