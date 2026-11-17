// Screenshot scenes behind ?shot=<name>&seed=<n>: each stages the real game (the real city, cars,
// police, pedestrians, missions and HUD) at a chosen moment, runs the simulation for a fixed number
// of steps with scripted controls, places the camera, and lets main.js report the frame ready.
//   chase    golden-hour police chase on Ocean Drive, four stars, helicopter, drifting Marlin
//   onfoot   the Club Mirage ambush: SMG fight with Kane's crew, Dani on the subtitle
//   map      the pause map with the story half done
//   mission  the mission-passed screen after Hot Wheels
//   title    the title screen over the city
import { POSE_RUN, POSE_WALK } from './figures.js';

export const SHOT_NAMES = ['chase', 'onfoot', 'map', 'mission', 'title'];

export function stageShot(name, game) {
  const { layout, player, fleet, driving, wanted, police, pedestrians, missions, economy, arsenal, hud, sky } = game;
  const setMoney = (n) => {
    economy.state.money = n;
    hud.setMoney(n, true);
  };
  if (name === 'chase') return stageChase();
  if (name === 'onfoot') return stageOnFoot();
  if (name === 'map') return stageMap();
  if (name === 'mission') return stageMission();
  return stageTitle();

  function prewarm(seconds) {
    for (let t = 0; t < seconds; t += 0.1) {
      game.traffic.update(0.1, player, game.time + t);
      pedestrians.update(0.1, player, player.vehicle);
    }
  }

  function crowd(points, pose = POSE_WALK) {
    const out = [];
    for (const [x, z, yaw] of points) {
      const p = pedestrians.spawnAt(x, z);
      if (p) {
        p.yaw = yaw;
        p.pose = pose;
        if (pose === POSE_RUN) {
          p.state = 'flee';
          p.fleeTimer = 9;
          p.fleeX = x - Math.sin(yaw) * 20;
          p.fleeZ = z - Math.cos(yaw) * 20;
        }
        out.push(p);
      }
    }
    return out;
  }

  function laneCar(model, x, z, yaw, color, cruise = 10) {
    const v = fleet.spawn(model, x, z, yaw, color, 'traffic');
    if (!v) return null;
    const near = layout.nearestRoad(x, z);
    const forward = (near.edge.dx * Math.sin(yaw) + near.edge.dz * Math.cos(yaw)) >= 0;
    v.ai = { mode: 'lane', edge: near.edge, forward, t: forward ? near.t : near.edge.len - near.t, speed: cruise, cruise, stuck: 0, next: null, physicsTimer: 0 };
    v.speed = cruise;
    return v;
  }

  function stageChase() {
    sky.setHour(18.0);
    setMoney(12480);
    economy.state.rep = 900;
    economy.state.level = 4;
    arsenal.give('smg', 96);
    arsenal.select('smg');
    arsenal.clip.smg = 24;
    player.health = 68;
    player.armor = 42;
    missions.jumpTo('glasswater', 4);
    const z0 = 418;
    const car = fleet.spawn('coupe', 2.4, z0, Math.PI, '#e3342f', 'player');
    car.tag = 'getaway';
    missions.state.missionCars.set('getaway', car);
    player.setPosition(car.x, car.z, Math.PI);
    driving.enter(car);
    car.speed = 22;
    wanted.setStars(4);
    const cruisers = [];
    for (const [x, z] of [[-2.8, z0 + 14], [3.6, z0 + 22], [-0.4, z0 + 34]]) {
      const c = police.spawnCruiser(x, z, Math.PI, 'chase');
      if (c) {
        c.speed = 24;
        cruisers.push(c);
      }
    }
    police.heliState.active = true;
    police.heli.visible = true;
    police.heliState.x = -18;
    police.heliState.z = z0 - 44;
    police.heliState.y = 23;
    police.heliState.angle = Math.PI * 1.25;
    // Traffic ahead on both lanes.
    laneCar('sedan', -2.4, z0 - 46, 0, '#f4f4f0');
    laneCar('taxi', 2.4, z0 - 78, Math.PI, '#ffd23f');
    laneCar('van', -2.4, z0 - 100, 0, '#7fd3e8');
    laneCar('pickup', 2.4, z0 - 128, Math.PI, '#2fa36b');
    laneCar('sedan', -2.4, z0 - 160, 0, '#9a6bd1');
    crowd([[-12.5, z0 - 20, 0], [-13.5, z0 - 34, Math.PI], [-11.8, z0 - 52, 0], [8.2, z0 - 26, Math.PI], [8.0, z0 - 44, 0], [-13, z0 - 70, Math.PI], [8.4, z0 - 80, Math.PI]], POSE_WALK);
    crowd([[-11.5, z0 - 10, Math.PI * 1.5], [7.8, z0 - 12, Math.PI * 0.5]], POSE_RUN);
    prewarm(1);
    let i = 0;
    return {
      steps: 132,
      dt: 1 / 60,
      controls() {
        i += 1;
        // Flat out, then a handbrake flick so the tail steps out in smoke; the frame lands mid-slide.
        if (i < 100) return { throttle: 1, steer: 0, brake: 0, handbrake: 0 };
        return { throttle: 1, steer: 0.45, brake: 0, handbrake: 1 };
      },
      beforeHud() {
        wanted.state.searching = true;
        wanted.state.searchX = car.x + 24;
        wanted.state.searchZ = car.z + 60;
        wanted.state.searchRadius = 170;
      },
      finish() {
        // Pull the pursuit into a readable formation right behind the Marlin.
        const fx = Math.sin(car.yaw);
        const fz = Math.cos(car.yaw);
        const rx = -fz;
        const rz = fx;
        const spots = [[-4.4, 6.2, 0.18], [3.9, 7.8, -0.16], [-0.9, 11.5, 0.05]];
        cruisers.forEach((c, k) => {
          const [side, back, turn] = spots[k];
          c.x = car.x - fx * back + rx * side;
          c.z = car.z - fz * back + rz * side;
          c.yaw = Math.PI + turn;
          c.speed = 24;
          c.siren = true;
          c.wrecked = false;
          c.health = 100;
        });
        // The roadblock the dispatcher warned about, with officers behind it.
        for (const [x, dz, yaw] of [[-3.0, -62, Math.PI / 2 + 0.2], [3.2, -63, -Math.PI / 2 - 0.2]]) {
          const b = police.spawnCruiser(x, car.z + dz, yaw, 'block');
          if (b) b.siren = true;
        }
        for (const [x, dz] of [[-4.2, -68], [0.2, -69], [4.4, -68]]) police.spawnOfficer(x, car.z + dz, 0);
        // The helicopter hangs ahead and left with its light on the Marlin.
        police.heliState.active = true;
        police.heli.visible = true;
        police.heliState.x = car.x - 9;
        police.heliState.y = 16.5;
        police.heliState.z = car.z - 50;
        police.heliState.yaw = Math.atan2(car.x - police.heliState.x, car.z - police.heliState.z);
        police.poseHelicopter(0.12);
        game.radio.state.station = 0;
        hud.setRadio(game.radio.stationName);
        hud.setObjective("Lose the cops before reaching Teo's garage");
        hud.setStars(4, true);
        hud.notify('Roadblock ahead on Ocean Drive', 'warn');
        game.camera.snap(car.x + 2.3, 5.4, car.z + 14, car.x - 0.8, 1.0, car.z - 24);
      },
    };
  }

  function stageOnFoot() {
    sky.setHour(17.3);
    setMoney(4310);
    economy.state.rep = 300;
    economy.state.level = 2;
    arsenal.give('smg', 150);
    arsenal.select('smg');
    arsenal.clip.smg = 19;
    player.health = 64;
    player.armor = 35;
    player.showWeapon(true);
    const club = layout.placeById.club;
    const roadX = club.block.x0 - 9;
    const px = roadX - 3.5;
    const pz = club.z + 11;
    player.setPosition(px, pz, 0.6);
    missions.jumpTo('neonrun', 0);
    // The squad is spawned by the stage; drag them into a readable fan in front of the club door.
    const squad = game.gangs.members.filter((m) => m.tag === 'ambush');
    const spots = [[roadX + 5.5, pz - 9], [roadX + 8.5, pz - 14], [roadX + 2, pz - 6], [roadX + 9.5, pz - 5], [roadX - 1, pz - 15]];
    squad.forEach((m, k) => {
      if (spots[k]) {
        m.x = spots[k][0];
        m.z = spots[k][1];
        m.state = 'hostile';
        m.shootTimer = 9;
      }
    });
    if (squad[3]) game.gangs.hurt(squad[3], 100, px, pz);
    crowd([[roadX - 7, pz - 4, Math.PI * 0.95], [roadX - 6.5, pz + 6, 0.2]], POSE_RUN);
    crowd([[roadX + 7.5, pz + 14, 0], [roadX - 7.5, pz - 30, Math.PI]], POSE_WALK);
    const parked = fleet.spawn('sedan', roadX + 4.7, pz + 4, Math.PI, '#1f6fd0', 'parked');
    void parked;
    laneCar('taxi', roadX - 2.4, pz + 26, 0, '#ffd23f', 0);
    wanted.setStars(1);
    const aimX = squad[0] ? squad[0].x : px + 10;
    const aimZ = squad[0] ? squad[0].z : pz;
    game.camera.state.yaw = Math.atan2(aimX - px, aimZ - pz);
    game.camera.state.pitch = 0.0;
    return {
      steps: 80,
      dt: 1 / 60,
      controls() {
        return { aim: true, fire: false, axes: { x: 0, y: 0 } };
      },
      beforeHud() {},
      finish() {
        arsenal.cooldown = 0;
        game.combat.playerShoot(arsenal, game.camera.state.yaw, -game.camera.state.pitch + 0.03);
        hud.subtitle('Dani', "They're Kane's boys, don't let them flank us!", 10);
        hud.setObjective("Take out Kane's crew outside Club Mirage (4 left)");
        hud.setStars(1, false);
        hud.showCrosshair(true);
        for (const m of squad) if (m.state !== 'dead') game.combat.npcShoot(m, player.x, player.y + 1.2, player.z, m.weapon, 0, 0);
        const yaw = game.camera.state.yaw;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        game.camera.snap(px - fx * 4.2 + fz * 1.6, 2.4, pz - fz * 4.2 - fx * 1.6, px + fx * 12, 1.5, pz + fz * 12);
      },
    };
  }

  function stageMap() {
    sky.setHour(17.8);
    setMoney(6920);
    economy.state.rep = 420;
    economy.state.level = 2;
    missions.markComplete(['welcome', 'hotwheels']);
    game.activities.state.collected = [0, 3, 5, 8, 12, 15, 17];
    game.activities.refreshMarkers();
    player.setPosition(layout.placeById.plaza.x - 6, layout.placeById.plaza.z + 4, 0.6);
    game.mapScreen.state.waypoint = { x: layout.placeById.club.x - 10, z: layout.placeById.club.z };
    return {
      steps: 20,
      dt: 1 / 60,
      controls() {
        return null;
      },
      beforeHud() {},
      finish() {
        game.openMap();
      },
    };
  }

  function stageMission() {
    sky.setHour(18.0);
    setMoney(2050);
    economy.state.rep = 150;
    economy.state.level = 1;
    missions.markComplete(['welcome', 'hotwheels']);
    arsenal.select('pistol');
    const garage = layout.placeById.garage;
    const car = fleet.spawn('coupe', garage.x + 12, garage.z + 6, Math.PI / 2, '#e3342f', 'player');
    player.setPosition(car.x, car.z, Math.PI / 2);
    driving.enter(car);
    prewarm(3);
    return {
      steps: 30,
      dt: 1 / 60,
      controls() {
        return { throttle: 0, steer: 0, brake: 0, handbrake: 0 };
      },
      beforeHud() {},
      finish() {
        setMoney(3250);
        game.camera.snap(car.x - 6, 4.5, car.z + 14, car.x + 10, 4, car.z - 30);
        game.onMissionComplete({
          title: 'Hot Wheels', reward: 1200, rep: 90, repTitle: 'Wheelman', levelUp: true, time: 143,
          next: 'Neon Run unlocked at Club Mirage',
          stats: [['Time', '2:23'], ['Missions passed', '2 / 6'], ['Cars stolen', '3'], ['Damage to the Marlin', '12%']],
        });
      },
    };
  }

  function stageTitle() {
    sky.setHour(17.8);
    prewarm(2);
    return {
      steps: 10,
      dt: 1 / 60,
      controls() {
        return null;
      },
      beforeHud() {},
      finish() {
        game.showTitle();
      },
    };
  }
}
