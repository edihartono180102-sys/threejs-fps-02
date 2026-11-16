// Keyboard and mouse for Emberworks. Pointer lock gives mouse look; the state
// object is plain data the simulation reads, so the loop never touches the DOM
// while it steps. Shot mode (screenshots) never requests the lock.
export function createInput(canvas, callbacks) {
  const state = {
    keys: new Set(),
    lookX: 0,
    lookY: 0,
    firing: false,
    aiming: false,
    locked: false,
  };
  let enabled = true;

  function onKeyDown(event) {
    if (event.repeat) return;
    state.keys.add(event.code);
    if (callbacks.onKey) callbacks.onKey(event.code);
    if (['Space', 'Tab'].includes(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    state.keys.delete(event.code);
  }

  function onMouseMove(event) {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  }

  function onMouseDown(event) {
    if (!state.locked || !enabled) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  }

  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  }

  function onLockChange() {
    state.locked = document.pointerLockElement === canvas;
    if (callbacks.onLockChange) callbacks.onLockChange(state.locked);
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    requestLock() {
      if (document.pointerLockElement === canvas) return;
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    setEnabled(value) {
      enabled = value;
      if (!value) {
        state.firing = false;
        state.aiming = false;
        state.keys.clear();
      }
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
