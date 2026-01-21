/**
 * Player aircraft state and update logic
 */
import * as THREE from 'three';
import { LightingConfig, getLightDirection } from '../terrain/lighting.js';
import { sampleTerrainElevation } from '../terrain/TerrainSampler.js';

export class Aircraft {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.heading = 0; // radians, 0 = up/north
    this.altitude = 10000; // feet
    this.throttle = 0.5; // 0 to 1
    this.speed = 0; // current velocity in units/sec

    // Flight model constants
    this.maxSpeed = 500;
    this.acceleration = 100;
    this.turnRate = Math.PI; // radians per second at full input
    this.climbRate = 1000; // feet per second

    // Visual tilt angles (for perspective effect)
    this.bankAngle = 0; // -1 to 1, smoothly interpolated (left/right)
    this.pitchAngle = 0; // -1 to 1, smoothly interpolated (climb/dive)

    // Screen position - aircraft stays at fixed position, world moves around it
    // Aircraft at screen center (screenY = 0)
    this.screenY = 0;
    this.screenZ = 300;   // 300 units from camera (at Z=600)

    // Create sprite mesh
    const loader = new THREE.TextureLoader();
    const texture = loader.load('sprites/f-16.png');
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const geometry = new THREE.PlaneGeometry(32, 32);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true
    });

    this.mesh = new THREE.Mesh(geometry, material);
    // Position aircraft close to camera so it stays large
    this.mesh.position.set(0, this.screenY, this.screenZ);

    // Create shadow mesh (same geometry, textured silhouette with black tint)
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: texture,           // Same F-16 texture as aircraft
      color: 0x000000,        // Black tint (multiplies with texture for silhouette)
      transparent: true,
      opacity: 0.5,
      depthWrite: false       // Don't write to depth buffer
    });
    this.shadowMesh = new THREE.Mesh(geometry.clone(), shadowMaterial);
    // Shadow will be positioned based on light direction and terrain elevation
    this.shadowMesh.position.set(0, this.screenY, this.screenZ - 5);

    // Store camera Z for perspective calculations (set externally)
    this.cameraZ = 600;
  }

  getMesh() {
    return this.mesh;
  }

  getShadowMesh() {
    return this.shadowMesh;
  }

  update(deltaTime, inputState) {
    // Throttle control (W/S)
    if (inputState.throttleUp) {
      this.throttle = Math.min(1, this.throttle + deltaTime * 0.5);
    }
    if (inputState.throttleDown) {
      this.throttle = Math.max(0, this.throttle - deltaTime * 0.5);
    }

    // Turn control (A/D)
    // Negative heading change = turn left (counterclockwise as viewed from above)
    if (inputState.turnLeft) {
      this.heading -= this.turnRate * deltaTime;
    }
    if (inputState.turnRight) {
      this.heading += this.turnRate * deltaTime;
    }
    // Normalize heading to 0-2PI
    this.heading = ((this.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Altitude control (Q/E)
    if (inputState.climbUp) {
      this.altitude += this.climbRate * deltaTime;
    }
    if (inputState.climbDown) {
      this.altitude = Math.max(0, this.altitude - this.climbRate * deltaTime);
    }

    // Update speed based on throttle
    const targetSpeed = this.throttle * this.maxSpeed;
    if (this.speed < targetSpeed) {
      this.speed = Math.min(targetSpeed, this.speed + this.acceleration * deltaTime);
    } else {
      this.speed = Math.max(targetSpeed, this.speed - this.acceleration * deltaTime);
    }

    // Update position based on heading and speed
    this.x += Math.sin(this.heading) * this.speed * deltaTime;
    this.y += Math.cos(this.heading) * this.speed * deltaTime;

    // Determine if turning (takes priority over pitch)
    const isTurning = inputState.turnLeft || inputState.turnRight;

    // Update visual bank angle based on turn input
    let targetBank = 0;
    if (inputState.turnLeft) targetBank = -1;
    if (inputState.turnRight) targetBank = 1;
    this.bankAngle += (targetBank - this.bankAngle) * Math.min(1, deltaTime * 8);

    // Update visual pitch angle based on climb/dive input (only when not turning)
    let targetPitch = 0;
    if (!isTurning) {
      if (inputState.climbUp) targetPitch = 1;    // nose up
      if (inputState.climbDown) targetPitch = -1; // nose down
    }
    this.pitchAngle += (targetPitch - this.pitchAngle) * Math.min(1, deltaTime * 8);

    // Apply tilt to mesh geometry by adjusting vertex positions to create trapezoid
    // PlaneGeometry(32,32) vertices in XY plane, indexed as:
    //   0: (-16, +16)  top-left
    //   1: (+16, +16)  top-right
    //   2: (-16, -16)  bottom-left
    //   3: (+16, -16)  bottom-right
    const positions = this.mesh.geometry.attributes.position;
    const halfSize = 16;
    const bankTilt = this.bankAngle * 4; // pixels to shift for bank
    const pitchTilt = this.pitchAngle * 3; // pixels to shift for pitch

    // Bank: compress left/right edges
    // Pitch: compress top (climb) or bottom (dive) edges

    // Top-left (index 0)
    positions.setY(0, halfSize + bankTilt + pitchTilt);
    // Top-right (index 1)
    positions.setY(1, halfSize - bankTilt + pitchTilt);
    // Bottom-left (index 2)
    positions.setY(2, -halfSize + bankTilt - pitchTilt);
    // Bottom-right (index 3)
    positions.setY(3, -halfSize - bankTilt - pitchTilt);

    positions.needsUpdate = true;

    // Update shadow: copy vertex deformation
    const shadowPositions = this.shadowMesh.geometry.attributes.position;
    shadowPositions.setY(0, halfSize + bankTilt + pitchTilt);
    shadowPositions.setY(1, halfSize - bankTilt + pitchTilt);
    shadowPositions.setY(2, -halfSize + bankTilt - pitchTilt);
    shadowPositions.setY(3, -halfSize - bankTilt - pitchTilt);
    shadowPositions.needsUpdate = true;

    // Compute shadow position based on light direction and terrain elevation
    this.updateShadowPosition();
  }

  /**
   * Compute shadow world position based on light direction and altitude
   * Shadow is in the terrain group, so position is in world coordinates
   */
  updateShadowPosition() {
    // Get light direction from current lighting config
    const lightDir = getLightDirection(LightingConfig.azimuth, LightingConfig.elevation);

    // Project shadow away from light source
    // The shadow offset depends on altitude and sun elevation angle
    // tan(elevation) = altitude / horizontal_distance
    // horizontal_distance = altitude / tan(elevation)
    // But we also want some minimum offset so shadow is visible
    const elevationRad = LightingConfig.elevation * Math.PI / 180;
    const tanElev = Math.tan(elevationRad);

    // Calculate horizontal offset based on altitude and sun angle
    // Higher sun (larger elevation) = shadow closer to aircraft
    // Lower sun (smaller elevation) = shadow further from aircraft
    // Clamp tanElev to avoid division issues at very low angles
    const clampedTan = Math.max(0.2, tanElev);  // Minimum ~11 degree elevation
    const horizontalOffset = this.altitude / clampedTan;

    // Scale down to reasonable world units (altitude is in feet, want offset in world units)
    // At 10000ft altitude with 45° sun, offset = 10000/1 = 10000, scale by 0.05 = 500 world units
    const projectionScale = horizontalOffset * 0.05;

    // Shadow world position (in terrain group coordinates)
    // Light direction x,y components point FROM the sun, so shadow is opposite direction
    const shadowWorldX = this.x - lightDir.x * projectionScale;
    const shadowWorldY = this.y - lightDir.y * projectionScale;

    // Sample terrain elevation at shadow position
    // sampleTerrainElevation returns elevation scaled to match terrain mesh Z (scale 400)
    const shadowZ = sampleTerrainElevation(shadowWorldX, shadowWorldY) + 5;  // +5 to sit above terrain surface

    // Position shadow in world coordinates (terrain group handles rotation/translation)
    this.shadowMesh.position.set(shadowWorldX, shadowWorldY, shadowZ);

    // Rotate shadow to match aircraft heading
    // The shadow mesh is in world space, so it needs to rotate with the aircraft
    this.shadowMesh.rotation.z = -this.heading;  // Negative because terrain rotates opposite

    // Dynamic opacity based on altitude (higher = fainter shadow)
    const altRatio = Math.min(1, this.altitude / 40000);
    const shadowOpacity = 0.5 * (1 - altRatio * 0.5);  // 0.5 at ground, 0.25 at ceiling
    this.shadowMesh.material.opacity = shadowOpacity;
  }

  /**
   * Update shadow Z position to match terrain
   * Called each frame to keep shadow on terrain surface
   * @param {number} baseTerrainZ - Base terrain Z position (unused now, kept for API compat)
   */
  updateShadowZ(baseTerrainZ) {
    // Shadow Z is now computed in updateShadowPosition() using world coordinates
    // This method is kept for API compatibility but no longer needed
  }

  /**
   * Update aircraft mesh Z position to stay between camera and terrain
   * With camera-moving architecture, aircraft must be positioned relative to camera
   * @param {number} cameraZ - Current camera Z position
   * @param {number} terrainZ - Fixed terrain Z position (always 0)
   */
  updateMeshZ(cameraZ, terrainZ = 0, pivotY = 0) {
    // Aircraft should be between camera and terrain, but closer to camera
    // to appear at a consistent size on screen
    // Position at 80% of the way from terrain to camera
    const aircraftZ = terrainZ + (cameraZ - terrainZ) * 0.8;
    this.mesh.position.z = aircraftZ;
    this.screenZ = aircraftZ;
    this.cameraZ = cameraZ;

    // Aircraft Y should match the terrain pivot Y so it appears centered
    this.mesh.position.y = pivotY;
  }

  /**
   * Get aircraft screen Y position (for terrain pivot alignment)
   */
  getScreenY() {
    return this.screenY;
  }
}
