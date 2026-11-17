// Keyboard and mouse: held keys by action name, one-frame presses, mouse look deltas (pointer
// lock on click while playing, or drag when the lock is refused), the wheel for weapon switching,
// and the buttons for punching, shooting and aiming.
import { KEYS } from './config.js';

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const codeToActions = new Map();
  for (const [action, codes] of Object.entries(KEYS)) {
    for (const code of codes) {
      if (!codeToActions.has(code)) codeToActions.set(code, []);
      codeToActions.get(code).push(action);
    }
  }
  const state = {
    mouseDX: 0,
    mouseDY: 0,
    wheel: 0,
    mouseDown: [false, false, false],
    mousePressed: [false, false, false],
    locked: false,
    wantLock: false,
    anyKey: false,
    lastCode: null,
  };
  const prevent = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F5', 'Tab']);

  window.addEventListener('keydown', (e) => {
    if (prevent.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    state.anyKey = true;
    state.lastCode = e.code;
  });
  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
  });
  window.addEventListener('blur', () => {
    down.clear();
    state.mouseDown.fill(false);
  });
  canvas.addEventListener('mousedown', (e) => {
    state.mouseDown[e.button] = true;
    state.mousePressed[e.button] = true;
    if (state.wantLock && !state.locked && document.pointerLockElement !== canvas) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch {
        // Pointer lock can be refused (headless or embedded); dragging still turns the camera.
      }
    }
  });
  window.addEventListener('mouseup', (e) => {
    state.mouseDown[e.button] = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (state.locked || state.mouseDown[0] || state.mouseDown[2] || state.wantLock) {
      state.mouseDX += e.movementX || 0;
      state.mouseDY += e.movementY || 0;
    }
  });
  window.addEventListener('wheel', (e) => {
    state.wheel += Math.sign(e.deltaY);
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
  });

  const isDown = (action) => KEYS[action].some((code) => down.has(code));
  const justPressed = (action) => KEYS[action].some((code) => pressed.has(code));

  return {
    state,
    isDown,
    justPressed,
    codeDown: (code) => down.has(code),
    codePressed: (code) => pressed.has(code),
    /** Reset the one-frame flags; call at the end of every frame. */
    endFrame() {
      pressed.clear();
      state.mouseDX = 0;
      state.mouseDY = 0;
      state.wheel = 0;
      state.mousePressed.fill(false);
      state.anyKey = false;
    },
    /** Ask for pointer lock on the next click (while playing) or release it (menus). */
    setLockWanted(want) {
      state.wantLock = want;
      if (!want && document.pointerLockElement === canvas) {
        try {
          document.exitPointerLock();
        } catch {
          // Nothing to release.
        }
      }
    },
    /** The movement axes from the keys: x right (-1..1), y forward (-1..1). */
    axes() {
      const x = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
      const y = (isDown('forward') ? 1 : 0) - (isDown('back') ? 1 : 0);
      return { x, y };
    },
  };
}
