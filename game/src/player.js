// LEONIDA HEAT — the player, on foot and behind the wheel. Walking is direct
// (WASD, Shift to run); driving is a simple arcade model: forward speed along the
// car's nose, steering that bites harder the faster you go, and a drift factor so
// the tail steps out in hard turns. Collisions slide along walls and shove cars.

import { PLAYER, CAR, WANTED, SIZE } from './config.js';
import { isSolid, nearestRoadPoint } from './city.js';
import { carById, moveCircle, addMoney, setMessage } from './world.js';
import { addWanted } from './police.js';

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function angleDiff(a, b) {
  return clampAngle(a - b);
}

export function updatePlayer(world, input, dt) {
  const p = world.player;
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.shootCd > 0) p.shootCd -= dt;
  if (input.enter) tryEnterOrExit(world);
  if (p.onFoot) {
    updateOnFoot(world, input, dt);
    if (input.punch) punch(world);
    if (input.shoot) shoot(world);
  } else {
    updateDriving(world, input, dt);
  }
}

function updateOnFoot(world, input, dt) {
  const p = world.player;
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx === 0 && dy === 0) {
    p.vx = 0;
    p.vy = 0;
    return;
  }
  const len = Math.hypot(dx, dy);
  dx /= len;
  dy /= len;
  const speed = input.run ? PLAYER.run : PLAYER.walk;
  p.angle = Math.atan2(dy, dx);
  p.vx = dx * speed;
  p.vy = dy * speed;
  moveCircle(world, p, p.vx * dt, p.vy * dt, PLAYER.radius);
}

function tryEnterOrExit(world) {
  const p = world.player;
  if (!p.onFoot) {
    exitCar(world);
    return;
  }
  let best = null;
  let bestD = CAR.enterRange;
  for (const car of world.cars) {
    if (car.kind === 'police' || car.kind === 'target' || car.kind === 'wreck') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  if (!best) return;
  p.onFoot = false;
  p.carId = best.id;
  p.x = best.x;
  p.y = best.y;
  p.angle = best.angle;
  if (best.kind === 'parked' || best.kind === 'traffic' || best.kind === 'taxi') {
    world.stats.stolen += 1;
    addWanted(world, WANTED.steal);
    setMessage(world, best.kind === 'taxi' ? 'Taxi jacked! The heat is on.' : 'Car stolen! The heat is on.');
    world.events.push('steal');
  }
  best.kind = 'player';
}

function exitCar(world) {
  const p = world.player;
  const car = carById(world, p.carId);
  if (!car) {
    p.onFoot = true;
    p.carId = null;
    return;
  }
  // Step out to the car's left so you never land inside a wall.
  const side = p.angle + Math.PI / 2;
  let x = car.x + Math.cos(side) * 34;
  let y = car.y + Math.sin(side) * 34;
  if (isSolid(world.city, x, y, PLAYER.radius)) {
    x = car.x - Math.cos(side) * 34;
    y = car.y - Math.sin(side) * 34;
  }
  if (isSolid(world.city, x, y, PLAYER.radius)) {
    x = car.x;
    y = car.y;
  }
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.onFoot = true;
  p.carId = null;
  car.kind = 'parked';
  car.speed = 0;
}

function updateDriving(world, input, dt) {
  const p = world.player;
  const car = carById(world, p.carId);
  if (!car) {
    p.onFoot = true;
    p.carId = null;
    return;
  }
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const gas = input.up ? 1 : 0;
  const brake = input.down ? 1 : 0;
  const speedRatio = Math.min(1, Math.abs(car.speed) / CAR.maxSpeed);
  // Steering follows the direction of travel (reversing flips it).
  const dirSign = car.speed >= 0 ? 1 : -1;
  car.angle = clampAngle(car.angle + steer * CAR.turn * (0.35 + 0.65 * speedRatio) * dirSign * dt);
  if (gas) car.speed += CAR.accel * dt;
  if (brake) {
    if (car.speed > 0) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  }
  if (!gas && !brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 260 * dt);
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  if (Math.abs(car.speed) < 4 && !gas && !brake) car.speed = 0;

  // Velocity splits into forward (along the nose) and sideways (the drift).
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const sx = -fy;
  const sy = fx;
  const fwd = car.vx * fx + car.vy * fy;
  const side = car.vx * sx + car.vy * sy;
  const newFwd = car.speed;
  const newSide = side * Math.exp(-CAR.grip * dt);
  car.vx = fx * newFwd + sx * newSide;
  car.vy = fy * newFwd + sy * newSide;

  const oldX = car.x;
  const oldY = car.y;
  moveCircle(world, car, car.vx * dt, car.vy * dt, 17);
  const movedX = Math.abs(car.x - (oldX + car.vx * dt)) > 0.5;
  const movedY = Math.abs(car.y - (oldY + car.vy * dt)) > 0.5;
  const blocked = movedX || movedY;
  if (car.wallCd > 0) car.wallCd -= dt;
  if (car.crashCd > 0) car.crashCd -= dt;
  if (blocked && car.wallCd <= 0 && (Math.abs(car.vx) > 90 || Math.abs(car.vy) > 90)) {
    car.wallCd = 0.4;
    car.damage = Math.min(CAR.damageMax, car.damage + 4);
    car.speed *= 0.55;
    car.vx *= 0.55;
    car.vy *= 0.55;
    world.events.push('crash');
  }
  collideCars(world, car, dt);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  if (car.damage >= CAR.damageMax) {
    setMessage(world, 'Your car is wrecked — get out and find another.');
    exitCar(world);
    car.kind = 'wreck';
    world.events.push('wrecked');
  }
}

/** Shove this car off any other car it overlaps; both take a little damage. */
function collideCars(world, car, dt) {
  for (const other of world.cars) {
    if (other === car || other.kind === 'player') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    const min = 34;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      car.x -= nx * push;
      car.y -= ny * push;
      if (other.kind !== 'parked') {
        other.x += nx * push;
        other.y += ny * push;
      }
      const impact = Math.abs(car.speed) + Math.abs(other.speed || 0);
      // One crash per half-second: without this, a single overlap charges
      // damage and wanted on every step while the cars are still touching.
      if (impact > 220 && car.crashCd <= 0) {
        car.crashCd = 0.5;
        car.damage = Math.min(CAR.damageMax, car.damage + 3);
        other.damage = Math.min(CAR.damageMax, (other.damage || 0) + 3);
        addWanted(world, WANTED.hitCar);
        world.events.push('crash');
      }
    }
  }
  // Running over a pedestrian on foot or in a car is a crime, and it hurts.
  for (const ped of world.peds) {
    if (ped.mode === 'down') continue;
    const d = Math.hypot(ped.x - car.x, ped.y - car.y);
    if (d < 26 && Math.abs(car.speed) > 60) {
      ped.mode = 'down';
      ped.downT = 3;
      addWanted(world, WANTED.hitPed);
      world.events.push('hit-ped');
    }
  }
}

