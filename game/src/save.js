// LEONIDA HEAT — save and best-stats in localStorage. Everything is wrapped in
// try/catch: private windows and blocked storage just mean no saving, never a crash.

import { SAVE_KEY, BEST_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    // A save hand-edited into nonsense is rejected, not trusted: every number
    // the game reads back must actually be a number.
    for (const key of ['money', 'missionsDone', 'packages', 'earned', 'stolen']) {
      if (typeof data[key] !== 'number' || !Number.isFinite(data[key])) return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writeSave(world) {
  try {
    const data = {
      money: world.money,
      missionsDone: world.stats.missionsDone,
      packages: world.packages.filter((pk) => pk.taken).length,
      earned: world.stats.earned,
      stolen: world.stats.stolen,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage off: the best score lasts this visit only.
  }
}
