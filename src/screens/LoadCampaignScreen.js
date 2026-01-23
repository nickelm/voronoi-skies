import { Screen } from './Screen.js';
import { CampaignPersistence } from '../campaign/CampaignPersistence.js';
import { generate } from '../terrain/island/IslandGenerator.js';
import { mergeTemplate, getTemplate } from '../terrain/island/IslandTemplates.js';
import { StrategicMapRenderer } from '../ui/strategic/index.js';

/**
 * Load campaign screen with save list and preview.
 */
export class LoadCampaignScreen extends Screen {
  constructor(manager) {
    super(manager);
    this.selectedCampaign = null;
    this.previewRenderer = null;
    this.previewCanvas = null;
    this.isGenerating = false;
  }

  create() {
    const container = document.createElement('div');
    container.className = 'screen';

    container.innerHTML = `
      <div class="screen-layout">
        <div class="screen-sidebar panel">
          <h2 class="screen-subtitle">Load Campaign</h2>

          <div class="save-list" id="save-list">
            <!-- Populated dynamically -->
          </div>

          <div class="btn-row">
            <button class="menu-btn" id="back-btn">Back</button>
            <button class="menu-btn primary" id="load-btn" disabled>Load</button>
          </div>

          <button class="menu-btn danger" id="delete-btn" disabled style="margin-top: 8px; width: 100%;">
            Delete Selected
          </button>
        </div>

        <div class="screen-main">
          <div class="preview-container" id="preview-container">
            <canvas id="preview-canvas"></canvas>
          </div>
          <div id="campaign-details" class="empty-state">
            Select a campaign to preview
          </div>
        </div>
      </div>
    `;

    // Cache references
    this.saveListEl = container.querySelector('#save-list');
    this.previewCanvas = container.querySelector('#preview-canvas');
    this.previewContainer = container.querySelector('#preview-container');
    this.detailsEl = container.querySelector('#campaign-details');
    this.loadBtn = container.querySelector('#load-btn');
    this.deleteBtn = container.querySelector('#delete-btn');

    // Bind events
    container
      .querySelector('#back-btn')
      .addEventListener('click', () => this.manager.back());

    this.loadBtn.addEventListener('click', () => this.loadCampaign());
    this.deleteBtn.addEventListener('click', () => this.deleteSelected());

    return container;
  }

  onShow() {
    this.refreshSaveList();
    this.resizeCanvas();
    this._resizeHandler = () => this.resizeCanvas();
    window.addEventListener('resize', this._resizeHandler);
  }

  onHide() {
    window.removeEventListener('resize', this._resizeHandler);
    this.disposePreview();
    this.selectedCampaign = null;
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

  refreshSaveList() {
    const saves = CampaignPersistence.list();

    if (saves.length === 0) {
      this.saveListEl.innerHTML = `
        <div class="empty-state">No saved campaigns</div>
      `;
      return;
    }

    this.saveListEl.innerHTML = saves
      .map(
        (save) => `
      <div class="save-item" data-id="${save.id}">
        <div class="save-item-info">
          <div class="save-item-name">${this._escapeHtml(save.name)}</div>
          <div class="save-item-meta">
            ${this._formatTemplateName(save.template)} |
            Seed: ${save.seed} |
            ${this._formatDate(save.lastPlayed || save.createdAt)}
          </div>
        </div>
      </div>
    `
      )
      .join('');

    // Bind click events
    this.saveListEl.querySelectorAll('.save-item').forEach((item) => {
      item.addEventListener('click', () => this.selectCampaign(item.dataset.id));
    });
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _formatTemplateName(templateKey) {
    const template = getTemplate(templateKey);
    return template?.name || templateKey.replace(/_/g, ' ');
  }

  _formatDate(timestamp) {
    if (!timestamp) return 'Unknown date';
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }

  _formatPlayTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  selectCampaign(id) {
    // Update selection UI
    this.saveListEl.querySelectorAll('.save-item').forEach((item) => {
      item.classList.toggle('selected', item.dataset.id === id);
    });

    // Load campaign data
    this.selectedCampaign = CampaignPersistence.load(id);

    if (!this.selectedCampaign) {
      this.detailsEl.textContent = 'Campaign not found';
      this.detailsEl.className = 'empty-state';
      this.loadBtn.disabled = true;
      this.deleteBtn.disabled = true;
      return;
    }

    this.loadBtn.disabled = false;
    this.deleteBtn.disabled = false;

    // Generate preview
    this.generatePreview();
  }

  generatePreview() {
    if (!this.selectedCampaign || this.isGenerating) return;
    this.isGenerating = true;

    this.detailsEl.textContent = 'Loading preview...';
    this.detailsEl.className = 'empty-state';

    setTimeout(() => {
      try {
        const config = mergeTemplate(this.selectedCampaign.template, {
          seed: this.selectedCampaign.seed,
        });

        const island = generate(config);

        this.disposePreview();

        this.previewRenderer = new StrategicMapRenderer({
          canvas: this.previewCanvas,
          island: island,
          viewMode: 'terrain',
        });

        this.previewRenderer.fitToIsland();

        // Show details
        const c = this.selectedCampaign;
        this.detailsEl.innerHTML = `
          <strong>${this._escapeHtml(c.name)}</strong><br>
          Template: ${this._formatTemplateName(c.template)}<br>
          Difficulty: ${c.difficulty}<br>
          Missions: ${c.missionsCompleted || 0}<br>
          Play time: ${this._formatPlayTime(c.playTime || 0)}
        `;
        this.detailsEl.className = 'preview-stats';
      } catch (error) {
        this.detailsEl.textContent = `Error: ${error.message}`;
        this.detailsEl.className = 'empty-state';
      }
      this.isGenerating = false;
    }, 50);
  }

  disposePreview() {
    if (this.previewRenderer) {
      this.previewRenderer.dispose();
      this.previewRenderer = null;
    }
  }

  loadCampaign() {
    if (!this.selectedCampaign) return;

    // Update last played timestamp
    this.selectedCampaign.lastPlayed = Date.now();
    CampaignPersistence.save(this.selectedCampaign);

    // Go to flight screen
    this.manager.goto('flight', { campaign: this.selectedCampaign }, false);
  }

  deleteSelected() {
    if (!this.selectedCampaign) return;

    if (confirm(`Delete campaign "${this.selectedCampaign.name}"?`)) {
      CampaignPersistence.delete(this.selectedCampaign.id);
      this.selectedCampaign = null;
      this.disposePreview();
      this.refreshSaveList();
      this.detailsEl.innerHTML =
        '<span class="empty-state">Select a campaign to preview</span>';
      this.detailsEl.className = 'empty-state';
      this.loadBtn.disabled = true;
      this.deleteBtn.disabled = true;
    }
  }
}
