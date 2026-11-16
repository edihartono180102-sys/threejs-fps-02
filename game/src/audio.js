// Synthesised sound for Emberworks. No audio files ship with the game: every
// effect is a short WebAudio recipe (filtered noise, a falling oscillator), so
// the game makes no network request and no asset load. Everything is guarded:
// without a user gesture the context stays suspended and calls are no-ops.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx || muted) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      muted = true;
      return null;
    }
    return ctx;
  }

  function noiseBuffer(duration) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  function tone(freqStart, freqEnd, duration, gainValue, type = 'sine') {
    if (!ensure() || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    shot(kind) {
      if (kind === 'dmr') { burst(0.22, 900, 0.9); tone(160, 55, 0.18, 0.5, 'square'); }
      else if (kind === 'smg') { burst(0.09, 1600, 0.5); tone(220, 90, 0.07, 0.25, 'square'); }
      else if (kind === 'rifle') { burst(0.14, 1200, 0.7); tone(190, 70, 0.12, 0.4, 'square'); }
      else { burst(0.1, 1800, 0.5); tone(260, 110, 0.08, 0.3, 'square'); }
    },
    enemyShot(distance) {
      const volume = Math.max(0.08, 0.55 - distance * 0.012);
      burst(0.12, 1000, volume);
    },
    dry() { tone(1200, 900, 0.04, 0.2, 'square'); },
    reload() { tone(500, 380, 0.05, 0.25, 'square'); setTimeout(() => tone(650, 500, 0.05, 0.25, 'square'), 260); },
    hit() { tone(1900, 1500, 0.05, 0.3, 'sine'); },
    kill() { tone(880, 880, 0.07, 0.3, 'sine'); setTimeout(() => tone(1318, 1318, 0.09, 0.3, 'sine'), 70); },
    hurt() { tone(140, 70, 0.18, 0.5, 'sawtooth'); },
    explosion() { burst(0.9, 320, 1.0); tone(90, 28, 0.8, 0.9, 'sine'); },
    beep() { tone(1150, 1150, 0.09, 0.3, 'sine'); },
    plant() { tone(950, 950, 0.12, 0.3, 'sine'); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, f, 0.16, 0.3, 'triangle'), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, f, 0.16, 0.3, 'triangle'), i * 110)); },
    buy() { tone(740, 740, 0.06, 0.25, 'triangle'); setTimeout(() => tone(988, 988, 0.08, 0.25, 'triangle'), 60); },
  };
}
