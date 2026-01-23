/**
 * StrategicMapControls - Pan, zoom, and hover controls for StrategicMapRenderer
 *
 * Provides click-drag panning, scroll wheel zoom, and region hover detection.
 */

// Zoom constraints
const MIN_SCALE = 0.001; // Very zoomed out (~1000 world units per pixel)
const MAX_SCALE = 0.1;   // Very zoomed in (~10 world units per pixel)
const ZOOM_FACTOR = 1.1; // Zoom multiplier per scroll step

export class StrategicMapControls {
  /**
   * @param {Object} renderer - StrategicMapRenderer instance
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.canvas = renderer.canvas;

    // Drag state
    this.isDragging = false;
    this.lastMouse = null;

    // Hover state
    this.hoveredRegion = null;

    // Callbacks (set by user)
    this.onRegionHover = null;

    // Bind event handlers
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onWheel = this._onWheel.bind(this);

    this._setupEventListeners();
  }

  /**
   * Attach event listeners to canvas
   */
  _setupEventListeners() {
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  /**
   * Handle mouse down - start drag
   * @param {MouseEvent} e
   */
  _onMouseDown(e) {
    this.isDragging = true;
    this.lastMouse = { x: e.clientX, y: e.clientY };
    this.canvas.style.cursor = 'grabbing';
  }

  /**
   * Handle mouse move - pan or hover detect
   * @param {MouseEvent} e
   */
  _onMouseMove(e) {
    if (this.isDragging && this.lastMouse) {
      // Pan the view
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;

      // Convert pixel delta to world delta
      this.renderer.offsetX -= dx / this.renderer.scale;
      this.renderer.offsetY -= dy / this.renderer.scale;

      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.renderer.render();
    } else {
      // Hover detection
      this._updateHover(e);
    }
  }

  /**
   * Handle mouse up - end drag
   * @param {MouseEvent} e
   */
  _onMouseUp(e) {
    this.isDragging = false;
    this.lastMouse = null;
    this.canvas.style.cursor = 'default';
  }

  /**
   * Handle mouse leave - end drag and clear hover
   * @param {MouseEvent} e
   */
  _onMouseLeave(e) {
    this.isDragging = false;
    this.lastMouse = null;
    this.canvas.style.cursor = 'default';

    if (this.hoveredRegion !== null) {
      this.hoveredRegion = null;
      if (this.onRegionHover) {
        this.onRegionHover(null);
      }
    }
  }

  /**
   * Handle scroll wheel - zoom
   * @param {WheelEvent} e
   */
  _onWheel(e) {
    e.preventDefault();

    // Get mouse position in canvas coordinates
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Get world position under mouse before zoom
    const [worldX, worldY] = this.renderer.screenToWorld(mouseX, mouseY);

    // Apply zoom
    const zoomIn = e.deltaY < 0;
    const factor = zoomIn ? ZOOM_FACTOR : (1 / ZOOM_FACTOR);
    const newScale = this.renderer.scale * factor;

    // Clamp to limits
    this.renderer.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

    // Adjust offset to keep mouse position fixed in world space
    // After zoom, we want worldToScreen(worldX, worldY) to equal (mouseX, mouseY)
    // Solving: (worldX - offsetX) * scale + canvas.width/2 = mouseX
    // offsetX = worldX - (mouseX - canvas.width/2) / scale
    this.renderer.offsetX = worldX - (mouseX - this.canvas.width / 2) / this.renderer.scale;
    this.renderer.offsetY = worldY - (mouseY - this.canvas.height / 2) / this.renderer.scale;

    this.renderer.render();
  }

  /**
   * Update hover state based on mouse position
   * @param {MouseEvent} e
   */
  _updateHover(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const [wx, wy] = this.renderer.screenToWorld(sx, sy);
    const region = this.renderer.island.findRegion(wx, wy);

    if (region !== this.hoveredRegion) {
      this.hoveredRegion = region;
      if (this.onRegionHover) {
        this.onRegionHover(region);
      }
    }
  }

  /**
   * Enable controls (re-attach listeners after disable)
   */
  enable() {
    this._setupEventListeners();
  }

  /**
   * Disable controls (remove listeners)
   */
  disable() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this.canvas.removeEventListener('wheel', this._onWheel);
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.disable();
    this.renderer = null;
    this.canvas = null;
    this.onRegionHover = null;
  }
}
