// Every sound is synthesized with the Web Audio API, nothing is loaded: the engine whose pitch
// follows the revs, police sirens and the helicopter's chop, gunshots per weapon, crashes, skids,
// footsteps, punches, the horn, pickups and the menu blips. Volumes come from the settings.
export function createAudio() {
  let ctx = null;
  let master = null;
  let sfx = null;
  let music = null;
  let noiseBuffer = null;
  const volumes = { volume: 0.8, music: 0.6, sfx: 0.9 };
  const loops = {};

  const ensure = () => {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volumes.volume;
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.gain.value = volumes.sfx;
      sfx.connect(master);
      music = ctx.createGain();
      music.gain.value = volumes.music;
      music.connect(master);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      buildLoops();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  };

  const noise = (duration, filterType, freq, q, gainValue, attack = 0.002, decay = duration) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainValue, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfx);
    src.start(t);
    src.stop(t + attack + decay + 0.05);
    return { filter, g };
  };

  const tone = (type, freq, duration, gainValue, dest = null, freqEnd = null, attack = 0.005) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainValue, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(dest || sfx);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  };

  function buildLoops() {
    // Engine: a sawtooth and a square an octave down through a low-pass, silent until a car is driven.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 600;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 60;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 30;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    saw.connect(engineFilter);
    sub.connect(subGain);
    subGain.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(sfx);
    saw.start();
    sub.start();
    loops.engine = { gain: engineGain, saw, sub, filter: engineFilter };
    // Siren: a sine whose pitch wails up and down.
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const siren = ctx.createOscillator();
    siren.type = 'sine';
    siren.frequency.value = 800;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(siren.frequency);
    siren.connect(sirenGain);
    sirenGain.connect(sfx);
    siren.start();
    lfo.start();
    loops.siren = { gain: sirenGain };
    // Helicopter: chopped band-passed noise.
    const heliGain = ctx.createGain();
    heliGain.gain.value = 0;
    const heliSrc = ctx.createBufferSource();
    heliSrc.buffer = noiseBuffer;
    heliSrc.loop = true;
    const heliFilter = ctx.createBiquadFilter();
    heliFilter.type = 'bandpass';
    heliFilter.frequency.value = 140;
    heliFilter.Q.value = 1.2;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const chopLfo = ctx.createOscillator();
    chopLfo.type = 'square';
    chopLfo.frequency.value = 11;
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = 0.5;
    chopLfo.connect(chopDepth);
    chopDepth.connect(chop.gain);
    heliSrc.connect(heliFilter);
    heliFilter.connect(chop);
    chop.connect(heliGain);
    heliGain.connect(sfx);
    heliSrc.start();
    chopLfo.start();
    loops.heli = { gain: heliGain };
    // Skid: band-passed noise.
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = noiseBuffer;
    skidSrc.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 900;
    skidFilter.Q.value = 2.5;
    skidSrc.connect(skidFilter);
    skidFilter.connect(skidGain);
    skidGain.connect(sfx);
    skidSrc.start();
    loops.skid = { gain: skidGain, level: 0 };
  }

  const setLoop = (name, value, rate = 0.08) => {
    if (!ctx || !loops[name]) return;
    loops[name].gain.gain.setTargetAtTime(value, ctx.currentTime, rate);
  };

  return {
    get context() {
      return ctx;
    },
    get musicNode() {
      return music;
    },
    get noise() {
      return noiseBuffer;
    },
    /** Create the context on the first user gesture (browsers require it). */
    unlock() {
      if (!ensure()) return false;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    },
    setVolumes(v) {
      Object.assign(volumes, v);
      if (!ctx) return;
      master.gain.value = volumes.volume;
      sfx.gain.value = volumes.sfx;
      music.gain.value = volumes.music;
    },
    /** rpm 0..1 and throttle 0..1; `on` false fades the engine out. */
    engine(rpm, throttle, on) {
      if (!ctx) return;
      const e = loops.engine;
      const base = 45 + rpm * 190;
      e.saw.frequency.setTargetAtTime(base, ctx.currentTime, 0.05);
      e.sub.frequency.setTargetAtTime(base / 2, ctx.currentTime, 0.05);
      e.filter.frequency.setTargetAtTime(300 + rpm * 1400 + throttle * 500, ctx.currentTime, 0.05);
      setLoop('engine', on ? 0.07 + rpm * 0.08 + throttle * 0.04 : 0, 0.1);
    },
    siren(level) {
      setLoop('siren', level * 0.12, 0.2);
    },
    helicopter(level) {
      setLoop('heli', level * 0.5, 0.3);
    },
    skid(level) {
      if (!ctx) return;
      loops.skid.level = Math.max(loops.skid.level, level);
    },
    gunshot(weapon, volume = 1) {
      if (!ctx) return;
      if (weapon === 'shotgun') {
        noise(0.35, 'lowpass', 1200, 0.7, 0.9 * volume, 0.003, 0.32);
        tone('sine', 140, 0.25, 0.6 * volume, null, 40);
      } else if (weapon === 'smg') {
        noise(0.12, 'bandpass', 1800, 0.8, 0.55 * volume, 0.002, 0.1);
        tone('triangle', 220, 0.08, 0.3 * volume, null, 80);
      } else {
        noise(0.2, 'lowpass', 2400, 0.7, 0.7 * volume, 0.002, 0.18);
        tone('sine', 180, 0.14, 0.45 * volume, null, 50);
      }
    },
    impact(strength) {
      if (!ctx) return;
      noise(0.3, 'lowpass', 500 + strength * 900, 0.8, 0.6 * strength + 0.1, 0.004, 0.28);
      tone('sine', 90, 0.3, 0.5 * strength, null, 35);
    },
    explosion() {
      if (!ctx) return;
      noise(1.4, 'lowpass', 900, 0.5, 1.0, 0.01, 1.3);
      tone('sine', 70, 0.9, 0.9, null, 25);
    },
    footstep(running) {
      if (!ctx) return;
      noise(0.06, 'bandpass', running ? 900 : 700, 1.5, running ? 0.18 : 0.12, 0.002, 0.05);
    },
    punch() {
      if (!ctx) return;
      noise(0.1, 'lowpass', 700, 1, 0.3, 0.003, 0.09);
    },
    hit() {
      if (!ctx) return;
      noise(0.12, 'bandpass', 400, 1.2, 0.4, 0.003, 0.1);
      tone('sine', 120, 0.12, 0.3, null, 60);
    },
    horn() {
      if (!ctx) return;
      tone('square', 392, 0.45, 0.12, null, null, 0.01);
      tone('square', 494, 0.45, 0.1, null, null, 0.01);
    },
    pickup() {
      if (!ctx) return;
      tone('sine', 880, 0.12, 0.25);
      setTimeout(() => ctx && tone('sine', 1320, 0.2, 0.25), 90);
    },
    ui(kind) {
      if (!ctx) return;
      if (kind === 'select') tone('sine', 700, 0.06, 0.12);
      else if (kind === 'confirm') tone('sine', 900, 0.1, 0.15, null, 1200);
      else if (kind === 'back') tone('sine', 500, 0.08, 0.12, null, 350);
      else if (kind === 'cash') {
        tone('triangle', 1046, 0.1, 0.2);
        setTimeout(() => ctx && tone('triangle', 1568, 0.16, 0.2), 80);
      } else if (kind === 'complete') {
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => ctx && tone('triangle', f, 0.35, 0.22), i * 110));
      } else if (kind === 'fail') {
        [392, 330, 262].forEach((f, i) => setTimeout(() => ctx && tone('sawtooth', f, 0.4, 0.14), i * 160));
      } else if (kind === 'star') {
        tone('square', 660, 0.08, 0.15);
        setTimeout(() => ctx && tone('square', 880, 0.12, 0.15), 70);
      }
    },
    update(dt) {
      if (!ctx) return;
      const s = loops.skid;
      s.gain.gain.setTargetAtTime(s.level * 0.25, ctx.currentTime, 0.05);
      s.level = Math.max(0, s.level - dt * 3);
    },
  };
}
