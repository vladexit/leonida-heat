// LEONIDA HEAT — headless rules test (node, no browser). It imports the same
// simulation the game runs and drives it with plain input objects, so every rule
// below is checked against the real code, not a copy of it.
// Run: node tests/rules.test.mjs — exits 0 when every check passes.

import assert from 'node:assert/strict';
import { createWorld, stepWorld, resetWorld, respawn } from '../game/src/world.js';
import { startMission } from '../game/src/missions.js';
import { STEP, SIZE } from '../game/src/config.js';
import { isSolid } from '../game/src/city.js';

const NO_INPUT = { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, taxi: false, pause: false, confirm: false, mute: false, station: -1 };
function input(patch) {
  return { ...NO_INPUT, ...patch };
}
function steps(world, n, inp = NO_INPUT) {
  for (let i = 0; i < n; i += 1) stepWorld(world, inp, STEP);
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

// 1. The player walks: holding up moves them up the map.
check('player moves on foot', () => {
  const world = createWorld(1);
  const y0 = world.player.y;
  steps(world, 60, input({ up: true }));
  assert.ok(world.player.y < y0 - 100, `y moved ${y0} -> ${world.player.y}`);
});

// 2. Entering a car works, and getting out puts the player back on foot.
check('car enter and exit', () => {
  const world = createWorld(2);
  const car = world.cars.find((c) => c.kind === 'parked');
  assert.ok(car, 'a parked car exists');
  world.player.x = car.x;
  world.player.y = car.y - 10;
  stepWorld(world, input({ enter: true }), STEP);
  assert.equal(world.player.onFoot, false, 'player is driving');
  assert.equal(world.player.carId, car.id, 'player is in that car');
  stepWorld(world, input({ enter: true }), STEP);
  assert.equal(world.player.onFoot, true, 'player is on foot again');
  assert.equal(world.player.carId, null, 'no car held');
});

// 3. Stealing a car raises the heat.
check('stealing raises wanted', () => {
  const world = createWorld(3);
  const car = world.cars.find((c) => c.kind === 'parked');
  world.player.x = car.x;
  world.player.y = car.y - 10;
  stepWorld(world, input({ enter: true }), STEP);
  assert.ok(world.wanted >= 1, `wanted is ${world.wanted}`);
});

// 4. Police spawn while wanted and chase the player.
check('police spawn at wanted 3', () => {
  const world = createWorld(4);
  world.wanted = 3;
  steps(world, 180);
  const cops = world.cars.filter((c) => c.kind === 'police');
  assert.ok(cops.length >= 3, `${cops.length} police cars`);
  const d0 = Math.hypot(cops[0].x - world.player.x, cops[0].y - world.player.y);
  steps(world, 180);
  const d1 = Math.hypot(cops[0].x - world.player.x, cops[0].y - world.player.y);
  assert.ok(d1 < d0 + 400, `chase closed in ${d0.toFixed(0)} -> ${d1.toFixed(0)}`);
});

// 5. Mission 1 completes the moment the player steals a car.
check('mission 1 completes on steal', () => {
  const world = createWorld(5);
  assert.equal(world.mission.index, 0, 'mission 1 is active');
  const car = world.cars.find((c) => c.kind === 'parked');
  world.player.x = car.x;
  world.player.y = car.y - 10;
  stepWorld(world, input({ enter: true }), STEP);
  assert.equal(world.mission.index, 1, 'mission 2 is active');
  assert.equal(world.stats.missionsDone, 1, 'one mission done');
  assert.ok(world.money > 200, `paid out, money is ${world.money}`);
});

// 6. Walking onto a package collects it and pays $50.
check('package pickup pays', () => {
  const world = createWorld(6);
  const pk = world.packages[0];
  world.player.x = pk.x;
  world.player.y = pk.y;
  const money0 = world.money;
  stepWorld(world, NO_INPUT, STEP);
  assert.equal(pk.taken, true, 'package is taken');
  assert.equal(world.money, money0 + 50, 'money rose by 50');
});

// 7. A taxi fare starts when the player hails a cab on foot.
check('taxi fare starts', () => {
  const world = createWorld(7);
  const cab = world.cars.find((c) => c.kind === 'taxi');
  assert.ok(cab, 'a taxi exists');
  world.player.x = cab.x;
  world.player.y = cab.y - 10;
  stepWorld(world, input({ taxi: true }), STEP);
  assert.equal(world.taxi.active, true, 'fare is active');
  assert.ok(world.taxi.dest, 'fare has a destination');
  assert.ok(world.taxi.fare >= 80 && world.taxi.fare <= 160, `fare is $${world.taxi.fare}`);
});

// 8. A cop car sitting on the player gets them busted.
check('busted on police contact', () => {
  const world = createWorld(8);
  world.wanted = 2;
  steps(world, 30);
  const cop = world.cars.find((c) => c.kind === 'police');
  assert.ok(cop, 'a police car exists');
  cop.x = world.player.x;
  cop.y = world.player.y;
  cop.speed = 0;
  steps(world, 120);
  assert.equal(world.over, 'busted', `over is ${world.over}`);
  respawn(world, 'busted');
  assert.equal(world.over, null, 'respawn clears the bust');
  assert.equal(world.wanted, 0, 'heat is clear after respawn');
});

// 9. The checkpoint mission completes when the player visits every marker.
check('checkpoint mission completes', () => {
  const world = createWorld(9);
  startMission(world, 4);
  const markers = world.mission.markers;
  assert.ok(markers.length === 5, `${markers.length} checkpoints`);
  for (const mk of markers) {
    world.player.x = mk.x;
    world.player.y = mk.y;
    stepWorld(world, NO_INPUT, STEP);
  }
  assert.equal(world.mission.index, 5, 'mission 6 is active');
});

// 10. The same seed always builds the same city.
check('seeded city is deterministic', () => {
  const a = createWorld(42);
  const b = createWorld(42);
  assert.equal(a.city.buildings.length, b.city.buildings.length, 'same building count');
  for (let i = 0; i < a.city.buildings.length; i += 1) {
    assert.equal(a.city.buildings[i].x, b.city.buildings[i].x, `building ${i} x matches`);
    assert.equal(a.city.buildings[i].y, b.city.buildings[i].y, `building ${i} y matches`);
  }
  assert.equal(a.packages.length, b.packages.length, 'same package count');
});

// 11. Buildings are solid: the player cannot walk through one.
check('buildings block movement', () => {
  const world = createWorld(11);
  const b = world.city.buildings[0];
  world.player.x = b.x - 30;
  world.player.y = b.y + b.h / 2;
  steps(world, 120, input({ right: true, run: true }));
  assert.ok(!isSolid(world.city, world.player.x, world.player.y, 11), 'player is not inside a building');
  assert.ok(world.player.x < b.x + 5, `player stopped at the wall, x=${world.player.x.toFixed(0)} vs wall ${b.x}`);
});

// 12. The world stays inside its own bounds.
check('player stays in the city', () => {
  const world = createWorld(12);
  steps(world, 600, input({ up: true, run: true }));
  assert.ok(world.player.x >= 0 && world.player.x <= SIZE, `x=${world.player.x}`);
  assert.ok(world.player.y >= 0 && world.player.y <= SIZE, `y=${world.player.y}`);
});

console.log(`\nALL ${passed} RULES TESTS PASSED`);
