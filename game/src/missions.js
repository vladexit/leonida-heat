// LEONIDA HEAT — the work. Six story missions in a chain, plus two side jobs that
// are always open: taxi fares and the package hunt. Each mission sets markers the
// renderer draws and the minimap shows; finishing one pays cash and starts the next.

import { MISSIONS, MONEY, PITCH, ROAD_W, SIZE } from './config.js';
import { roadCenter, nearestIntersection, randomRoadPoint } from './city.js';
import { addMoney, setMessage } from './world.js';
import { addWanted } from './police.js';

function farMarker(world, minDist) {
  let x = 0;
  let y = 0;
  let guard = 0;
  do {
    const p = randomRoadPoint(world.rng);
    x = p.x;
    y = p.y;
    guard += 1;
  } while (Math.hypot(x - world.player.x, y - world.player.y) < minDist && guard < 40);
  return { x, y };
}

export function startMission(world, index) {
  const def = MISSIONS[index];
  const m = world.mission;
  m.index = index;
  m.phase = 'active';
  m.timer = def.time || 0;
  m.markers = [];
  m.targetId = null;
  m.hits = 0;
  m.cpIndex = 0;
  if (!def) {
    m.phase = 'done';
    return;
  }
  setMessage(world, `Mission ${def.id}: ${def.title} — ${def.brief}`);
  if (index === 1) {
    m.markers = [farMarker(world, 700)];
  } else if (index === 2) {
    addWanted(world, 2);
    setMessage(world, 'Mission 3: Heat — the cops are on you. Stay clean until the stars clear.');
  } else if (index === 3) {
    m.markers = [farMarker(world, 600)];
    m.phase = 'pickup';
  } else if (index === 4) {
    m.markers = checkpointLine(world);
    m.cpIndex = 0;
  } else if (index === 5) {
    spawnTarget(world);
  }
}

function checkpointLine(world) {
  const marks = [];
  let guard = 0;
  while (marks.length < 5 && guard < 200) {
    guard += 1;
    const p = randomRoadPoint(world.rng);
    if (marks.some((mk) => Math.hypot(mk.x - p.x, mk.y - p.y) < 420)) continue;
    marks.push({ x: p.x, y: p.y });
  }
  return marks;
}

function spawnTarget(world) {
  const p = randomRoadPoint(world.rng);
  const car = {
    id: world.nextCarId, x: p.x, y: p.y, angle: 0, speed: 0, vx: 0, vy: 0,
    color: '#ff2ea6', kind: 'target', damage: 0, axis: p.axis, dir: p.dir, wallCd: 0,
  };
  world.nextCarId += 1;
  world.cars.push(car);
  world.mission.targetId = car.id;
  setMessage(world, 'Mission 6: Finale — ram the pink getaway car 3 times!');
}

function completeMission(world) {
  const def = MISSIONS[world.mission.index];
  addMoney(world, def.reward);
  world.stats.missionsDone += 1;
  world.events.push('mission-done');
  setMessage(world, `Mission complete: ${def.title} +$${def.reward}`);
  const next = world.mission.index + 1;
  if (next >= MISSIONS.length) {
    world.mission.index = next;
    world.mission.phase = 'done';
    world.over = 'won';
    world.events.push('won');
  } else {
    startMission(world, next);
  }
}

function failMission(world, why) {
  const def = MISSIONS[world.mission.index];
  setMessage(world, `Mission failed: ${why} — try again.`);
  world.events.push('mission-fail');
  startMission(world, world.mission.index);
}

