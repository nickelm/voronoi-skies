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
const CAMERA_FOV = 60;          // Field of view in degrees
const TERRAIN_Z = 0;            // Terrain is FIXED at Z=0

// Altitude to camera Z mapping
// Terrain stays fixed at Z=0, camera moves along Z to control zoom
const MIN_ALTITUDE = 100;       // Ground level
const MAX_ALTITUDE = 40000;     // Service ceiling

// Camera Z range: close at ground level, far at high altitude
const CAMERA_Z_CLOSE = 500;     // Camera Z at ground level (close = zoomed in)
const CAMERA_Z_FAR = 15600;     // Camera Z at max altitude (far = zoomed out)

// Smooth transition state
let currentCameraZ = CAMERA_Z_CLOSE;
const CAMERA_Z_LERP_SPEED = 5.0;

export function init(container) {
  // Create scene
  scene = new THREE.Scene();
  scene.background = null;  // Prevent auto-clearing during multi-pass stencil rendering

  // Set up perspective camera for altitude effect
  // Far plane must accommodate camera at max distance
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 1, 20000);
  camera.position.z = currentCameraZ;
  camera.lookAt(0, 0, 0);  // Explicit: look at origin
  camera.up.set(0, 1, 0);  // Explicit: Y-up orientation

  // Create WebGL renderer with stencil buffer for Voronoi cell masking
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    stencil: true,  // Enable stencil buffer for cell masking
    logarithmicDepthBuffer: true  // Better depth precision at distance
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
 * Calculate camera Z position based on altitude
 * Higher altitude = higher Z = camera further from terrain = zoomed out
 */
function getCameraZForAltitude(altitude) {
  // Clamp altitude to valid range
  const clampedAlt = Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, altitude));

  // Linear interpolation from close (ground) to far (ceiling)
  const t = (clampedAlt - MIN_ALTITUDE) / (MAX_ALTITUDE - MIN_ALTITUDE);
  return CAMERA_Z_CLOSE + t * (CAMERA_Z_FAR - CAMERA_Z_CLOSE);
}

/**
 * Update camera Z position based on altitude with smooth interpolation
 * Moves the CAMERA, terrain stays fixed at Z=0.
 * Returns the current camera Z.
 */
export function updateAltitudeZoom(altitude, deltaTime) {
  const targetZ = getCameraZForAltitude(altitude);

  // Smooth interpolation to prevent jarring changes
  currentCameraZ += (targetZ - currentCameraZ) * Math.min(1, deltaTime * CAMERA_Z_LERP_SPEED);

  // Update the main camera position
  if (camera) {
    camera.position.z = currentCameraZ;
  }

  return currentCameraZ;
}

/**
 * Get the current camera Z position (changes with altitude)
 */
export function getCameraZ() {
  return currentCameraZ;
}

/**
 * Get the fixed terrain Z position (always 0)
 */
export function getTerrainZ() {
  return TERRAIN_Z;
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

/**
 * Dispose of renderer and clean up resources
 */
export function dispose() {
  if (composer) {
    composer.dispose();
    composer = null;
  }
  if (blurPass) {
    blurPass = null;
  }
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = null;
  }
  if (scene) {
    // Clear scene children
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }
    scene = null;
  }
  camera = null;
  currentCameraZ = CAMERA_Z_CLOSE;
}
