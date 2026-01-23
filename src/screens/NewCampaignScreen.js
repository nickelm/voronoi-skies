import { Screen } from './Screen.js';
import { generate } from '../terrain/island/IslandGenerator.js';
import {
  getTemplateNames,
  getTemplate,
  mergeTemplate,
} from '../terrain/island/IslandTemplates.js';
import { StrategicMapRenderer } from '../ui/strategic/index.js';
import { CampaignPersistence } from '../campaign/CampaignPersistence.js';
import { CampaignState } from '../campaign/CampaignState.js';

/**
 * New campaign configuration screen with island preview.
 */
export class NewCampaignScreen extends Screen {
  constructor(manager) {
    super(manager);
    this.previewRenderer = null;
    this.currentIsland = null;
    this.previewCanvas = null;
    this.isGenerating = false;
  }

  create() {
    const container = document.createElement('div');
    container.className = 'screen';

    // Template options from IslandTemplates
    const templates = getTemplateNames();
    const templateOptions = templates
      .map((t) => {
        const template = getTemplate(t);
        const displayName = template?.name || t.replace(/_/g, ' ');
        return `<option value="${t}">${displayName}</option>`;
      })
      .join('');

    container.innerHTML = `
      <div class="screen-layout">
        <div class="screen-sidebar panel">
          <h2 class="screen-subtitle">New Campaign</h2>

          <div class="form-group">
            <label class="form-label" for="campaign-name">Campaign Name</label>
            <input type="text" id="campaign-name" class="form-input"
                   placeholder="My Campaign" value="New Campaign">
          </div>

          <div class="form-group">
            <label class="form-label" for="island-template">Island Template</label>
            <select id="island-template" class="form-select">
              ${templateOptions}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="world-seed">World Seed</label>
            <div class="seed-row">
              <input type="number" id="world-seed" class="form-input"
                     value="${Math.floor(Math.random() * 1000000)}">
              <button class="menu-btn" id="random-seed">
                Random
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="difficulty">Difficulty</label>
            <select id="difficulty" class="form-select">
              <option value="easy">Easy</option>
              <option value="normal" selected>Normal</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <button class="menu-btn" id="preview-btn" style="width: 100%;">
            Generate Preview
          </button>

          <div class="btn-row">
            <button class="menu-btn" id="back-btn">Back</button>
            <button class="menu-btn primary" id="start-btn" disabled>Start</button>
          </div>
        </div>

        <div class="screen-main">
          <div class="preview-container" id="preview-container">
            <canvas id="preview-canvas"></canvas>
          </div>
          <div id="preview-stats" class="empty-state">
            Click "Generate Preview" to see island
          </div>
        </div>
      </div>
    `;

    // Cache DOM references
    this.previewCanvas = container.querySelector('#preview-canvas');
    this.previewContainer = container.querySelector('#preview-container');
    this.statsEl = container.querySelector('#preview-stats');
    this.startBtn = container.querySelector('#start-btn');
    this.previewBtn = container.querySelector('#preview-btn');
    this.nameInput = container.querySelector('#campaign-name');
    this.templateSelect = container.querySelector('#island-template');
    this.seedInput = container.querySelector('#world-seed');
    this.difficultySelect = container.querySelector('#difficulty');

    // Bind events
    container
      .querySelector('#back-btn')
      .addEventListener('click', () => this.manager.back());

    this.previewBtn.addEventListener('click', () => this.generatePreview());

    container.querySelector('#random-seed').addEventListener('click', () => {
      this.seedInput.value = Math.floor(Math.random() * 1000000);
    });

    this.startBtn.addEventListener('click', () => this.startCampaign());

    // Auto-generate on template change if we already have a preview
    this.templateSelect.addEventListener('change', () => {
      if (this.currentIsland) this.generatePreview();
    });

    return container;
  }

  onShow() {
    // Resize canvas to container
    this.resizeCanvas();
    this._resizeHandler = () => this.resizeCanvas();
    window.addEventListener('resize', this._resizeHandler);
  }

  onHide() {
    window.removeEventListener('resize', this._resizeHandler);
    this.disposePreview();
  }

  onDispose() {
    this.disposePreview();
  }

  resizeCanvas() {
    if (!this.previewCanvas || !this.previewContainer) return;
    const rect = this.previewContainer.getBoundingClientRect();
    this.previewCanvas.width = rect.width;
    this.previewCanvas.height = rect.height;
    if (this.previewRenderer) {
      this.previewRenderer.resize();
      this.previewRenderer.fitToIsland();
    }
  }

  generatePreview() {
    if (this.isGenerating) return;
    this.isGenerating = true;

    this.statsEl.textContent = 'Generating island...';
    this.statsEl.className = 'empty-state';
    this.startBtn.disabled = true;
    this.previewBtn.disabled = true;

    // Use setTimeout to let UI update
    setTimeout(() => {
      try {
        const seed = parseInt(this.seedInput.value) || 42;
        const templateName = this.templateSelect.value;

        // Merge template with seed
        const config = mergeTemplate(templateName, { seed });

        // Generate island
        const island = generate(config);
        this.currentIsland = island;

        // Dispose old renderer
        this.disposePreview();

        // Create new renderer
        this.previewRenderer = new StrategicMapRenderer({
          canvas: this.previewCanvas,
          island: island,
          viewMode: 'terrain',
        });

        this.previewRenderer.fitToIsland();

        // Update stats
        const landRegions = island.regions.filter((r) => !r.isOcean);
        const landRatio = ((landRegions.length / island.regions.length) * 100).toFixed(1);
        const template = getTemplate(templateName);

        this.statsEl.innerHTML = `
          <strong>${template?.name || templateName}</strong><br>
          Seed: ${seed}<br>
          Regions: ${island.regions.length} | Land: ${landRatio}%
        `;
        this.statsEl.className = 'preview-stats';

        this.startBtn.disabled = false;
      } catch (error) {
        console.error('Failed to generate island:', error);
        this.statsEl.textContent = `Error: ${error.message}`;
        this.statsEl.className = 'empty-state';
      }

      this.previewBtn.disabled = false;
      this.isGenerating = false;
    }, 50);
  }

  disposePreview() {
    if (this.previewRenderer) {
      this.previewRenderer.dispose();
      this.previewRenderer = null;
    }
  }

  startCampaign() {
    if (!this.currentIsland) return;

    // Create campaign state
    const campaign = new CampaignState({
      name: this.nameInput.value || 'Unnamed Campaign',
      seed: parseInt(this.seedInput.value),
      template: this.templateSelect.value,
      difficulty: this.difficultySelect.value,
      createdAt: Date.now(),
    });

    // Save to localStorage
    CampaignPersistence.save(campaign);

    // Transition to flight screen with campaign
    this.manager.goto('flight', { campaign }, false);
  }
}
