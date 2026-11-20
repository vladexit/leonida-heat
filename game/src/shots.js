// LEONIDA HEAT — the screenshot scenes behind ?shot=start|drive|chase|win. Each
// one plays the real rules forward from a fresh world for a fixed number of steps,
// steered by a small autopilot that walks to a car, steals it, then drives the
// roads toward random intersections — so the frame is what a short game really
// looks like, and the same seed always gives the same frame.

import { STEP, SIZE } from './config.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_WIN } from './render.js';
import { nearestIntersection, nearestRoadPoint } from './city.js';
import { carById } from './world.js';
import { addWanted } from './police.js';

const SAMPLE = STEP;
const START_SECONDS = 6;
const DRIVE_SECONDS = 20;
const CHASE_SECONDS = 16;

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** A driver that follows the roads: pick an intersection, drive to it, pick another. */
function makeDriver(world) {
  const driver = { target: null };
  return function driveInput() {
    const p = world.player;
    const car = carById(world, p.carId);
    const input = { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, taxi: false, pause: false, confirm: false, mute: false, station: -1 };
    if (!car) return input;
    if (!driver.target || Math.hypot(driver.target.x - car.x, driver.target.y - car.y) < 80) {
      const ix = nearestIntersection(
        car.x + world.rng.range(-900, 900),
        car.y + world.rng.range(-900, 900),
      );
      driver.target = ix;
    }
    // Desired heading: along the current road toward the target, turning at crossings.
    const snap = nearestRoadPoint(car.x, car.y);
    const ix = nearestIntersection(car.x, car.y);
    const nearCrossing = Math.hypot(ix.x - car.x, ix.y - car.y) < 50;
    let desired;
    if (nearCrossing) {
      const dx = driver.target.x - ix.x;
      const dy = driver.target.y - ix.y;
      desired = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : Math.PI) : (dy > 0 ? Math.PI / 2 : -Math.PI / 2);
    } else if (snap.axis === 'h') {
      desired = driver.target.x > car.x ? 0 : Math.PI;
    } else {
      desired = driver.target.y > car.y ? Math.PI / 2 : -Math.PI / 2;
    }
    const diff = clampAngle(desired - car.angle);
    // Slow down for sharp turns instead of sliding into the building on the corner,
    // and cap the autopilot's speed so it stays on the road instead of the sidewalk.
    // Gas when aligned, or when crawling (a stopped car still needs to move to turn);
    // brake only while moving forward — holding brake at a stop is reverse gear,
    // and reversing at -190 while trying to turn is how the old driver got stuck.
    input.up = car.speed < 520 && (Math.abs(diff) < 0.5 || car.speed < 40);
    if (diff > 0.12) input.left = true;
    else if (diff < -0.12) input.right = true;
    if (Math.abs(diff) > 0.35 && car.speed > 60) input.down = true;
    // Do not rear-end the car ahead: lift off, and brake if we are closing fast.
    const aheadX = car.x + Math.cos(car.angle) * 80;
    const aheadY = car.y + Math.sin(car.angle) * 80;
    let blocked = false;
    for (const other of world.cars) {
      if (other === car) continue;
      if (Math.hypot(other.x - aheadX, other.y - aheadY) < 46) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      input.up = false;
      if (car.speed > 260) input.down = true;
    }
    return input;
  };
}

/** Walk toward a point; press enter when close enough to steal the car there. */
function walkInput(world, tx, ty) {
  const p = world.player;
  const input = { up: false, down: false, left: false, right: false, run: true, enter: false, punch: false, shoot: false, taxi: false, pause: false, confirm: false, mute: false, station: -1 };
  const dx = tx - p.x;
  const dy = ty - p.y;
  if (Math.hypot(dx, dy) < 44) {
    input.enter = true;
    return input;
  }
  if (Math.abs(dx) > 12) input.right = dx > 0;
  if (Math.abs(dx) > 12) input.left = dx < 0;
  if (Math.abs(dy) > 12) input.down = dy > 0;
  if (Math.abs(dy) > 12) input.up = dy < 0;
  return input;
}

function nearestStealable(world) {
  const p = world.player;
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (car.kind === 'police' || car.kind === 'target' || car.kind === 'wreck') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

export function stageShot(name, world) {
  const { stepWorld } = world;
  if (name === 'win') {
    world.mission.index = 6;
    world.mission.phase = 'done';
    world.money = 5340;
    world.stats.missionsDone = 6;
    world.stats.earned = 3200;
    world.stats.stolen = 9;
    world.over = 'won';
    world.message = '';
    world.messageT = 0;
    return { screen: SCREEN_WIN };
  }
  if (name === 'start') {
    // Title scene: the player strolls the sidewalk while traffic rolls by.
    // No car, no heat — a calm frame behind the title.
    let target = null;
    const total = Math.floor(START_SECONDS / SAMPLE);
    for (let i = 0; i < total; i += 1) {
      const p = world.player;
      if (!target || Math.hypot(target.x - p.x, target.y - p.y) < 40) {
        const ix = nearestIntersection(p.x + world.rng.range(-500, 500), p.y + world.rng.range(-500, 500));
        target = ix;
      }
      stepWorld(world, walkInput(world, target.x, target.y), SAMPLE);
    }
    return { screen: SCREEN_TITLE };
  }
  const drive = makeDriver(world);
  const seconds = name === 'chase' ? CHASE_SECONDS : name === 'drive' ? DRIVE_SECONDS : START_SECONDS;
  const total = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < total; i += 1) {
    const p = world.player;
    let input;
    if (p.onFoot) {
      const car = nearestStealable(world);
      input = car ? walkInput(world, car.x, car.y) : { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, taxi: false, pause: false, confirm: false, mute: false, station: -1 };
    } else {
      input = drive();
    }
    if (name === 'chase' && i === Math.floor(4 / SAMPLE)) addWanted(world, 3);
    stepWorld(world, input, SAMPLE);
    if (world.over) break;
  }
  // Finish while the car is moving well: the frame should catch the drive at
  // speed on a straight, not mid-turn at a crawl — and not pinned against the
  // edge of the world, where the clamped camera shoves the car off-centre.
  if (!world.over && !world.player.onFoot) {
    for (let i = 0; i < Math.floor(3 / SAMPLE); i += 1) {
      const car = carById(world, world.player.carId);
      const p = world.player;
      const centred = p.x > 420 && p.x < SIZE - 420 && p.y > 420 && p.y < SIZE - 420;
      if (car && car.speed > 300 && centred) break;
      stepWorld(world, drive(), SAMPLE);
      if (world.over) break;
    }
  }
  if (name === 'start') return { screen: SCREEN_TITLE };
  return { screen: SCREEN_PLAY };
}
