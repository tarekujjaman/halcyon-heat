// Crowd figures: pedestrians, police officers and gang members are the same blocky humanoid drawn
// through seven InstancedMeshes (head, hair, torso, two arms, two legs). Each figure gets a slot,
// its own skin, shirt and trouser colours, and a pose (walk, run, idle, aim, lying) animated by a
// phase, so a hundred people on the street cost seven draw calls.
import * as THREE from 'three';
import { colorize, coloredMaterial, setInstance, hideInstance } from './meshkit.js';

export const POSE_IDLE = 0;
export const POSE_WALK = 1;
export const POSE_RUN = 2;
export const POSE_AIM = 3;
export const POSE_DEAD = 4;
export const POSE_SIT = 5;

const tmpColor = new THREE.Color();

export function createFigures(scene, capacity = 160) {
  const material = coloredMaterial({ roughness: 0.85 });
  const parts = {
    head: new THREE.InstancedMesh(colorize(new THREE.SphereGeometry(0.15, 8, 7), '#ffffff'), material, capacity),
    hair: new THREE.InstancedMesh(colorize(new THREE.BoxGeometry(0.3, 0.14, 0.32), '#ffffff').translate(0, 0.07, -0.02), material, capacity),
    torso: new THREE.InstancedMesh(colorize(new THREE.BoxGeometry(0.42, 0.56, 0.24), '#ffffff'), material, capacity),
    armL: new THREE.InstancedMesh(colorize(new THREE.BoxGeometry(0.12, 0.56, 0.14), '#ffffff').translate(0, -0.25, 0), material, capacity),
    armR: new THREE.InstancedMesh(colorize(new THREE.BoxGeometry(0.12, 0.56, 0.14), '#ffffff').translate(0, -0.25, 0), material, capacity),
    legL: new THREE.InstancedMesh(colorize(new THREE.BoxGeometry(0.17, 0.8, 0.2), '#ffffff').translate(0, -0.4, 0), material, capacity),
    legR: new THREE.InstancedMesh(colorize(new THREE.BoxGeometry(0.17, 0.8, 0.2), '#ffffff').translate(0, -0.4, 0), material, capacity),
  };
  const meshes = Object.values(parts);
  for (const m of meshes) {
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.count = capacity;
    for (let i = 0; i < capacity; i += 1) hideInstance(m, i);
    scene.add(m);
  }
  const free = [];
  for (let i = capacity - 1; i >= 0; i -= 1) free.push(i);
  const used = new Set();

  const root = new THREE.Object3D();
  const limb = new THREE.Object3D();
  const limbMatrix = new THREE.Matrix4();
  const place = (mesh, index, x, y, z, rx, ry, rz) => {
    limb.position.set(x, y, z);
    limb.rotation.set(rx, ry, rz);
    limb.updateMatrix();
    limbMatrix.multiplyMatrices(root.matrix, limb.matrix);
    mesh.setMatrixAt(index, limbMatrix);
  };

  return {
    capacity,
    /** Reserve a slot and paint it; returns the slot index or -1 when the crowd is full. */
    alloc(skin, shirt, pants, hair = '#2a1a12') {
      if (free.length === 0) return -1;
      const i = free.pop();
      used.add(i);
      parts.head.setColorAt(i, tmpColor.set(skin));
      parts.hair.setColorAt(i, tmpColor.set(hair));
      parts.torso.setColorAt(i, tmpColor.set(shirt));
      parts.armL.setColorAt(i, tmpColor.set(shirt));
      parts.armR.setColorAt(i, tmpColor.set(shirt));
      parts.legL.setColorAt(i, tmpColor.set(pants));
      parts.legR.setColorAt(i, tmpColor.set(pants));
      for (const m of meshes) m.instanceColor.needsUpdate = true;
      return i;
    },
    release(i) {
      if (i < 0 || !used.has(i)) return;
      used.delete(i);
      free.push(i);
      for (const m of meshes) hideInstance(m, i);
    },
    /** Pose slot `i` at (x, y, z) facing `yaw`; `phase` drives the limb swing, `pose` the stance. */
    pose(i, x, y, z, yaw, phase, pose, lean = 0) {
      if (i < 0) return;
      root.position.set(x, y, z);
      if (pose === POSE_DEAD) {
        root.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
        root.position.y = y + 0.25;
      } else {
        root.rotation.set(lean, yaw, 0, 'YXZ');
      }
      root.updateMatrix();
      const swing = pose === POSE_RUN ? 1.1 : pose === POSE_WALK ? 0.65 : 0;
      const s = Math.sin(phase) * swing;
      const bob = pose === POSE_IDLE ? Math.sin(phase * 0.5) * 0.01 : Math.abs(Math.cos(phase)) * 0.03 * swing;
      const hip = 0.86;
      const shoulder = hip + 0.52;
      if (pose === POSE_SIT) {
        place(parts.torso, i, 0, 0.95 + 0.28 + bob, 0, 0, 0, 0);
        place(parts.head, i, 0, 0.95 + 0.72, 0, 0, 0, 0);
        place(parts.hair, i, 0, 0.95 + 0.72, 0, 0, 0, 0);
        place(parts.armL, i, 0.27, 0.95 + 0.52, 0, -0.8, 0, 0);
        place(parts.armR, i, -0.27, 0.95 + 0.52, 0, -0.8, 0, 0);
        place(parts.legL, i, 0.11, 0.95, 0, -1.4, 0, 0);
        place(parts.legR, i, -0.11, 0.95, 0, -1.4, 0, 0);
        return;
      }
      place(parts.torso, i, 0, hip + 0.28 + bob, 0, 0, 0, 0);
      place(parts.head, i, 0, hip + 0.72 + bob, 0, 0, 0, 0);
      place(parts.hair, i, 0, hip + 0.72 + bob, 0, 0, 0, 0);
      if (pose === POSE_AIM) {
        place(parts.armL, i, 0.27, shoulder + bob, 0, -1.5, 0, 0.3);
        place(parts.armR, i, -0.27, shoulder + bob, 0, -1.5, 0, -0.2);
      } else {
        place(parts.armL, i, 0.27, shoulder + bob, 0, -s, 0, 0.08);
        place(parts.armR, i, -0.27, shoulder + bob, 0, s, 0, -0.08);
      }
      place(parts.legL, i, 0.11, hip + bob, 0, s, 0, 0);
      place(parts.legR, i, -0.11, hip + bob, 0, -s, 0, 0);
    },
    commit() {
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Random pedestrian colours: skin tones, bright beachwear, uniforms are chosen by the caller. */
export const SKINS = ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#5c3a1e', '#f5d7bd', '#a56f43'];
export const SHIRTS = ['#ff6fb5', '#5ee8ff', '#ffd36e', '#ffffff', '#ff8a5b', '#9fd98a', '#c58cff', '#2a4d8f', '#f04d4d', '#1f9aa8'];
export const PANTS = ['#2a3a5a', '#3b3b44', '#d9d2c4', '#6b4a3a', '#f4f4f0', '#1b1b1b', '#5c7f93'];
export const HAIRS = ['#1b1b1b', '#3b2416', '#6b4a3a', '#d9b36a', '#8a1c1c', '#e8e4dc'];
