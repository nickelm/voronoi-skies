/**
 * Terrain lighting configuration and hillshade calculations
 * Provides configurable directional lighting for the Voronoi terrain system
 */

/**
 * Global lighting configuration
 * All angles in degrees, colors normalized [0, 1]
 */
export const LightingConfig = {
  azimuth: 315,       // Light direction: 0=N, 90=E, 180=S, 270=W (315=NW)
  elevation: 45,      // Angle above horizon in degrees (0=horizon, 90=overhead)
  intensity: 1.0,     // Hillshade strength multiplier (0=flat, 1=full contrast)
  ambient: 0.4,       // Minimum brightness floor (0=black shadows, 1=no shadows)
  color: { r: 1.0, g: 0.98, b: 0.95 },  // Light color (warm white default)
  hemisphere: {
    skyColor: { r: 0.53, g: 0.81, b: 0.92 },    // Soft blue-white (0x87CEEB)
    groundColor: { r: 0.24, g: 0.19, b: 0.16 }, // Dark warm gray (0x3d3028)
    intensity: 0.35
  }
};

/**
 * Ambient occlusion configuration for vertex shading
 */
export const AOConfig = {
  enabled: true,
  samplingRadius: 40,  // World units (~1.5x gridSpacing)
  maxHeight: 0.3,      // Elevation difference for full occlusion (noise units)
  strength: 0.4        // 0-1, higher = darker valleys
};

/**
 * Time-of-day lighting presets
 */
export const TimePresets = {
  dawn: {
    azimuth: 90,        // Sun rising from east
    elevation: 15,      // Low on horizon
    intensity: 0.9,
    ambient: 0.3,
    color: { r: 1.0, g: 0.6, b: 0.4 },   // Warm orange
    sky: { r: 0.4, g: 0.25, b: 0.35 },   // Purple-pink dawn sky
    hemisphere: {
      skyColor: { r: 1.0, g: 0.69, b: 0.49 },    // Warm peach
      groundColor: { r: 0.16, g: 0.12, b: 0.10 }, // Dark warm
      intensity: 0.25
    }
  },
  noon: {
    azimuth: 180,       // Sun from south
    elevation: 75,      // High overhead
    intensity: 1.0,
    ambient: 0.5,
    color: { r: 1.0, g: 0.98, b: 0.95 }, // Bright warm white
    sky: { r: 0.1, g: 0.23, b: 0.32 },   // Blue sky (original)
    hemisphere: {
      skyColor: { r: 0.53, g: 0.81, b: 0.92 },    // Soft blue-white
      groundColor: { r: 0.24, g: 0.19, b: 0.16 }, // Dark warm gray
      intensity: 0.35
    }
  },
  night: {
    azimuth: 270,       // Moon from west
    elevation: 30,      // Medium height
    intensity: 0.25,
    ambient: 0.1,
    color: { r: 0.6, g: 0.7, b: 1.0 },   // Cool blue moonlight
    sky: { r: 0.02, g: 0.03, b: 0.08 },  // Dark night sky
    hemisphere: {
      skyColor: { r: 0.10, g: 0.10, b: 0.18 },    // Dark blue
      groundColor: { r: 0.04, g: 0.04, b: 0.06 }, // Near black
      intensity: 0.15
    }
  }
};

/**
 * Apply a time-of-day preset to the lighting configuration
 * @param {string} presetName - 'dawn', 'noon', or 'night'
 * @returns {Object|null} - The preset object if applied, null if not found
 */
export function applyTimePreset(presetName) {
  const preset = TimePresets[presetName];
  if (!preset) return null;

  LightingConfig.azimuth = preset.azimuth;
  LightingConfig.elevation = preset.elevation;
  LightingConfig.intensity = preset.intensity;
  LightingConfig.ambient = preset.ambient;
  LightingConfig.color = { ...preset.color };

  // Copy hemisphere settings if present
  if (preset.hemisphere) {
    LightingConfig.hemisphere = {
      skyColor: { ...preset.hemisphere.skyColor },
      groundColor: { ...preset.hemisphere.groundColor },
      intensity: preset.hemisphere.intensity
    };
  }

  return preset;
}

/**
 * Convert azimuth and elevation to a 3D light direction vector
 * @param {number} azimuth - Compass direction of light source in degrees (0=N, clockwise)
 * @param {number} elevation - Angle above horizon in degrees (0-90)
 * @returns {{x: number, y: number, z: number}} - Normalized light direction vector
 */
