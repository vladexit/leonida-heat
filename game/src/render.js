// LEONIDA HEAT — the painter. One canvas, top-down. The camera follows the
// player; the city is drawn block by block in view, then cars, peds, markers,
// then the HUD and the minimap. Screens (title, pause, busted, wasted, win)
// are drawn over the world.

import { SIZE, GRID, PITCH, ROAD_W, PALETTE, FONT, TITLE, TAGLINE, MISSIONS, MONEY, SPRAY_BAYS } from './config.js';
import { roadCenter } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_WIN = 'win';

const MINIMAP = 168;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);
  return { canvas, ctx, width: () => window.innerWidth, height: () => window.innerHeight };
}

function cameraFor(renderer, world) {
  const w = renderer.width();
  const h = renderer.height();
  const p = world.player;
  const x = Math.max(w / 2, Math.min(SIZE - w / 2, p.x));
  const y = Math.max(h / 2, Math.min(SIZE - h / 2, p.y));
  return { x: x - w / 2, y: y - h / 2, w, h };
}

function drawCity(ctx, city, cam) {
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(cam.x, cam.y, cam.w, cam.h);
  // Roads: asphalt bands with dashed centre lines and crosswalks.
  ctx.fillStyle = PALETTE.asphalt;
  for (let k = 0; k <= GRID; k += 1) {
    const c = roadCenter(k);
    if (c + ROAD_W / 2 < cam.x || c - ROAD_W / 2 > cam.x + cam.w) continue;
    ctx.fillRect(c - ROAD_W / 2, cam.y, ROAD_W, cam.h);
    if (c + ROAD_W / 2 < cam.y || c - ROAD_W / 2 > cam.y + cam.h) continue;
    ctx.fillRect(cam.x, c - ROAD_W / 2, cam.w, ROAD_W);
  }
  ctx.strokeStyle = PALETTE.roadLine;
  ctx.lineWidth = 2;
  ctx.setLineDash([22, 18]);
  ctx.beginPath();
  for (let k = 0; k <= GRID; k += 1) {
    const c = roadCenter(k);
    ctx.moveTo(c, Math.max(cam.y, 0));
    ctx.lineTo(c, Math.min(cam.y + cam.h, SIZE));
    ctx.moveTo(Math.max(cam.x, 0), c);
    ctx.lineTo(Math.min(cam.x + cam.w, SIZE), c);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosswalks at every intersection in view.
  ctx.fillStyle = PALETTE.crosswalk;
  for (let i = 0; i <= GRID; i += 1) {
    for (let j = 0; j <= GRID; j += 1) {
      const cx = roadCenter(i);
      const cy = roadCenter(j);
      if (cx < cam.x - 40 || cx > cam.x + cam.w + 40 || cy < cam.y - 40 || cy > cam.y + cam.h + 40) continue;
      for (let s = -3; s <= 3; s += 1) {
        ctx.fillRect(cx - 26 + s * 8, cy - ROAD_W / 2 + 4, 4, ROAD_W - 8);
        ctx.fillRect(cx - ROAD_W / 2 + 4, cy - 26 + s * 8, ROAD_W - 8, 4);
      }
    }
  }
  // Beach and water along the south edge.
  const beachY = GRID * PITCH - PITCH + ROAD_W;
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(Math.max(cam.x, 0), Math.max(cam.y, beachY), Math.min(cam.x + cam.w, SIZE) - Math.max(cam.x, 0), SIZE - Math.max(cam.y, beachY));
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(Math.max(cam.x, 0), Math.max(cam.y, SIZE - 8), Math.min(cam.x + cam.w, SIZE) - Math.max(cam.x, 0), 8);
  // Blocks: parks first, then buildings with a roof and a drop shadow.
  for (const b of city.blocks) {
    if (b.x0 > cam.x + cam.w || b.y0 > cam.y + cam.h || b.x0 + PITCH - ROAD_W < cam.x || b.y0 + PITCH - ROAD_W < cam.y) continue;
    if (b.kind === 'park') {
      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(b.x0, b.y0, PITCH - ROAD_W, PITCH - ROAD_W);
    }
  }
  for (const t of city.trees) {
    if (t.x < cam.x - 16 || t.x > cam.x + cam.w + 16 || t.y < cam.y - 16 || t.y > cam.y + cam.h + 16) continue;
    ctx.fillStyle = PALETTE.tree;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of city.buildings) {
    if (b.x > cam.x + cam.w || b.y > cam.y + cam.h || b.x + b.w < cam.x || b.y + b.h < cam.y) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + 5, b.y + 7, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = PALETTE.buildingEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    if (b.roof === 'stripes') {
      for (let s = 10; s < b.w - 8; s += 18) ctx.fillRect(b.x + s, b.y + 6, 6, b.h - 12);
    } else if (b.roof === 'cross') {
      ctx.fillRect(b.x + b.w / 2 - 3, b.y + 6, 6, b.h - 12);
      ctx.fillRect(b.x + 6, b.y + b.h / 2 - 3, b.w - 12, 6);
    } else {
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    }
  }
  // Pay 'n Spray bays: a purple square with a dollar sign on the road.
  for (const bay of SPRAY_BAYS) {
    ctx.fillStyle = '#7a5fd8';
    ctx.fillRect(bay.x - 26, bay.y - 26, 52, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', bay.x, bay.y + 1);
  }
}

function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-22, -9, 46, 24);
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-23, -11, 46, 22, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,24,32,0.85)';
  ctx.beginPath();
  ctx.roundRect(-6, -9, 14, 18, 3);
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(20, -9, 3, 6);
  ctx.fillRect(20, 3, 3, 6);
  if (car.kind === 'police') {
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-14, -11, 8, 4);
    ctx.fillStyle = '#2f7bff';
    ctx.fillRect(-4, -11, 8, 4);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('LCPD', 0, 1);
  }
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#20242c';
    ctx.font = 'bold 10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 1);
  }
  if (car.kind === 'target') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-23, -11, 46, 22, 6);
    ctx.stroke();
  }
  ctx.restore();
  if (car.damage > 25) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = 30 * (car.damage / 100);
    ctx.fillRect(car.x - 15, car.y - 26, 30, 4);
    ctx.fillStyle = car.damage > 70 ? '#e5534b' : '#f2c94c';
    ctx.fillRect(car.x - 15, car.y - 26, w, 4);
  }
}

