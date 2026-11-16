// Sound, synthesized: every shot, reload, beep and boom is an oscillator or
// a noise buffer through the Web Audio API. No audio files ship with the
// game, so the gate's "loads nothing over the network" row stays trivially
// true. The context starts on the first click; before that every call is a
// silent no-op, which is also how the headless screenshot runs behave.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, dur, type, gain, slideTo = 0, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, filterFreq, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    shot(kind) {
      if (kind === 'sniper') {
        noise(0.22, 0.9, 1400);
        tone(160, 0.16, 'sawtooth', 0.25, 40);
      } else if (kind === 'shotgun') {
        noise(0.3, 1, 900);
        tone(120, 0.2, 'sawtooth', 0.3, 35);
      } else if (kind === 'smg') {
        noise(0.09, 0.5, 2400);
        tone(220, 0.06, 'square', 0.12, 90);
      } else if (kind === 'pistol') {
        noise(0.12, 0.6, 1800);
        tone(190, 0.08, 'square', 0.15, 70);
      } else {
        noise(0.13, 0.7, 2000);
        tone(180, 0.09, 'sawtooth', 0.2, 55);
      }
    },
    dryFire() {
      tone(1400, 0.03, 'square', 0.08);
    },
    reload() {
      tone(900, 0.04, 'square', 0.1);
      tone(700, 0.04, 'square', 0.1, 0, 0.25);
      tone(1100, 0.05, 'square', 0.12, 0, 0.6);
    },
    hit() {
      tone(2400, 0.05, 'sine', 0.25);
    },
    kill() {
      tone(1800, 0.07, 'sine', 0.25);
      tone(2400, 0.09, 'sine', 0.25, 0, 0.07);
    },
    hurt() {
      tone(140, 0.15, 'sawtooth', 0.25, 70);
    },
    footstep() {
      noise(0.05, 0.12, 500);
    },
    buy() {
      tone(1200, 0.06, 'sine', 0.2);
      tone(1600, 0.08, 'sine', 0.2, 0, 0.06);
    },
    plantBeep(final = false) {
      tone(final ? 1800 : 1200, 0.09, 'square', 0.2);
    },
    defuseBeep() {
      tone(900, 0.08, 'square', 0.18);
    },
    explosion() {
      noise(1.1, 1, 500);
      tone(70, 0.9, 'sine', 0.7, 28);
      noise(0.5, 0.5, 2400);
    },
    roundWin() {
      tone(523, 0.14, 'sine', 0.25);
      tone(659, 0.14, 'sine', 0.25, 0, 0.14);
      tone(784, 0.28, 'sine', 0.3, 0, 0.28);
    },
    roundLose() {
      tone(392, 0.18, 'sine', 0.25);
      tone(311, 0.18, 'sine', 0.25, 0, 0.18);
      tone(233, 0.36, 'sine', 0.28, 0, 0.36);
    },
  };
}
