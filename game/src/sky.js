// The sky over Halcyon Bay: a gradient dome with the sun's glow, a warm low sun that throws long
// shadows at golden hour, hemisphere fill, distance haze, and a clock that turns it all from dawn
// through the golden default into a neon night with stars.
import * as THREE from 'three';
import { TIME } from './config.js';

const SKY_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = pos.xyww;
}`;

const SKY_FRAGMENT = `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float night;
uniform float time;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, pow(h, 0.55));
  col = mix(col, horizon * 0.85, smoothstep(0.0, -0.08, vDir.y));
  float sd = max(dot(vDir, sunDir), 0.0);
  col += sunColor * (pow(sd, 1200.0) * 3.0 + pow(sd, 60.0) * 0.55 + pow(sd, 6.0) * 0.18);
  // A warm band hugging the horizon in the sun's half of the sky.
  float band = (1.0 - smoothstep(0.0, 0.25, abs(vDir.y))) * (0.5 + 0.5 * dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))));
  col += sunColor * band * 0.25 * (1.0 - night);
  // Stars.
  vec3 cell = floor(vDir * 180.0);
  float star = step(0.9975, hash(cell)) * smoothstep(0.02, 0.3, vDir.y);
  col += vec3(star) * night * (0.6 + 0.4 * sin(time * 3.0 + hash(cell + 1.0) * 6.28));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky(scene, renderer) {
  const uniforms = {
    zenith: { value: new THREE.Color('#3a7bd5') },
    horizon: { value: new THREE.Color('#ffb577') },
    sunDir: { value: new THREE.Vector3(-0.7, 0.2, 0.3).normalize() },
    sunColor: { value: new THREE.Color('#ffd0a0') },
    night: { value: 0 },
    time: { value: 0 },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false }));
  dome.scale.setScalar(2000);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  const sun = new THREE.DirectionalLight('#ffd3a3', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 520;
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight('#9fd0ff', '#c88a5a', 0.9);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight('#ffe0c0', 0.28);
  scene.add(ambient);

  scene.fog = new THREE.Fog('#f7c9a0', 260, 1500);
  scene.background = null;

  const sunDir = new THREE.Vector3();
  const sunColor = new THREE.Color();
  const fogColor = new THREE.Color();
  const tmpColor = new THREE.Color();
  let hour = TIME.startHour;
  let nightAmount = 0;

  function lerpColor(out, a, b, t) {
    return out.copy(a).lerp(tmpColor.set(b), Math.max(0, Math.min(1, t)));
  }

  /** Place the sun and recolour the sky for `h` hours (0-24). */
  function setHour(h) {
    hour = ((h % 24) + 24) % 24;
    const dayFrac = (hour - TIME.sunrise) / (TIME.sunset - TIME.sunrise);
    const a = Math.PI * Math.max(-0.2, Math.min(1.2, dayFrac));
    const elev = Math.sin(a) * 1.05;
    const night = hour < TIME.sunrise - 0.6 || hour > TIME.sunset + 0.7;
    const dusk = Math.max(0, Math.min(1, (hour - (TIME.sunset - 1.6)) / 2.3));
    const dawn = Math.max(0, Math.min(1, ((TIME.sunrise + 1.4) - hour) / 2.0));
    nightAmount = night ? 1 : Math.max(dusk, dawn);
    sunDir.set(Math.cos(a), Math.max(0.03, elev), 0.42 * Math.sin(a) + 0.15).normalize();
    // Warmth rises as the sun drops.
    const low = 1 - Math.min(1, Math.max(0, elev) / 0.6);
    sunColor.setRGB(1.0, 0.95 - low * 0.35, 0.85 - low * 0.55);
    uniforms.sunDir.value.copy(sunDir);
    uniforms.sunColor.value.copy(sunColor);
    uniforms.night.value = nightAmount;
    const zenithDay = new THREE.Color().setRGB(0.22 + low * 0.1, 0.5 - low * 0.15, 0.9 - low * 0.2);
    const horizonDay = new THREE.Color().setRGB(1.0, 0.75 - low * 0.22, 0.55 - low * 0.25);
    lerpColor(uniforms.zenith.value, zenithDay, '#070b1c', nightAmount);
    lerpColor(uniforms.horizon.value, horizonDay, '#2a1a3a', nightAmount);
    lerpColor(fogColor, horizonDay, '#1a1626', nightAmount);
    scene.fog.color.copy(fogColor);
    sun.position.copy(sunDir).multiplyScalar(300);
    sun.color.copy(sunColor);
    sun.intensity = night ? 0.25 : 2.9 * (1 - nightAmount * 0.75);
    if (night) {
      sun.color.set('#8fa6ff');
      sunDir.set(0.3, 0.8, 0.4).normalize();
      sun.position.copy(sunDir).multiplyScalar(300);
    }
    hemi.intensity = 0.95 - nightAmount * 0.65;
    hemi.color.set(night ? '#2b3b6b' : '#9fd0ff');
    ambient.intensity = 0.28 - nightAmount * 0.1;
    renderer.toneMappingExposure = 1.05 - nightAmount * 0.15;
  }

  setHour(hour);

  return {
    sun, hemi, dome, uniforms,
    get hour() { return hour; },
    get night() { return nightAmount; },
    sunDir, sunColor, fogColor,
    setHour,
    /** Follow the player so the shadow map covers the streets around them. */
    update(dt, focus, elapsed) {
      uniforms.time.value = elapsed;
      sun.target.position.set(focus.x, 0, focus.z);
      sun.position.copy(sunDir).multiplyScalar(300).add(sun.target.position);
      sun.target.updateMatrixWorld();
    },
    advance(dt) {
      setHour(hour + (dt / 60) * TIME.hoursPerRealMinute);
    },
  };
}
