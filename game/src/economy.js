// Money, reputation and stats: cash from jobs, fares, races and fallen rivals; reputation that
// climbs through named levels and unlocks weapons and missions; owned safehouses; and the tally
// of everything Sol has done in Halcyon Bay.
import { ECONOMY } from './config.js';

export function createEconomy(game) {
  const state = {
    money: ECONOMY.startMoney,
    rep: 0,
    level: 0,
    safehouses: ['motel'],
    stats: {
      missionsPassed: 0, missionsFailed: 0, carsStolen: 0, distanceDriven: 0, distanceWalked: 0, kills: 0, gangKills: 0,
      racesWon: 0, faresDone: 0, shardsFound: 0, timesArrested: 0, timesHospitalized: 0, maxWanted: 0, moneyEarned: 0, copsEvaded: 0, playTime: 0,
    },
  };
  const levelFor = (rep) => {
    let level = 0;
    for (let i = 0; i < ECONOMY.repLevels.length; i += 1) if (rep >= ECONOMY.repLevels[i]) level = i;
    return level;
  };
  return {
    state,
    get money() {
      return state.money;
    },
    get rep() {
      return state.rep;
    },
    get level() {
      return state.level;
    },
    title() {
      return ECONOMY.repTitles[state.level];
    },
    nextLevelRep() {
      return ECONOMY.repLevels[Math.min(ECONOMY.repLevels.length - 1, state.level + 1)];
    },
    addMoney(amount, reason = '') {
      state.money += amount;
      if (amount > 0) state.stats.moneyEarned += amount;
      if (game.hud) {
        game.hud.setMoney(state.money);
        if (reason) game.hud.notify(`${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toLocaleString('en-US')} ${reason}`, amount >= 0 ? 'reward' : 'warn');
      }
      if (game.audio && amount > 0) game.audio.ui('cash');
    },
    canAfford(amount) {
      return state.money >= amount;
    },
    spend(amount, reason = '') {
      if (state.money < amount) return false;
      state.money -= amount;
      if (game.hud) {
        game.hud.setMoney(state.money);
        if (reason) game.hud.notify(`-$${amount.toLocaleString('en-US')} ${reason}`, 'warn');
      }
      return true;
    },
    /** Reputation; returns the new level when one was gained, else -1. */
    addRep(amount) {
      state.rep += amount;
      const level = levelFor(state.rep);
      if (level > state.level) {
        state.level = level;
        if (game.hud) game.hud.notify(`Reputation up: ${ECONOMY.repTitles[level]}`, 'reward');
        if (game.arsenal) {
          if (level >= 2 && !game.arsenal.owned.smg) {
            game.arsenal.give('smg', 90);
            if (game.hud) game.hud.notify('SMG unlocked', 'reward');
          }
          if (level >= 3 && !game.arsenal.owned.shotgun) {
            game.arsenal.give('shotgun', 24);
            if (game.hud) game.hud.notify('Shotgun unlocked', 'reward');
          }
        }
        return level;
      }
      return -1;
    },
    ownsSafehouse(id) {
      return state.safehouses.includes(id);
    },
    buySafehouse(place) {
      if (state.safehouses.includes(place.id)) return false;
      if (!this.spend(place.price, `for ${place.name}`)) return false;
      state.safehouses.push(place.id);
      return true;
    },
    stat(name, amount = 1) {
      state.stats[name] = (state.stats[name] || 0) + amount;
    },
    serialize() {
      return { money: state.money, rep: state.rep, level: state.level, safehouses: [...state.safehouses], stats: { ...state.stats } };
    },
    restore(data) {
      if (!data) return;
      state.money = data.money ?? state.money;
      state.rep = data.rep ?? 0;
      state.level = levelFor(state.rep);
      state.safehouses = data.safehouses || ['motel'];
      Object.assign(state.stats, data.stats || {});
      if (game.hud) game.hud.setMoney(state.money, true);
    },
  };
}
