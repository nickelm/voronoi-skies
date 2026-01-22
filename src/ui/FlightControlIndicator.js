/**
 * FlightControlIndicator - DOM-based HUD widget showing throttle,
 * stick position, and flight status indicators.
 *
 * 8-bit pixel art aesthetic: hard edges, 1px borders, no gradients.
 */
export class FlightControlIndicator {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Parent element (game-container)
   * @param {Object} [options.position] - Position {x, y} in pixels from bottom-left
   */
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.position = options.position || { x: 16, y: 16 };

    this.element = null;
    this.throttleFill = null;
    this.stickDot = null;
    this.statusLights = {};

    this._createDOM();
  }

  _createDOM() {
    // Main container
    this.element = document.createElement('div');
    this.element.id = 'flight-control-indicator';
    this.element.style.cssText = `
      position: fixed;
      bottom: ${this.position.y}px;
      left: ${this.position.x}px;
      display: flex;
      flex-direction: row;
      gap: 8px;
      opacity: 0.5;
      transition: opacity 0.15s;
      pointer-events: none;
      z-index: 100;
      font-family: monospace;
    `;

    // Throttle bar
    const throttle = this._createThrottleBar();
    this.element.appendChild(throttle);

    // Stick indicator
    const stick = this._createStickIndicator();
    this.element.appendChild(stick);

    // Status lights
    const status = this._createStatusLights();
    this.element.appendChild(status);

    this.container.appendChild(this.element);
  }

  _createThrottleBar() {
    const throttle = document.createElement('div');
    throttle.style.cssText = `
      position: relative;
      width: 16px;
      height: 60px;
      background: #1a1a1a;
      border: 1px solid #444;
    `;

    // AB zone (top 33%)
    const abZone = document.createElement('div');
    abZone.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 33%;
      background: #331111;
      border-bottom: 1px solid #444;
    `;
    throttle.appendChild(abZone);

    // Fill element
    this.throttleFill = document.createElement('div');
    this.throttleFill.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 50%;
      background: #4a4;
    `;
    throttle.appendChild(this.throttleFill);

    // Military power line (at 67% from bottom = 33% from top)
    const milLine = document.createElement('div');
    milLine.style.cssText = `
      position: absolute;
      top: 33%;
      left: 0;
      width: 100%;
      height: 1px;
      background: #888;
    `;
    throttle.appendChild(milLine);

    return throttle;
  }

  _createStickIndicator() {
    const stick = document.createElement('div');
    stick.style.cssText = `
      position: relative;
      width: 50px;
      height: 50px;
      background: #1a1a1a;
      border: 1px solid #444;
    `;

    // Vertical crosshair line
    const vLine = document.createElement('div');
    vLine.style.cssText = `
      position: absolute;
      top: 0;
      left: 50%;
      width: 1px;
      height: 100%;
      background: #333;
      transform: translateX(-50%);
    `;
    stick.appendChild(vLine);

    // Horizontal crosshair line
    const hLine = document.createElement('div');
    hLine.style.cssText = `
      position: absolute;
      top: 50%;
      left: 0;
      width: 100%;
      height: 1px;
      background: #333;
      transform: translateY(-50%);
    `;
    stick.appendChild(hLine);

    // Center dot (2x2px neutral marker)
    const centerDot = document.createElement('div');
    centerDot.style.cssText = `
      position: absolute;
      width: 2px;
      height: 2px;
      background: #555;
      left: 24px;
      top: 24px;
    `;
    stick.appendChild(centerDot);

    // Position dot (6x6px)
    this.stickDot = document.createElement('div');
    this.stickDot.style.cssText = `
      position: absolute;
      width: 6px;
      height: 6px;
      background: #4a4;
      left: 22px;
      top: 22px;
    `;
    stick.appendChild(this.stickDot);

    return stick;
  }

  _createStatusLights() {
    const status = document.createElement('div');
    status.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    const lights = [
      { key: 'afterburner', label: 'AB', color: '#f80' },
      { key: 'speedBrake', label: 'S', color: '#cc0' },
      { key: 'flaps', label: 'F', color: '#cc0' },
      { key: 'gear', label: 'G', color: '#0c0' }
    ];

    lights.forEach(({ key, label, color }) => {
      const light = document.createElement('div');
      light.style.cssText = `
        width: 20px;
        height: 12px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        color: #2a2a2a;
        font-size: 8px;
        line-height: 12px;
        text-align: center;
      `;
      light.textContent = label;
      light.dataset.onColor = color;
      status.appendChild(light);
      this.statusLights[key] = light;
    });

    return status;
  }

  /**
   * Update widget display from current flight state
   * @param {Object} flightState
   * @param {number} flightState.throttle - 0 to 1.5
   * @param {number} flightState.stickX - -1 to 1
   * @param {number} flightState.stickY - -1 to 1
   * @param {Object} flightState.status - Status light states
   * @param {boolean} flightState.inputActive - Whether any input is active
   */
  update(flightState) {
    const { throttle, stickX, stickY, status, inputActive } = flightState;

    // Update opacity based on input activity
    this.element.style.opacity = inputActive ? '0.7' : '0.5';

    // Update throttle fill
    // 0-1 maps to 0-67% (normal range), 1-1.5 maps to 67-100% (AB range)
    const clampedThrottle = Math.max(0, Math.min(1.5, throttle));
    const fillPercent = (clampedThrottle / 1.5) * 100;
    this.throttleFill.style.height = `${fillPercent}%`;
    this.throttleFill.style.background = throttle > 1.0 ? '#f84' : '#4a4';

    // Update stick dot position
    // stickX: -1 to 1 maps to 3px to 41px (center at 22, range ±19)
    // stickY: -1 to 1 maps to 41px to 3px (inverted, up = negative in screen coords)
    const dotX = 22 + stickX * 19;
    const dotY = 22 - stickY * 19;
    this.stickDot.style.left = `${dotX}px`;
    this.stickDot.style.top = `${dotY}px`;
    this.stickDot.style.background = inputActive ? '#6c6' : '#4a4';

    // Update status lights
    this._updateStatusLight('afterburner', status.afterburner, true);
    this._updateStatusLight('speedBrake', status.speedBrake, false);
    this._updateStatusLight('flaps', status.flaps, false);
    this._updateStatusLight('gear', status.gear, false);
  }

  _updateStatusLight(key, isOn, isEnabled) {
    const light = this.statusLights[key];
    if (!light) return;

    const onColor = light.dataset.onColor || '#4a4';

    if (!isEnabled) {
      // Disabled state - dimmed appearance
      light.style.background = '#1a1a1a';
      light.style.color = '#2a2a2a';
      light.style.borderColor = '#2a2a2a';
    } else if (isOn) {
      // On state - lit with indicator color
      light.style.background = onColor;
      light.style.color = '#fff';
      light.style.borderColor = onColor;
    } else {
      // Off but enabled
      light.style.background = '#222';
      light.style.color = '#444';
      light.style.borderColor = '#444';
    }
  }

  /**
   * Show or hide the widget
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.element.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Clean up DOM elements
   */
  dispose() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.throttleFill = null;
    this.stickDot = null;
    this.statusLights = {};
  }
}
