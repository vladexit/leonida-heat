// LEONIDA HEAT — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between title, play, paused, busted, wasted and win screens.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|win (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { makeRng } from './random.js';
import { createWorld, stepWorld, resetWorld, respawn } from './world.js';
import { createInput } from './input.js';
import { createRenderer, draw, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave } from './save.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const errorBox = document.getElementById('shot-errors');

// Any page error is collected where a screenshot check can read it.
window.__shotErrors = [];
window.addEventListener('error', (event) => {
  const text = String(event.message || event.type);
  window.__shotErrors.push(text);
  if (errorBox) errorBox.textContent = window.__shotErrors.join(' | ');
});

const world = createWorld(seed);
world.stepWorld = stepWorld;
const renderer = createRenderer(canvas);
const audio = createAudio();
const saved = loadSave();
if (saved && saved.money > 0) {
  world.money = saved.money;
  world.stats.missionsDone = saved.missionsDone || 0;
}

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  // Paint once, synchronously: the draw is complete when it returns, so the
  // shot flag is set deterministically instead of racing the frame scheduler.
  const scene = stageShot(name, world);
  draw(renderer, world, scene.screen);
  window.__shotReady = true;
  document.documentElement.setAttribute('data-shot-ready', 'true');
}

function runGame() {
  const input = createInput();
  input.attach();
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let audioStarted = false;

  function startAudio() {
    if (audioStarted) return;
    audioStarted = audio.init();
  }

  function startGame() {
    resetWorld(world, seed);
    world.stepWorld = stepWorld;
    screen = SCREEN_PLAY;
    announce('Playing. Steal a car to start mission one.');
  }

  function handleEvents() {
    for (const event of world.events) {
      if (event === 'crash' || event === 'rammed') audio.sfx('crash');
      else if (event === 'package' || event === 'pistol' || event === 'package-bonus') audio.sfx('pickup');
      else if (event === 'punch' || event === 'punch-cop') audio.sfx('punch');
      else if (event === 'shoot' || event === 'shoot-hit') audio.sfx('shoot');
      else if (event === 'mission-done' || event === 'won') audio.sfx('mission');
      else if (event === 'busted') audio.sfx('busted');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const keys = input.take();
    if (keys.mute) audio.setMuted(!audio.muted);
    if (keys.station >= 0) audio.setStation(keys.station);
    if (keys.confirm || keys.enter || keys.punch) startAudio();
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (screen === SCREEN_TITLE) {
      if (keys.confirm) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (keys.pause) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (keys.pause || keys.confirm) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_BUSTED) {
      if (keys.confirm) {
        respawn(world, 'busted');
        writeSave(world);
        screen = SCREEN_PLAY;
      }
    } else if (screen === SCREEN_WASTED) {
      if (keys.confirm) {
        respawn(world, 'wasted');
        writeSave(world);
        screen = SCREEN_PLAY;
      }
    } else if (screen === SCREEN_WIN) {
      if (keys.confirm) {
        world.over = null;
        screen = SCREEN_PLAY;
        announce('Free roam — Leonida is yours.');
      }
    }

    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepWorld(world, keys, STEP);
        handleEvents();
        accumulator -= STEP;
        if (world.over === 'busted') {
          screen = SCREEN_BUSTED;
          announce('Busted! Press Enter to walk free.');
          break;
        }
        if (world.over === 'wasted') {
          screen = SCREEN_WASTED;
          announce('Wasted! Press Enter to get back out there.');
          break;
        }
        if (world.over === 'won') {
          screen = SCREEN_WIN;
          writeSave(world);
          announce('Leonida is yours!');
          break;
        }
      }
      const car = world.player.onFoot ? null : world.cars.find((c) => c.id === world.player.carId);
      audio.setEngine(car ? Math.abs(car.speed) / 540 : 0, !!car);
      audio.setSiren(world.wanted >= 1);
    } else {
      accumulator = 0;
      audio.setEngine(0, false);
      audio.setSiren(false);
    }
    draw(renderer, world, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('LEONIDA HEAT. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
