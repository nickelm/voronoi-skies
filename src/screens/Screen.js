/**
 * Base class for all game screens.
 * Each screen manages its own DOM container and lifecycle.
 */
export class Screen {
  /**
   * @param {ScreenManager} manager - Parent screen manager
   */
  constructor(manager) {
    this.manager = manager;
    this.container = null;
    this.isVisible = false;
  }

  /**
   * Create DOM elements for this screen.
   * Called once when screen is first shown.
   * @returns {HTMLElement} The screen's root container
   */
  create() {
    throw new Error('Screen.create() must be implemented');
  }

  /**
   * Show the screen with optional transition.
   * @param {Object} [params] - Parameters passed from previous screen
   * @returns {Promise<void>}
   */
  async show(params = {}) {
    if (!this.container) {
      this.container = this.create();
      this.manager.getRoot().appendChild(this.container);
    }
    this.container.classList.remove('hidden');
    // Force reflow before adding visible class for CSS transition
    this.container.offsetHeight;
    this.container.classList.add('visible');
    this.isVisible = true;
    this.onShow(params);
  }

  /**
   * Hide the screen with optional transition.
   * @returns {Promise<void>}
   */
  async hide() {
    if (this.container) {
      this.container.classList.remove('visible');
      this.container.classList.add('hidden');
    }
    this.isVisible = false;
    this.onHide();
  }

  /**
   * Called each frame while screen is visible.
   * Override for screens that need animation/updates.
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    // Override in subclasses
  }

  /**
   * Clean up resources when screen is permanently removed.
   */
  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.onDispose();
  }

  // Lifecycle hooks for subclasses
  onShow(params) {}
  onHide() {}
  onDispose() {}
}
