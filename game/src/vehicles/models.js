// Halcyon Bay's own cars, built from primitives: the Marlin sports coupe, the Dune sedan, the Bay
// Cab taxi, the Mule pickup, the Halcyon P.D. cruiser, the Pelican van and the Hornet motorbike.
// Paintable panels are white so an instance colour tints them; glass, trim and tyres keep their own.
// Each model also carries its handling numbers and where its wheels and lights go.
import { box, cylinder, merge, colorize } from '../meshkit.js';
import * as THREE from 'three';

const GLASS = '#1a2430';
const TRIM = '#2b2b30';
const CHROME = '#9aa3ab';

/** Handling: top speed (m/s), acceleration, braking, lateral grip, wheelbase and mass. */
export const SPECS = {
  coupe: { name: 'Marlin GT', maxSpeed: 54, accel: 13, brake: 24, grip: 7.0, wheelbase: 2.8, mass: 1.0, length: 4.4, width: 1.9, wheelRadius: 0.34, seatHeight: 0.5 },
  sedan: { name: 'Dune Sedan', maxSpeed: 40, accel: 8, brake: 18, grip: 8.0, wheelbase: 2.9, mass: 1.1, length: 4.6, width: 1.85, wheelRadius: 0.34, seatHeight: 0.6 },
  taxi: { name: 'Bay Cab', maxSpeed: 40, accel: 8, brake: 18, grip: 8.0, wheelbase: 2.9, mass: 1.1, length: 4.6, width: 1.85, wheelRadius: 0.34, seatHeight: 0.6 },
  pickup: { name: 'Mule Pickup', maxSpeed: 38, accel: 7.5, brake: 17, grip: 8.0, wheelbase: 3.4, mass: 1.4, length: 5.2, width: 1.95, wheelRadius: 0.4, seatHeight: 0.8 },
  cruiser: { name: 'Interceptor', maxSpeed: 50, accel: 11.5, brake: 21, grip: 8.0, wheelbase: 2.9, mass: 1.2, length: 4.7, width: 1.9, wheelRadius: 0.35, seatHeight: 0.6 },
  van: { name: 'Pelican Van', maxSpeed: 34, accel: 6, brake: 16, grip: 8.5, wheelbase: 3.6, mass: 1.6, length: 5.0, width: 2.0, wheelRadius: 0.38, seatHeight: 0.9 },
  bike: { name: 'Hornet 650', maxSpeed: 50, accel: 14, brake: 20, grip: 6.5, wheelbase: 1.5, mass: 0.4, length: 2.1, width: 0.7, wheelRadius: 0.32, seatHeight: 0.55 },
};

export const MODEL_NAMES = Object.keys(SPECS);

export const PAINTS = ['#e3342f', '#1f6fd0', '#f4f4f0', '#1b1b1b', '#ffd23f', '#2fa36b', '#ff6fb5', '#7fd3e8', '#9a6bd1', '#f28c28', '#c0c4c8', '#3b2a1e', '#5ee8ff', '#9fd98a'];

function coupe() {
  return merge([
    box(1.9, 0.46, 4.4, '#ffffff', 0, 0.62, 0),
    box(1.8, 0.2, 1.7, '#ffffff', 0, 0.95, 1.15),
    box(1.6, 0.46, 2.0, '#ffffff', 0, 1.1, -0.3),
    box(1.64, 0.3, 1.8, GLASS, 0, 1.17, -0.3),
    box(1.5, 0.05, 0.3, TRIM, 0, 1.12, -2.05),
    box(0.08, 0.2, 0.2, TRIM, 0.6, 1.0, -2.0),
    box(0.08, 0.2, 0.2, TRIM, -0.6, 1.0, -2.0),
    box(1.9, 0.18, 0.2, TRIM, 0, 0.42, 2.2),
    box(1.9, 0.18, 0.2, TRIM, 0, 0.42, -2.2),
    box(1.2, 0.12, 0.05, '#101010', 0, 0.75, 2.22),
  ]);
}

function sedan(taxi = false) {
  const parts = [
    box(1.85, 0.5, 4.6, '#ffffff', 0, 0.64, 0),
    box(1.7, 0.52, 2.3, '#ffffff', 0, 1.15, -0.1),
    box(1.74, 0.34, 2.05, GLASS, 0, 1.22, -0.1),
    box(1.85, 0.18, 0.18, TRIM, 0, 0.42, 2.3),
    box(1.85, 0.18, 0.18, TRIM, 0, 0.42, -2.3),
    box(1.0, 0.1, 0.05, '#101010', 0, 0.78, 2.32),
    box(0.1, 0.05, 0.3, CHROME, 0.95, 0.9, 0.8),
    box(0.1, 0.05, 0.3, CHROME, -0.95, 0.9, 0.8),
  ];
  if (taxi) {
    parts.push(box(0.8, 0.22, 0.32, '#ffffff', 0, 1.52, 0.1));
    parts.push(box(0.84, 0.1, 0.36, '#111111', 0, 1.6, 0.1));
    parts.push(box(1.88, 0.08, 4.0, '#111111', 0, 0.9, 0));
  }
  return merge(parts);
}

function pickup() {
  return merge([
    box(1.95, 0.55, 5.2, '#ffffff', 0, 0.75, 0),
    box(1.9, 0.7, 1.9, '#ffffff', 0, 1.35, 0.7),
    box(1.94, 0.4, 1.6, GLASS, 0, 1.45, 0.75),
    box(1.9, 0.45, 2.5, '#ffffff', 0, 1.2, -1.3),
    box(1.6, 0.4, 2.3, '#222222', 0, 1.25, -1.3),
    box(1.95, 0.2, 0.2, TRIM, 0, 0.5, 2.6),
    box(1.95, 0.2, 0.2, TRIM, 0, 0.5, -2.6),
    box(1.2, 0.14, 0.06, '#101010', 0, 0.95, 2.62),
  ]);
}

