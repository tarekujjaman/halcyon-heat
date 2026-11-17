// Saving to the browser: three named slots plus an autosave after every mission, each wrapped in
// try/catch because storage can be full, private or disabled. "Continue" picks the newest of them.
import { SAVE_PREFIX, GAME_VERSION } from './config.js';

const SLOTS = [1, 2, 3];
const keyOf = (slot) => `${SAVE_PREFIX}-slot-${slot}`;
const AUTOSAVE = `${SAVE_PREFIX}-autosave`;

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

function write(key, data) {
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export const saveSystem = {
  SLOTS,
  /** Save `state` (from game.serialize()) to a slot 1-3; returns true on success. */
  save(slot, state) {
    return write(keyOf(slot), { ...state, version: GAME_VERSION, savedAt: Date.now(), slot });
  },
  autosave(state) {
    return write(AUTOSAVE, { ...state, version: GAME_VERSION, savedAt: Date.now(), slot: 'auto' });
  },
  load(slot) {
    return read(slot === 'auto' ? AUTOSAVE : keyOf(slot));
  },
  /** Summaries for the slot menus: null for an empty slot. */
  list() {
    return SLOTS.map((slot) => {
      const d = read(keyOf(slot));
      return d ? { slot, savedAt: d.savedAt, summary: d.summary || {} } : { slot, savedAt: null, summary: null };
    });
  },
  /** The newest save of any kind, or null. */
  latest() {
    let best = null;
    for (const key of [AUTOSAVE, ...SLOTS.map(keyOf)]) {
      const d = read(key);
      if (d && (!best || d.savedAt > best.savedAt)) best = d;
    }
    return best;
  },
  hasAny() {
    return saveSystem.latest() !== null;
  },
  erase(slot) {
    try {
      window.localStorage.removeItem(keyOf(slot));
    } catch {
      // Nothing to erase.
    }
  },
  /** Settings live beside the saves. */
  loadSettings() {
    return read(`${SAVE_PREFIX}-settings`) || {};
  },
  saveSettings(settings) {
    return write(`${SAVE_PREFIX}-settings`, settings);
  },
};
