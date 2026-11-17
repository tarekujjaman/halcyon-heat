// Collision against the city's obstacle hash: push a circle out of buildings, posts and walls,
// trace a bullet or a line of sight across the streets, and keep movers inside the world.
import { BEACH } from './config.js';

const result = { x: 0, z: 0, hit: false, nx: 0, nz: 0, tag: null, depth: 0 };

/** Resolve a circle at (x, z) of radius r against obstacles taller than `minHeight`; returns the pushed position. */
export function resolveCircle(obstacles, x, z, r, minHeight = 0) {
  result.x = x;
  result.z = z;
  result.hit = false;
  result.nx = 0;
  result.nz = 0;
  result.tag = null;
  result.depth = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    obstacles.query(result.x, result.z, r + 1, (ob) => {
      if (ob.height < minHeight) return false;
      if (ob.type === 'box') {
        const cx = Math.max(ob.x0, Math.min(ob.x1, result.x));
        const cz = Math.max(ob.z0, Math.min(ob.z1, result.z));
        let dx = result.x - cx;
        let dz = result.z - cz;
        let d = Math.hypot(dx, dz);
        if (d >= r) return false;
        if (d < 1e-4) {
          // Centre inside the box: push out through the nearest face.
          const left = result.x - ob.x0;
          const right = ob.x1 - result.x;
          const top = result.z - ob.z0;
          const bottom = ob.z1 - result.z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) { dx = -1; dz = 0; } else if (m === right) { dx = 1; dz = 0; } else if (m === top) { dx = 0; dz = -1; } else { dx = 0; dz = 1; }
          d = 0;
          result.x += dx * (m + r);
          result.z += dz * (m + r);
        } else {
          dx /= d;
          dz /= d;
          result.x += dx * (r - d);
          result.z += dz * (r - d);
        }
        result.hit = true;
        result.nx = dx;
        result.nz = dz;
        result.tag = ob.tag;
        result.depth = Math.max(result.depth, r - d);
      } else {
        let dx = result.x - ob.x;
        let dz = result.z - ob.z;
        const d = Math.hypot(dx, dz);
        const minD = r + ob.r;
        if (d >= minD) return false;
        if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        result.x += dx * (minD - d);
        result.z += dz * (minD - d);
        result.hit = true;
        result.nx = dx;
        result.nz = dz;
        result.tag = ob.tag;
        result.depth = Math.max(result.depth, minD - d);
      }
      return false;
    });
  }
  return result;
}

/** Keep (x, z) on dry land inside the world: the shoreline, the harbour wall and the city bounds. */
export function clampToWorld(layout, x, z, margin = 0) {
  const b = layout.bounds;
  let cx = Math.max(b.x0 + margin, Math.min(b.x1 - margin, x));
  let cz = Math.max(b.z0 + margin, Math.min(b.z1 - margin, z));
  const p = layout.pier;
  const onPier = x >= p.x0 && x <= p.x1 && z >= p.z0 + 0.5 && z <= p.z1 - 0.5;
  if (onPier) {
    cx = Math.max(p.x0 + 1, Math.min(p.x1, x));
    cz = Math.max(p.z0 + 0.6, Math.min(p.z1 - 0.6, z));
  } else if (cx < BEACH.seaEdge + 4) {
    cx = BEACH.seaEdge + 4;
  }
  return { x: cx, z: cz };
}

/**
 * March a ray from (x, z) along (dx, dz) up to `maxDist` and return the distance to the first
 * obstacle taller than `height`, or Infinity. Boxes use a slab test; circles a quadratic.
 */
export function raycastObstacles(obstacles, x, z, dx, dz, maxDist, height = 1.2) {
  let best = Infinity;
  let bestTag = null;
  const steps = Math.ceil(maxDist / 24);
  const seen = new Set();
  for (let s = 0; s <= steps; s += 1) {
    const sx = x + dx * Math.min(maxDist, s * 24);
    const sz = z + dz * Math.min(maxDist, s * 24);
    obstacles.query(sx, sz, 26, (ob) => {
      if (seen.has(ob) || ob.height < height) return false;
      seen.add(ob);
      let t = Infinity;
      if (ob.type === 'box') {
        let tmin = -Infinity;
        let tmax = Infinity;
        if (Math.abs(dx) < 1e-6) {
          if (x < ob.x0 || x > ob.x1) return false;
        } else {
          const t1 = (ob.x0 - x) / dx;
          const t2 = (ob.x1 - x) / dx;
          tmin = Math.max(tmin, Math.min(t1, t2));
          tmax = Math.min(tmax, Math.max(t1, t2));
        }
        if (Math.abs(dz) < 1e-6) {
          if (z < ob.z0 || z > ob.z1) return false;
        } else {
          const t1 = (ob.z0 - z) / dz;
          const t2 = (ob.z1 - z) / dz;
          tmin = Math.max(tmin, Math.min(t1, t2));
          tmax = Math.min(tmax, Math.max(t1, t2));
        }
        if (tmax >= Math.max(0, tmin)) t = Math.max(0, tmin);
      } else {
        const fx = x - ob.x;
        const fz = z - ob.z;
        const b = 2 * (fx * dx + fz * dz);
        const c = fx * fx + fz * fz - ob.r * ob.r;
        const disc = b * b - 4 * c;
        if (disc >= 0) {
          const t0 = (-b - Math.sqrt(disc)) / 2;
          if (t0 >= 0) t = t0;
        }
      }
      if (t < best && t <= maxDist) {
        best = t;
        bestTag = ob.tag;
      }
      return false;
    });
    if (best < s * 24) break;
  }
  return { dist: best, tag: bestTag };
}

/** Whether nothing tall stands between two points (used for police sight and shots). */
export function lineOfSight(obstacles, x0, z0, x1, z1, height = 1.6) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return true;
  return raycastObstacles(obstacles, x0, z0, dx / d, dz / d, d, height).dist >= d;
}
