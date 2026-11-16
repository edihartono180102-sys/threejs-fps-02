// Keyboard and mouse, and the pointer lock that turns the mouse into
// look. Plain browser APIs only. Left mouse fires, right mouse aims down
// sights, and every key press is also reported once as an edge, so the
// buy menu and the grenade throw never double-fire from a held key.
// Mouse sensitivity lives here (0.5×–2× of the default), so the game
// never has to reach into the listeners to tune the feel.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = {
    keys,
    pressed,
    locked: false,
    firing: false,
    aiming: false,
    lookX: 0,
    lookY: 0,
    sensitivity: 1, // 0.5–2, multiplied into the look delta
  };

  function pressKey(code) {
    if (!keys.has(code)) pressed.add(code);
    keys.add(code);
    if (code === 'Space') return true; // caller prevents the page scroll
    return false;
  }

  const handlers = {
    keydown(event) {
      if (pressKey(event.code)) event.preventDefault();
    },
    keyup(event) {
      keys.delete(event.code);
    },
    blur() {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    },
    mousemove(event) {
      if (!state.locked) return;
      state.lookX += event.movementX * state.sensitivity;
      state.lookY += event.movementY * state.sensitivity;
    },
    mousedown(event) {
      if (!state.locked) return;
      if (event.button === 0) state.firing = true;
      if (event.button === 2) state.aiming = true;
    },
    mouseup(event) {
      if (event.button === 0) state.firing = false;
      if (event.button === 2) state.aiming = false;
    },
    contextmenu(event) {
      event.preventDefault();
    },
  };
  for (const [name, fn] of Object.entries(handlers)) {
    window.addEventListener(name, fn);
  }
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    setSensitivity(value) {
      state.sensitivity = Math.max(0.5, Math.min(2, value));
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
  };
}
