/**
 * Manages screen transitions and the active screen stack.
 * Injects CSS and provides the root container for all screens.
 */
export class ScreenManager {
  constructor(rootElement) {
    this.root = rootElement;
    this.screens = new Map();
    this.activeScreen = null;
    this.screenStack = [];

    this._injectStyles();
  }

  /**
   * Register a screen class with a name
   * @param {string} name - Screen identifier
   * @param {typeof Screen} ScreenClass - Screen class to instantiate
   */
  register(name, ScreenClass) {
    this.screens.set(name, new ScreenClass(this));
  }

  /**
   * Transition to a named screen
   * @param {string} name - Screen name
   * @param {Object} [params] - Parameters to pass to the screen
   * @param {boolean} [pushStack=true] - Whether to push current screen to stack
   */
  async goto(name, params = {}, pushStack = true) {
    const screen = this.screens.get(name);
    if (!screen) {
      console.error(`Screen not found: ${name}`);
      return;
    }

    // Hide current screen
    if (this.activeScreen) {
      if (pushStack) {
        this.screenStack.push(this.activeScreen);
      }
      await this.activeScreen.hide();
    }

    // Show new screen
    this.activeScreen = screen;
    await screen.show(params);
  }

  /**
   * Go back to previous screen in stack
   */
  async back() {
    if (this.screenStack.length === 0) return;

    const previousScreen = this.screenStack.pop();

    if (this.activeScreen) {
      await this.activeScreen.hide();
    }

    this.activeScreen = previousScreen;
    await previousScreen.show();
  }

  /**
   * Get root element for screen containers
   */
  getRoot() {
    return this.root;
  }

  /**
   * Call update on active screen (for game loop integration)
   */
  update(deltaTime) {
    if (this.activeScreen) {
      this.activeScreen.update(deltaTime);
    }
  }

  /**
   * Inject CSS styles for screens
   */
  _injectStyles() {
    if (document.getElementById('screen-styles')) return;

    const style = document.createElement('style');
    style.id = 'screen-styles';
    style.textContent = SCREEN_CSS;
    document.head.appendChild(style);
  }
}

const SCREEN_CSS = `
/* Screen container base */
.screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: #0a0a12;
  z-index: 500;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.screen.visible {
  opacity: 1;
  pointer-events: auto;
}

.screen.hidden {
  opacity: 0;
  pointer-events: none;
}

/* Typography */
.screen-title {
  color: #4a9;
  font-family: monospace;
  font-size: 32px;
  letter-spacing: 4px;
  margin-bottom: 48px;
  text-transform: uppercase;
}

.screen-subtitle {
  color: #888;
  font-family: monospace;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 24px;
}

/* Buttons */
.menu-btn {
  display: block;
  width: 280px;
  padding: 16px 24px;
  margin: 8px 0;
  background: #1a1a2e;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #4a9;
  font-family: monospace;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.1s;
}

.menu-btn:hover {
  background: #252540;
  border-color: #4a9;
}

.menu-btn:active {
  transform: scale(0.98);
}

.menu-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.menu-btn:disabled:hover {
  background: #1a1a2e;
  border-color: #2a2a4a;
}

.menu-btn.primary {
  background: #1a3a2e;
  border-color: #4a9;
}

.menu-btn.primary:hover {
  background: #254a3e;
}

.menu-btn.danger {
  border-color: #944;
}

.menu-btn.danger:hover {
  background: #2e1a1a;
  border-color: #c66;
}

/* Form controls */
.form-group {
  margin-bottom: 16px;
  width: 100%;
}

.form-label {
  display: block;
  color: #888;
  font-family: monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.form-input,
.form-select {
  width: 100%;
  padding: 10px 12px;
  background: #1a1a24;
  border: 1px solid #2a2a3a;
  border-radius: 4px;
  color: #4a9;
  font-family: monospace;
  font-size: 13px;
  box-sizing: border-box;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: #4a9;
}

.form-select option {
  background: #1a1a24;
  color: #4a9;
}

/* Panel / Card */
.panel {
  background: #12121a;
  border: 1px solid #2a2a3a;
  border-radius: 8px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
}

/* Island Preview Canvas Container */
.preview-container {
  width: 100%;
  aspect-ratio: 4/3;
  background: #0a0a12;
  border: 1px solid #2a2a3a;
  border-radius: 4px;
  overflow: hidden;
  margin: 16px 0;
}

.preview-container canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* Save list */
.save-list {
  max-height: 300px;
  overflow-y: auto;
  margin: 16px 0;
}

.save-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #1a1a24;
  border: 1px solid #2a2a3a;
  border-radius: 4px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.save-item:hover {
  background: #252530;
  border-color: #4a9;
}

.save-item.selected {
  border-color: #4a9;
  background: #1a2a24;
}

.save-item-info {
  flex: 1;
}

.save-item-name {
  color: #4a9;
  font-family: monospace;
  font-size: 14px;
  margin-bottom: 4px;
}

.save-item-meta {
  color: #666;
  font-family: monospace;
  font-size: 11px;
}

/* Two-column layout for campaign screens */
.screen-layout {
  display: flex;
  gap: 32px;
  max-width: 900px;
  width: 90%;
}

.screen-sidebar {
  width: 320px;
  flex-shrink: 0;
}

.screen-main {
  flex: 1;
  min-width: 0;
}

/* Empty state */
.empty-state {
  color: #666;
  font-family: monospace;
  font-size: 13px;
  text-align: center;
  padding: 40px 20px;
}

/* Button row */
.btn-row {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-row .menu-btn {
  flex: 1;
  text-align: center;
}

/* Preview stats */
.preview-stats {
  color: #888;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  padding: 12px;
  background: #12121a;
  border: 1px solid #2a2a3a;
  border-radius: 4px;
}

.preview-stats strong {
  color: #4a9;
}

/* Seed row with button */
.seed-row {
  display: flex;
  gap: 8px;
}

.seed-row .form-input {
  flex: 1;
}

.seed-row .menu-btn {
  width: auto;
  padding: 10px 16px;
  margin: 0;
}

/* Responsive adjustments */
@media (max-width: 800px) {
  .screen-layout {
    flex-direction: column;
  }

  .screen-sidebar {
    width: 100%;
  }
}
`;
