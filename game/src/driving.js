// Getting in and out of cars: the nearest car within reach, stealing one (its driver jumps out and
// runs), the player's car controls fed to the physics, collisions with traffic that knock AI cars
// out of their lane, running down pedestrians, wrecks that throw the player out, and the horn.
import { PLAYER } from './config.js';
import { stepVehicle, damageVehicle } from './vehicles/physics.js';

export function createDriving(game) {
  const { fleet, traffic, layout, effects, player, pedestrians } = game;

  const exitPosition = (v) => {
    // Step out on the left side (local +x), clear of the door.
    const rx = Math.cos(v.yaw);
    const rz = -Math.sin(v.yaw);
    return { x: v.x + rx * (v.spec.width / 2 + 0.9), z: v.z + rz * (v.spec.width / 2 + 0.9) };
  };

  const api = {
    nearestCar() {
      return fleet.nearest(player.x, player.z, PLAYER.interactRange + 2.2, (v) => !v.wrecked && v.occupant !== 'player' && !v.locked);
    },
    /** Put Sol in `v`; a driven car's AI driver flees on foot. */
    enter(v) {
      if (!v || player.vehicle) return false;
      const hadDriver = v.kind === 'traffic' || v.kind === 'police';
      if (hadDriver) {
        const out = exitPosition(v);
        const ped = pedestrians.spawnAt(out.x, out.z);
        if (ped) {
          ped.state = 'flee';
          ped.fleeTimer = 8;
          ped.fleeX = v.x;
          ped.fleeZ = v.z;
        }
      }
      const wasKind = v.kind;
      v.kind = 'player';
      v.ai = null;
      v.occupant = 'player';
      v.siren = false;
      player.vehicle = v;
      player.group.visible = false;
      game.camera.settleBehind(v.yaw);
      if (game.onEnterVehicle) game.onEnterVehicle(v, wasKind, hadDriver);
      return true;
    },
    exit() {
      const v = player.vehicle;
      if (!v) return;
      const out = exitPosition(v);
      v.occupant = null;
      v.kind = v.wrecked ? 'wreck' : 'parked';
      v.throttle = 0;
      v.braking = false;
      player.vehicle = null;
      player.group.visible = true;
      player.setPosition(out.x, out.z, v.yaw);
      game.camera.state.yaw = v.yaw + Math.PI;
      if (game.onExitVehicle) game.onExitVehicle(v);
    },
    /** Keep Sol from walking through cars: push her out of any car's two-circle hull. */
    pushPlayerOutOfCars() {
      for (const v of fleet.vehicles) {
        const dx = player.x - v.x;
        const dz = player.z - v.z;
        if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
        const half = v.spec.length / 2 - v.spec.width / 2;
        const r = v.spec.width / 2 + PLAYER.radius;
        for (const o of [-half, 0, half]) {
          const cx = v.x + Math.sin(v.yaw) * o;
          const cz = v.z + Math.cos(v.yaw) * o;
          let ex = player.x - cx;
          let ez = player.z - cz;
          const d = Math.hypot(ex, ez);
          if (d >= r || d < 1e-4) continue;
          ex /= d;
          ez /= d;
          player.x = cx + ex * r;
          player.z = cz + ez * r;
          if (Math.abs(v.speed) > 6 && v.occupant !== 'player') {
            player.damage(Math.abs(v.speed) * 1.5);
            effects.blood(player.x, 1.2, player.z, 3);
            if (player.dead && game.onPlayerDeath) game.onPlayerDeath('run over');
          }
        }
      }
      player.sync();
    },
    /** Drive the player's car from the input (or scripted controls) for one step. */
    update(dt, input, override = null) {
      const v = player.vehicle;
      if (!v) return;
      const axes = input.axes();
      const ctl = override && override.throttle !== undefined ? override : {
        throttle: axes.y,
        steer: -axes.x,
        brake: 0,
        handbrake: input.isDown('handbrake') ? 1 : 0,
      };
      if (v.wrecked) {
        api.exit();
        player.damage(35);
        return;
      }
      stepVehicle(v, dt, ctl, layout, effects, {
        onCrash: (car, impact, tag) => {
          if (game.audio) game.audio.impact(Math.min(1, impact / 15));
          game.camera.state.shake = Math.min(1.2, impact * 0.06);
          if (tag === 'lamp' || tag === 'post' || tag === 'palm') effects.dust(car.x, car.z, 3);
        },
        onSkid: (car, amount) => {
          if (game.audio) game.audio.skid(Math.min(1, amount / 8));
        },
      });
      // The horn.
      if (input.justPressed('horn') && game.audio) game.audio.horn();
      player.x = v.x;
      player.z = v.z;
      player.y = v.y;
      player.yaw = v.yaw;
      player.sync();
    },
    /** Car-to-car hits: knock traffic out of its lane, damage both, and make noise. */
    collide() {
      fleet.collide((a, b, rel, x, z) => {
        const playerIn = a.occupant === 'player' || b.occupant === 'player';
        for (const v of [a, b]) {
          if (v.ai) traffic.disturb(v);
          damageVehicle(v, rel * 1.6, effects);
          if (v.occupant === 'player') game.camera.state.shake = Math.min(1, rel * 0.05);
        }
        effects.sparks(x, 0.7, z, 8, 4);
        if (game.audio) game.audio.impact(Math.min(1, rel / 12));
        if (playerIn && game.onPlayerHitCar) game.onPlayerHitCar(a.occupant === 'player' ? b : a, rel);
      });
      pedestrians.runOver(fleet.vehicles, (ped, v) => {
        if (v.occupant === 'player' && game.onPlayerHitPed) game.onPlayerHitPed(ped);
        if (v.ai) traffic.disturb(v);
      });
    },
  };
  return api;
}
