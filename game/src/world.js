// LEONIDA HEAT — the simulation. One world holds everything (player, cars, peds,
// police, missions, money, heat) and one fixed step advances it. This module owns
// the state and the order of updates; the behaviour lives in player/traffic/
// police/missions. Nothing here touches the DOM, so node can run it headless.

import { STEP, SIZE, GRID, PITCH, ROAD_W, PLAYER, CAR, TRAFFIC, PEDS, WANTED, MONEY, MISSIONS, SPRAY_BAYS, PISTOL_SPOTS } from './config.js';
import { makeRng } from './random.js';
import { createCity, isSolid, randomRoadPoint, randomSidewalkPoint, roadCenter } from './city.js';
import { updatePlayer } from './player.js';
import { spawnTraffic, spawnParked, stepTraffic, stepPeds } from './traffic.js';
import { stepPolice, addWanted } from './police.js';
import { startMission, stepMissions, stepTaxi, hailTaxi } from './missions.js';

export const OVER_BUSTED = 'busted';
export const OVER_WASTED = 'wasted';
export const OVER_WON = 'won';

export function createWorld(seed) {
  const rng = makeRng(seed);
  const city = createCity(seed);
  const world = {
    seed,
    rng,
    city,
    time: 0,
    money: MONEY.start,
    hp: PLAYER.hp,
    wanted: 0,
    wantedTimer: 0,
    ammo: 0,
    player: {
      x: roadCenter(6), y: roadCenter(6), angle: -Math.PI / 2,
      vx: 0, vy: 0, onFoot: true, carId: null,
      punchCd: 0, shootCd: 0, invuln: 0,
    },
    cars: [],
    peds: [],
    packages: [],
    pistol: PISTOL_SPOTS.map((s) => ({ x: s.x, y: s.y, taken: false })),
    mission: { index: 0, phase: 'active', timer: 0, markers: [], targetId: null, hits: 0, cpIndex: 0 },
    taxi: { active: false, fare: 0, dest: null, timer: 0 },
    stats: { stolen: 0, busted: 0, wasted: 0, earned: 0, missionsDone: 0 },
    over: null,
    bustTimer: 0,
    events: [],
    message: '',
    messageT: 0,
    nextCarId: 1,
    nextPedId: 1,
  };
  spawnTraffic(world, TRAFFIC.count);
  spawnParked(world, TRAFFIC.parked);
  spawnPeds(world, PEDS.count);
  spawnPackages(world);
  startMission(world, 0);
  return world;
}

export function resetWorld(world, seed) {
  const fresh = createWorld(seed);
  for (const key of Object.keys(fresh)) world[key] = fresh[key];
}

function spawnPeds(world, n) {
  for (let i = 0; i < n; i += 1) {
    const p = randomSidewalkPoint(world.rng);
    world.peds.push({
      id: world.nextPedId, x: p.x, y: p.y, angle: world.rng.range(0, Math.PI * 2),
      speed: world.rng.range(PEDS.walkMin, PEDS.walkMax),
      color: world.rng.pick(['#e8e8e8', '#7ab8e8', '#e8a87a', '#9ad87a', '#d87ab8']),
      mode: 'walk', downT: 0, axis: world.rng.chance(0.5) ? 'h' : 'v',
      dir: world.rng.chance(0.5) ? 1 : -1, fleeX: 0, fleeY: 0,
    });
    world.nextPedId += 1;
  }
}

function spawnPackages(world) {
  const spots = [];
  let guard = 0;
  while (spots.length < MONEY.packageCount && guard < 400) {
    guard += 1;
    const p = randomRoadPoint(world.rng);
    if (spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 300)) continue;
    spots.push({ x: p.x, y: p.y, taken: false });
  }
  world.packages = spots;
}

/** Push a transient message the HUD shows for a few seconds. */
export function setMessage(world, text) {
  world.message = text;
  world.messageT = 4;
}

/** Add (or remove) cash and remember what the player earned. */
export function addMoney(world, amount) {
  world.money = Math.max(0, world.money + amount);
  if (amount > 0) world.stats.earned += amount;
}

/** Move a circle through the city, sliding along walls instead of sticking. */
export function moveCircle(world, ent, dx, dy, r) {
  const nx = ent.x + dx;
  if (!isSolid(world.city, nx, ent.y, r)) ent.x = nx;
  const ny = ent.y + dy;
  if (!isSolid(world.city, ent.x, ny, r)) ent.y = ny;
  ent.x = Math.max(r, Math.min(SIZE - r, ent.x));
  ent.y = Math.max(r, Math.min(SIZE - r, ent.y));
}

