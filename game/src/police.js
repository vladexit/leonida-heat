// LEONIDA HEAT — the heat. Wanted level 0-5 grows with crimes and cools when you
// stay clean. Police cars spawn on the roads near the player and chase along the
// streets; foot cops join in from wanted 2. Touch a cop car (or a foot cop) long
// enough while slow or on foot and you are busted.

import { WANTED, POLICE, MONEY, SIZE } from './config.js';
import { randomRoadPoint, nearestRoadPoint, nearestIntersection } from './city.js';
import { carById, addMoney, setMessage, moveCircle } from './world.js';

export function addWanted(world, amount) {
  if (world.wanted >= WANTED.max) return;
  const before = Math.floor(world.wanted);
  world.wanted = Math.min(WANTED.max, world.wanted + amount);
  world.wantedTimer = 0;
  if (Math.floor(world.wanted) > before) {
    world.events.push('wanted-up');
    setMessage(world, `Wanted level ${Math.floor(world.wanted)} — lose the heat!`);
  }
}

function policeCount(wanted) {
  if (wanted < 1) return 0;
  return Math.min(5, Math.floor(wanted) + (wanted >= 4 ? 1 : 0));
}

function spawnPoliceCar(world) {
  // Spawn on a road a little way off, so the chase arrives instead of popping in.
  let x = 0;
  let y = 0;
  let guard = 0;
  do {
    const p = randomRoadPoint(world.rng);
    x = p.x;
    y = p.y;
    guard += 1;
  } while (Math.hypot(x - world.player.x, y - world.player.y) < POLICE.spawnRange * 0.6 && guard < 20);
  const snap = nearestRoadPoint(x, y);
  const car = {
    id: world.nextCarId, x: snap.x, y: snap.y, angle: 0, speed: 0, vx: 0, vy: 0,
    color: '#2e4a8a', kind: 'police', damage: 0, axis: snap.axis, dir: 1, wallCd: 0,
  };
  world.nextCarId += 1;
  world.cars.push(car);
  return car;
}

function spawnFootCop(world) {
  const p = world.player;
  const a = world.rng.range(0, Math.PI * 2);
  const x = Math.max(20, Math.min(SIZE - 20, p.x + Math.cos(a) * 420));
  const y = Math.max(20, Math.min(SIZE - 20, p.y + Math.sin(a) * 420));
  world.peds.push({
    id: world.nextPedId, x, y, angle: 0, speed: POLICE.footSpeed,
    color: '#2e4a8a', mode: 'cop', downT: 0, axis: 'h', dir: 1, fleeX: 0, fleeY: 0,
  });
  world.nextPedId += 1;
}

export function stepPolice(world, dt) {
  const p = world.player;
  const want = policeCount(world.wanted);
  const cars = world.cars.filter((c) => c.kind === 'police' && c.damage < 100);
  while (cars.length < want) {
    cars.push(spawnPoliceCar(world));
  }
  // Extra cruisers over the cap drive off instead of vanishing.
  for (let i = cars.length - 1; i >= want; i -= 1) {
    const extra = cars[i];
    extra.kind = 'traffic';
    extra.speed = 200;
  }
  const cops = world.peds.filter((pd) => pd.mode === 'cop');
  const wantCops = world.wanted >= 2 ? Math.min(3, Math.floor(world.wanted) - 1) : 0;
  while (cops.length < wantCops) {
    spawnFootCop(world);
    cops.push(world.peds[world.peds.length - 1]);
  }

  // Whether any officer is holding the player this step: the arrest clock only
  // runs down when nobody is touching the player at all.
  let contact = false;
  for (const car of cars) {
    if (car.damage >= 100) continue;
    // Chase along the roads: head for the intersection nearest the player, then
    // turn toward them at each crossing. Close in, just ram straight at them.
    const target = nearestIntersection(p.x, p.y);
    const dist = Math.hypot(p.x - target.x, p.y - target.y);
    const close = Math.hypot(car.x - p.x, car.y - p.y) < 170;
    let wantAngle;
    if (close) {
      wantAngle = Math.atan2(p.y - car.y, p.x - car.x);
    } else if (car.axis === 'h') {
      wantAngle = target.x > car.x ? 0 : Math.PI;
      if (Math.abs(target.x - car.x) < 30) {
        car.axis = 'v';
        wantAngle = target.y > car.y ? Math.PI / 2 : -Math.PI / 2;
      }
    } else {
      wantAngle = target.y > car.y ? Math.PI / 2 : -Math.PI / 2;
      if (Math.abs(target.y - car.y) < 30) {
        car.axis = 'h';
        wantAngle = target.x > car.x ? 0 : Math.PI;
      }
    }
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    // On top of the player, a cruiser stops and holds position: that is the arrest.
    const holdDist = Math.hypot(car.x - p.x, car.y - p.y);
    const targetSpeed = holdDist < 44 ? 0 : POLICE.chaseSpeed;
    car.speed += (targetSpeed - car.speed) * Math.min(1, 1.6 * dt);
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    const oldX = car.x;
    const oldY = car.y;
    // Slide along walls instead of driving through buildings.
    moveCircle(world, car, car.vx * dt, car.vy * dt, 17);
    const blocked = Math.abs(car.x - (oldX + car.vx * dt)) > 0.5 || Math.abs(car.y - (oldY + car.vy * dt)) > 0.5;
    if (car.stuckCd > 0) car.stuckCd -= dt;
    if (blocked && car.stuckCd <= 0) {
      car.stuckCd = 0.6;
      car.angle += Math.PI / 2;
    }
    // Busted: a cruiser sitting on you while you are slow or on foot.
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    const playerSlow = p.onFoot || Math.abs(car.speed) < 120;
    if (d < POLICE.bustRange && playerSlow) {
      contact = true;
      world.bustTimer += dt;
      if (world.bustTimer > POLICE.bustTime) {
        bust(world);
        return;
      }
    }
    // Ramming the player's car hurts it — and the driver inside.
    if (!p.onFoot) {
      const pc = carById(world, p.carId);
      if (pc && d < 40 && Math.abs(car.speed) > 200) {
        pc.damage = Math.min(100, pc.damage + 6 * dt);
        world.hp = Math.max(0, world.hp - 3 * dt);
        world.events.push('rammed');
      }
    }
  }

  for (const cop of world.peds) {
    if (cop.mode !== 'cop') continue;
    const d = Math.hypot(cop.x - p.x, cop.y - p.y);
    if (d < 26 && p.onFoot) {
      contact = true;
      world.bustTimer += dt;
      // A cop on top of you also works you over: standing and fighting gets you wasted.
      world.hp = Math.max(0, world.hp - 14 * dt);
      if (world.bustTimer > POLICE.bustTime) {
        bust(world);
        return;
      }
    }
    const a = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = a;
    cop.x += Math.cos(a) * cop.speed * dt;
    cop.y += Math.sin(a) * cop.speed * dt;
  }
  if (!contact && world.bustTimer > 0) {
    world.bustTimer = Math.max(0, world.bustTimer - dt * 2);
  }
}

function bust(world) {
  world.stats.busted += 1;
  addMoney(world, -Math.floor(world.money * MONEY.bustLoss));
  world.over = 'busted';
  world.events.push('busted');
  setMessage(world, 'BUSTED! The Leonida PD got you.');
}
