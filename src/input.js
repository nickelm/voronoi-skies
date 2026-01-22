/**
 * Input state management (keyboard + touch)
 */

import * as touch from './touch.js';

const keys = {};

// Touch input state (set by touch module)
let touchInputState = {
  active: false,
  turn: 0,
  throttle: 0,
};

export function init() {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
}

/**
 * Initialize touch controls with callbacks
 * @param {Object} options - Touch options with callbacks
 */
export function initTouch(options = {}) {
  touch.init(options);
}

export function isKeyDown(code) {
  return keys[code] === true;
}

/**
 * Get combined input state from keyboard and touch
 * Touch provides analog values (-1 to 1) for turn and throttle
 * These are converted to boolean states for compatibility
 */
export function getInputState() {
  // Get touch state
  touchInputState = touch.getTouchInputState();

  // Threshold for converting analog touch to digital input
  const threshold = 0.2;

  // Keyboard inputs
  const keyThrottleUp = isKeyDown('KeyW');
  const keyThrottleDown = isKeyDown('KeyS');
  const keyTurnLeft = isKeyDown('KeyA');
  const keyTurnRight = isKeyDown('KeyD');
  const keyClimbUp = isKeyDown('KeyE');
  const keyClimbDown = isKeyDown('KeyQ');

  // Touch inputs (converted to boolean)
  const touchThrottleUp = touchInputState.throttle > threshold;
  const touchThrottleDown = touchInputState.throttle < -threshold;
  const touchTurnLeft = touchInputState.turn < -threshold;
  const touchTurnRight = touchInputState.turn > threshold;

  return {
    // Combine keyboard and touch (either triggers the action)
    throttleUp: keyThrottleUp || touchThrottleUp,
    throttleDown: keyThrottleDown || touchThrottleDown,
    turnLeft: keyTurnLeft || touchTurnLeft,
    turnRight: keyTurnRight || touchTurnRight,
    climbUp: keyClimbUp,
    climbDown: keyClimbDown,
    centerStick: isKeyDown('Space'),  // Center turn stick
    lock: isKeyDown('Space'),
    fire: isKeyDown('KeyF'),
    advanceTime: isKeyDown('KeyT'),
    advanceSeason: isKeyDown('KeyY'),

    // Analog touch values for smoother control (optional use by aircraft)
    touchActive: touchInputState.active,
    touchTurn: touchInputState.turn,
    touchThrottle: touchInputState.throttle,
  };
}
