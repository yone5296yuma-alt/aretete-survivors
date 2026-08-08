// Lightweight synthesized SFX (no external audio assets needed).
let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'sine', gainStart = 0.15, delay = 0) {
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
    gain.gain.setValueAtTime(gainStart, ac.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + dur);
  } catch (e) { /* audio not available, ignore */ }
}

export const SFX = {
  hit: () => tone(220 + Math.random() * 60, 0.06, 'square', 0.06),
  kill: () => tone(440, 0.08, 'triangle', 0.08),
  hurt: () => tone(130, 0.15, 'sawtooth', 0.12),
  pickup: () => tone(880, 0.05, 'sine', 0.05),
  heal: () => { tone(587, 0.1, 'sine', 0.1); tone(880, 0.15, 'sine', 0.1, 0.09); },
  levelUp: () => { tone(523, 0.1, 'sine', 0.12); tone(659, 0.1, 'sine', 0.12, 0.08); tone(784, 0.18, 'sine', 0.12, 0.16); },
  evolve: () => { tone(392, 0.12, 'sine', 0.14); tone(523, 0.12, 'sine', 0.14, 0.1); tone(659, 0.12, 'sine', 0.14, 0.2); tone(784, 0.3, 'sine', 0.14, 0.3); },
  chest: () => { tone(660, 0.08, 'square', 0.08); tone(880, 0.12, 'square', 0.08, 0.08); },
  bossWarn: () => { tone(110, 0.3, 'sawtooth', 0.15); tone(110, 0.3, 'sawtooth', 0.15, 0.35); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.14, i * 0.14)); },
  lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, 'sine', 0.12, i * 0.18)); },
};

export function unlockAudio() {
  try { getCtx(); } catch (e) { /* ignore */ }
}