function cruiser() {
  return merge([
    box(1.9, 0.5, 4.7, '#ffffff', 0, 0.64, 0),
    box(1.92, 0.5, 2.3, '#111111', 0, 0.64, 0),
    box(1.7, 0.52, 2.3, '#ffffff', 0, 1.15, -0.1),
    box(1.74, 0.34, 2.05, GLASS, 0, 1.22, -0.1),
    box(1.9, 0.18, 0.18, TRIM, 0, 0.42, 2.35),
    box(1.9, 0.18, 0.18, TRIM, 0, 0.42, -2.35),
    box(1.6, 0.5, 0.12, '#2b2b30', 0, 0.65, 2.5),
    box(0.12, 0.5, 0.4, '#2b2b30', 0.6, 0.65, 2.3),
    box(0.12, 0.5, 0.4, '#2b2b30', -0.6, 0.65, 2.3),
    box(1.1, 0.08, 0.4, '#111111', 0, 1.43, -0.1),
    box(0.1, 0.05, 0.3, CHROME, 0.95, 0.9, 0.8),
    box(0.1, 0.05, 0.3, CHROME, -0.95, 0.9, 0.8),
  ]);
}

function van() {
  return merge([
    box(2.0, 1.5, 5.0, '#ffffff', 0, 1.15, 0),
    box(2.02, 0.5, 0.5, GLASS, 0, 1.6, 2.26),
    box(2.02, 0.42, 1.0, GLASS, 0, 1.6, 1.45),
    box(2.0, 0.2, 0.2, TRIM, 0, 0.45, 2.5),
    box(2.0, 0.2, 0.2, TRIM, 0, 0.45, -2.5),
    box(1.2, 0.12, 0.05, '#101010', 0, 0.85, 2.52),
    box(1.98, 0.1, 4.6, '#333333', 0, 0.55, 0),
  ]);
}

function bike() {
  return merge([
    box(0.3, 0.3, 1.2, '#ffffff', 0, 0.75, 0),
    box(0.2, 0.2, 0.5, TRIM, 0, 0.6, 0.2),
    box(0.5, 0.12, 0.6, '#1b1b1b', 0, 0.92, -0.3),
    box(0.7, 0.04, 0.08, TRIM, 0, 1.0, 0.6),
    box(0.05, 0.5, 0.05, TRIM, 0, 0.75, 0.75, 0, 0.4),
    box(0.04, 0.35, 0.1, '#ffffff', 0, 0.92, 0.25),
  ]);
}

/** Build every model: geometry, wheel offsets (x left, z forward) and light positions. */
export function buildVehicleModels() {
  const models = {
    coupe: { geometry: coupe(), wheels: [[0.85, 1.4], [-0.85, 1.4], [0.85, -1.4], [-0.85, -1.4]], lights: { headY: 0.7, headX: 0.65, tailY: 0.72, tailX: 0.7, front: 2.2, back: -2.2 } },
    sedan: { geometry: sedan(false), wheels: [[0.82, 1.45], [-0.82, 1.45], [0.82, -1.45], [-0.82, -1.45]], lights: { headY: 0.72, headX: 0.62, tailY: 0.74, tailX: 0.66, front: 2.3, back: -2.3 } },
    taxi: { geometry: sedan(true), wheels: [[0.82, 1.45], [-0.82, 1.45], [0.82, -1.45], [-0.82, -1.45]], lights: { headY: 0.72, headX: 0.62, tailY: 0.74, tailX: 0.66, front: 2.3, back: -2.3 } },
    pickup: { geometry: pickup(), wheels: [[0.88, 1.7], [-0.88, 1.7], [0.88, -1.7], [-0.88, -1.7]], lights: { headY: 0.85, headX: 0.68, tailY: 0.9, tailX: 0.72, front: 2.6, back: -2.6 } },
    cruiser: { geometry: cruiser(), wheels: [[0.84, 1.45], [-0.84, 1.45], [0.84, -1.45], [-0.84, -1.45]], lights: { headY: 0.72, headX: 0.64, tailY: 0.74, tailX: 0.68, front: 2.35, back: -2.35, bar: { y: 1.52, z: -0.1, x: 0.38 } } },
    van: { geometry: van(), wheels: [[0.9, 1.8], [-0.9, 1.8], [0.9, -1.8], [-0.9, -1.8]], lights: { headY: 0.8, headX: 0.7, tailY: 1.0, tailX: 0.75, front: 2.5, back: -2.5 } },
    bike: { geometry: bike(), wheels: [[0, 0.75], [0, -0.75]], lights: { headY: 0.85, headX: 0, tailY: 0.8, tailX: 0, front: 1.0, back: -1.0 } },
  };
  for (const [name, m] of Object.entries(models)) {
    m.name = name;
    m.spec = SPECS[name];
    m.geometry.computeBoundingSphere();
  }
  return models;
}

/** The tyre geometry shared by every wheel: a dark cylinder with a lighter hub, axis along x. */
export function wheelGeometry() {
  const tyre = colorize(new THREE.CylinderGeometry(1, 1, 0.7, 12), '#141414');
  tyre.rotateZ(Math.PI / 2);
  const hub = colorize(new THREE.CylinderGeometry(0.6, 0.6, 0.74, 8), '#b8bec4');
  hub.rotateZ(Math.PI / 2);
  return merge([tyre, hub]);
}
