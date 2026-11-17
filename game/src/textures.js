// Every texture is painted on a canvas at load: window grids for each building style (with a
// matching emissive map of the lit windows), asphalt, sidewalk, sand, boardwalk planks, neon
// and shop signs, billboards and the soft particle dot. Nothing is downloaded.
import * as THREE from 'three';
import { createRng } from './rng.js';

function canvasOf(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function toTexture(canvas, repeat = true, srgb = true) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A facade tile: `cols` by `rows` windows on a wall colour. One tile covers `tile` metres on a
 * building side (see meshkit.tiledBox). Returns the colour map and the emissive map of lit windows.
 */
export function windowTextures(style, seed = 1) {
  const rng = createRng(seed);
  const size = 256;
  const map = canvasOf(size, size);
  const glow = canvasOf(size, size);
  const c = map.getContext('2d');
  const g = glow.getContext('2d');
  const s = STYLES[style];
  c.fillStyle = s.wall;
  c.fillRect(0, 0, size, size);
  // Subtle wall grain.
  for (let i = 0; i < 300; i += 1) {
    c.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.07)})`;
    c.fillRect(rng.range(0, size), rng.range(0, size), rng.range(2, 12), rng.range(1, 3));
  }
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const cw = size / s.cols;
  const ch = size / s.rows;
  for (let row = 0; row < s.rows; row += 1) {
    for (let col = 0; col < s.cols; col += 1) {
      const x = col * cw + cw * s.inset;
      const y = row * ch + ch * s.insetY;
      const w = cw * (1 - s.inset * 2);
      const h = ch * (1 - s.insetY * 2);
      const lit = rng.next() < s.litChance;
      const shade = rng.range(0.75, 1);
      c.fillStyle = s.frame;
      c.fillRect(x - 2, y - 2, w + 4, h + 4);
      const grad = c.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, s.glassA);
      grad.addColorStop(1, s.glassB);
      c.fillStyle = grad;
      c.fillRect(x, y, w, h);
      c.fillStyle = `rgba(255,255,255,${0.12 * shade})`;
      c.fillRect(x, y, w * 0.45, h * 0.3);
      if (s.mullion) {
        c.fillStyle = s.frame;
        c.fillRect(x + w / 2 - 1, y, 2, h);
      }
      if (lit) {
        const warm = rng.next() < 0.7;
        g.fillStyle = warm ? `rgba(255,${rng.int(190, 230)},${rng.int(120, 170)},1)` : `rgba(${rng.int(170, 220)},${rng.int(220, 240)},255,1)`;
        g.fillRect(x + 1, y + 1, w - 2, h - 2);
      }
    }
  }
  if (s.bands) {
    c.fillStyle = s.bandColor;
    for (let row = 0; row <= s.rows; row += 1) c.fillRect(0, row * ch - 2, size, 4);
  }
  return { map: toTexture(map), emissiveMap: toTexture(glow) };
}

const STYLES = {
  glass: { wall: '#4f7f9a', frame: '#1d3340', glassA: '#8fd3ec', glassB: '#2a6f93', cols: 6, rows: 6, inset: 0.06, insetY: 0.08, litChance: 0.45, mullion: true, bands: true, bandColor: '#213c4b' },
  tower: { wall: '#d9d2c4', frame: '#5a5247', glassA: '#6c9fb8', glassB: '#35607a', cols: 5, rows: 5, inset: 0.16, insetY: 0.18, litChance: 0.4, mullion: false, bands: true, bandColor: '#bfb6a6' },
  stucco: { wall: '#e6b98a', frame: '#4b3b32', glassA: '#5f8aa3', glassB: '#2f4f66', cols: 4, rows: 4, inset: 0.2, insetY: 0.2, litChance: 0.5, mullion: true, bands: false },
  deco: { wall: '#f3d8c4', frame: '#6a4a3a', glassA: '#79b6cf', glassB: '#3c7a95', cols: 4, rows: 4, inset: 0.22, insetY: 0.16, litChance: 0.42, mullion: false, bands: true, bandColor: '#e59c86' },
  villa: { wall: '#f7f1e3', frame: '#5b4a3a', glassA: '#8dc0d6', glassB: '#4f8aa5', cols: 3, rows: 2, inset: 0.24, insetY: 0.22, litChance: 0.55, mullion: true, bands: false },
  warehouse: { wall: '#9a9ea3', frame: '#45484c', glassA: '#6c7d87', glassB: '#3e4b55', cols: 6, rows: 3, inset: 0.08, insetY: 0.3, litChance: 0.25, mullion: false, bands: true, bandColor: '#7d8287' },
  neon: { wall: '#6b4b7a', frame: '#2a1c33', glassA: '#8f6fb0', glassB: '#4a2f63', cols: 4, rows: 4, inset: 0.18, insetY: 0.18, litChance: 0.6, mullion: true, bands: true, bandColor: '#4b2f5a' },
};

export const BUILDING_STYLES = Object.keys(STYLES);

export function asphaltTexture() {
  const size = 256;
  const canvas = canvasOf(size, size);
  const c = canvas.getContext('2d');
  const rng = createRng(77);
  c.fillStyle = '#3a3a3e';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i += 1) {
    const v = rng.int(40, 80);
    c.fillStyle = `rgba(${v},${v},${v + 4},${rng.range(0.2, 0.6)})`;
    c.fillRect(rng.range(0, size), rng.range(0, size), 2, 2);
  }
  const t = toTexture(canvas);
  t.repeat.set(1, 1);
  return t;
}

export function sidewalkTexture() {
  const size = 256;
  const canvas = canvasOf(size, size);
  const c = canvas.getContext('2d');
  const rng = createRng(78);
  c.fillStyle = '#b9b2a6';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 2500; i += 1) {
    const v = rng.int(150, 200);
    c.fillStyle = `rgba(${v},${v - 6},${v - 14},${rng.range(0.2, 0.5)})`;
    c.fillRect(rng.range(0, size), rng.range(0, size), 2, 2);
  }
  c.strokeStyle = 'rgba(70,65,60,0.5)';
  c.lineWidth = 3;
  for (let i = 0; i <= 2; i += 1) {
    c.beginPath();
    c.moveTo(0, i * 128);
    c.lineTo(size, i * 128);
    c.moveTo(i * 128, 0);
    c.lineTo(i * 128, size);
    c.stroke();
  }
  return toTexture(canvas);
}

export function sandTexture() {
  const size = 256;
  const canvas = canvasOf(size, size);
  const c = canvas.getContext('2d');
  const rng = createRng(79);
  c.fillStyle = '#efd9a6';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i += 1) {
    c.fillStyle = `rgba(${rng.int(200, 250)},${rng.int(170, 215)},${rng.int(110, 160)},${rng.range(0.25, 0.7)})`;
    c.fillRect(rng.range(0, size), rng.range(0, size), 2, 2);
  }
  return toTexture(canvas);
}

export function grassTexture() {
  const size = 256;
  const canvas = canvasOf(size, size);
  const c = canvas.getContext('2d');
  const rng = createRng(80);
  c.fillStyle = '#6f9e4a';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i += 1) {
    c.fillStyle = `rgba(${rng.int(70, 130)},${rng.int(130, 180)},${rng.int(40, 80)},${rng.range(0.3, 0.7)})`;
    c.fillRect(rng.range(0, size), rng.range(0, size), 2, 3);
  }
  return toTexture(canvas);
}

export function plankTexture() {
  const size = 256;
  const canvas = canvasOf(size, size);
  const c = canvas.getContext('2d');
  const rng = createRng(81);
  c.fillStyle = '#a97c50';
  c.fillRect(0, 0, size, size);
  const plank = 32;
  for (let i = 0; i < size / plank; i += 1) {
    c.fillStyle = `rgb(${rng.int(150, 185)},${rng.int(105, 130)},${rng.int(60, 85)})`;
    c.fillRect(0, i * plank + 2, size, plank - 4);
    c.fillStyle = 'rgba(60,35,20,0.35)';
    for (let k = 0; k < 10; k += 1) c.fillRect(rng.range(0, size), i * plank + rng.range(4, plank - 4), rng.range(10, 60), 1);
  }
  return toTexture(canvas);
}

export function concreteTexture() {
  const size = 128;
  const canvas = canvasOf(size, size);
  const c = canvas.getContext('2d');
  const rng = createRng(82);
  c.fillStyle = '#8f8c86';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 1500; i += 1) {
    const v = rng.int(110, 170);
    c.fillStyle = `rgba(${v},${v},${v - 6},${rng.range(0.2, 0.5)})`;
    c.fillRect(rng.range(0, size), rng.range(0, size), 2, 2);
  }
  return toTexture(canvas);
}

/** A glowing sign: bold text on a dark panel in the neon colour, for shops, clubs and the bank. */
export function signTexture(text, color = '#ff6fb5', background = '#140b1c', width = 512, height = 128, font = 'bold 72px Impact, "Arial Black", sans-serif') {
  const canvas = canvasOf(width, height);
  const c = canvas.getContext('2d');
  c.fillStyle = background;
  c.fillRect(0, 0, width, height);
  // A wash of the neon colour and a bright border so the panel reads from far away.
  c.globalAlpha = 0.42;
  c.fillStyle = color;
  c.fillRect(0, 0, width, height);
  c.globalAlpha = 1;
  c.lineWidth = 8;
  c.strokeStyle = color;
  c.strokeRect(4, 4, width - 8, height - 8);
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = color;
  c.shadowBlur = 24;
  c.fillStyle = color;
  c.fillText(text, width / 2, height / 2 + 4, width - 24);
  c.shadowBlur = 0;
  c.fillStyle = '#fff6fb';
  c.font = font.replace(/\d+px/, (m) => `${Math.round(parseInt(m, 10) * 0.97)}px`);
  c.globalAlpha = 0.55;
  c.fillText(text, width / 2, height / 2 + 4, width - 24);
  c.globalAlpha = 1;
  const t = toTexture(canvas, false);
  return t;
}

/** A painted billboard with a headline and a tagline, in the city's own ad style. */
export function billboardTexture(headline, tagline, colors = ['#ff8a5b', '#ffd36e']) {
  const width = 512;
  const height = 256;
  const canvas = canvasOf(width, height);
  const c = canvas.getContext('2d');
  const grad = c.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  c.fillStyle = grad;
  c.fillRect(0, 0, width, height);
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.beginPath();
  c.arc(width * 0.8, height * 0.3, 90, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1b1430';
  c.font = 'bold 64px Impact, "Arial Black", sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(headline, 28, height * 0.4, width - 56);
  c.font = 'italic 30px Georgia, serif';
  c.fillText(tagline, 30, height * 0.72, width - 60);
  return toTexture(canvas, false);
}

/** A soft radial dot for smoke, sparks, glow and muzzle flashes. */
export function particleTexture() {
  const size = 64;
  const canvas = canvasOf(size, size);
  const c = canvas.getContext('2d');
  const grad = c.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  return toTexture(canvas, false);
}

/** Palm fronds: a feathered leaf with alpha, drawn once and shared by every palm. */
export function frondTexture() {
  const width = 128;
  const height = 256;
  const canvas = canvasOf(width, height);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, width, height);
  c.lineCap = 'round';
  // Leaflets fan out from the spine, longest in the middle, drooping toward the tip.
  for (let i = 0; i < 44; i += 1) {
    const t = i / 44;
    const y = 14 + t * 230;
    const len = 8 + 56 * Math.sin(Math.pow(t, 0.8) * Math.PI);
    const droop = 10 + t * 16;
    const g = 150 + Math.sin(t * 9) * 30;
    c.strokeStyle = `rgb(${70 + t * 30}, ${g}, ${55})`;
    c.lineWidth = 6.5;
    c.beginPath();
    c.moveTo(64, y);
    c.lineTo(64 - len, y + droop);
    c.moveTo(64, y);
    c.lineTo(64 + len, y + droop);
    c.stroke();
  }
  c.strokeStyle = '#6d8f3a';
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(64, 256);
  c.lineTo(64, 6);
  c.stroke();
  const t = toTexture(canvas, false);
  return t;
}

/** The lane paint along a road segment: double yellow centre line and white edge lines. */
export function roadStripeTexture() {
  const width = 128;
  const height = 128;
  const canvas = canvasOf(width, height);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, width, height);
  return toTexture(canvas, true);
}

export function createTextures() {
  const windows = {};
  for (const style of BUILDING_STYLES) windows[style] = windowTextures(style, style.length * 31 + 7);
  return {
    windows,
    asphalt: asphaltTexture(),
    sidewalk: sidewalkTexture(),
    sand: sandTexture(),
    grass: grassTexture(),
    plank: plankTexture(),
    concrete: concreteTexture(),
    particle: particleTexture(),
    frond: frondTexture(),
  };
}