export function stepMissions(world, dt) {
  const m = world.mission;
  if (m.phase === 'done' || world.over) return;
  const def = MISSIONS[m.index];
  if (!def) return;
  const p = world.player;

  if (def.time) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(world, 'out of time');
      return;
    }
  }

  if (m.index === 0) {
    if (!p.onFoot) completeMission(world);
    return;
  }
  if (m.index === 1) {
    const mk = m.markers[0];
    if (mk && Math.hypot(mk.x - p.x, mk.y - p.y) < 60) completeMission(world);
    return;
  }
  if (m.index === 2) {
    if (world.wanted <= 0) completeMission(world);
    return;
  }
  if (m.index === 3) {
    if (m.phase === 'pickup') {
      const mk = m.markers[0];
      if (mk && Math.hypot(mk.x - p.x, mk.y - p.y) < 60) {
        m.phase = 'deliver';
        m.markers = [farMarker(world, 700)];
        setMessage(world, 'Stash grabbed — now drop it at the new marker.');
      }
    } else if (m.markers[0] && Math.hypot(m.markers[0].x - p.x, m.markers[0].y - p.y) < 60) {
      completeMission(world);
    }
    return;
  }
  if (m.index === 4) {
    const mk = m.markers[m.cpIndex];
    if (mk && Math.hypot(mk.x - p.x, mk.y - p.y) < 70) {
      m.cpIndex += 1;
      world.events.push('checkpoint');
      if (m.cpIndex >= m.markers.length) completeMission(world);
      else setMessage(world, `Checkpoint ${m.cpIndex + 1} of ${m.markers.length}`);
    }
    return;
  }
  if (m.index === 5) {
    const target = world.cars.find((c) => c.id === m.targetId);
    if (!target) {
      failMission(world, 'the driver got away');
      return;
    }
    // The getaway driver flees along the roads, away from the player.
    const away = Math.atan2(target.y - p.y, target.x - p.x);
    const snap = nearestIntersection(target.x, target.y);
    let wantAngle = away;
    if (Math.hypot(target.x - snap.x, target.y - snap.y) < 20) {
      // At a crossing, pick the turn that keeps the most distance from the player.
      const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      let best = options[0];
      let bestD = -1;
      for (const a of options) {
        const nx = target.x + Math.cos(a) * 200;
        const ny = target.y + Math.sin(a) * 200;
        const d = Math.hypot(nx - p.x, ny - p.y);
        if (d > bestD) {
          bestD = d;
          best = a;
        }
      }
      wantAngle = best;
    }
    let diff = wantAngle - target.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    target.angle += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
    target.speed += (380 - target.speed) * Math.min(1, 1.4 * dt);
    target.x += Math.cos(target.angle) * target.speed * dt;
    target.y += Math.sin(target.angle) * target.speed * dt;
    target.x = Math.max(20, Math.min(SIZE - 20, target.x));
    target.y = Math.max(20, Math.min(SIZE - 20, target.y));
    // A solid ram counts when the player's car hits it fast.
    const pc = p.onFoot ? null : world.cars.find((c) => c.id === p.carId);
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    if (pc && d < 44 && Math.abs(pc.speed) > 240) {
      if (!target.hitCd || target.hitCd <= 0) {
        target.hitCd = 1;
        m.hits += 1;
        target.damage = Math.min(100, target.damage + 30);
        setMessage(world, `Ram ${m.hits} of 3!`);
        world.events.push('ram');
        if (m.hits >= 3) completeMission(world);
      }
    }
    if (target.hitCd > 0) target.hitCd -= dt;
  }
}

/** Taxi side job: hail a cab on foot, drive the fare to the marker in time. */
export function stepTaxi(world, dt) {
  const t = world.taxi;
  const p = world.player;
  if (!t.active) return;
  t.timer -= dt;
  if (t.timer <= 0) {
    t.active = false;
    t.dest = null;
    setMessage(world, 'Fare lost — the passenger got out.');
    world.events.push('taxi-fail');
    return;
  }
  if (t.dest && Math.hypot(t.dest.x - p.x, t.dest.y - p.y) < 60) {
    addMoney(world, t.fare);
    setMessage(world, `Fare delivered +$${t.fare}`);
    world.events.push('taxi-done');
    t.active = false;
    t.dest = null;
  }
}

export function hailTaxi(world) {
  const p = world.player;
  if (!p.onFoot || world.taxi.active) return false;
  let cab = null;
  let bestD = 60;
  for (const car of world.cars) {
    if (car.kind !== 'taxi') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      cab = car;
      bestD = d;
    }
  }
  if (!cab) return false;
  world.taxi.active = true;
  world.taxi.fare = world.rng.int(MONEY.taxiFareMin, MONEY.taxiFareMax);
  world.taxi.dest = farMarker(world, 600);
  world.taxi.timer = 60;
  world.taxi.cabId = cab.id;
  setMessage(world, `Taxi fare $${world.taxi.fare} — drive to the marker, 60 seconds!`);
  world.events.push('taxi-start');
  return true;
}
