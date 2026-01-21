/**
 * Touch input handling for aircraft control
 *
 * Touch zones:
 * - Center area (aircraft): Drag for steering and throttle
 *   - Horizontal drag = turn left/right
 *   - Vertical drag = speed up/down
 *
 * Gestures:
 * - Single tap: Drop a view (key '9')
 * - Double tap: Clear all views (shift+9)
 */

// Touch state
const touchState = {
  active: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  deltaX: 0,  // Normalized -1 to 1
  deltaY: 0,  // Normalized -1 to 1
};

// Configuration
const config = {
  // Dead zone radius in pixels - touch must move beyond this to register as drag
  deadZone: 20,
  // Maximum drag distance for full input (pixels)
  maxDragDistance: 150,
  // Tap detection: max time (ms) and max movement (px)
  tapMaxTime: 300,
  tapMaxDistance: 20,
  // Double tap: max time between taps (ms)
  doubleTapMaxInterval: 400,
  // Center zone radius - only touches in this area control aircraft
  centerZoneRadius: 200,
};

// Tap detection state
let tapStartTime = 0;
let tapStartX = 0;
let tapStartY = 0;
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;

// Callbacks
let onSingleTap = null;
let onDoubleTap = null;

/**
 * Initialize touch input handling
 * @param {Object} options - Configuration options
 * @param {Function} options.onSingleTap - Callback for single tap
 * @param {Function} options.onDoubleTap - Callback for double tap
 */
export function init(options = {}) {
  onSingleTap = options.onSingleTap || null;
  onDoubleTap = options.onDoubleTap || null;

  // Touch events
  window.addEventListener('touchstart', handleTouchStart, { passive: false });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handleTouchEnd, { passive: false });
  window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  console.log('Touch controls initialized');
}

/**
 * Check if a position is within the center control zone
 * @param {number} x - Screen X position
 * @param {number} y - Screen Y position
 * @returns {boolean}
 */
function isInCenterZone(x, y) {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const dist = Math.hypot(x - centerX, y - centerY);
  return dist <= config.centerZoneRadius;
}

/**
 * Handle touch start
 * @param {TouchEvent} e
 */
function handleTouchStart(e) {
  if (e.touches.length !== 1) return;

  const touch = e.touches[0];
  const x = touch.clientX;
  const y = touch.clientY;

  // Record tap start for gesture detection
  tapStartTime = performance.now();
  tapStartX = x;
  tapStartY = y;

  // Only start drag control if in center zone
  if (isInCenterZone(x, y)) {
    touchState.active = true;
    touchState.startX = x;
    touchState.startY = y;
    touchState.currentX = x;
    touchState.currentY = y;
    touchState.deltaX = 0;
    touchState.deltaY = 0;

    // Prevent default to avoid scrolling
    e.preventDefault();
  }
}

/**
 * Handle touch move
 * @param {TouchEvent} e
 */
function handleTouchMove(e) {
  if (!touchState.active || e.touches.length !== 1) return;

  const touch = e.touches[0];
  touchState.currentX = touch.clientX;
  touchState.currentY = touch.clientY;

  // Calculate drag distance from start
  const dx = touchState.currentX - touchState.startX;
  const dy = touchState.currentY - touchState.startY;
  const dist = Math.hypot(dx, dy);

  // Apply dead zone
  if (dist < config.deadZone) {
    touchState.deltaX = 0;
    touchState.deltaY = 0;
  } else {
    // Normalize to -1 to 1 range based on max drag distance
    // Subtract dead zone from effective distance
    const effectiveDist = dist - config.deadZone;
    const maxEffective = config.maxDragDistance - config.deadZone;

    // Calculate direction
    const angle = Math.atan2(dy, dx);

    // Scale by effective distance, clamped to max
    const scale = Math.min(1, effectiveDist / maxEffective);

    touchState.deltaX = Math.cos(angle) * scale;
    touchState.deltaY = Math.sin(angle) * scale;
  }

  // Prevent default to avoid scrolling
  e.preventDefault();
}

/**
 * Handle touch end
 * @param {TouchEvent} e
 */
function handleTouchEnd(e) {
  const now = performance.now();
  const tapDuration = now - tapStartTime;
  const tapDistance = Math.hypot(
    (e.changedTouches[0]?.clientX || tapStartX) - tapStartX,
    (e.changedTouches[0]?.clientY || tapStartY) - tapStartY
  );

  // Check if this was a tap (short duration, small movement)
  if (tapDuration < config.tapMaxTime && tapDistance < config.tapMaxDistance) {
    const timeSinceLastTap = now - lastTapTime;
    const distFromLastTap = Math.hypot(tapStartX - lastTapX, tapStartY - lastTapY);

    // Check for double tap
    if (timeSinceLastTap < config.doubleTapMaxInterval && distFromLastTap < config.tapMaxDistance * 2) {
      // Double tap detected
      if (onDoubleTap) {
        onDoubleTap();
      }
      // Reset to prevent triple tap triggering another double tap
      lastTapTime = 0;
      lastTapX = 0;
      lastTapY = 0;
    } else {
      // Potential single tap - wait briefly to see if it becomes a double tap
      // For immediate response, we fire single tap right away
      // Double tap will fire its own action
      if (onSingleTap) {
        onSingleTap();
      }
      lastTapTime = now;
      lastTapX = tapStartX;
      lastTapY = tapStartY;
    }
  }

  // Reset touch state
  touchState.active = false;
  touchState.deltaX = 0;
  touchState.deltaY = 0;
}

/**
 * Get current touch input state for aircraft control
 * @returns {Object} Touch input state with turn and throttle values
 */
export function getTouchInputState() {
  return {
    active: touchState.active,
    // Horizontal = turn: positive = right, negative = left
    turn: touchState.deltaX,
    // Vertical = throttle: negative (up) = speed up, positive (down) = slow down
    // Invert Y so dragging up increases speed
    throttle: -touchState.deltaY,
  };
}

/**
 * Check if touch is currently active
 * @returns {boolean}
 */
export function isTouchActive() {
  return touchState.active;
}