function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.mode === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(7, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, world) {
  const p = world.player;
  if (!p.onFoot) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.playerJacket;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(8, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242c';
  ctx.fillRect(8, -2, 5, 4);
  ctx.restore();
  if (p.invuln > 0 && Math.floor(p.invuln * 8) % 2 === 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawMarkers(ctx, world) {
  const m = world.mission;
  const pulse = 1 + Math.sin(world.time * 4) * 0.15;
  for (let i = 0; i < m.markers.length; i += 1) {
    const mk = m.markers[i];
    if (m.index === 4 && i < m.cpIndex) continue;
    const isNext = m.index === 4 ? i === m.cpIndex : true;
    ctx.save();
    ctx.translate(mk.x, mk.y);
    ctx.strokeStyle = isNext ? PALETTE.gold : 'rgba(242,201,76,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const pk of world.packages) {
    if (pk.taken) continue;
    ctx.fillStyle = PALETTE.gold;
    ctx.save();
    ctx.translate(pk.x, pk.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
    ctx.strokeStyle = '#8a6d1f';
    ctx.lineWidth = 2;
    ctx.strokeRect(pk.x - 7, pk.y - 7, 14, 14);
  }
  for (const gun of world.pistol) {
    if (gun.taken) continue;
    ctx.fillStyle = '#2ed3e6';
    ctx.beginPath();
    ctx.arc(gun.x, gun.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c0e13';
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', gun.x, gun.y);
  }
  if (world.taxi.active && world.taxi.dest) {
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(world.taxi.dest.x, world.taxi.dest.y, 24 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawHud(ctx, renderer, world, screen) {
  const w = renderer.width();
  const h = renderer.height();
  ctx.textBaseline = 'alphabetic';
  // Cash, top left.
  ctx.fillStyle = 'rgba(10,12,16,0.72)';
  ctx.beginPath();
  ctx.roundRect(14, 12, 190, 64, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 26px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText(`$${world.money.toLocaleString('en-US')}`, 28, 40);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '13px ' + FONT;
  ctx.fillText(`Packages ${world.packages.filter((pk) => pk.taken).length}/${MONEY.packageCount}`, 28, 62);
  // Health bar under the cash.
  ctx.fillStyle = 'rgba(10,12,16,0.72)';
  ctx.beginPath();
  ctx.roundRect(14, 84, 190, 18, 9);
  ctx.fill();
  ctx.fillStyle = world.hp > 30 ? '#58c96b' : '#e5534b';
  ctx.beginPath();
  ctx.roundRect(16, 86, Math.max(0, 186 * (world.hp / 100)), 14, 7);
  ctx.fill();
  // Wanted stars, top centre.
  const stars = Math.floor(world.wanted);
  ctx.fillStyle = 'rgba(10,12,16,0.72)';
  ctx.beginPath();
  ctx.roundRect(w / 2 - 95, 12, 190, 40, 10);
  ctx.fill();
  ctx.font = '24px ' + FONT;
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < stars ? '#ffd94d' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', w / 2 - 72 + i * 36, 42);
  }
  // Speed + car damage, bottom left when driving.
  const p = world.player;
  if (!p.onFoot) {
    const car = world.cars.find((c) => c.id === p.carId);
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    ctx.beginPath();
    ctx.roundRect(14, h - 66, 190, 52, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.hud;
    ctx.font = 'bold 24px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(Math.abs(car ? car.speed : 0) * 0.36)} km/h`, 28, h - 32);
    if (car) {
      ctx.fillStyle = PALETTE.hudDim;
      ctx.font = '12px ' + FONT;
      ctx.fillText(`Car condition ${Math.round(100 - car.damage)}%`, 28, h - 16);
    }
  }
  // Ammo, bottom right of the HUD cluster.
  if (world.ammo > 0) {
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    ctx.beginPath();
    ctx.roundRect(w - 104, h - 66, 90, 52, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.cyan;
    ctx.font = 'bold 22px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(`AMMO ${world.ammo}`, w - 59, h - 32);
  }
  // Mission objective, bottom centre.
  const def = MISSIONS[world.mission.index];
  const line = world.over === 'won'
    ? 'LEONIDA IS YOURS — all six missions done!'
    : def
      ? `Mission ${def.id}: ${def.title} — ${def.brief}`
      : 'Free roam — Leonida is yours.';
  ctx.fillStyle = 'rgba(10,12,16,0.78)';
  ctx.font = '15px ' + FONT;
  const tw = ctx.measureText(line).width;
  ctx.beginPath();
  ctx.roundRect(w / 2 - tw / 2 - 18, h - 52, tw + 36, 38, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.hud;
  ctx.textAlign = 'center';
  ctx.fillText(line, w / 2, h - 27);
  // Mission timer, when one runs.
  if (def && def.time && world.mission.phase === 'active' && world.mission.timer > 0) {
    ctx.fillStyle = world.mission.timer < 15 ? '#e5534b' : PALETTE.gold;
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText(`${Math.ceil(world.mission.timer)}s`, w / 2, 96);
  }
  // Transient message.
  if (world.messageT > 0 && world.message) {
    ctx.fillStyle = 'rgba(10,12,16,0.78)';
    ctx.font = 'bold 16px ' + FONT;
    const mw = ctx.measureText(world.message).width;
    ctx.beginPath();
    ctx.roundRect(w / 2 - mw / 2 - 16, 118, mw + 32, 34, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.hud;
    ctx.fillText(world.message, w / 2, 141);
  }
  // Minimap, top right.
  const mm = MINIMAP;
  const scale = mm / SIZE;
  const mx = w - mm - 14;
  const my = 12;
  ctx.fillStyle = 'rgba(10,12,16,0.8)';
  ctx.beginPath();
  ctx.roundRect(mx - 4, my - 4, mm + 8, mm + 8, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mm, mm);
  ctx.clip();
  ctx.fillStyle = '#2b313c';
  ctx.fillRect(mx, my, mm, mm);
  ctx.fillStyle = '#3e7d46';
  for (const b of world.city.blocks) {
    if (b.kind === 'park') ctx.fillRect(mx + b.x0 * scale, my + b.y0 * scale, (PITCH - ROAD_W) * scale, (PITCH - ROAD_W) * scale);
  }
  ctx.fillStyle = '#c9b078';
  ctx.fillRect(mx, my + (SIZE - PITCH) * scale, mm, PITCH * scale);
  ctx.fillStyle = '#1d6fb0';
  ctx.fillRect(mx, my + (SIZE - 8) * scale, mm, 8 * scale);
  for (const car of world.cars) {
    if (car.kind === 'police') {
      ctx.fillStyle = '#4d8dff';
      ctx.fillRect(mx + car.x * scale - 2, my + car.y * scale - 2, 4, 4);
    }
  }
  for (const mk of world.mission.markers) {
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(mx + mk.x * scale, my + mk.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (world.taxi.active && world.taxi.dest) {
    ctx.fillStyle = PALETTE.cyan;
    ctx.beginPath();
    ctx.arc(mx + world.taxi.dest.x * scale, my + world.taxi.dest.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mx + p.x * scale, my + p.y * scale, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Screen overlays.
  if (screen === SCREEN_TITLE) drawTitle(ctx, renderer);
  else if (screen === SCREEN_PAUSED) drawCenter(ctx, renderer, 'PAUSED', 'P or Esc to keep playing · M mute · 1/2 radio');
  else if (screen === SCREEN_BUSTED) drawCenter(ctx, renderer, 'BUSTED!', 'The Leonida PD got you. Press Enter to walk free.');
  else if (screen === SCREEN_WASTED) drawCenter(ctx, renderer, 'WASTED!', 'Leonida chewed you up. Press Enter to get back out there.');
  else if (screen === SCREEN_WIN) drawWin(ctx, renderer, world);
}

function drawTitle(ctx, renderer) {
  const w = renderer.width();
  const h = renderer.height();
  ctx.fillStyle = 'rgba(8,8,14,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.pink;
  ctx.font = 'bold 84px ' + FONT;
  ctx.fillText(TITLE, w / 2, h / 2 - 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px ' + FONT;
  ctx.fillText(TAGLINE, w / 2, h / 2 - 22);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '17px ' + FONT;
  ctx.fillText('WASD drive & walk · E steal a car · Space punch · F shoot · T hail a taxi · P pause · M mute', w / 2, h / 2 + 26);
  ctx.fillText('Six missions. Twelve packages. One city that never sleeps.', w / 2, h / 2 + 56);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 20px ' + FONT;
  ctx.fillText('Press ENTER to start', w / 2, h / 2 + 104);
}

function drawCenter(ctx, renderer, big, small) {
  const w = renderer.width();
  const h = renderer.height();
  ctx.fillStyle = 'rgba(8,8,14,0.66)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px ' + FONT;
  ctx.fillText(big, w / 2, h / 2 - 10);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '18px ' + FONT;
  ctx.fillText(small, w / 2, h / 2 + 32);
}

function drawWin(ctx, renderer, world) {
  const w = renderer.width();
  const h = renderer.height();
  ctx.fillStyle = 'rgba(8,10,8,0.78)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 68px ' + FONT;
  ctx.fillText('LEONIDA IS YOURS', w / 2, h / 2 - 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px ' + FONT;
  ctx.fillText(`All six missions done · $${world.money.toLocaleString('en-US')} in the pocket`, w / 2, h / 2 - 28);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '17px ' + FONT;
  ctx.fillText(`Cars stolen ${world.stats.stolen} · Times busted ${world.stats.busted} · Earned $${world.stats.earned.toLocaleString('en-US')}`, w / 2, h / 2 + 8);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 20px ' + FONT;
  ctx.fillText('Press ENTER to keep roaming Leonida', w / 2, h / 2 + 56);
}

export function draw(renderer, world, screen) {
  const ctx = renderer.ctx;
  const cam = cameraFor(renderer, world);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawCity(ctx, world.city, cam);
  drawMarkers(ctx, world);
  for (const car of world.cars) drawCar(ctx, car);
  for (const ped of world.peds) drawPed(ctx, ped);
  drawPlayer(ctx, world);
  ctx.restore();
  drawHud(ctx, renderer, world, screen);
}
