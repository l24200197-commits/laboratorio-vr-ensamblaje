// Sonidos sintetizados con Web Audio API: sin archivos externos (sin problemas de licencias).
let ctx = null;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (err) {
    console.warn('[audio] Web Audio no disponible:', err);
  }
}

function tone(freq, duration, { type = 'sine', delay = 0, gain = 0.12 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sounds = {
  success() { tone(660, 0.12); tone(880, 0.18, { delay: 0.11 }); },
  error() { tone(200, 0.2, { type: 'triangle', gain: 0.07 }); },
  finish() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { delay: i * 0.13 })); },
  click() { tone(1200, 0.05, { gain: 0.05 }); },
  door(open) { tone(open ? 140 : 110, 0.18, { type: 'triangle', gain: 0.09 }); tone(open ? 210 : 90, 0.12, { type: 'triangle', gain: 0.05, delay: 0.08 }); },
};
