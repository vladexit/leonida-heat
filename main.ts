// LEONIDA HEAT — the entrypoint the grader runs (Node 22, standard library only).
// It checks the game and the screenshots, copies both to /output, and writes
// /output/dossier.json, the summary the judge reads.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  console.error(`LEONIDA HEAT: ${message}`);
  process.exit(1);
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(full.slice(base.length + 1));
  }
  return out;
}

// Pre-flight: the game must be there, and 1-4 screenshots, each a JPEG under 256 KiB.
const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
const gameFiles = listFiles(gameDir);
if (gameFiles.length > 993) fail(`game/ holds ${gameFiles.length} files, the cap is 993`);
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');
const shots = readdirSync(shotsDir).filter((n) => n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png')).sort();
if (shots.length < 1 || shots.length > 4) fail(`screenshots/ holds ${shots.length} images, the cap is 4`);
const shotInfo = shots.map((name) => {
  const size = statSync(join(shotsDir, name)).size;
  if (size > 262144) fail(`screenshots/${name} is ${size} bytes, over the 256 KiB cap`);
  return { name, bytes: size };
});

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

const dossier = {
  title: 'LEONIDA HEAT',
  tagline: 'Steal it. Drive it. Lose the heat.',
  summary:
    'A top-down open-world crime game in the spirit of GTA 1 and 2, built with plain Canvas 2D and vanilla JavaScript, fully offline. '
    + 'Leonida is a road-grid city of twelve blocks a side: drive and walk it, steal cars, dodge traffic, outrun the Leonida PD, '
    + 'and work through a six-mission story — wheels, a timed courier run, losing the heat, a stash pickup, a checkpoint race, '
    + 'and a finale chase — with taxi fares and a twelve-package hunt on the side. Original city, original names, original music.',
  controls: {
    move: 'WASD / arrow keys (Shift to run)',
    enterCar: 'E (steal the nearest car, E again to get out)',
    punch: 'Space',
    shoot: 'F (after picking up a pistol)',
    taxi: 'T to hail a cab on foot',
    pause: 'P or Esc',
    mute: 'M',
    radio: '1 / 2 to switch stations',
  },
  features: [
    'Open city: 12x12 road grid, buildings with collision, parks, beach and water edge',
    'On foot and driving: acceleration, braking, drift, collisions, car damage',
    'Traffic AI that follows the roads and pedestrians that flee danger',
    'Wanted 0-5 stars: police cars chase on the roads, foot cops join from 2 stars, busted and wasted',
    'Six-mission story chain with timers, checkpoints and a finale chase',
    'Taxi fares and a 12-package hunt, Pay ’n Spray bays that clear heat and fix cars',
    'HUD with cash, health, wanted stars and speed; minimap with mission markers and police',
    'Two original WebAudio radio stations (synthwave + dangdut), engine hum, siren, crash and pickup sounds',
    'Save and best stats in localStorage; win screen with run stats',
  ],
  missions: [
    '1 Wheels — steal any car',
    '2 Courier — timed delivery',
    '3 Heat — lose a 2-star wanted level',
    '4 Pickup — grab the stash and deliver it',
    '5 Checkpoint Run — 5 checkpoints in 90 seconds',
    '6 Finale — ram the getaway driver 3 times',
  ],
  screenshots: shotInfo,
  screenshotBytes: shotInfo.reduce((sum, shot) => sum + shot.bytes, 0),
  gameFiles: gameFiles.length,
  gameBytes: gameFiles.reduce((sum, name) => sum + statSync(join(gameDir, name)).size, 0),
  tech: 'Canvas 2D, vanilla JavaScript ES modules, no libraries, no network, deterministic seeded world',
};

writeFileSync(join(out, 'dossier.json'), JSON.stringify(dossier, null, 2));
console.log(`LEONIDA HEAT: ${gameFiles.length} game files, ${shots.length} screenshots, dossier written to ${out}/dossier.json`);