function punch(world) {
  const p = world.player;
  if (p.punchCd > 0) return;
  p.punchCd = 0.45;
  const range = PLAYER.punchRange;
  // Cops and peds in front of the fist go down; hitting a cop is a big deal.
  for (const ped of world.peds) {
    if (ped.mode === 'down') continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d < range) {
      ped.mode = 'down';
      ped.downT = 3;
      world.events.push('punch');
      return;
    }
  }
  for (const cop of world.cars) {
    if (cop.kind !== 'police') continue;
    const d = Math.hypot(cop.x - p.x, cop.y - p.y);
    if (d < range + 10) {
      addWanted(world, WANTED.punchCop);
      world.events.push('punch-cop');
      return;
    }
  }
}

function shoot(world) {
  const p = world.player;
  if (p.shootCd > 0 || world.ammo <= 0) return;
  p.shootCd = 0.3;
  world.ammo -= 1;
  addWanted(world, WANTED.shoot);
  // Auto-aim: the nearest police car or foot cop inside range takes the hit.
  let best = null;
  let bestD = PLAYER.shootRange;
  for (const car of world.cars) {
    if (car.kind !== 'police') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  if (best) {
    best.damage = Math.min(CAR.damageMax, (best.damage || 0) + 34);
    world.events.push('shoot-hit');
    if (best.damage >= CAR.damageMax) {
      best.kind = 'wreck';
      setMessage(world, 'Cop car disabled!');
      world.events.push('cop-down');
    }
  } else {
    world.events.push('shoot');
  }
}

export { clampAngle, angleDiff };
