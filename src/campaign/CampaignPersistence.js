import { CampaignState } from './CampaignState.js';

const STORAGE_KEY = 'voronoi-skies-campaigns';
const MAX_CAMPAIGNS = 10;

/**
 * Handles save/load of campaigns to localStorage.
 * Each campaign is stored with a unique ID.
 */
export class CampaignPersistence {
  /**
   * Save a campaign (create or update)
   * @param {CampaignState} campaign
   */
  static save(campaign) {
    const campaigns = this._loadAll();

    // Find existing or add new
    const index = campaigns.findIndex((c) => c.id === campaign.id);
    if (index >= 0) {
      campaigns[index] = campaign.toJSON();
    } else {
      // Enforce max campaigns
      if (campaigns.length >= MAX_CAMPAIGNS) {
        // Remove oldest by lastPlayed
        campaigns.sort((a, b) => (a.lastPlayed || 0) - (b.lastPlayed || 0));
        campaigns.shift();
      }
      campaigns.push(campaign.toJSON());
    }

    this._saveAll(campaigns);
  }

  /**
   * Load a campaign by ID
   * @param {string} id
   * @returns {CampaignState|null}
   */
  static load(id) {
    const campaigns = this._loadAll();
    const data = campaigns.find((c) => c.id === id);
    if (!data) return null;

    return CampaignState.fromJSON(data);
  }

  /**
   * List all saved campaigns (metadata only for list display)
   * @returns {Array<{id, name, template, seed, createdAt, lastPlayed}>}
   */
  static list() {
    const campaigns = this._loadAll();
    // Sort by last played, most recent first
    campaigns.sort(
      (a, b) => (b.lastPlayed || b.createdAt) - (a.lastPlayed || a.createdAt)
    );
    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      template: c.template,
      seed: c.seed,
      difficulty: c.difficulty,
      createdAt: c.createdAt,
      lastPlayed: c.lastPlayed,
    }));
  }

  /**
   * Delete a campaign by ID
   * @param {string} id
   */
  static delete(id) {
    let campaigns = this._loadAll();
    campaigns = campaigns.filter((c) => c.id !== id);
    this._saveAll(campaigns);
  }

  /**
   * Check if any campaigns exist
   * @returns {boolean}
   */
  static hasAnySaves() {
    return this._loadAll().length > 0;
  }

  // Internal methods
  static _loadAll() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load campaigns:', e);
      return [];
    }
  }

  static _saveAll(campaigns) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns));
    } catch (e) {
      console.error('Failed to save campaigns:', e);
    }
  }
}
