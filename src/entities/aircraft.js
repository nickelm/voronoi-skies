/**
 * Player aircraft state and update logic
 */
import * as THREE from 'three';

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
    // With perspective camera at Z=600 and FOV=60:
    // At Z=500 (100 units from camera), visible height is ~115 units
    // Position aircraft 20% from bottom: -115/2 + 0.2*115 = -34
    this.screenY = -100;   // 20% from bottom at Z=500
    this.screenZ = 300;   // 100 units from camera (at Z=600)

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

    // Create shadow mesh (same geometry, dark tint)
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a0a1a,
      transparent: true,
      opacity: 0.5
    });
    this.shadowMesh = new THREE.Mesh(geometry.clone(), shadowMaterial);
    // Shadow will be positioned relative to terrain Z in updateShadow()
    this.shadowMesh.position.set(0, this.screenY, this.screenZ - 5);
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

    // Update shadow: copy vertex deformation and apply altitude-based offset
    const shadowPositions = this.shadowMesh.geometry.attributes.position;
    shadowPositions.setY(0, halfSize + bankTilt + pitchTilt);
    shadowPositions.setY(1, halfSize - bankTilt + pitchTilt);
    shadowPositions.setY(2, -halfSize + bankTilt - pitchTilt);
    shadowPositions.setY(3, -halfSize - bankTilt - pitchTilt);
    shadowPositions.needsUpdate = true;

    // Shadow offset based on altitude (sun from top-right, shadow toward bottom-left)
    const maxOffset = 30;
    const offsetRatio = Math.min(1, this.altitude / 40000);
    const shadowOffsetX = -offsetRatio * maxOffset;
    const shadowOffsetY = -offsetRatio * maxOffset;

    // Update shadow position
    this.shadowMesh.position.x = this.mesh.position.x + shadowOffsetX;
    this.shadowMesh.position.y = this.mesh.position.y + shadowOffsetY;
  }

  /**
   * Update shadow Z position to match terrain
   * Shadow should appear on the terrain, which moves in Z with altitude
   * @param {number} terrainZ - Current terrain Z position
   */
  updateShadowZ(terrainZ) {
    // Shadow sits just above terrain
    this.shadowMesh.position.z = terrainZ + 1;
  }

  /**
   * Get aircraft screen Y position (for terrain pivot alignment)
   */
  getScreenY() {
    return this.screenY;
  }
}
