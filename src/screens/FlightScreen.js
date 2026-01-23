import { Screen } from './Screen.js';
import * as game from '../game.js';

/**
 * Flight screen that wraps the main game.
 * Handles game initialization, loop control, and cleanup.
 */
export class FlightScreen extends Screen {
  constructor(manager) {
    super(manager);
    this.campaign = null;
    this.isRunning = false;
    this.animationFrameId = null;
  }

  create() {
    const container = document.createElement('div');
    container.className = 'screen flight-screen';
    container.style.background = 'transparent';
    container.style.pointerEvents = 'none';
    return container;
  }

  async show(params = {}) {
    await super.show(params);

    // Store campaign
    this.campaign = params.campaign;

    // Get world seed from campaign or default
    const worldSeed = this.campaign?.seed ?? 42;

    // Initialize the game
    await game.initGame(worldSeed);

    // Start game loop
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  async hide() {
    // Stop game loop
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Clean up game
    game.stopGame();

    await super.hide();
  }

  gameLoop(currentTime) {
    if (!this.isRunning) return;

    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Check for escape key to return to menu
    if (game.shouldReturnToMenu()) {
      this.manager.goto('main-menu', {}, false);
      return;
    }

    // Run game update and render
    game.update(deltaTime);
    game.render();
    game.updateDebug(deltaTime);

    // Continue loop
    this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }
}