export function getLightDirection(azimuth, elevation) {
  // Convert to radians
  const azRad = azimuth * Math.PI / 180;
  const elRad = elevation * Math.PI / 180;

  // Project onto horizontal plane
  const cosEl = Math.cos(elRad);

  // In our coordinate system:
  // X increases east, Y increases north (in terrain space)
  // Azimuth 0 = north = +Y, Azimuth 90 = east = +X
  return {
    x: Math.sin(azRad) * cosEl,
    y: Math.cos(azRad) * cosEl,
    z: Math.sin(elRad)
  };
}

/**
 * Compute hillshade value from surface gradient and light direction
 * @param {number} gradX - Elevation gradient in X direction (dE/dx)
 * @param {number} gradY - Elevation gradient in Y direction (dE/dy)
 * @param {{x: number, y: number, z: number}} lightDir - Light direction vector
 * @returns {number} - Hillshade factor in [0, 1], 1 = fully lit, 0 = in shadow
 */
export function computeHillshadeFromGradient(gradX, gradY, lightDir) {
  // Construct surface normal from gradient
  // N = normalize(-dE/dx, -dE/dy, 1)
  const nx = -gradX;
  const ny = -gradY;
  const nz = 1;
  const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);

  // Normalized surface normal
  const normalX = nx / nLen;
  const normalY = ny / nLen;
  const normalZ = nz / nLen;

  // Dot product with light direction
  const dotProduct = normalX * lightDir.x + normalY * lightDir.y + normalZ * lightDir.z;

  // Clamp to [0, 1] - negative values mean surface faces away from light
  return Math.max(0, Math.min(1, dotProduct));
}

/**
 * Apply hillshade lighting to a base color
 * Formula: luminance = ambient + dot * intensity * (1 - ambient)
 * @param {number} baseColor - RGB hex color (0xRRGGBB)
 * @param {number} hillshade - Raw hillshade value [0, 1] from dot(normal, lightDir)
 * @param {Object} config - Lighting configuration
 * @returns {number} - Modified RGB hex color
 */
export function applyHillshadeToColor(baseColor, hillshade, config = LightingConfig) {
  const { intensity, ambient, color } = config;

  // Extract RGB components
  const r = ((baseColor >> 16) & 0xFF);
  const g = ((baseColor >> 8) & 0xFF);
  const b = (baseColor & 0xFF);

  // Compute luminance factor per spec:
  // luminance = ambient + dot * intensity * (1 - ambient)
  // This ensures: shadow (h=0) = ambient, full sun (h=1) = ambient + intensity*(1-ambient)
  const luminance = ambient + hillshade * intensity * (1 - ambient);

  // Apply luminance with light color tinting
  const finalR = r * luminance * color.r;
  const finalG = g * luminance * color.g;
  const finalB = b * luminance * color.b;

  // Clamp and return
  return (Math.min(255, Math.max(0, Math.round(finalR))) << 16) |
         (Math.min(255, Math.max(0, Math.round(finalG))) << 8) |
         Math.min(255, Math.max(0, Math.round(finalB)));
}

/**
 * Update lighting configuration
 * @param {Object} updates - Partial config updates
 */
export function updateLightingConfig(updates) {
  if (updates.azimuth !== undefined) {
    // Wrap azimuth to [0, 360)
    LightingConfig.azimuth = ((updates.azimuth % 360) + 360) % 360;
  }
  if (updates.elevation !== undefined) {
    // Clamp elevation to [0, 90]
    LightingConfig.elevation = Math.max(0, Math.min(90, updates.elevation));
  }
  if (updates.intensity !== undefined) {
    // Clamp intensity to [0, 1]
    LightingConfig.intensity = Math.max(0, Math.min(1, updates.intensity));
  }
  if (updates.ambient !== undefined) {
    // Clamp ambient to [0, 1]
    LightingConfig.ambient = Math.max(0, Math.min(1, updates.ambient));
  }
  if (updates.color !== undefined) {
    LightingConfig.color = { ...LightingConfig.color, ...updates.color };
  }
}

/**
 * Get a copy of the current lighting configuration
 * @returns {Object} - Current lighting config
 */
export function getLightingConfig() {
  return { ...LightingConfig, color: { ...LightingConfig.color } };
}
