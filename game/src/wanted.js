// The wanted level: crimes add heat, heat fills stars, and stars bring the police. Once no officer
// can see Sol the search starts from where she was last spotted: stay out of that circle and out
// of sight long enough and the stars fade; get spotted and the clock resets.
import { WANTED, CRIMES } from './config.js';

export function createWanted(game) {
  const state = {
    heat: 0,
    stars: 0,
    maxStarsReached: 0,
    seen: false,
    searching: false,
    searchX: 0,
    searchZ: 0,
    searchRadius: 0,
    evadeTimer: 0,
    sinceSeen: 0,
    lastCrime: '',
  };
  const setStars = (n) => {
    const next = Math.max(0, Math.min(WANTED.maxStars, n));
    if (next > state.stars) {
      if (game.audio) game.audio.ui('star');
      if (game.hud) game.hud.notify(`Wanted level ${'★'.repeat(next)}`, 'warn');
    }
    state.stars = next;
    state.maxStarsReached = Math.max(state.maxStarsReached, next);
    if (next === 0) {
      state.heat = 0;
      state.searching = false;
      state.seen = false;
    } else {
      state.heat = Math.max(state.heat, (next - 1) * WANTED.heatPerStar + 10);
      state.searchRadius = WANTED.searchRadius[next];
      state.evadeTimer = WANTED.evadeSeconds[next];
    }
  };
  return {
    state,
    get stars() {
      return state.stars;
    },
    /** A crime raises the heat (names from CRIMES or a number). */
    crime(kind, multiplier = 1) {
      const amount = (typeof kind === 'number' ? kind : CRIMES[kind] || 40) * multiplier;
      state.heat = Math.min(WANTED.maxStars * WANTED.heatPerStar + 50, state.heat + amount);
      state.lastCrime = typeof kind === 'string' ? kind : 'crime';
      const stars = Math.min(WANTED.maxStars, Math.floor(state.heat / WANTED.heatPerStar) + 1);
      if (stars > state.stars) setStars(stars);
      // Fresh crime: the police know where you are.
      state.seen = true;
      state.sinceSeen = 0;
      state.searching = false;
      state.evadeTimer = WANTED.evadeSeconds[state.stars];
    },
    setStars,
    clear() {
      setStars(0);
    },
    /** `seenNow` is whether any officer, cruiser or helicopter has Sol in sight this frame. */
    update(dt, seenNow, playerX, playerZ) {
      if (state.stars === 0) return;
      if (seenNow) {
        state.seen = true;
        state.sinceSeen = 0;
        state.searching = false;
        state.searchX = playerX;
        state.searchZ = playerZ;
        state.evadeTimer = WANTED.evadeSeconds[state.stars];
      } else {
        state.sinceSeen += dt;
        if (state.sinceSeen > 2.5) {
          if (!state.searching) {
            state.searching = true;
            state.searchX = state.seen ? state.searchX : playerX;
            state.searchZ = state.seen ? state.searchZ : playerZ;
            state.searchRadius = WANTED.searchRadius[state.stars];
          }
          const outside = Math.hypot(playerX - state.searchX, playerZ - state.searchZ) > state.searchRadius;
          state.evadeTimer -= dt * (outside ? 1.6 : 0.6);
          state.heat = Math.max(0, state.heat - WANTED.decayPerSecond * dt);
          if (state.evadeTimer <= 0) {
            setStars(0);
            if (game.hud) game.hud.notify('You lost the cops', 'reward');
            if (game.audio) game.audio.ui('complete');
            if (game.onEvaded) game.onEvaded();
          }
        }
      }
    },
    searchCircle() {
      if (state.stars === 0 || !state.searching) return null;
      return { x: state.searchX, z: state.searchZ, radius: state.searchRadius };
    },
    serialize() {
      return { stars: state.stars, heat: state.heat };
    },
    restore(data) {
      if (!data) return;
      state.stars = 0;
      state.heat = 0;
    },
  };
}
