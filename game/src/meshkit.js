// A small kit for building props and vehicles from primitives: coloured boxes, cylinders and
// spheres placed with a transform, then merged into one vertex-coloured geometry so a car, a
// crane or a palm costs a single draw call.
import * as THREE from 'three';

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpEuler = new THREE.Euler();

/** Add a flat colour attribute to a geometry (every vertex the same). */
export function colorize(geometry, color) {
  const c = new THREE.Color(color);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Move, rotate (radians, XYZ) and scale a geometry in place. */
export function place(geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  tmpPos.set(x, y, z);
  tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz));
  tmpScale.set(sx, sy, sz);
  tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
  geometry.applyMatrix4(tmpMatrix);
  return geometry;
}

export function box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  return place(colorize(new THREE.BoxGeometry(w, h, d), color), x, y, z, rx, ry, rz);
}

export function cylinder(rTop, rBottom, h, color, x = 0, y = 0, z = 0, segments = 10, rx = 0, ry = 0, rz = 0) {
  return place(colorize(new THREE.CylinderGeometry(rTop, rBottom, h, segments), color), x, y, z, rx, ry, rz);
}

export function sphere(r, color, x = 0, y = 0, z = 0, w = 10, h = 8) {
  return place(colorize(new THREE.SphereGeometry(r, w, h), color), x, y, z);
}

export function cone(r, h, color, x = 0, y = 0, z = 0, segments = 8, rx = 0, ry = 0, rz = 0) {
  return place(colorize(new THREE.ConeGeometry(r, h, segments), color), x, y, z, rx, ry, rz);
}

export function plane(w, h, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return place(colorize(new THREE.PlaneGeometry(w, h), color), x, y, z, rx, ry, rz);
}

/** Merge geometries (position, normal, uv, color) into one non-indexed BufferGeometry. */
export function merge(parts) {
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nonIndexed) total += g.attributes.position.count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const color = new Float32Array(total * 3);
  let offset = 0;
  for (const g of nonIndexed) {
    const n = g.attributes.position.count;
    position.set(g.attributes.position.array, offset * 3);
    if (g.attributes.normal) normal.set(g.attributes.normal.array, offset * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, offset * 2);
    if (g.attributes.color) color.set(g.attributes.color.array, offset * 3);
    else color.fill(1, offset * 3, (offset + n) * 3);
    offset += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  for (const g of parts) g.dispose();
  return out;
}

/** A vertex-coloured standard material; instance colours multiply in on InstancedMesh. */
export function coloredMaterial(options = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.08, ...options });
}

/** One mesh from a list of parts. */
export function buildMesh(parts, material = coloredMaterial(), castShadow = true) {
  const mesh = new THREE.Mesh(merge(parts), material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** A box whose side UVs repeat every `tile` metres so a window texture never stretches. */
export function tiledBox(w, h, d, tile, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z, four vertices each.
  const sizes = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let face = 0; face < 6; face += 1) {
    const [fw, fh] = sizes[face];
    for (let v = 0; v < 4; v += 1) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * (fw / tile), uv.getY(i) * (fh / tile));
    }
  }
  uv.needsUpdate = true;
  g.translate(x, y, z);
  return g;
}

/** Set an instanced mesh's instance transform from position, yaw and scale. */
export function setInstance(mesh, index, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, pitch = 0, roll = 0) {
  tmpPos.set(x, y, z);
  tmpQuat.setFromEuler(tmpEuler.set(pitch, yaw, roll, 'YXZ'));
  tmpScale.set(sx, sy, sz);
  tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
  mesh.setMatrixAt(index, tmpMatrix);
}

export function hideInstance(mesh, index) {
  tmpMatrix.makeScale(0, 0, 0);
  mesh.setMatrixAt(index, tmpMatrix);
}
