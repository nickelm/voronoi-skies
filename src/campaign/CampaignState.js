/**
 * Represents the state of a campaign.
 * Contains all data needed to resume a campaign.
 */
export class CampaignState {
  constructor(data = {}) {
    // Identity
    this.id = data.id || this._generateId();
    this.name = data.name || 'Unnamed Campaign';

    // Island configuration (for regeneration)
    this.seed = data.seed ?? 42;
    this.template = data.template || 'tropical_volcanic';

    // Game settings
    this.difficulty = data.difficulty || 'normal';

    // Progress
    this.missionsCompleted = data.missionsCompleted || 0;
    this.currentMission = data.currentMission || null;
    this.playerPosition = data.playerPosition || { x: 0, y: 0 };
    this.playerAltitude = data.playerAltitude || 500;

    // Statistics
    this.playTime = data.playTime || 0;
    this.enemiesDestroyed = data.enemiesDestroyed || 0;
    this.missionsFailed = data.missionsFailed || 0;

    // Timestamps
    this.createdAt = data.createdAt || Date.now();
    this.lastPlayed = data.lastPlayed || Date.now();
  }

  _generateId() {
    return `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Serialize to JSON for storage
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      seed: this.seed,
      template: this.template,
      difficulty: this.difficulty,
      missionsCompleted: this.missionsCompleted,
      currentMission: this.currentMission,
      playerPosition: this.playerPosition,
      playerAltitude: this.playerAltitude,
      playTime: this.playTime,
      enemiesDestroyed: this.enemiesDestroyed,
      missionsFailed: this.missionsFailed,
      createdAt: this.createdAt,
      lastPlayed: this.lastPlayed,
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data) {
    return new CampaignState(data);
  }

  /**
   * Get island generation config from campaign settings
   */
  getIslandConfig() {
    return {
      seed: this.seed,
      template: this.template,
    };
  }
}
