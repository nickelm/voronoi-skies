/**
 * Three.js rendering setup with PerspectiveCamera for altitude effect
 * Terrain Z position varies with altitude - higher = further away = smaller
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BlurShader } from './shaders/blurShader.js';

let renderer = null;
let camera = null;
let scene = null;

// Post-processing for terrain blur
let composer = null;
let blurPass = null;

// Camera configuration
const CAMERA_Z = 600;           // Camera distance from origin
const CAMERA_FOV = 60;          // Field of view in degrees

// Altitude to terrain Z mapping
// We want dramatic scaling: at ground level terrain is close, at high altitude it's far
// Using a much stronger scale factor
const MIN_ALTITUDE = 100;       // Ground level
const MAX_ALTITUDE = 40000;     // Service ceiling

// Terrain Z range: close to camera at ground level, far at high altitude
// At ground level (100ft): terrain at Z = 200 (close, appears large)
// At cruise (10000ft): terrain at Z = -200 (medium)
// At ceiling (40000ft): terrain at Z = -600 (far, appears small)
const TERRAIN_Z_CLOSE = 100;    // Z when at ground level
const TERRAIN_Z_FAR = -15000;     // Z when at max altitude

// Smooth transition state
let currentTerrainZ = 0;
const TERRAIN_Z_LERP_SPEED = 5.0;

export function init(container) {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a3a52);

  // Set up perspective camera for altitude effect
  // Far plane must accommodate terrain at max altitude (Z = -15000 from camera at Z = 600)
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 1, 20000);
  camera.position.z = CAMERA_Z;

  // Create WebGL renderer with stencil buffer for Voronoi cell masking
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    stencil: true  // Enable stencil buffer for cell masking
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1); // Keep pixelated look
  renderer.autoClear = false;  // Manual clear control for multi-pass rendering
  container.appendChild(renderer.domElement);

  // Post-processing is disabled for now
  composer = null;
  blurPass = null;

  // Handle window resize
  window.addEventListener('resize', onWindowResize);

  return { renderer, camera, scene };
}

function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Update composer resolution (when blur is re-enabled)
  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  if (blurPass) {
    blurPass.uniforms.uResolution.value = [window.innerWidth, window.innerHeight];
  }
}

/**
 * Calculate terrain Z position based on altitude
 * Higher altitude = more negative Z = further from camera = appears smaller
 */
function getTerrainZForAltitude(altitude) {
  // Clamp altitude to valid range
  const clampedAlt = Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, altitude));

  // Linear interpolation from close (ground) to far (ceiling)
  const t = (clampedAlt - MIN_ALTITUDE) / (MAX_ALTITUDE - MIN_ALTITUDE);
  return TERRAIN_Z_CLOSE + t * (TERRAIN_Z_FAR - TERRAIN_Z_CLOSE);
}

/**
 * Update terrain Z position based on altitude with smooth interpolation
 * Returns the current terrain Z for positioning terrain group
 */
export function updateAltitudeZoom(altitude, deltaTime) {
  const targetZ = getTerrainZForAltitude(altitude);

  // Smooth interpolation to prevent jarring changes
  currentTerrainZ += (targetZ - currentTerrainZ) * Math.min(1, deltaTime * TERRAIN_Z_LERP_SPEED);

  return currentTerrainZ;
}

/**
 * Get the camera Z position (needed for aircraft positioning)
 */
export function getCameraZ() {
  return CAMERA_Z;
}

export function render() {
  if (composer) {
    composer.render();
  } else if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

/**
 * Update terrain blur based on altitude
 * Higher altitude = more blur (depth-of-field effect)
 */
export function updateBlur(altitude) {
  if (!blurPass) return;

  let blurAmount = 0;

  // Altitude thresholds for blur progression
  if (altitude <= 500) {
    // Ground level: no blur
    blurAmount = 0;
  } else if (altitude < 15000) {
    // Low to mid altitude: gradual blur increase
    blurAmount = ((altitude - 500) / 14500) * 0.3;
  } else if (altitude < 35000) {
    // Mid to high altitude: moderate blur
    blurAmount = 0.3 + ((altitude - 15000) / 20000) * 0.4;
  } else {
    // Very high altitude: strong blur
    blurAmount = 0.7 + ((Math.min(altitude, 40000) - 35000) / 5000) * 0.3;
  }

  blurPass.uniforms.uBlurAmount.value = blurAmount;
}

export function getScene() {
  return scene;
}

export function getCamera() {
  return camera;
}

export function getRenderer() {
  return renderer;
}

/**
 * Clear specific buffers manually
 * Used for multi-pass rendering with stencil masking
 */
export function clearBuffers(color = true, depth = true, stencil = true) {
  if (renderer) {
    renderer.clear(color, depth, stencil);
  }
}
