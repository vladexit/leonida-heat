// LEONIDA HEAT — keyboard input. Holds the current key set and hands the world a
// plain object of booleans each frame; edge actions (enter, punch, shoot, taxi,
// pause, confirm, mute, station) fire only on the frame the key goes down.

const KEYMAP = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  enter: ['KeyE'],
  punch: ['Space'],
  shoot: ['KeyF'],
  taxi: ['KeyT'],
  pause: ['KeyP', 'Escape'],
  confirm: ['Enter', 'Space'],
  mute: ['KeyM'],
  station: ['Digit1', 'Digit2'],
};

export function createInput() {
  const down = new Set();
  const edge = new Set();
  const state = { down, edge };

  function onKeyDown(event) {
    if (event.repeat) return;
    down.add(event.code);
    edge.add(event.code);
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  }
  function onKeyUp(event) {
    down.delete(event.code);
  }
  function onBlur() {
    // A key released while the window is unfocused would otherwise stay in the
    // edge set and fire once on the next frame even though nobody pressed it.
    down.clear();
    edge.clear();
  }

  return {
    state,
    attach() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
    },
    /** Read the frame's input, then clear the edge set for the next frame. */
    take() {
      const has = (names) => names.some((code) => down.has(code));
      const hit = (names) => names.some((code) => edge.has(code));
      const input = {
        up: has(KEYMAP.up),
        down: has(KEYMAP.down),
        left: has(KEYMAP.left),
        right: has(KEYMAP.right),
        run: has(KEYMAP.run),
        enter: hit(KEYMAP.enter),
        punch: hit(KEYMAP.punch),
        shoot: hit(KEYMAP.shoot),
        taxi: hit(KEYMAP.taxi),
        pause: hit(KEYMAP.pause),
        confirm: hit(KEYMAP.confirm),
        mute: hit(KEYMAP.mute),
        station: hit(KEYMAP.station) ? (down.has('Digit2') ? 1 : 0) : -1,
      };
      edge.clear();
      return input;
    },
  };
}
