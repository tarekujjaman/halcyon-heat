// The map of Halcyon Bay drawn once to an offscreen canvas (water, beach, districts in their
// colours, every road, the canal and bridges, the pier), then shown two ways: the circular
// minimap that rotates with the player and carries blips and the police search circle, and the
// full pause map with district names, a legend and the waypoint.
import { CITY, DISTRICTS, BEACH } from '../config.js';

const SCALE = 1.0;
const PAD = 170;

export function createMinimap(layout) {
  const w = Math.ceil((layout.width + PAD * 2) * SCALE);
  const h = Math.ceil((layout.depth + PAD * 2) * SCALE);
  const base = document.createElement('canvas');
  base.width = w;
  base.height = h;
  const toMap = (x, z) => [(x + PAD) * SCALE, (z + PAD) * SCALE];

  const paintBase = () => {
    const c = base.getContext('2d');
    c.fillStyle = DISTRICTS.sea.mapColor;
    c.fillRect(0, 0, w, h);
    // Land: sand strip and the city ground.
    c.fillStyle = '#f1dcae';
    const [sx] = toMap(BEACH.seaEdge, 0);
    c.fillRect(sx, toMap(0, -CITY.road / 2 - 9)[1], w - sx, h);
    c.fillStyle = '#d9d2bf';
    const [gx, gz] = toMap(-CITY.road / 2 - 3, -CITY.road / 2 - 9);
    c.fillRect(gx, gz, w - gx, h - gz);
    for (const b of layout.blocks) {
      const [x0, z0] = toMap(b.x0 - 3, b.z0 - 3);
      const [x1, z1] = toMap(b.x1 + 3, b.z1 + 3);
      c.fillStyle = DISTRICTS[b.district].mapColor;
      c.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
    // Canal.
    const [cx0, cz0] = toMap(-80, layout.canal.z0);
    const [cx1, cz1] = toMap(layout.width + 80, layout.canal.z1);
    c.fillStyle = DISTRICTS.canal.mapColor;
    c.fillRect(cx0, cz0, cx1 - cx0, cz1 - cz0);
    // Boardwalk and pier.
    c.fillStyle = '#b98b5a';
    const [bx0] = toMap(BEACH.boardwalkTo, 0);
    const [bx1] = toMap(BEACH.boardwalkFrom, 0);
    c.fillRect(bx0, toMap(0, -8)[1], bx1 - bx0, (layout.depth + 36) * SCALE);
    const p = layout.pier;
    const [px0, pz0] = toMap(p.x0, p.z0);
    const [px1, pz1] = toMap(p.x1, p.z1);
    c.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
    // Roads.
    c.strokeStyle = '#f7f5ef';
    c.lineWidth = CITY.asphalt * SCALE;
    c.lineCap = 'round';
    for (const e of layout.edges) {
      const [ax, az] = toMap(e.a.x, e.a.z);
      const [bx, bz] = toMap(e.b.x, e.b.z);
      c.beginPath();
      c.moveTo(ax, az);
      c.lineTo(bx, bz);
      c.stroke();
    }
    c.strokeStyle = '#e7d25a';
    c.lineWidth = 1.2;
    for (const e of layout.edges) {
      const [ax, az] = toMap(e.a.x, e.a.z);
      const [bx, bz] = toMap(e.b.x, e.b.z);
      c.beginPath();
      c.moveTo(ax, az);
      c.lineTo(bx, bz);
      c.stroke();
    }
  };
  paintBase();

  const drawBlip = (c, blip, x, y, scale = 1) => {
    const r = 6 * scale;
    c.save();
    c.translate(x, y);
    c.lineWidth = 2 * scale;
    c.strokeStyle = '#fff';
    c.fillStyle = blip.color;
    if (blip.kind === 'police' || blip.kind === 'enemy') {
      c.beginPath();
      c.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    } else if (blip.kind === 'mission' || blip.kind === 'waypoint') {
      c.beginPath();
      c.moveTo(0, -r * 1.4);
      c.lineTo(r, r * 0.6);
      c.lineTo(-r, r * 0.6);
      c.closePath();
      c.fill();
      c.stroke();
    } else if (blip.kind === 'heli') {
      c.beginPath();
      c.moveTo(-r, -r);
      c.lineTo(r, r);
      c.moveTo(r, -r);
      c.lineTo(-r, r);
      c.lineWidth = 3 * scale;
      c.strokeStyle = blip.color;
      c.stroke();
    } else {
      // Square icon with a letter for places.
      c.fillRect(-r, -r, r * 2, r * 2);
      c.strokeRect(-r, -r, r * 2, r * 2);
      if (blip.letter) {
        c.fillStyle = '#111';
        c.font = `bold ${Math.round(r * 1.6)}px Arial, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(blip.letter, 0, 1);
      }
    }
    c.restore();
  };

  return {
    base,
    toMap,
    scale: SCALE,
    pad: PAD,
    /** The rotating circular minimap: centred on (px, pz), rotated so `yaw` points up, with blips. */
    drawCircular(ctx, size, px, pz, yaw, blips, search, zoom = 0.9) {
      const r = size / 2;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = DISTRICTS.sea.mapColor;
      ctx.fillRect(0, 0, size, size);
      ctx.translate(r, r + size * 0.12);
      ctx.rotate(yaw + Math.PI);
      ctx.scale(zoom, zoom);
      const [mx, my] = toMap(px, pz);
      ctx.translate(-mx, -my);
      ctx.drawImage(base, 0, 0);
      if (search) {
        const [sx, sy] = toMap(search.x, search.z);
        ctx.beginPath();
        ctx.arc(sx, sy, search.radius * SCALE, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 60, 60, 0.18)';
        ctx.fill();
        ctx.lineWidth = 3 / zoom;
        ctx.strokeStyle = 'rgba(255, 70, 70, 0.9)';
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const b of blips) {
        const [bx, by] = toMap(b.x, b.z);
        // Blips keep upright: undo the rotation around their own centre.
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(-(yaw + Math.PI));
        ctx.scale(1 / zoom, 1 / zoom);
        drawBlip(ctx, b, 0, 0, 1.1);
        ctx.restore();
      }
      ctx.restore();
      // The player arrow at the centre.
      ctx.save();
      ctx.translate(r, r + size * 0.12);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(8, 9);
      ctx.lineTo(0, 5);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // North marker on the rim.
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(yaw + Math.PI);
      ctx.fillStyle = '#ffd34a';
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', 0, -r + 16);
      ctx.restore();
    },
    /** The full map: the whole city fitted into (width, height) with labels, blips and the waypoint. */
    drawFull(ctx, width, height, blips, labels, waypoint, player) {
      ctx.clearRect(0, 0, width, height);
      const fit = Math.min(width / base.width, height / base.height);
      const ox = (width - base.width * fit) / 2;
      const oy = (height - base.height * fit) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(fit, fit);
      ctx.drawImage(base, 0, 0);
      ctx.restore();
      const project = (x, z) => {
        const [mx, my] = toMap(x, z);
        return [ox + mx * fit, oy + my * fit];
      };
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of labels) {
        const [x, y] = project(l.x, l.z);
        ctx.save();
        ctx.translate(x, y);
        if (l.angle) ctx.rotate(l.angle);
        ctx.font = `bold ${l.size || 26}px Impact, "Arial Black", sans-serif`;
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(l.text, 0, 0);
        ctx.fillStyle = l.color || '#fff';
        ctx.fillText(l.text, 0, 0);
        ctx.restore();
      }
      for (const b of blips) {
        const [x, y] = project(b.x, b.z);
        drawBlip(ctx, b, x, y, 1.5);
      }
      if (waypoint) {
        const [x, y] = project(waypoint.x, waypoint.z);
        drawBlip(ctx, { kind: 'waypoint', color: '#c58cff' }, x, y, 1.8);
      }
      if (player) {
        const [x, y] = project(player.x, player.z);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI - player.yaw);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(10, 11);
        ctx.lineTo(0, 6);
        ctx.lineTo(-10, 11);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      return { project, unproject: (sx, sy) => [((sx - ox) / fit) / SCALE - PAD, ((sy - oy) / fit) / SCALE - PAD] };
    },
  };
}
