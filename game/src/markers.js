// World markers: the glowing columns that mark mission givers, objectives, safehouses, garages and
// race starts, the hovering arrow over the current objective, race checkpoint rings, and the
// sea-glass shards that spin and sparkle until collected.
import * as THREE from 'three';

export function createMarkers(scene) {
  const markers = new Map();
  const column = new THREE.CylinderGeometry(2.2, 2.2, 3.5, 20, 1, true);
  column.translate(0, 1.75, 0);
  const ring = new THREE.TorusGeometry(2.3, 0.14, 8, 28);
  ring.rotateX(Math.PI / 2);
  const arrow = new THREE.ConeGeometry(0.7, 1.4, 4);
  arrow.rotateX(Math.PI);
  const shardGeom = new THREE.OctahedronGeometry(0.45, 0);
  shardGeom.scale(0.7, 1.4, 0.7);
  const gate = new THREE.TorusGeometry(5.5, 0.35, 8, 30);

  const materialFor = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

  return {
    /** Add or move a marker: kind column (objective/place), gate (race checkpoint) or shard. */
    set(id, x, z, color = '#ffd34a', kind = 'column', y = 0) {
      let m = markers.get(id);
      if (!m) {
        const group = new THREE.Group();
        if (kind === 'column') {
          const col = new THREE.Mesh(column, materialFor(color, 0.35));
          const base = new THREE.Mesh(ring, materialFor(color, 0.9));
          base.position.y = 0.12;
          const tip = new THREE.Mesh(arrow, materialFor(color, 0.95));
          tip.position.y = 5.2;
          group.add(col, base, tip);
          m = { group, tip, kind };
        } else if (kind === 'ring') {
          const base = new THREE.Mesh(ring, materialFor(color, 0.9));
          base.scale.setScalar(0.45);
          base.position.y = 0.1;
          const tip = new THREE.Mesh(arrow, materialFor(color, 0.95));
          tip.scale.setScalar(0.5);
          tip.position.y = 2.6;
          group.add(base, tip);
          m = { group, tip, kind: 'column' };
        } else if (kind === 'gate') {
          const g = new THREE.Mesh(gate, materialFor(color, 0.8));
          g.position.y = 5.5;
          const col = new THREE.Mesh(column, materialFor(color, 0.18));
          col.scale.set(2.5, 2.4, 2.5);
          group.add(g, col);
          m = { group, tip: g, kind };
        } else {
          const s = new THREE.Mesh(shardGeom, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.95 }));
          s.position.y = 0.9;
          const glow = new THREE.Mesh(ring, materialFor(color, 0.5));
          glow.scale.setScalar(0.35);
          glow.position.y = 0.1;
          group.add(s, glow);
          m = { group, tip: s, kind };
        }
        scene.add(group);
        markers.set(id, m);
      }
      m.group.position.set(x, y, z);
      m.group.visible = true;
      return m;
    },
    remove(id) {
      const m = markers.get(id);
      if (!m) return;
      scene.remove(m.group);
      markers.delete(id);
    },
    has(id) {
      return markers.has(id);
    },
    clearPrefix(prefix) {
      for (const id of [...markers.keys()]) if (id.startsWith(prefix)) this.remove(id);
    },
    update(dt, time) {
      for (const m of markers.values()) {
        if (m.kind === 'column') {
          const base = m.tip.scale.x < 1 ? 2.6 : 5.2;
          m.tip.position.y = base + Math.sin(time * 3) * 0.3;
          m.tip.rotation.y += dt * 1.5;
        } else if (m.kind === 'shard') {
          m.tip.rotation.y += dt * 2;
          m.tip.position.y = 0.9 + Math.sin(time * 2.5) * 0.15;
        } else {
          m.tip.rotation.z += dt * 0.6;
        }
      }
    },
  };
}
