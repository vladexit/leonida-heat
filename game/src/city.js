// LEONIDA HEAT — the city. A road grid with blocks between the roads; each block
// is buildings, a park, or (along the south edge) beach. All layout comes from one
// seed, so the same seed always builds the same streets.

import { GRID, PITCH, ROAD_W, BLOCK, SIZE, WATER_Y, PALETTE } from './config.js';
import { makeRng } from './random.js';

/** Centre line of road k (0..GRID), in world pixels. */
export function roadCenter(k) {
  return k * PITCH + ROAD_W / 2;
}

export function createCity(seed) {
  const rng = makeRng(seed);
  const blocks = [];
  const buildings = [];
  const trees = [];
  for (let bx = 0; bx < GRID; bx += 1) {
    for (let by = 0; by < GRID; by += 1) {
      const x0 = bx * PITCH + ROAD_W;
      const y0 = by * PITCH + ROAD_W;
      if (by === GRID - 1) {
        blocks.push({ bx, by, kind: 'beach', x0, y0 });
        continue;
      }
      const roll = rng.next();
      if (roll < 0.16) {
        blocks.push({ bx, by, kind: 'park', x0, y0 });
        const n = rng.int(3, 6);
        for (let i = 0; i < n; i += 1) {
          trees.push({ x: x0 + rng.range(18, BLOCK - 18), y: y0 + rng.range(18, BLOCK - 18), r: rng.range(7, 12) });
        }
        continue;
      }
      blocks.push({ bx, by, kind: 'built', x0, y0 });
      const two = rng.chance(0.45);
      const spots = two
        ? [
            { x: x0 + 10, y: y0 + 10, w: BLOCK / 2 - 16, h: BLOCK - 20 },
            { x: x0 + BLOCK / 2 + 6, y: y0 + 10, w: BLOCK / 2 - 16, h: BLOCK - 20 },
          ]
        : [{ x: x0 + 12, y: y0 + 12, w: BLOCK - 24, h: BLOCK - 24 }];
      for (const s of spots) {
        buildings.push({
          x: s.x, y: s.y, w: s.w, h: s.h,
          color: rng.pick(PALETTE.buildingRoof),
          roof: rng.pick(['flat', 'stripes', 'cross']),
        });
      }
    }
  }
  return { seed, blocks, buildings, trees };
}

/** Distance from a coordinate to the nearest road centre line. */
function roadDist(v) {
  const m = (((v - ROAD_W / 2) % PITCH) + PITCH) % PITCH;
  return Math.min(m, PITCH - m);
}

/** True when the point sits on a road (within the asphalt, minus a small kerb). */
export function isOnRoad(x, y) {
  return roadDist(x) < ROAD_W / 2 - 3 || roadDist(y) < ROAD_W / 2 - 3;
}

/** True when a circle of radius r at (x, y) overlaps a building or the water. */
export function isSolid(city, x, y, r) {
  if (x < r || y < r || x > SIZE - r || y >= WATER_Y - r) return true;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/** Snap a point to the nearest road centre line (keeps cars and chases on the streets). */
export function nearestRoadPoint(x, y) {
  const kx = Math.round((x - ROAD_W / 2) / PITCH);
  const ky = Math.round((y - ROAD_W / 2) / PITCH);
  const cx = roadCenter(Math.max(0, Math.min(GRID, kx)));
  const cy = roadCenter(Math.max(0, Math.min(GRID, ky)));
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  if (dx <= dy) return { x: cx, y, axis: 'v' };
  return { x, y: cy, axis: 'h' };
}

/** A random point on a road, for spawning traffic. */
export function randomRoadPoint(rng) {
  const horizontal = rng.chance(0.5);
  const line = rng.int(0, GRID);
  const along = rng.range(ROAD_W, SIZE - ROAD_W);
  if (horizontal) return { x: along, y: roadCenter(line), axis: 'h', dir: rng.chance(0.5) ? 1 : -1 };
  return { x: roadCenter(line), y: along, axis: 'v', dir: rng.chance(0.5) ? 1 : -1 };
}

/** A random sidewalk point (just off a road edge), for spawning pedestrians. */
export function randomSidewalkPoint(rng) {
  const p = randomRoadPoint(rng);
  const off = (ROAD_W / 2 + 12) * (rng.chance(0.5) ? 1 : -1);
  if (p.axis === 'h') return { x: p.x, y: p.y + off };
  return { x: p.x + off, y: p.y };
}

/** The nearest intersection centre to a point. */
export function nearestIntersection(x, y) {
  const kx = Math.round((x - ROAD_W / 2) / PITCH);
  const ky = Math.round((y - ROAD_W / 2) / PITCH);
  return {
    x: roadCenter(Math.max(0, Math.min(GRID, kx))),
    y: roadCenter(Math.max(0, Math.min(GRID, ky))),
  };
}
