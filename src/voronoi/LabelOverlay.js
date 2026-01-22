/**
 * LabelOverlay - DOM-based overlay for rendering text labels
 *
 * Uses positioned div elements on top of the WebGL canvas to display
 * distance/magnification labels at Voronoi cell borders.
 */

export class LabelOverlay {
  constructor() {
    this.container = null;
    this.labelContainer = null;
    this.labels = new Map(); // cellId -> DOM element
  }

  /**
   * Initialize the overlay
   * @param {HTMLElement} container - The game container element
   */
  init(container) {
    this.container = container;

    // Create a container for all labels
    this.labelContainer = document.createElement('div');
    this.labelContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
      overflow: hidden;
    `;
    container.appendChild(this.labelContainer);
  }

  /**
   * Clear all labels
   */
  clear() {
    // Mark all labels as unused this frame
    for (const label of this.labels.values()) {
      label.dataset.used = 'false';
    }
  }

  /**
   * Finalize the frame - remove unused labels
   * Call this after all drawBoxedLabel calls for the frame
   */
  finalize() {
    for (const [cellId, label] of this.labels) {
      if (label.dataset.used === 'false') {
        label.remove();
        this.labels.delete(cellId);
      }
    }
  }

  /**
   * Draw a boxed label above the specified position (seed point)
   * Label is clamped to stay fully within screen bounds.
   *
   * @param {string} cellId - Unique identifier for this label (for reuse)
   * @param {string} text - The label text
   * @param {number} seedX - Seed X coordinate (label positioned relative to this)
   * @param {number} seedY - Seed Y coordinate (label positioned relative to this)
   * @param {Object} options - Styling options
   * @param {string} [options.bgColor='rgba(0, 0, 0, 0.75)'] - Background color
   * @param {string} [options.textColor='#00ff00'] - Text color
   * @param {string} [options.borderColor='#00ff00'] - Border color
   */
  drawBoxedLabel(cellId, text, seedX, seedY, options = {}) {
    if (!this.labelContainer) return;

    const {
      bgColor = 'rgba(0, 0, 0, 0.75)',
      textColor = '#00ff00',
      borderColor = '#00ff00'
    } = options;

    // Reuse existing label or create new one
    let label = this.labels.get(cellId);
    if (!label) {
      label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        font: bold 11px monospace;
        padding: 4px 6px;
        border: 1px solid;
        white-space: nowrap;
      `;
      this.labelContainer.appendChild(label);
      this.labels.set(cellId, label);
    }

    // Update content and styling
    label.textContent = text;
    label.style.backgroundColor = bgColor;
    label.style.color = textColor;
    label.style.borderColor = borderColor;
    label.dataset.used = 'true';

    // Estimate label dimensions (will be refined after first render)
    // Approximate: 7px per character + padding
    const estimatedWidth = text.length * 7 + 14;
    const estimatedHeight = 22;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const margin = 5;

    // Position label above seed, offset by 20px
    const offsetY = 20;
    let labelX = seedX - estimatedWidth / 2;
    let labelY = seedY - offsetY - estimatedHeight;

    // Clamp to screen bounds
    labelX = Math.max(margin, Math.min(screenW - estimatedWidth - margin, labelX));
    labelY = Math.max(margin, Math.min(screenH - estimatedHeight - margin, labelY));

    label.style.left = `${labelX}px`;
    label.style.top = `${labelY}px`;
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.labelContainer && this.labelContainer.parentNode) {
      this.labelContainer.parentNode.removeChild(this.labelContainer);
    }
    this.labelContainer = null;
    this.labels.clear();
  }
}
