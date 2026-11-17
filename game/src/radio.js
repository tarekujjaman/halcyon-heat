// Three procedural radio stations for the car, every note synthesized live: Halcyon FM (driving
// synthwave with arpeggiated bass and a square lead), Coral 88 (slow chill pads and plucks) and
// Dock Talk (a dub bed under a muffled late-night host). R switches stations; silence is a station too.
export const STATIONS = [
  { id: 'halcyon', name: 'Halcyon FM 101.3', bpm: 118 },
  { id: 'coral', name: 'Coral 88', bpm: 84 },
  { id: 'dock', name: 'Dock Talk AM', bpm: 76 },
  { id: 'off', name: 'Radio off', bpm: 0 },
];

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

export function createRadio(audio) {
  const state = { station: 0, playing: false, step: 0, nextTime: 0, bar: 0, voiceTimer: 0 };
  let out = null;
  let echo = null;

  const ensure = () => {
    const ctx = audio.context;
    if (!ctx) return null;
    if (!out) {
      out = ctx.createGain();
      out.gain.value = 0.5;
      // A slap-back echo shared by the stations.
      echo = ctx.createDelay(1.0);
      echo.delayTime.value = 0.32;
      const fb = ctx.createGain();
      fb.gain.value = 0.3;
      const echoFilter = ctx.createBiquadFilter();
      echoFilter.type = 'lowpass';
      echoFilter.frequency.value = 2200;
      echo.connect(echoFilter);
      echoFilter.connect(fb);
      fb.connect(echo);
      echoFilter.connect(audio.musicNode);
      out.connect(audio.musicNode);
    }
    return ctx;
  };

  const osc = (ctx, type, freq, t, dur, gain, dest = out, attack = 0.005, release = null, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - (release || dur * 0.4)));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  };
  const drum = (ctx, t, kind) => {
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.3);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = audio.noise;
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : kind === 'rim' ? 2500 : 1800;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      const dur = kind === 'hat' ? 0.04 : kind === 'rim' ? 0.05 : 0.16;
      const level = kind === 'hat' ? 0.18 : kind === 'rim' ? 0.25 : 0.5;
      g.gain.setValueAtTime(level, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.01);
      if (kind === 'snare') osc(ctx, 'triangle', 190, t, 0.12, 0.3);
    }
  };

  // Chord progressions as semitone roots; the station patterns play over them.
  const PROG_SYNTH = [57, 53, 48, 55]; // A F C G
  const PROG_CHILL = [60, 57, 53, 55]; // C Am F G (maj7 flavours)
  const PROG_DUB = [50, 50, 48, 53]; // D D C F

  const stepSynth = (ctx, t, step, bar, sixteenth) => {
    const chord = PROG_SYNTH[Math.floor(bar / 2) % 4];
    if (step % 4 === 0) drum(ctx, t, 'kick');
    if (step === 4 || step === 12) drum(ctx, t, 'snare');
    if (step % 2 === 1) drum(ctx, t, 'hat');
    // Arpeggiated bass, octave bounce.
    const bassNote = chord - 24 + (step % 4 === 2 ? 12 : 0) + (step % 8 === 6 ? 7 : 0);
    osc(ctx, 'sawtooth', NOTE(bassNote), t, sixteenth * 0.9, 0.22, out, 0.004, 0.05);
    // Lead every other bar, a lilting pentatonic phrase with echo.
    if (bar % 2 === 1 && [0, 3, 6, 10, 12, 14].includes(step)) {
      const n = chord + 12 + PENTA[(step * 7 + bar * 3) % PENTA.length];
      osc(ctx, 'square', NOTE(n), t, sixteenth * 2.5, 0.08, echo, 0.01, 0.1);
      osc(ctx, 'square', NOTE(n), t, sixteenth * 2.5, 0.08, out, 0.01, 0.1, 6);
    }
    // Pad chord on bar starts.
    if (step === 0) {
      for (const iv of [0, 4, 7]) osc(ctx, 'triangle', NOTE(chord + iv), t, sixteenth * 16, 0.05, out, 0.3, 0.6, iv * 2);
    }
  };

  const stepChill = (ctx, t, step, bar, sixteenth) => {
    const chord = PROG_CHILL[Math.floor(bar / 2) % 4];
    if (step === 0 || step === 10) drum(ctx, t, 'kick');
    if (step === 4 || step === 12) drum(ctx, t, 'rim');
    if (step % 4 === 2) drum(ctx, t, 'hat');
    if (step === 0) {
      for (const iv of [0, 4, 7, 11]) osc(ctx, 'triangle', NOTE(chord + iv), t, sixteenth * 32, 0.045, out, 0.8, 1.2, iv);
      osc(ctx, 'sine', NOTE(chord - 24), t, sixteenth * 14, 0.3, out, 0.02, 0.3);
    }
    if (step === 8) osc(ctx, 'sine', NOTE(chord - 24 + 7), t, sixteenth * 6, 0.22, out, 0.02, 0.2);
    if ((step * 5 + bar * 11) % 7 < 2 && step % 2 === 0) {
      const n = chord + 12 + PENTA[(step * 3 + bar * 5) % PENTA.length];
      osc(ctx, 'triangle', NOTE(n), t, sixteenth * 3, 0.1, echo, 0.01, 0.2);
    }
  };

  const voice = (ctx, t) => {
    // A muffled host: a low sawtooth with wandering formants, gated into syllables.
    const syllables = 5 + Math.floor(Math.random() * 5);
    for (let s = 0; s < syllables; s += 1) {
      const st = t + s * 0.19;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(105 + Math.random() * 30, st);
      o.frequency.linearRampToValueAtTime(95 + Math.random() * 40, st + 0.16);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(500 + Math.random() * 900, st);
      f.frequency.linearRampToValueAtTime(400 + Math.random() * 900, st + 0.16);
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.16, st + 0.03);
      g.gain.linearRampToValueAtTime(0, st + 0.16);
      o.connect(f);
      f.connect(g);
      g.connect(out);
      o.start(st);
      o.stop(st + 0.18);
    }
  };

  const stepDub = (ctx, t, step, bar, sixteenth) => {
    const chord = PROG_DUB[Math.floor(bar / 2) % 4];
    if (step === 8) {
      drum(ctx, t, 'kick');
      drum(ctx, t, 'snare');
    }
    if (step === 0 && bar % 2 === 0) drum(ctx, t, 'kick');
    if (step % 4 === 2) drum(ctx, t, 'hat');
    if (step === 4 || step === 12) for (const iv of [0, 3, 7]) osc(ctx, 'triangle', NOTE(chord + iv), t, sixteenth * 0.8, 0.09, echo, 0.004, 0.05);
    if (step === 0 || step === 6 || step === 10) osc(ctx, 'sine', NOTE(chord - 24 + (step === 6 ? 5 : 0)), t, sixteenth * 4, 0.35, out, 0.01, 0.4);
    if (bar % 4 === 1 && step === 0) voice(ctx, t);
    if (bar % 4 === 3 && step === 8) voice(ctx, t);
  };

  const steppers = [stepSynth, stepChill, stepDub];

  return {
    STATIONS,
    state,
    get stationName() {
      return STATIONS[state.station].name;
    },
    setStation(i) {
      state.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
      state.step = 0;
      state.bar = 0;
      const ctx = ensure();
      if (ctx) state.nextTime = ctx.currentTime + 0.1;
    },
    next() {
      this.setStation(state.station + 1);
    },
    setPlaying(on) {
      state.playing = on;
      const ctx = ensure();
      if (ctx && on) state.nextTime = Math.max(state.nextTime, ctx.currentTime + 0.05);
    },
    /** Schedule the next sixteenth notes a little ahead of the clock. */
    update() {
      const ctx = ensure();
      if (!ctx || !state.playing) return;
      const station = STATIONS[state.station];
      if (!station.bpm) return;
      const sixteenth = 60 / station.bpm / 4;
      let guard = 0;
      while (state.nextTime < ctx.currentTime + 0.25 && guard < 32) {
        if (state.nextTime < ctx.currentTime - 0.5) state.nextTime = ctx.currentTime;
        steppers[state.station](ctx, state.nextTime, state.step, state.bar, sixteenth);
        state.nextTime += sixteenth;
        state.step += 1;
        if (state.step >= 16) {
          state.step = 0;
          state.bar += 1;
        }
        guard += 1;
      }
    },
  };
}
