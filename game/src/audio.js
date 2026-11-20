// LEONIDA HEAT — all sound is synthesized live with WebAudio: two original radio
// stations (a synthwave drive and a dangdut-flavoured groove), an engine hum that
// follows your speed, a police siren, and small one-shots for crashes, pickups and
// punches. Nothing is loaded from disk, so the game stays fully offline. In node
// (the headless rules test) every method is a harmless no-op.

const NOTE = {
  // Diatonic set only — both stations are written from these notes, so the
  // loops never sound out of key with each other.
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
};

// 16-step loops: [note, length in steps]. 0 = rest.
const STATIONS = [
  {
    name: 'HEAT FM — synthwave',
    bpm: 104,
    bass: ['C3', 'C3', 0, 'C3', 'G3', 0, 'C3', 0, 'A3', 0, 'A3', 0, 'F3', 0, 'G3', 0],
    lead: ['E5', 0, 'G5', 0, 'A5', 0, 'G5', 'E5', 'D5', 0, 'E5', 0, 'C5', 0, 'D5', 0],
  },
  {
    name: 'DANGDUT LEONIDA',
    bpm: 128,
    bass: ['C3', 0, 'G3', 'C3', 0, 'G3', 'C3', 0, 'F3', 0, 'G3', 0, 'C3', 'G3', 0, 'G3'],
    lead: ['G4', 'A4', 0, 'C5', 0, 'A4', 'G4', 0, 'E4', 'G4', 'A4', 0, 'C5', 0, 'A4', 'G4'],
  },
];

export function createAudio() {
  const engine = {
    ctx: null,
    master: null,
    musicGain: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    muted: false,
    station: 0,
    step: 0,
    nextStepTime: 0,
    timer: null,
    ready: false,
  };

  function ensure() {
    if (engine.ready) return true;
    const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) return false;
    try {
      engine.ctx = new AC();
      engine.master = engine.ctx.createGain();
      engine.master.gain.value = 0.5;
      engine.master.connect(engine.ctx.destination);
      engine.musicGain = engine.ctx.createGain();
      engine.musicGain.gain.value = 0.22;
      engine.musicGain.connect(engine.master);
      engine.engineOsc = engine.ctx.createOscillator();
      engine.engineOsc.type = 'sawtooth';
      engine.engineOsc.frequency.value = 55;
      engine.engineGain = engine.ctx.createGain();
      engine.engineGain.gain.value = 0;
      engine.engineOsc.connect(engine.engineGain);
      engine.engineGain.connect(engine.master);
      engine.engineOsc.start();
      engine.sirenOsc = engine.ctx.createOscillator();
      engine.sirenOsc.type = 'triangle';
      engine.sirenOsc.frequency.value = 700;
      engine.sirenGain = engine.ctx.createGain();
      engine.sirenGain.gain.value = 0;
      engine.sirenOsc.connect(engine.sirenGain);
      engine.sirenGain.connect(engine.master);
      engine.sirenOsc.start();
      engine.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!engine.ready) return;
    const t = engine.ctx.currentTime + when;
    const osc = engine.ctx.createOscillator();
    const gain = engine.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(engine.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function playStep() {
    if (!engine.ready || engine.muted) return;
    const station = STATIONS[engine.station];
    const stepDur = 60 / station.bpm / 4;
    const now = engine.ctx.currentTime;
    if (engine.nextStepTime < now) engine.nextStepTime = now + 0.05;
    while (engine.nextStepTime < now + 0.25) {
      const i = engine.step % 16;
      const when = engine.nextStepTime - now;
      const bass = station.bass[i];
      const lead = station.lead[i];
      if (bass) blip(NOTE[bass], stepDur * 1.8, 'triangle', 0.5, when);
      if (lead) blip(NOTE[lead], stepDur * 0.9, 'square', 0.12, when);
      if (i % 4 === 0) blip(1200, 0.03, 'sine', 0.1, when);
      engine.step += 1;
      engine.nextStepTime += stepDur;
    }
  }

  return {
    get muted() {
      return engine.muted;
    },
    get stationName() {
      return STATIONS[engine.station].name;
    },
    init() {
      if (!ensure()) return false;
      if (engine.ctx.state === 'suspended') engine.ctx.resume();
      if (!engine.timer) {
        engine.nextStepTime = engine.ctx.currentTime + 0.1;
        engine.timer = setInterval(playStep, 120);
      }
      return true;
    },
    setMuted(muted) {
      engine.muted = muted;
      if (engine.ready) engine.master.gain.value = muted ? 0 : 0.5;
    },
    setStation(index) {
      engine.station = index % STATIONS.length;
      engine.step = 0;
    },
    cycleStation() {
      this.setStation(engine.station + 1);
    },
    setEngine(ratio, on) {
      if (!engine.ready) return;
      engine.engineGain.gain.setTargetAtTime(on ? 0.05 + ratio * 0.05 : 0, engine.ctx.currentTime, 0.1);
      engine.engineOsc.frequency.setTargetAtTime(50 + ratio * 130, engine.ctx.currentTime, 0.08);
    },
    setSiren(on) {
      if (!engine.ready) return;
      engine.sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, engine.ctx.currentTime, 0.2);
      if (on) engine.sirenOsc.frequency.setTargetAtTime(engine.sirenOsc.frequency.value > 800 ? 700 : 950, engine.ctx.currentTime, 0.4);
    },
    sfx(name) {
      if (!engine.ready || engine.muted) return;
      if (name === 'crash') {
        blip(90, 0.25, 'sawtooth', 0.5);
        blip(55, 0.3, 'square', 0.4, 0.02);
      } else if (name === 'pickup') {
        blip(660, 0.09, 'sine', 0.4);
        blip(990, 0.14, 'sine', 0.4, 0.08);
      } else if (name === 'punch') {
        blip(160, 0.12, 'square', 0.4);
      } else if (name === 'shoot') {
        blip(1400, 0.08, 'square', 0.35);
        blip(300, 0.1, 'sawtooth', 0.3, 0.01);
      } else if (name === 'mission') {
        blip(523, 0.12, 'sine', 0.4);
        blip(659, 0.12, 'sine', 0.4, 0.1);
        blip(784, 0.25, 'sine', 0.4, 0.2);
      } else if (name === 'busted') {
        blip(440, 0.3, 'sawtooth', 0.4);
        blip(330, 0.4, 'sawtooth', 0.4, 0.25);
      }
    },
  };
}
