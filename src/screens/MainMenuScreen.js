import { Screen } from './Screen.js';
import { CampaignPersistence } from '../campaign/CampaignPersistence.js';

/**
 * Main menu screen with title and navigation buttons.
 */
export class MainMenuScreen extends Screen {
  create() {
    const container = document.createElement('div');
    container.className = 'screen';
    container.innerHTML = `
      <h1 class="screen-title">Voronoi Skies</h1>
      <div class="menu-container">
        <button class="menu-btn primary" data-action="new-campaign">
          New Campaign
        </button>
        <button class="menu-btn" data-action="continue">
          Continue
        </button>
        <button class="menu-btn" data-action="single-mission" disabled>
          Single Mission
        </button>
        <button class="menu-btn" data-action="settings" disabled>
          Settings
        </button>
      </div>
    `;

    // Cache button references
    this.continueBtn = container.querySelector('[data-action="continue"]');

    // Bind event listeners
    container
      .querySelector('[data-action="new-campaign"]')
      .addEventListener('click', () => this.manager.goto('new-campaign'));

    this.continueBtn.addEventListener('click', () =>
      this.manager.goto('load-campaign')
    );

    return container;
  }

  onShow() {
    // Enable/disable continue button based on saved campaigns
    const hasSaves = CampaignPersistence.hasAnySaves();
    this.continueBtn.disabled = !hasSaves;
  }
}
