import * as THREE from 'three';

export const CAMERA_MODES = {
  CHASE: 'Chase (3rd Person)',
  HOOD: 'Hood / FPV (1st Person)',
  BUMPER: 'Bumper Cam (Asphalt)',
  DRONE: 'Orbit Spectator',
};

// Scratch vectors for the per-frame ideal pose (avoids GC churn while driving).
const _idealPos = new THREE.Vector3();
const _idealLook = new THREE.Vector3();

// Camera clearance around street furniture by PROP kind (shared/tileformat.js):
// poles, masts, machines, shelters, parked cars… a lens 30 cm from any of
// these fills the frame with a razor-edged black block at night.
const STICK_RADIUS = [
  0.5,  // 0 TREE trunk (crowns handled separately)
  0.5,  // 1 POLE (10 m concrete mast)
  0.5,  // 2 LIGHT
  0.8,  // 3 VENDING
  0.6,  // 4 SIGNAL
  0.8,  // 5 (unused here: flat road paint is skipped upstream)
  1.2,  // 6 BUS_STOP (shelter)
  0.8,  // 7 BENCH
  0.4,  // 8 BOLLARD
  0.5,  // 9 POST_BOX
  0.8,  // 10 PHONE booth
  2.2,  // 11 SUBWAY entrance
  0.8,  // 12 STATUE
  1.2,  // 13 BIKES rack
  0.8,  // 14 SHRINE
  1.3,  // 15 PARKED car
  0.4,  // 16 HYDRANT sign
  0.8,  // 17 INFO board
  0.8,  // 18 TABLE
  1.5,  // 19 PLAY equipment
  2.0,  // 20 TORII
  1.5,  // 21 RAIL_CROSSING
];

export class CameraController {
  camera: THREE.PerspectiveCamera;
  vehicle: any;
  domElement: HTMLElement;
  modes: string[];
  currentModeIndex: number;
  currentCameraPos: THREE.Vector3;
  currentLookAt: THREE.Vector3;
  orbitDistance: number;
  orbitAzimuth: number;
  orbitElevation: number;
  isDragging: boolean;
  lastPointer: [number, number];
  baseFov: number;
  targetFov: number;
  shakeTrauma: number;
  snapped: boolean;

  constructor(camera: THREE.PerspectiveCamera, vehicle: any, domElement: HTMLElement) {
    this.camera = camera;
    this.vehicle = vehicle;
    this.domElement = domElement;

    this.modes = [
      CAMERA_MODES.CHASE,
      CAMERA_MODES.HOOD,
      CAMERA_MODES.BUMPER,
      CAMERA_MODES.DRONE,
    ];
    this.currentModeIndex = 0;

    // Smooth Chase Cam target tracking
    this.currentCameraPos = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();

    // Orbit controls for DRONE mode
    this.orbitDistance = 24;
    this.orbitAzimuth = 0;
    this.orbitElevation = 25;
    this.isDragging = false;
    this.lastPointer = [0, 0];

    // FOV management
    this.baseFov = 55;
    this.targetFov = 55;

    // Screen Shake Trauma
    this.shakeTrauma = 0;

    // Snap state: the chase cam lerps from its current position, so it must be
    // placed on the car once (spawn) instead of flying in from the origin
    // (which crosses buildings/ground = black flashes when starting to drive).
    this.snapped = false;

    this.setupControls();
  }

