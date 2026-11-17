// Sol's arsenal: fists, pistol, SMG and shotgun with clips, reserve ammo, reloads, fire rates and
// spread, selected with 1-4 or the mouse wheel, unlocked by reputation and restocked at safehouses.
export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', damage: 18, range: 1.9, rate: 0.45, melee: true, unlockLevel: 0 },
  pistol: { id: 'pistol', name: 'Pistol', damage: 26, range: 70, rate: 0.26, clip: 12, auto: false, spread: 0.012, pellets: 1, unlockLevel: 0, reload: 1.1, maxAmmo: 240 },
  smg: { id: 'smg', name: 'SMG', damage: 13, range: 55, rate: 0.082, clip: 30, auto: true, spread: 0.04, pellets: 1, unlockLevel: 2, reload: 1.6, maxAmmo: 480 },
  shotgun: { id: 'shotgun', name: 'Shotgun', damage: 11, range: 26, rate: 0.8, clip: 6, auto: false, spread: 0.085, pellets: 7, unlockLevel: 3, reload: 2.0, maxAmmo: 96 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

export function createArsenal() {
  const owned = { fists: true, pistol: true, smg: false, shotgun: false };
  const ammo = { pistol: 60, smg: 0, shotgun: 0 };
  const clip = { pistol: 12, smg: 0, shotgun: 0 };
  const arsenal = {
    current: 'fists',
    owned, ammo, clip,
    cooldown: 0,
    reloading: 0,
    get spec() {
      return WEAPONS[arsenal.current];
    },
    select(id) {
      if (!owned[id] || id === arsenal.current) return false;
      arsenal.current = id;
      arsenal.reloading = 0;
      arsenal.cooldown = 0.15;
      return true;
    },
    /** Cycle to the next owned weapon in `dir` (+1 or -1). */
    cycle(dir) {
      let i = WEAPON_ORDER.indexOf(arsenal.current);
      for (let k = 0; k < WEAPON_ORDER.length; k += 1) {
        i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
        if (owned[WEAPON_ORDER[i]]) {
          arsenal.select(WEAPON_ORDER[i]);
          return;
        }
      }
    },
    give(id, amount = 0) {
      owned[id] = true;
      if (hasAmmo(id)) {
        ammo[id] = Math.min(WEAPONS[id].maxAmmo, ammo[id] + amount);
        if (clip[id] === 0) {
          const take = Math.min(WEAPONS[id].clip, ammo[id]);
          clip[id] = take;
          ammo[id] -= take;
        }
      }
    },
    restock() {
      for (const id of ['pistol', 'smg', 'shotgun']) if (owned[id]) arsenal.give(id, WEAPONS[id].clip * 6);
    },
    canFire() {
      const w = arsenal.spec;
      if (arsenal.cooldown > 0 || arsenal.reloading > 0) return false;
      if (w.melee) return true;
      return clip[w.id] > 0;
    },
    /** Spend a round; returns false when the clip is empty (and starts a reload if any reserve). */
    fire() {
      const w = arsenal.spec;
      if (!arsenal.canFire()) {
        if (!w.melee && clip[w.id] === 0 && ammo[w.id] > 0 && arsenal.reloading <= 0) arsenal.reload();
        return false;
      }
      arsenal.cooldown = w.rate;
      if (!w.melee) {
        clip[w.id] -= 1;
        if (clip[w.id] === 0 && ammo[w.id] > 0) arsenal.reload();
      }
      return true;
    },
    reload() {
      const w = arsenal.spec;
      if (w.melee || arsenal.reloading > 0) return false;
      if (clip[w.id] >= w.clip || ammo[w.id] <= 0) return false;
      arsenal.reloading = w.reload;
      return true;
    },
    update(dt) {
      if (arsenal.cooldown > 0) arsenal.cooldown -= dt;
      if (arsenal.reloading > 0) {
        arsenal.reloading -= dt;
        if (arsenal.reloading <= 0) {
          const w = arsenal.spec;
          const need = w.clip - clip[w.id];
          const take = Math.min(need, ammo[w.id]);
          clip[w.id] += take;
          ammo[w.id] -= take;
        }
      }
    },
    hudInfo() {
      const w = arsenal.spec;
      if (w.melee) return { name: w.name, clip: null, ammo: null };
      return { name: arsenal.reloading > 0 ? `${w.name} (reloading)` : w.name, clip: clip[w.id], ammo: ammo[w.id] };
    },
    serialize() {
      return { current: arsenal.current, owned: { ...owned }, ammo: { ...ammo }, clip: { ...clip } };
    },
    restore(data) {
      if (!data) return;
      Object.assign(owned, data.owned || {});
      Object.assign(ammo, data.ammo || {});
      Object.assign(clip, data.clip || {});
      arsenal.current = owned[data.current] ? data.current : 'fists';
    },
  };
  return arsenal;
}

function hasAmmo(id) {
  return id !== 'fists';
}
