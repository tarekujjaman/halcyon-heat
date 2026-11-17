// Mission runtime: the next story mission waits at its giver's marker, with the giver standing
// there; walking in starts the intro dialogue, then each stage runs (objective text, markers and
// blips, timers, spawned cars and squads, wanted levels, chases) until it passes or fails. Passing
// pays, raises reputation, unlocks the next mission and autosaves.
import { MISSIONS, CHARACTERS, STORY_COMPLETE } from './story.js';
import { POSE_IDLE } from '../figures.js';
import { stepVehicle } from '../vehicles/physics.js';
import { lanePoint } from '../city/layout.js';
import { LANES } from '../config.js';

const DIALOGUE_SECONDS = 3.6;

export function createMissions(game) {
  const { layout, player, markers, hud, figures } = game;
  const state = {
    completed: [],
    active: null,
    stageIndex: -1,
    stage: null,
    stageTime: 0,
    timer: null,
    queue: [],
    queueTimer: 0,
    missionCars: new Map(),
    failed: false,
    startedAt: 0,
    givers: [],
    chaseTarget: null,
    chaseLost: 0,
    storyDone: false,
  };

  const placePoint = (placeId, offset = [0, 0]) => {
    const p = layout.placeById[placeId];
    return { x: p.x + offset[0], z: p.z + offset[1], heading: p.heading };
  };

  const nextMission = () => MISSIONS.find((m) => !state.completed.includes(m.id)) || null;

  const say = (lines) => {
    for (const l of lines) state.queue.push(l);
  };

  const placeGivers = () => {
    for (const g of state.givers) figures.release(g.slot);
    state.givers.length = 0;
    markers.clearPrefix('giver');
    const m = nextMission();
    if (!m || state.active) return;
    const spot = placePoint(m.giver);
    markers.set('giver', spot.x, spot.z, '#ffd34a');
    const charId = m.giver === 'club' ? 'dani' : m.giver === 'motel' ? 'teo' : 'teo';
    const c = CHARACTERS[charId];
    const slot = figures.alloc(c.colors.skin, c.colors.shirt, c.colors.pants, c.colors.hair);
    if (slot >= 0) {
      const gx = spot.x + Math.sin(spot.heading) * -2.2;
      const gz = spot.z + Math.cos(spot.heading) * -2.2;
      state.givers.push({ slot, x: gx, z: gz, yaw: spot.heading + Math.PI, phase: 0 });
    }
    // Ruiz waits at the plaza once she is in the story.
    if (state.completed.includes('neonrun')) {
      const r = CHARACTERS.ruiz;
      const rslot = figures.alloc(r.colors.skin, r.colors.shirt, r.colors.pants, r.colors.hair);
      const pz = layout.placeById.plaza;
      if (rslot >= 0) state.givers.push({ slot: rslot, x: pz.x + 3, z: pz.z + 2, yaw: -Math.PI / 2, phase: 1 });
    }
  };

  const spawnMissionCar = (spec) => {
    const at = placePoint(spec.place, spec.offset);
    const near = layout.nearestRoad(at.x, at.z);
    let x = at.x;
    let z = at.z;
    let yaw = at.heading;
    if (near && near.dist < 12) {
      const p = lanePoint(near.edge, true, near.t, LANES.park * (near.edge.horizontal ? (at.z < near.z ? -1 : 1) : (at.x < near.x ? -1 : 1)) * (near.edge.horizontal ? -1 : 1));
      x = p.x;
      z = p.z;
      yaw = Math.atan2(near.edge.dx, near.edge.dz);
    }
    const v = game.fleet.spawn(spec.model, x, z, yaw, spec.color, 'mission');
    if (v) {
      v.tag = spec.tag;
      state.missionCars.set(spec.tag, v);
    }
    return v;
  };

  const startStage = (index) => {
    const m = state.active;
    if (index >= m.stages.length) {
      complete();
      return;
    }
    state.stageIndex = index;
    const s = m.stages[index];
    state.stage = s;
    state.stageTime = 0;
    state.timer = s.timer ? s.timer : null;
    markers.clearPrefix('objective');
    if (s.say) say(s.say);
    if (s.type === 'say') {
      say(s.lines);
      hud.setObjective(null);
      return;
    }
    if (s.type === 'getcar' && s.spawn) {
      const v = spawnMissionCar(s.spawn);
      if (v) markers.set('objective', v.x, v.z, '#5ee8ff');
    }
    if (s.type === 'kill') {
      const at = placePoint(s.place, s.offset);
      const squad = game.gangs.spawnSquad(at.x, at.z, s.count, true, s.weapon, s.tag);
      if (s.boss && squad.length) {
        const boss = squad[0];
        boss.boss = true;
        boss.health = 220;
        boss.name = 'Kane Okafor';
        boss.weapon = 'smg';
      }
      game.gangs.state.hostile = true;
    }
    if (s.type === 'goto' || s.type === 'deliver') {
      const at = placePoint(s.place, s.offset);
      markers.set('objective', at.x, at.z, s.type === 'deliver' ? '#ffd34a' : '#ffd34a');
    }
    if (s.type === 'wanted') {
      game.wanted.setStars(s.stars);
      startStage(index + 1);
      return;
    }
    if (s.type === 'chase') {
      const v = spawnMissionCar(s.spawn);
      if (v) {
        v.ai = { mode: 'flee', edge: null, forward: true, t: 0, speed: 0, stuck: 0, reverse: 0 };
        v.locked = true;
        state.chaseTarget = v;
        state.chaseLost = 0;
      }
    }
    if (s.type === 'escape') {
      if (game.wanted.stars === 0) game.wanted.setStars(3);
      markers.set('objective', layout.placeById.garage.x, layout.placeById.garage.z, '#ffd34a');
    }
    hud.setObjective(s.text || '');
  };

  const complete = () => {
    const m = state.active;
    const elapsed = game.time - state.startedAt;
    game.economy.addMoney(m.reward, `${m.title} reward`);
    const newLevel = game.economy.addRep(m.rep);
    game.economy.stat('missionsPassed');
    state.completed.push(m.id);
    for (const v of state.missionCars.values()) if (v.alive) {
      v.kind = v.occupant === 'player' ? 'player' : 'parked';
      v.locked = false;
      v.ai = null;
    }
    state.missionCars.clear();
    game.gangs.state.hostile = false;
    state.active = null;
    state.stage = null;
    state.timer = null;
    markers.clearPrefix('objective');
    hud.setObjective(null);
    hud.setTimer(null);
    const next = nextMission();
    if (!next) state.storyDone = true;
    if (game.audio) game.audio.ui('complete');
    game.onMissionComplete({
      title: m.title,
      reward: m.reward,
      rep: m.rep,
      repTitle: game.economy.title(),
      levelUp: newLevel >= 0,
      time: elapsed,
      next: next ? `${next.title} unlocked at ${next.giverLabel}` : 'Story complete: Halcyon Bay is yours',
      stats: [
        ['Time', `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`],
        ['Missions passed', `${state.completed.length} / ${MISSIONS.length}`],
        ['Cars stolen', String(game.economy.state.stats.carsStolen)],
        ['Reputation', `${game.economy.rep} (${game.economy.title()})`],
      ],
    });
    if (state.storyDone) say(STORY_COMPLETE);
    placeGivers();
  };

  const api = {
    state,
    MISSIONS,
    nextMission,
    placeGivers,
    isActive: () => state.active !== null,
    /** Start a mission by id (or the next one). */
    start(id = null) {
      const m = id ? MISSIONS.find((x) => x.id === id) : nextMission();
      if (!m || state.active) return false;
      state.active = m;
      state.startedAt = game.time;
      state.queue.length = 0;
      state.queueTimer = 0;
      for (const g of state.givers) figures.release(g.slot);
      state.givers.length = 0;
      markers.clearPrefix('giver');
      hud.notify(`Mission: ${m.title}`, 'reward');
      if (game.audio) game.audio.ui('confirm');
      say(m.intro);
      startStage(0);
      return true;
    },
    fail(reason) {
      const m = state.active;
      if (!m) return;
      game.economy.stat('missionsFailed');
      for (const [tag, v] of state.missionCars) {
        if (v.alive && v.occupant !== 'player') game.fleet.remove(v);
        else if (v.alive) {
          v.kind = 'player';
          v.locked = false;
        }
        void tag;
      }
      state.missionCars.clear();
      for (const s of m.stages) if (s.tag) game.gangs.clearMission(s.tag);
      game.gangs.state.hostile = false;
      state.active = null;
      state.stage = null;
      state.timer = null;
      state.chaseTarget = null;
      state.queue.length = 0;
      markers.clearPrefix('objective');
      hud.setObjective(null);
      hud.setTimer(null);
      hud.clearSubtitle();
      hud.bigText('MISSION FAILED', reason);
      if (game.audio) game.audio.ui('fail');
      setTimeout(() => hud.bigText(null), 3200);
      placeGivers();
    },
    /** Skip straight to a given stage (used by the screenshot scenes). */
    jumpTo(id, stageIndex) {
      const m = MISSIONS.find((x) => x.id === id);
      if (!m) return;
      state.completed = MISSIONS.slice(0, MISSIONS.indexOf(m)).map((x) => x.id);
      state.active = m;
      state.startedAt = game.time;
      state.queue.length = 0;
      startStage(stageIndex);
    },
    markComplete(ids) {
      state.completed = [...ids];
      placeGivers();
    },
    /** Blips for the minimap and the pause map. */
    blips() {
      const out = [];
      const next = nextMission();
      if (next && !state.active) {
        const p = placePoint(next.giver);
        out.push({ x: p.x, z: p.z, kind: 'place', color: '#ffd34a', letter: 'M', label: next.title });
      }
      const s = state.stage;
      if (s && (s.type === 'goto' || s.type === 'deliver' || s.type === 'escape')) {
        const at = s.type === 'escape' ? layout.placeById.garage : placePoint(s.place, s.offset);
        out.push({ x: at.x, z: at.z, kind: 'mission', color: '#ffd34a' });
      }
      if (s && s.type === 'getcar' && s.spawn) {
        const v = state.missionCars.get(s.spawn.tag);
        if (v && v.alive) out.push({ x: v.x, z: v.z, kind: 'mission', color: '#5ee8ff' });
      }
      if (s && s.type === 'kill') for (const m of game.gangs.members) if (m.tag === s.tag && m.state !== 'dead') out.push({ x: m.x, z: m.z, kind: 'enemy', color: '#ff3b3b' });
      if (state.chaseTarget && state.chaseTarget.alive && s && s.type === 'chase') out.push({ x: state.chaseTarget.x, z: state.chaseTarget.z, kind: 'mission', color: '#ff3b3b' });
      return out;
    },
    /** The story list for the pause map: done, next or locked. */
    progress() {
      const next = nextMission();
      return MISSIONS.map((m) => ({ id: m.id, title: m.title, status: state.completed.includes(m.id) ? 'done' : (next && next.id === m.id) ? (state.active ? 'active' : 'next') : 'locked' }));
    },
    update(dt) {
      // Dialogue queue.
      if (state.queueTimer > 0) state.queueTimer -= dt;
      if (state.queueTimer <= 0 && state.queue.length) {
        const line = state.queue.shift();
        hud.subtitle(CHARACTERS[line.who].name, line.text, DIALOGUE_SECONDS);
        if (game.audio) game.audio.ui('select');
        state.queueTimer = DIALOGUE_SECONDS;
      }
      for (const g of state.givers) {
        g.phase += dt * 1.5;
        figures.pose(g.slot, g.x, 0.16, g.z, g.yaw, g.phase, POSE_IDLE);
      }
      // Starting a mission: step into the giver marker.
      if (!state.active) {
        const next = nextMission();
        if (next && game.state === 'playing') {
          const p = placePoint(next.giver);
          if (Math.hypot(player.x - p.x, player.z - p.z) < 3.2) api.start(next.id);
        }
        return;
      }
      const s = state.stage;
      if (!s) return;
      state.stageTime += dt;
      if (state.timer !== null) {
        state.timer -= dt;
        hud.setTimer(state.timer);
        if (state.timer <= 0) {
          api.fail('Out of time');
          return;
        }
      } else hud.setTimer(null);
      const v = player.vehicle;
      if (s.type === 'say') {
        if (state.queue.length === 0 && state.queueTimer <= 0.4) startStage(state.stageIndex + 1);
      } else if (s.type === 'wait') {
        hud.setObjective(s.text);
        if (state.stageTime >= s.seconds) startStage(state.stageIndex + 1);
      } else if (s.type === 'goto') {
        const at = placePoint(s.place, s.offset);
        const d = Math.hypot(player.x - at.x, player.z - at.z);
        if (s.vehicleTag && (!v || v.tag !== s.vehicleTag)) hud.setObjective(`Get back in the ${state.missionCars.get(s.vehicleTag)?.spec.name || 'car'}`);
        else hud.setObjective(s.text);
        if (d < (s.radius || 5) && (!s.vehicleTag || (v && v.tag === s.vehicleTag))) {
          if (s.wantedOnArrive) game.wanted.setStars(s.wantedOnArrive);
          startStage(state.stageIndex + 1);
        }
      } else if (s.type === 'getcar') {
        const tag = s.spawn ? s.spawn.tag : null;
        if (tag) {
          const car = state.missionCars.get(tag);
          if (!car || !car.alive || car.wrecked) {
            api.fail('The car was destroyed');
            return;
          }
          markers.set('objective', car.x, car.z, '#5ee8ff');
          if (v && v.tag === tag) {
            if (s.wantedOnTake) game.wanted.setStars(s.wantedOnTake);
            startStage(state.stageIndex + 1);
          }
        } else if (v) startStage(state.stageIndex + 1);
      } else if (s.type === 'deliver') {
        const car = s.vehicle ? state.missionCars.get(s.vehicle) : null;
        if (s.vehicle && (!car || car.wrecked)) {
          api.fail('The car was destroyed');
          return;
        }
        if (s.vehicle && s.minHealth && car.health < s.minHealth) {
          api.fail('The car is too damaged');
          return;
        }
        const at = placePoint(s.place, s.offset);
        const d = Math.hypot(player.x - at.x, player.z - at.z);
        const inRight = s.vehicle ? (v && v.tag === s.vehicle) : !!v;
        hud.setObjective(inRight ? s.text : `Get back in the ${car ? car.spec.name : 'car'}`);
        if (d < (s.radius || 7) && inRight && Math.abs(v.speed) < 3) startStage(state.stageIndex + 1);
      } else if (s.type === 'kill') {
        const alive = game.gangs.aliveWithTag(s.tag);
        hud.setObjective(`${s.text} (${alive} left)`);
        for (const m of game.gangs.members) if (m.tag === s.tag) {
          if (m.state === 'dead') markers.remove(`objective-${m.slot}`);
          else markers.set(`objective-${m.slot}`, m.x, m.z, '#ff3b3b', 'ring');
        }
        if (alive === 0) startStage(state.stageIndex + 1);
      } else if (s.type === 'escape') {
        if (s.requireVehicleTag) {
          const car = state.missionCars.get(s.requireVehicleTag);
          if (!car || car.wrecked) {
            api.fail('The getaway car was destroyed');
            return;
          }
        }
        hud.setObjective(s.text);
        if (game.wanted.stars === 0) startStage(state.stageIndex + 1);
      } else if (s.type === 'chase') {
        const t = state.chaseTarget;
        if (!t || !t.alive) {
          startStage(state.stageIndex + 1);
          return;
        }
        markers.set('objective', t.x, t.z, '#ff3b3b');
        const d = Math.hypot(t.x - player.x, t.z - player.z);
        if (t.wrecked || (Math.abs(t.speed) < 1 && d < 7 && state.stageTime > 4)) {
          t.ai = null;
          t.locked = false;
          state.chaseTarget = null;
          startStage(state.stageIndex + 1);
          return;
        }
        if (d > 380) {
          state.chaseLost += dt;
          hud.setObjective("Don't lose Kane!");
          if (state.chaseLost > 8) {
            api.fail('Kane got away');
            return;
          }
        } else {
          state.chaseLost = 0;
          hud.setObjective(s.text);
        }
        driveFleeing(t, dt);
      }
    },
  };

  /** Kane's car runs the road graph away from Sol at speed, ignoring the lights. */
  function driveFleeing(v, dt) {
    const ai = v.ai;
    if (!ai.edge) {
      const near = layout.nearestRoad(v.x, v.z);
      ai.edge = near.edge;
      ai.forward = true;
      ai.t = near.t;
    }
    const target = lanePoint(ai.edge, ai.forward, Math.min(ai.edge.len, ai.t + 14), LANES.drive);
    const dx = target.x - v.x;
    const dz = target.z - v.z;
    let diff = Math.atan2(dx, dz) - v.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const ctl = { throttle: Math.abs(diff) > 1.0 ? 0.3 : 1, steer: Math.max(-1, Math.min(1, diff * 2)), brake: 0, handbrake: 0 };
    if (ai.reverse > 0) {
      ai.reverse -= dt;
      ctl.throttle = -1;
      ctl.steer = -ctl.steer;
    } else if (Math.abs(v.speed) < 1 && state.stageTime > 2) {
      ai.stuck += dt;
      if (ai.stuck > 1.2) {
        ai.stuck = 0;
        ai.reverse = 1.2;
      }
    } else ai.stuck = 0;
    stepVehicle(v, dt, ctl, layout, game.effects);
    // Progress along the edge; at the node, pick the edge that leads away from Sol.
    const near = layout.nearestRoad(v.x, v.z);
    if (near && near.edge === ai.edge) ai.t = ai.forward ? near.t : ai.edge.len - near.t;
    if (ai.t > ai.edge.len - 10) {
      const node = ai.forward ? ai.edge.b : ai.edge.a;
      let best = null;
      let bestScore = -Infinity;
      for (const e of node.edges) {
        if (e === ai.edge) continue;
        const f = e.a === node;
        const other = f ? e.b : e.a;
        const score = Math.hypot(other.x - player.x, other.z - player.z) + Math.random() * 40;
        if (score > bestScore) {
          bestScore = score;
          best = { edge: e, forward: f };
        }
      }
      if (best) {
        ai.edge = best.edge;
        ai.forward = best.forward;
        ai.t = 0;
      }
    }
  }

  return api;
}
