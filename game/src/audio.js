// Sound, synthesized live with WebAudio — no audio files, no network.
// Every effect is a small oscillator or noise burst with an envelope:
// shots are filtered noise with a pitch per weapon class, footsteps are
// short low thuds, the bomb beep quickens near the end, and round
// win/lose are three-note phrases. The context is created lazily on the
// first call (browsers forbid sound before a gesture, and the headless
// screenshot runs must never crash on audio), so before the first click
// every call is a silent no-op. Effects are written as step lists —
// [offset, kind, params] — instead of nested timers, so a phrase reads
// as a score rather than a chain of callbacks.
const SHOT_PROFILE = {
  rifle: { noise: [0.13, 0.7, 2000], tone: [180, 0.09, 'sawtooth', 0.2, 55] },
  smg: { noise: [0.09, 0.5, 2400], tone: [220, 0.06, 'square', 0.12, 90] },
  shotgun: { noise: [0.3, 1, 900], tone: [120, 0.2, 'sawtooth', 0.3, 35] },
  sniper: { noise: [0.22, 0.9, 1400], tone: [160, 0.16, 'sawtooth', 0.25, 40] },
  pistol: { noise: [0.12, 0.6, 1800], tone: [190, 0.08, 'square', 0.15, 70] },
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
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
      return false;
    }
    return true;
  }

  // One envelope-shaped oscillator at an absolute start time.
  function toneAt(t0, freq, dur, type, gainValue, slideTo = 0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // One burst of filtered noise at an absolute start time.
  function noiseAt(t0, dur, gainValue, filterFreq) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // Run a step list: each step is [delaySeconds, 'tone'|'noise', params].
  function play(steps) {
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    for (const [delay, kind, params] of steps) {
      if (kind === 'tone') toneAt(t0 + delay, ...params);
      else noiseAt(t0 + delay, ...params);
    }
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    shot(kind) {
      const profile = SHOT_PROFILE[kind] || SHOT_PROFILE.rifle;
      play([[0, 'noise', profile.noise], [0, 'tone', profile.tone]]);
    },
    dryFire() {
      play([[0, 'tone', [1400, 0.03, 'square', 0.08]]]);
    },
    reload() {
      play([
        [0, 'tone', [900, 0.04, 'square', 0.1]],
        [0.25, 'tone', [700, 0.04, 'square', 0.1]],
        [0.6, 'tone', [1100, 0.05, 'square', 0.12]],
      ]);
    },
    hit() {
      play([[0, 'tone', [2400, 0.05, 'sine', 0.25]]]);
    },
    kill() {
      play([
        [0, 'tone', [1800, 0.07, 'sine', 0.25]],
        [0.07, 'tone', [2400, 0.09, 'sine', 0.25]],
      ]);
    },
    hurt() {
      play([[0, 'tone', [140, 0.15, 'sawtooth', 0.25, 70]]]);
    },
    footstep() {
      play([[0, 'noise', [0.05, 0.12, 500]]]);
    },
    buy() {
      play([
        [0, 'tone', [1200, 0.06, 'sine', 0.2]],
        [0.06, 'tone', [1600, 0.08, 'sine', 0.2]],
      ]);
    },
    plantBeep(final = false) {
      play([[0, 'tone', [final ? 1800 : 1200, 0.09, 'square', 0.2]]]);
    },
    defuseBeep() {
      play([[0, 'tone', [900, 0.08, 'square', 0.18]]]);
    },
    explosion() {
      play([
        [0, 'noise', [1.1, 1, 500]],
        [0, 'tone', [70, 0.9, 'sine', 0.7, 28]],
        [0.1, 'noise', [0.5, 0.5, 2400]],
      ]);
    },
    roundWin() {
      play([
        [0, 'tone', [523, 0.14, 'sine', 0.25]],
        [0.14, 'tone', [659, 0.14, 'sine', 0.25]],
        [0.28, 'tone', [784, 0.28, 'sine', 0.3]],
      ]);
    },
    roundLose() {
      play([
        [0, 'tone', [392, 0.18, 'sine', 0.25]],
        [0.18, 'tone', [311, 0.18, 'sine', 0.25]],
        [0.36, 'tone', [233, 0.36, 'sine', 0.28]],
      ]);
    },
  };
}
