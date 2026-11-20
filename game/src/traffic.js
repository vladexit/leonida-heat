// LEONIDA HEAT — traffic and pedestrians. Traffic cars stick to the roads: they
// run along one road, and at each intersection they either carry straight on or
// turn. Peds walk the sidewalks and run away from danger. Parked cars just sit
// there, waiting to be stolen.

import { GRID, PITCH, ROAD_W, TRAFFIC, PEDS, SIZE } from './config.js';
import { randomRoadPoint, randomSidewalkPoint, roadCenter, nearestIntersection } from './city.js';
import { moveCircle } from './world.js';

function newCar(world, x, y, angle, kind, color) {
  const car = {
    id: world.nextCarId, x, y, angle, speed: 0, vx: 0, vy: 0,
    color, kind, damage: 0, axis: 'h', dir: 1, wallCd: 0,
  };
  world.nextCarId += 1;
  return car;
}

export function spawnTraffic(world, count) {
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(world.rng);
    const car = newCar(world, p.x, p.y, p.axis === 'h' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2), 'traffic', world.rng.pick(['#d8443c', '#3c7dd8', '#e8b73c', '#7dd83c', '#d8d8d8', '#8a5fd8', '#e07f2e']));
    car.axis = p.axis;
    car.dir = p.dir;
    car.speed = world.rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax);
    world.cars.push(car);
  }
  for (let i = 0; i < TRAFFIC.taxi; i += 1) {
    const p = randomRoadPoint(world.rng);
    const car = newCar(world, p.x, p.y, 0, 'taxi', '#e8c832');
    car.axis = p.axis;
    car.dir = p.dir;
    car.speed = world.rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax);
    world.cars.push(car);
  }
}

export function spawnParked(world, count) {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < 300) {
    guard += 1;
    const p = randomRoadPoint(world.rng);
    const alongRoad = p.axis === 'h';
    const x = alongRoad ? p.x : p.x + (ROAD_W / 2 - 12) * (world.rng.chance(0.5) ? 1 : -1);
    const y = alongRoad ? p.y + (ROAD_W / 2 - 12) * (world.rng.chance(0.5) ? 1 : -1) : p.y;
    if (world.cars.some((c) => Math.hypot(c.x - x, c.y - y) < 70)) continue;
    if (Math.hypot(x - world.player.x, y - world.player.y) < 120) continue;
    const car = newCar(world, x, y, alongRoad ? (world.rng.chance(0.5) ? 0 : Math.PI) : (world.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2), 'parked', world.rng.pick(['#d8443c', '#3c7dd8', '#e8b73c', '#7dd83c', '#d8d8d8', '#8a5fd8', '#e07f2e']));
    world.cars.push(car);
    placed += 1;
  }
}

function carAhead(world, car) {
  let best = Infinity;
  for (const other of world.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = car.axis === 'h' ? dx * car.dir : dy * car.dir;
    const side = car.axis === 'h' ? Math.abs(dy) : Math.abs(dx);
    if (along > 0 && along < 90 && side < 26 && along < best) best = along;
  }
  return best;
}

function atIntersection(car) {
  const ix = nearestIntersection(car.x, car.y);
  return Math.hypot(ix.x - car.x, ix.y - car.y) < 14 ? ix : null;
}

export function stepTraffic(world, dt) {
  for (const car of world.cars) {
    if (car.kind !== 'traffic' && car.kind !== 'taxi') continue;
    const ix = atIntersection(car);
    if (ix) {
      // At a crossing, mostly carry on, sometimes turn onto the other road.
      const r = world.rng.next();
      if (r < 0.3) {
        if (car.axis === 'h') {
          car.axis = 'v';
          car.dir = world.rng.chance(0.5) ? 1 : -1;
          car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.axis = 'h';
          car.dir = world.rng.chance(0.5) ? 1 : -1;
          car.angle = car.dir > 0 ? 0 : Math.PI;
        }
        car.x = ix.x;
        car.y = ix.y;
      }
    }
    const ahead = carAhead(world, car);
    const want = ahead < 70 ? 0 : world.rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax);
    car.speed += (want - car.speed) * Math.min(1, 2.5 * dt);
    const vx = car.axis === 'h' ? car.dir * car.speed : 0;
    const vy = car.axis === 'v' ? car.dir * car.speed : 0;
    car.x += vx * dt;
    car.y += vy * dt;
    // Wrap around the far edge so the streets never empty out.
    if (car.x < -60) car.x = SIZE + 60;
    if (car.x > SIZE + 60) car.x = -60;
    if (car.y < -60) car.y = SIZE + 60;
    if (car.y > SIZE + 60) car.y = -60;
  }
  // Keep the streets full: replace any traffic car that vanished off the map.
  const moving = world.cars.filter((c) => c.kind === 'traffic' || c.kind === 'taxi').length;
  if (moving < TRAFFIC.count + TRAFFIC.taxi) {
    const p = randomRoadPoint(world.rng);
    const car = newCar(world, p.x, p.y, 0, 'traffic', world.rng.pick(['#d8443c', '#3c7dd8', '#e8b73c', '#7dd83c', '#d8d8d8']));
    car.axis = p.axis;
    car.dir = p.dir;
    car.speed = world.rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax);
    world.cars.push(car);
  }
}

export function stepPeds(world, dt) {
  const p = world.player;
  for (const ped of world.peds) {
    if (ped.mode === 'cop') continue; // foot cops are driven by police.js
    if (ped.mode === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) ped.mode = 'walk';
      continue;
    }
    // Flee anything fast and close: the player's car, or a police chase.
    const threat = !p.onFoot && Math.hypot(ped.x - p.x, ped.y - p.y) < 130;
    if (threat) {
      ped.mode = 'flee';
      ped.fleeX = ped.x - p.x;
      ped.fleeY = ped.y - p.y;
      const len = Math.hypot(ped.fleeX, ped.fleeY) || 1;
      ped.fleeX /= len;
      ped.fleeY /= len;
    } else if (ped.mode === 'flee' && Math.hypot(ped.x - p.x, ped.y - p.y) > 220) {
      ped.mode = 'walk';
    }
    if (ped.mode === 'flee') {
      moveCircle(world, ped, ped.fleeX * PEDS.fleeSpeed * dt, ped.fleeY * PEDS.fleeSpeed * dt, 10);
      ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
      continue;
    }
    // Amble along the sidewalk; turn at intersections sometimes.
    const ix = nearestIntersection(ped.x, ped.y);
    if (Math.hypot(ix.x - ped.x, ix.y - ped.y) < 16 && world.rng.chance(0.02)) {
      ped.axis = ped.axis === 'h' ? 'v' : 'h';
      ped.dir = world.rng.chance(0.5) ? 1 : -1;
    }
    const vx = ped.axis === 'h' ? ped.dir * ped.speed : 0;
    const vy = ped.axis === 'v' ? ped.dir * ped.speed : 0;
    ped.angle = Math.atan2(vy, vx);
    moveCircle(world, ped, vx * dt, vy * dt, 10);
    if (ped.x <= 12 || ped.x >= SIZE - 12 || ped.y <= 12 || ped.y >= SIZE - 12) ped.dir *= -1;
  }
}
