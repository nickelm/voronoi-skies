/**
 * Keyboard state management
 */

const keys = {};

export function init() {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
}

export function isKeyDown(code) {
  return keys[code] === true;
}

export function getInputState() {
  return {
    throttleUp: isKeyDown('KeyW'),
    throttleDown: isKeyDown('KeyS'),
    turnLeft: isKeyDown('KeyA'),
    turnRight: isKeyDown('KeyD'),
    climbUp: isKeyDown('KeyQ'),
    climbDown: isKeyDown('KeyE'),
    lock: isKeyDown('Space'),
    fire: isKeyDown('KeyF'),
    advanceTime: isKeyDown('KeyT'),
    advanceSeason: isKeyDown('KeyY'),
  };
}
