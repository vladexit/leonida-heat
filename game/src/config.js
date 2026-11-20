// LEONIDA HEAT — every tuning number, colour and rule in one place.
// The city is a road grid: roads run every PITCH pixels, blocks sit between them.
// All distances are world pixels; the renderer scales the view to the window.

export const STEP = 1 / 60;

export const GRID = 12; // blocks per side
export const PITCH = 240; // road centre to road centre
export const ROAD_W = 64; // road width
export const BLOCK = PITCH - ROAD_W; // block side
export const SIZE = GRID * PITCH + ROAD_W; // city side, 2944
export const WATER_Y = SIZE - 8; // south of this line is water, blocked

export const PLAYER = {
  radius: 11,
  walk: 175,
  run: 265,
  hp: 100,
  punchRange: 34,
  punchDamage: 34,
  shootRange: 300,
  pistolAmmo: 12,
};

export const CAR = {
  length: 46,
  width: 22,
  accel: 430,
  brake: 760,
  reverseAccel: 260,
  maxSpeed: 540,
  maxReverse: 190, // holding brake at a stop is reverse gear, capped here
  turn: 2.7, // radians per second at full lock, scaled by speed
  grip: 6.5, // how fast sideways slide is killed (lower = more drift)
  damageMax: 100,
  enterRange: 52,
};

export const TRAFFIC = {
  count: 26,
  speedMin: 120,
  speedMax: 185,
  parked: 16,
  taxi: 3,
};

export const PEDS = { count: 34, walkMin: 42, walkMax: 78, fleeSpeed: 150 };

export const WANTED = {
  decayDelay: 9, // seconds calm before the heat cools
  decayRate: 0.22, // stars per second once cooling
  steal: 1,
  hitPed: 1,
  hitCar: 0.5,
  shoot: 1,
  punchCop: 2,
  max: 5,
};

export const POLICE = {
  chaseSpeed: 470,
  ramRange: 30,
  bustRange: 34,
  bustTime: 1.15, // seconds of contact before the arrest lands
  footSpeed: 210,
  spawnRange: 620,
};

export const MONEY = {
  start: 200,
  taxiFareMin: 80,
  taxiFareMax: 160,
  sprayCost: 100,
  packageBonus: 1000,
  packageCount: 12,
  bustLoss: 0.3, // fraction of cash lost on arrest
  wastedLoss: 0.2,
};

export const MISSIONS = [
  { id: 1, title: 'Wheels', brief: 'Steal any car. Walk up to one and press E.', reward: 150 },
  { id: 2, title: 'Courier', brief: 'Drive the package to the yellow marker before the timer runs out.', reward: 300, time: 75 },
  { id: 3, title: 'Heat', brief: 'The cops are onto you. Lose the heat: stay clean until the stars clear.', reward: 450 },
  { id: 4, title: 'Pickup', brief: 'Grab the stash at the marker, then drop it at the second marker.', reward: 500 },
  { id: 5, title: 'Checkpoint Run', brief: 'Hit all 5 checkpoints in order, inside 90 seconds.', reward: 700, time: 90 },
  { id: 6, title: 'Finale', brief: 'Ram the getaway driver 3 times before he escapes the city.', reward: 1200 },
];

// Pay 'n Spray bays: drive in, pay, wanted clears and the car is fixed.
export const SPRAY_BAYS = [
  { x: 5 * PITCH + ROAD_W / 2, y: 2 * PITCH + ROAD_W / 2 },
  { x: 9 * PITCH + ROAD_W / 2, y: 9 * PITCH + ROAD_W / 2 },
];

// Pistol pickups on the map (refill to 12 shots).
export const PISTOL_SPOTS = [
  { x: 2 * PITCH + ROAD_W / 2, y: 6 * PITCH + ROAD_W / 2 },
  { x: 10 * PITCH + ROAD_W / 2, y: 4 * PITCH + ROAD_W / 2 },
];

export const PALETTE = {
  ground: '#3d4450',
  sidewalk: '#565d6b',
  asphalt: '#23262d',
  roadLine: '#d9c95c',
  crosswalk: '#c9ccd4',
  grass: '#3e7d46',
  sand: '#c9b078',
  water: '#1d6fb0',
  buildingRoof: ['#7a5c46', '#5d6b7a', '#8a6d4b', '#6b5a7d', '#4f6b5d', '#7d4a52'],
  buildingEdge: '#20242c',
  tree: '#2c6b34',
  car: ['#d8443c', '#3c7dd8', '#e8b73c', '#7dd83c', '#d8d8d8', '#8a5fd8', '#e07f2e'],
  policeCar: '#2e4a8a',
  taxi: '#e8c832',
  player: '#f2f2f2',
  playerJacket: '#e83e8c',
  ped: ['#e8e8e8', '#7ab8e8', '#e8a87a', '#9ad87a', '#d87ab8'],
  cop: '#2e4a8a',
  hud: '#f4f6f8',
  hudDim: '#9aa3b0',
  gold: '#f2c94c',
  danger: '#e5534b',
  pink: '#ff2ea6',
  cyan: '#2ed3e6',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'leonida-heat.save.v1';
export const BEST_KEY = 'leonida-heat.best.v1';

export const TITLE = 'LEONIDA HEAT';
export const TAGLINE = 'Steal it. Drive it. Lose the heat.';