  addImpactShake(intensity = 0.5) {
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + intensity);
  }

  get mode() {
    return this.modes[this.currentModeIndex];
  }

  setupControls() {
    window.addEventListener('keydown', (e) => {
      const el = document.activeElement;
      if (el?.tagName === 'INPUT') return;
      if (e.code === 'KeyC') {
        this.nextMode();
      }
    });

    this.domElement.addEventListener('pointerdown', (e) => {
      if (this.mode !== CAMERA_MODES.DRONE) return;
      this.isDragging = true;
      this.lastPointer = [e.clientX, e.clientY];
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging || this.mode !== CAMERA_MODES.DRONE) return;
      const dx = e.clientX - this.lastPointer[0];
      const dy = e.clientY - this.lastPointer[1];
      this.orbitAzimuth -= dx * 0.006;
      this.orbitElevation = THREE.MathUtils.clamp(this.orbitElevation + dy * 0.2, 5, 80);
      this.lastPointer = [e.clientX, e.clientY];
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    this.domElement.addEventListener('wheel', (e) => {
      if (this.mode === CAMERA_MODES.DRONE) {
        this.orbitDistance = THREE.MathUtils.clamp(this.orbitDistance + e.deltaY * 0.05, 8, 120);
      }
    }, { passive: true });
  }

  nextMode() {
    this.currentModeIndex = (this.currentModeIndex + 1) % this.modes.length;
    // Chase mode lerps from the stored position: re-snap so the camera does
    // not sweep through the city when switching views.
    this.snapped = false;
    return this.mode;
  }

  setMode(modeName) {
    const idx = this.modes.indexOf(modeName);
    if (idx !== -1) this.currentModeIndex = idx;
    this.snapped = false;
    return this.mode;
  }

  // Place the camera directly at its ideal spot (spawn, respawn, view change).
  snap() {
    this.snapped = false;
    this.update(0.0001);
  }

  private clampAboveGround(pos: THREE.Vector3, margin: number) {
    try {
      const surface = this.vehicle?.streamer?.surface;
      if (typeof surface !== 'function') return;
      const minY = surface(pos.x, pos.z) + margin;
      if (pos.y < minY) pos.y = minY;
    } catch { /* surface unavailable before streamer init */ }
  }

  // Pull the chase camera in front of any building wall between the car and
  // the desired camera spot. Without this the boom ends up inside a building
  // (dark frame) whenever the car stops against one.
  private resolveBoom(outPos: THREE.Vector3) {
    try {
      const s = this.vehicle?.streamer;
      if (!s?.getCollidersNear) return;
      const from = this.vehicle.position;
      const dx = outPos.x - from.x, dy = outPos.y - from.y, dz = outPos.z - from.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) return;
      const segs = s.getCollidersNear((from.x + outPos.x) / 2, (from.z + outPos.z) / 2, outPos.y, 10);
      const crowns = s.getCrownsNear ? s.getCrownsNear((from.x + outPos.x) / 2, (from.z + outPos.z) / 2, 10) : [];
      const sticks = s.getSticksNear ? s.getSticksNear((from.x + outPos.x) / 2, (from.z + outPos.z) / 2, 10) : [];
      if ((!segs || !segs.length) && (!crowns || !crowns.length) && (!sticks || !sticks.length)) return;
      const STEPS = 8;
      // Never pull the lens inside the car itself (~2.4 m behind its centre).
      const minClear = Math.min(0.9, 2.4 / len);
      let clear = 1;
      for (let i = 1; i <= STEPS; i++) {
        const px = from.x + dx * (i / STEPS), py = from.y + dy * (i / STEPS), pz = from.z + dz * (i / STEPS);
        const blocked = (segs && segs.length && this.hitsWall(segs, px, pz, 1.1)) ||
          (crowns && crowns.length && this.hitsCrown(crowns, px, py, pz)) ||
          (sticks && sticks.length && this.hitsStick(sticks, px, pz));
        if (blocked) { clear = Math.max(minClear, (i - 1.5) / STEPS); break; }
      }
      if (clear < 1) {
        outPos.set(from.x + dx * clear, from.y + dy * clear, from.z + dz * clear);
        // Narrow street, tall buildings both sides: even the pulled-in spot
        // can sit inside a wall. Fall back to above the car — open sky beats
        // a black frame, and the car stays centred.
        const stillBlocked = (segs && segs.length && this.hitsWall(segs, outPos.x, outPos.z, 0.7)) ||
          (crowns && crowns.length && this.hitsCrown(crowns, outPos.x, outPos.y, outPos.z)) ||
          (sticks && sticks.length && this.hitsStick(sticks, outPos.x, outPos.z));
        if (stillBlocked) {
          outPos.set(from.x - (dx / len) * 1.5, from.y + 5.5, from.z - (dz / len) * 1.5);
        }
      }
    } catch { /* colliders unavailable: keep the desired spot */ }
  }

  // Last resort: the desired spot itself sits inside a wall, a tree crown,
  // a pole or the car. Lift straight up until clear — a high view always
  // beats a black frame.
  private escapeWall(outPos: THREE.Vector3) {
    try {
      const s = this.vehicle?.streamer;
      if (!s?.getCollidersNear) return;
      for (let lift = 0; lift <= 5; lift += 0.7) {
        const segs = s.getCollidersNear(outPos.x, outPos.z, outPos.y, 3);
        const crowns = s.getCrownsNear ? s.getCrownsNear(outPos.x, outPos.z, 4) : [];
        const sticks = s.getSticksNear ? s.getSticksNear(outPos.x, outPos.z, 4) : [];
        const inWall = segs && segs.length && this.hitsWall(segs, outPos.x, outPos.z, 0.6);
        const inCrown = crowns && crowns.length && this.hitsCrown(crowns, outPos.x, outPos.y, outPos.z);
        const inStick = sticks && sticks.length && this.hitsStick(sticks, outPos.x, outPos.z);
        if (!inWall && !inCrown && !inStick) return;
        outPos.y += 0.7;
      }
    } catch { /* keep the spot */ }
  }

  // Inside the clearance radius of a pole, mast, machine or parked car?
  // (PROP kinds from shared/tileformat.js; stadium-sized furniture first.)
  private hitsStick(sticks: number[], px: number, pz: number) {
    for (let i = 0; i < sticks.length; i += 3) {
      const dx = sticks[i] - px, dz = sticks[i + 1] - pz;
      const r = STICK_RADIUS[sticks[i + 2]] ?? 0.8;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // Inside a tree crown? Ellipsoid test around each foliage centre.
  private hitsCrown(crowns: number[], px: number, py: number, pz: number) {
    for (let i = 0; i < crowns.length; i += 3) {
      const dx = crowns[i] - px, dz = crowns[i + 2] - pz;
      if (dx * dx + dz * dz > 2.8 * 2.8) continue;
      if (Math.abs(crowns[i + 1] - py) < 3.4) return true;
    }
    return false;
  }

  // Hide the car body when the lens gets too close (wall right behind the
  // car): otherwise the camera sits inside the mesh and the frame goes
  // black with only a sliver of street visible.
  private updateCarVisibility() {
    try {
      const g = this.vehicle?.model?.group;
      if (!g) return;
      g.visible = this.camera.position.distanceTo(this.vehicle.position) > 2.6;
    } catch { /* keep visible */ }
  }

  private hitsWall(segs: number[], px: number, pz: number, r: number) {
    const r2 = r * r;
    for (let s = 0; s < segs.length; s += 4) {
      const xA = segs[s], zA = segs[s + 1], xB = segs[s + 2], zB = segs[s + 3];
      const dx = xB - xA, dz = zB - zA;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((px - xA) * dx + (pz - zA) * dz) / lenSq));
      const qx = xA + dx * t - px, qz = zA + dz * t - pz;
      if (qx * qx + qz * qz < r2) return true;
    }
    return false;
  }

  // Ideal camera position + look target for the current mode (no smoothing).
  private computeIdeal(outPos: THREE.Vector3, outLook: THREE.Vector3) {
    const carPos = this.vehicle.position;
    const yaw = this.vehicle.yaw;
    const speed = Math.abs(this.vehicle.speed);
    const speedRatio = Math.min(1.0, speed / 260);

    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const mode = this.mode;

    if (mode === CAMERA_MODES.CHASE) {
      // Burnout Paradise Cinematic Action Chase
      // Distance stretches back at speed and boost: 6.2m -> 10.5m
      const followDist = 6.2 + speedRatio * 3.4 + (this.vehicle.isBoosting ? 1.2 : 0);
      const followHeight = 2.1 + speedRatio * 0.65;

      // Dynamic Drift Framing:
      // When sliding sideways, camera swings out to frame the slide and road ahead
      let driftOffset = 0;
      if (this.vehicle.isDrifting) {
        driftOffset = -this.vehicle.driftDirection * (this.vehicle.driftFactor * 2.2);
      }

      // Slight steer look-ahead
      const steerLook = -this.vehicle.steerAngle * 2.2;

      outPos.set(
        carPos.x - forwardX * followDist + rightX * driftOffset,
        carPos.y + followHeight,
        carPos.z - forwardZ * followDist + rightZ * driftOffset
      );

      const lookAheadDist = 9 + speedRatio * 15;
      const driftLookBonus = this.vehicle.isDrifting ? this.vehicle.driftDirection * 3.5 : 0;

      outLook.set(
        carPos.x + forwardX * lookAheadDist + rightX * (steerLook + driftLookBonus),
        carPos.y + 1.15,
        carPos.z + forwardZ * lookAheadDist + rightZ * (steerLook + driftLookBonus)
      );
    } else if (mode === CAMERA_MODES.HOOD) {
      // 1st Person Hood / Cockpit View
      outPos.set(
        carPos.x + forwardX * 0.45,
        carPos.y + 1.05,
        carPos.z + forwardZ * 0.45
      );
      outLook.set(
        carPos.x + forwardX * 28,
        carPos.y + 1.1,
        carPos.z + forwardZ * 28
      );
    } else if (mode === CAMERA_MODES.BUMPER) {
      // Low Asphalt Bumper View
      outPos.set(
        carPos.x + forwardX * 2.1,
        carPos.y + 0.35,
        carPos.z + forwardZ * 2.1
      );
      outLook.set(
        carPos.x + forwardX * 32,
        carPos.y + 0.45,
        carPos.z + forwardZ * 32
      );
    } else {
      // Free Orbit Spectator Mode
      const radEl = THREE.MathUtils.degToRad(this.orbitElevation);
      const radAz = this.orbitAzimuth + yaw;

      const ox = this.orbitDistance * Math.cos(radEl) * Math.sin(radAz);
      const oy = this.orbitDistance * Math.sin(radEl);
      const oz = this.orbitDistance * Math.cos(radEl) * Math.cos(radAz);

      outPos.set(carPos.x + ox, carPos.y + oy, carPos.z + oz);
      outLook.set(carPos.x, carPos.y + 1.0, carPos.z);
    }
  }

  update(dt: number) {
    const carPos = this.vehicle.position;
    const speed = Math.abs(this.vehicle.speed);
    const speedRatio = Math.min(1.0, speed / 260);

    // Dynamic FOV scaling: dramatic speed tunnel warp (55° up to 84° under Nitro Boost).
    // Only rebuild the projection matrix past a threshold: every rebuild also
    // resyncs the depth-dependent post-processing passes (AO, reflections).
    const boostFov = this.vehicle.isBoosting ? 14 : 0;
    const chainFov = Math.min(6, (this.vehicle.burnoutChainCount || 0) * 2);
    const extraFov = (speedRatio * 15) + boostFov + chainFov;
    this.targetFov = this.baseFov + extraFov;
    if (Math.abs(this.camera.fov - this.targetFov) > 0.02) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFov, Math.min(1, dt * 8));
      this.camera.updateProjectionMatrix();
    }

    const mode = this.mode;

    this.computeIdeal(_idealPos, _idealLook);

    if (mode === CAMERA_MODES.CHASE) {
      if (!this.snapped) {
        // First frame / after teleport: jump straight to the car instead of
        // lerping from the world origin through buildings.
        this.currentCameraPos.copy(_idealPos);
        this.currentLookAt.copy(_idealLook);
        this.snapped = true;
      } else {
        // Smooth lag damping
        const posLerp = 1.0 - Math.exp(-dt * (9.0 + speedRatio * 7.0));
        const lookLerp = 1.0 - Math.exp(-dt * 14.0);

        this.currentCameraPos.lerp(_idealPos, posLerp);
        this.currentLookAt.lerp(_idealLook, lookLerp);
      }

      this.clampAboveGround(this.currentCameraPos, 0.8);
      this.resolveBoom(this.currentCameraPos);
      this.escapeWall(this.currentCameraPos);
      this.camera.position.copy(this.currentCameraPos);
      this.camera.lookAt(this.currentLookAt);
      this.updateCarVisibility();

      // Subtle dynamic horizon roll / Dutch angle into corners
      const lateralG = this.vehicle.lateralG || 0;
      const targetRoll = THREE.MathUtils.clamp(-lateralG * 0.035, -0.065, 0.065);
      this.camera.rotation.z += targetRoll;

    } else if (mode === CAMERA_MODES.HOOD) {
      this.clampAboveGround(_idealPos, 0.5);
      this.escapeWall(_idealPos);
      this.camera.position.copy(_idealPos);
      this.camera.lookAt(_idealLook);

    } else if (mode === CAMERA_MODES.BUMPER) {
      this.clampAboveGround(_idealPos, 0.25);
      this.escapeWall(_idealPos);
      this.camera.position.copy(_idealPos);
      this.camera.lookAt(_idealLook);

    } else if (mode === CAMERA_MODES.DRONE) {
      this.clampAboveGround(_idealPos, 0.5);
      this.escapeWall(_idealPos);
      this.camera.position.copy(_idealPos);
      this.camera.lookAt(_idealLook);
    }

    // High speed engine & wind vibration (Burnout Paradise thrill)
    if (speed > 210 || this.vehicle.isBoosting) {
      const vib = this.vehicle.isBoosting ? 0.045 : (speed - 210) / 100 * 0.03;
      this.camera.position.x += (Math.random() * 2 - 1) * vib;
      this.camera.position.y += (Math.random() * 2 - 1) * vib * 0.6;
      this.camera.position.z += (Math.random() * 2 - 1) * vib;
    }

    // Apply procedural impact trauma shake
    if (this.shakeTrauma > 0.001) {
      const s = this.shakeTrauma * this.shakeTrauma;
      this.camera.position.x += (Math.random() * 2 - 1) * 0.48 * s;
      this.camera.position.y += (Math.random() * 2 - 1) * 0.42 * s;
      this.camera.position.z += (Math.random() * 2 - 1) * 0.48 * s;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.6);
    }
  }
}
