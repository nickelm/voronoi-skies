/**
 * Biome definitions and color palettes for terrain
 */

export const Biome = {
  DEEP_OCEAN: 0,
  SHALLOW_OCEAN: 1,
  COASTLINE: 2,
  PLAINS: 3,
  FOREST: 4,
  MOUNTAINS: 5
};

// Each biome has 3 shade variations for visual variety
export const BiomeColors = {
  [Biome.DEEP_OCEAN]: [0x0a2463, 0x0e306b, 0x123c73],
  [Biome.SHALLOW_OCEAN]: [0x1e5f8a, 0x2570a0, 0x2c81b6],
  [Biome.COASTLINE]: [0xc9b896, 0xd4c4a8, 0xdfd0ba],
  [Biome.PLAINS]: [0x4a7c3f, 0x5a8f4f, 0x6aa25f],
  [Biome.FOREST]: [0x2d5a27, 0x376b30, 0x417c39],
  [Biome.MOUNTAINS]: [0x6b6b6b, 0x7a7a7a, 0x898989]
};

/**
 * Get biome from noise value
 * @param {number} noiseValue - Value in range [-1, 1]
 * @returns {number} - Biome enum value
 */
export function getBiomeFromNoise(noiseValue) {
  if (noiseValue < -0.3) return Biome.DEEP_OCEAN;
  if (noiseValue < 0.0) return Biome.SHALLOW_OCEAN;
  if (noiseValue < 0.2) return Biome.COASTLINE;
  if (noiseValue < 0.5) return Biome.PLAINS;
  if (noiseValue < 0.7) return Biome.FOREST;
  return Biome.MOUNTAINS;
}

/**
 * Get final color for a cell
 * @param {number} biome - Biome enum value
 * @param {number} elevation - Elevation value [0, 1]
 * @param {number} variation - Random variation seed [0, 1)
 * @returns {number} - RGB hex color
 */
export function getCellColor(biome, elevation, variation) {
  const colors = BiomeColors[biome];

  // Use variation to select base shade (0, 1, or 2)
  const shadeIndex = Math.floor(variation * 3) % 3;
  let baseColor = colors[shadeIndex];

  // Apply elevation shading (higher = lighter)
  // Shift color slightly toward white based on elevation
  const elevationFactor = elevation * 0.15; // Max 15% lightening

  const r = ((baseColor >> 16) & 0xFF);
  const g = ((baseColor >> 8) & 0xFF);
  const b = (baseColor & 0xFF);

  const lightenedR = Math.min(255, r + Math.floor((255 - r) * elevationFactor));
  const lightenedG = Math.min(255, g + Math.floor((255 - g) * elevationFactor));
  const lightenedB = Math.min(255, b + Math.floor((255 - b) * elevationFactor));

  return (lightenedR << 16) | (lightenedG << 8) | lightenedB;
}
