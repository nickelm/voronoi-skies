/**
 * Player aircraft state and update logic
 */
import * as THREE from 'three';
import { LightingConfig, getLightDirection } from '../terrain/lighting.js';
import { sampleTerrainElevation } from '../terrain/TerrainSampler.js';

/**
 * Create a "tent" geometry for the aircraft sprite
 * Two planes meeting at a shallow angle along the vertical (nose-to-tail) axis
 * This allows left/right halves to receive different lighting
 *
 * @param {number} width - Total width of the geometry
 * @param {number} height - Total height (nose to tail)
 * @param {number} angle - Tilt angle in degrees from horizontal
 * @returns {THREE.BufferGeometry}
 */
function createTentGeometry(width, height, angle) {
  const geometry = new THREE.BufferGeometry();

  // Calculate ridge height from angle
  const angleRad = angle * Math.PI / 180;
  const ridgeZ = (width / 2) * Math.tan(angleRad);
  const halfW = width / 2;
  const halfH = height / 2;

  // 8 vertices: 4 for left panel, 4 for right panel
  // Left panel: wing tip (Z=0) to ridge (Z=ridgeZ)
  // Right panel: ridge (Z=ridgeZ) to wing tip (Z=0)
  //
  // Vertex layout (looking down from above, nose pointing +Y):
  //   Left panel:                Right panel:
  //   0--1 (top/nose)           4--5
  //   |  |                      |  |
  //   2--3 (bottom/tail)        6--7
  //
  // X: -halfW (left wing) to 0 (center) to +halfW (right wing)
  // Y: +halfH (nose) to -halfH (tail)
  // Z: 0 (wing tips) to ridgeZ (center ridge)

  const positions = new Float32Array([
    // Left panel (4 vertices)
    -halfW, halfH, 0,        // 0: top-left (nose, left wing tip)
    0, halfH, ridgeZ,        // 1: top-center (nose, ridge)
    -halfW, -halfH, 0,       // 2: bottom-left (tail, left wing tip)
    0, -halfH, ridgeZ,       // 3: bottom-center (tail, ridge)

    // Right panel (4 vertices)
    0, halfH, ridgeZ,        // 4: top-center (nose, ridge)
    halfW, halfH, 0,         // 5: top-right (nose, right wing tip)
    0, -halfH, ridgeZ,       // 6: bottom-center (tail, ridge)
    halfW, -halfH, 0         // 7: bottom-right (tail, right wing tip)
  ]);

  // UVs - split texture at center
  // Left panel gets left half of texture (U: 0 to 0.5)
  // Right panel gets right half of texture (U: 0.5 to 1)
  const uvs = new Float32Array([
    // Left panel
    0, 1,       // 0: top-left
    0.5, 1,     // 1: top-center
    0, 0,       // 2: bottom-left
    0.5, 0,     // 3: bottom-center

    // Right panel
    0.5, 1,     // 4: top-center
    1, 1,       // 5: top-right
    0.5, 0,     // 6: bottom-center
    1, 0        // 7: bottom-right
  ]);

  // Normals - each panel has a uniform normal pointing outward
  // Left panel normal: pointing up and to the left
  const leftNormalX = -Math.sin(angleRad);
  const leftNormalZ = Math.cos(angleRad);
  // Right panel normal: pointing up and to the right
  const rightNormalX = Math.sin(angleRad);
  const rightNormalZ = Math.cos(angleRad);

  const normals = new Float32Array([
    // Left panel (all 4 vertices have same normal)
    leftNormalX, 0, leftNormalZ,
    leftNormalX, 0, leftNormalZ,
    leftNormalX, 0, leftNormalZ,
    leftNormalX, 0, leftNormalZ,

    // Right panel (all 4 vertices have same normal)
    rightNormalX, 0, rightNormalZ,
    rightNormalX, 0, rightNormalZ,
    rightNormalX, 0, rightNormalZ,
    rightNormalX, 0, rightNormalZ
  ]);

  // Indices - two triangles per quad (CCW winding for front face)
  // Left panel: 0-2-1, 1-2-3
  // Right panel: 4-6-5, 5-6-7
  const indices = [
    0, 2, 1,  1, 2, 3,  // Left panel
    4, 6, 5,  5, 6, 7   // Right panel
  ];

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);

  return geometry;
}

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
    this.turnRate = Math.PI / 2; // radians per second at full input (90°/sec)
    this.climbRate = 1000; // feet per second

    // Virtual stick X position (per spec section 2.1)
    // Deflects while keys held, persists when released
    this.stickX = 0; // -1 to 1, turn command (left/right)
    this.stickDeflectRate = 1.5; // units/second (0.67s from center to full)
    this.stickDeadzone = 0.05;   // below threshold treated as zero

    // Visual tilt angles (for perspective effect, smoothly interpolated from stick)
    this.bankAngle = 0; // -1 to 1, smoothly interpolated (left/right)
    this.pitchAngle = 0; // -1 to 1, smoothly interpolated (climb/dive)

    // Screen position - aircraft stays at fixed position, world moves around it
    // Aircraft at screen center (screenY = 0)
    this.screenY = 0;
    this.screenZ = 300;   // 300 units from camera (at Z=600)

    // Geometry parameters (stored for tilt calculations)
    this.spriteWidth = 64;
    this.spriteHeight = 64;
    this.tentAngle = 15;  // degrees

    // Create sprite mesh with tent geometry for 3D lighting
    const loader = new THREE.TextureLoader();
    const texture = loader.load('sprites/f-16.png');
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const geometry = createTentGeometry(this.spriteWidth, this.spriteHeight, this.tentAngle);
    const material = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide  // Render both sides for safety
    });

    this.mesh = new THREE.Mesh(geometry, material);
    // Position aircraft close to camera so it stays large
    this.mesh.position.set(0, this.screenY, this.screenZ);

    // Create shadow mesh (flat plane, not tent - shadows project onto flat terrain)
    const shadowGeometry = new THREE.PlaneGeometry(this.spriteWidth, this.spriteHeight);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: texture,           // Same F-16 texture as aircraft
      color: 0x000000,        // Black tint (multiplies with texture for silhouette)
      transparent: true,
      opacity: 0.5,
      depthWrite: false       // Don't write to depth buffer
    });
    this.shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
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
    // Throttle control - analog touch or digital keyboard
    if (inputState.touchActive && Math.abs(inputState.touchThrottle) > 0.1) {
      // Touch: directly adjust throttle based on analog input
      // touchThrottle is -1 to 1 (positive = speed up)
      const throttleChange = inputState.touchThrottle * deltaTime * 1.0;
      this.throttle = Math.max(0, Math.min(1, this.throttle + throttleChange));
    } else {
      // Keyboard: digital throttle control
      if (inputState.throttleUp) {
        this.throttle = Math.min(1, this.throttle + deltaTime * 0.5);
      }
      if (inputState.throttleDown) {
        this.throttle = Math.max(0, this.throttle - deltaTime * 0.5);
      }
    }

    // Virtual stick X (turn) - deflects while key held, persists when released
    if (inputState.touchActive && Math.abs(inputState.touchTurn) > 0.1) {
      // Touch: direct stick position (bypass deflection rate)
      this.stickX = inputState.touchTurn;
    } else {
      // Keyboard: deflect stick at constant rate
      // Tapping opposite direction zeros the stick immediately
      if (inputState.turnLeft && inputState.turnRight) {
        // A+D simultaneous: center stick
        this.stickX = 0;
      } else if (inputState.turnLeft) {
        if (this.stickX > 0) {
          // Tapping A while turning right: zero stick
          this.stickX = 0;
        } else {
          this.stickX = Math.max(-1, this.stickX - this.stickDeflectRate * deltaTime);
        }
      } else if (inputState.turnRight) {
        if (this.stickX < 0) {
          // Tapping D while turning left: zero stick
          this.stickX = 0;
        } else {
          this.stickX = Math.min(1, this.stickX + this.stickDeflectRate * deltaTime);
        }
      }
      // X or Space centers turn stick
      if (inputState.centerStick) {
        this.stickX = 0;
      }
    }

    // Apply deadzone to stick X for turn rate calculation
    const effectiveStickX = Math.abs(this.stickX) < this.stickDeadzone ? 0 : this.stickX;

    // Turn rate proportional to stick position
    this.heading += effectiveStickX * this.turnRate * deltaTime;
    // Normalize heading to 0-2PI
    this.heading = ((this.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Altitude control (Q/E) - direct, not stick-based
    // Q = descend, E = climb
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

    // Determine if turning (based on stick position, not input)
    const isTurning = Math.abs(effectiveStickX) > 0;

    // Update visual bank angle to follow stick X position
    this.bankAngle += (this.stickX - this.bankAngle) * Math.min(1, deltaTime * 8);

    // Update visual pitch angle based on altitude input (only when not turning)
    // Q = descend = nose down = negative pitch
    // E = climb = nose up = positive pitch
    // When turning, pitch visual returns to neutral (bank takes priority)
    let targetPitch = 0;
    if (!isTurning) {
      if (inputState.climbDown) targetPitch = 1;  // Q = nose down
      if (inputState.climbUp) targetPitch = -1;     // E = nose up
    }
    this.pitchAngle += (targetPitch - this.pitchAngle) * Math.min(1, deltaTime * 8);

    // Apply bank and pitch as actual 3D rotations
    // Bank: rotate around Y axis (nose-to-tail axis) - tilts wings up/down
    // Pitch: rotate around X axis (wing-to-wing axis) - tilts nose up/down
    //
    // In our coordinate system:
    // - Y axis points from tail to nose (aircraft length)
    // - X axis points from left wing to right wing
    // - Z axis points up (toward camera)
    //
    // Bank (turning): rotate around Y so one wing dips, other rises
    // Pitch (climb/dive): rotate around X so nose goes up/down

    const maxBankAngle = Math.PI / 6;   // 30 degrees max bank
    const maxPitchAngle = Math.PI / 8;  // 22.5 degrees max pitch

    this.mesh.rotation.y = this.bankAngle * maxBankAngle;
    this.mesh.rotation.x = -this.pitchAngle * maxPitchAngle;

    // Shadow doesn't rotate with bank/pitch (stays flat on ground)
    // But we still apply the old vertex-based tilt for visual effect
    const halfH = this.spriteHeight / 2;
    const bankTilt = this.bankAngle * 8;
    const pitchTilt = this.pitchAngle * 6;

    const shadowPositions = this.shadowMesh.geometry.attributes.position;
    shadowPositions.setY(0, halfH + bankTilt + pitchTilt);
    shadowPositions.setY(1, halfH - bankTilt + pitchTilt);
    shadowPositions.setY(2, -halfH + bankTilt - pitchTilt);
    shadowPositions.setY(3, -halfH - bankTilt - pitchTilt);
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