export function carById(world, id) {
  for (let i = 0; i < world.cars.length; i += 1) {
    if (world.cars[i].id === id) return world.cars[i];
  }
  return null;
}

/** One fixed step. `input` is a plain object of booleans (see input.js). */
export function stepWorld(world, input, dt) {
  world.events = [];
  if (world.over) return;
  world.time += dt;
  if (world.messageT > 0) world.messageT -= dt;
  if (world.player.invuln > 0) world.player.invuln -= dt;
  if (world.player.punchCd > 0) world.player.punchCd -= dt;
  if (world.player.shootCd > 0) world.player.shootCd -= dt;

  updatePlayer(world, input, dt);
  if (input.taxi) hailTaxi(world);
  stepTraffic(world, dt);
  stepPeds(world, dt);
  stepPolice(world, dt);
  stepMissions(world, dt);
  stepTaxi(world, dt);
  checkPickups(world);
  checkSpray(world, dt);
  decayWanted(world, dt);

  if (world.hp <= 0 && !world.over) {
    world.over = OVER_WASTED;
    world.stats.wasted += 1;
    addMoney(world, -Math.floor(world.money * MONEY.wastedLoss));
    world.events.push('wasted');
  }
}

function checkPickups(world) {
  const p = world.player;
  if (!p.onFoot) return;
  for (const pk of world.packages) {
    if (!pk.taken && Math.hypot(pk.x - p.x, pk.y - p.y) < 26) {
      pk.taken = true;
      addMoney(world, 50);
      setMessage(world, 'Package found! +$50');
      world.events.push('package');
    }
  }
  const found = world.packages.filter((pk) => pk.taken).length;
  if (found === MONEY.packageCount && !world.packageBonusPaid) {
    world.packageBonusPaid = true;
    addMoney(world, MONEY.packageBonus);
    setMessage(world, `All ${MONEY.packageCount} packages! Bonus +$${MONEY.packageBonus}`);
    world.events.push('package-bonus');
  }
  for (const gun of world.pistol) {
    if (!gun.taken && Math.hypot(gun.x - p.x, gun.y - p.y) < 26) {
      gun.taken = true;
      world.ammo = PLAYER.pistolAmmo;
      setMessage(world, 'Pistol picked up — 12 shots (F to fire)');
      world.events.push('pistol');
    }
  }
}

function checkSpray(world, dt) {
  const p = world.player;
  if (p.onFoot) return;
  const car = carById(world, p.carId);
  if (!car) return;
  for (const bay of SPRAY_BAYS) {
    if (Math.hypot(bay.x - p.x, bay.y - p.y) < 70) {
      if (world.wanted > 0 && world.money >= MONEY.sprayCost) {
        addMoney(world, -MONEY.sprayCost);
        world.wanted = 0;
        car.damage = 0;
        setMessage(world, 'Pay ’n Spray — heat gone, car fixed (-$100)');
        world.events.push('spray');
      } else if (car.damage > 0 && world.money >= MONEY.sprayCost) {
        addMoney(world, -MONEY.sprayCost);
        car.damage = 0;
        setMessage(world, 'Pay ’n Spray — car fixed (-$100)');
        world.events.push('spray');
      }
      return;
    }
  }
}

function decayWanted(world, dt) {
  if (world.wanted <= 0) {
    if (world.hp < PLAYER.hp) world.hp = Math.min(PLAYER.hp, world.hp + 3 * dt);
    return;
  }
  world.wantedTimer += dt;
  if (world.wantedTimer < WANTED.decayDelay) return;
  world.wanted = Math.max(0, world.wanted - WANTED.decayRate * dt);
  if (world.wanted < 0.15) {
    world.wanted = 0;
    world.wantedTimer = 0;
    world.events.push('heat-clear');
  }
}

/** Respawn after busted/wasted: hospital corner, on foot, heat cleared. */
export function respawn(world, kind) {
  const p = world.player;
  p.x = roadCenter(2);
  p.y = roadCenter(2);
  p.vx = 0;
  p.vy = 0;
  p.onFoot = true;
  p.carId = null;
  p.invuln = 2;
  world.hp = PLAYER.hp;
  world.wanted = 0;
  world.wantedTimer = 0;
  world.bustTimer = 0;
  world.over = null;
  if (kind === OVER_BUSTED) setMessage(world, 'Busted! You lost 30% of your cash.');
  else setMessage(world, 'Wasted! You lost 20% of your cash.');
}
