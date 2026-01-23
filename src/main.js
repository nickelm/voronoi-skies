/**
 * Voronoi Skies - Entry Point
 *
 * Sets up the ScreenManager and registers all screens.
 * The game starts at the Main Menu.
 */

import { ScreenManager } from './screens/ScreenManager.js';
import { MainMenuScreen } from './screens/MainMenuScreen.js';
import { NewCampaignScreen } from './screens/NewCampaignScreen.js';
import { LoadCampaignScreen } from './screens/LoadCampaignScreen.js';
import { FlightScreen } from './screens/FlightScreen.js';

let screenManager = null;

function init() {
  // Hide the loading overlay (it's for flight mode, not menus)
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }

  // Get game container
  const container = document.getElementById('game-container');

  // Create screen manager
  screenManager = new ScreenManager(container);

  // Register screens
  screenManager.register('main-menu', MainMenuScreen);
  screenManager.register('new-campaign', NewCampaignScreen);
  screenManager.register('load-campaign', LoadCampaignScreen);
  screenManager.register('flight', FlightScreen);

  // Start at main menu
  screenManager.goto('main-menu');

  console.log('Voronoi Skies initialized - Main Menu');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
