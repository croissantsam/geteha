import * as THREE from 'three';
import { CarModel } from './carModel.js';

export class VehicleController {
  scene: THREE.Scene;
  streamer: any;
  particles: any;
  sound: any;
  roads: any;
  camera: any;

  // Vehicle 3D Visual Model
  model: CarModel;

  // Transform State
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number; // heading in radians
  pitch: number;
  roll: number;

  // Dynamics State
  speed: number; // km/h
  speedMs: number; // m/s
  steerAngle: number;
  targetSteer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  isBraking: boolean;
  isReversing: boolean;

  // Engine & Transmission
  rpm: number; // Idle RPM
  gear: number;
  gearRatios: number[];
  maxSpeedPerGear: number[];

  // Nitro System
  nitro: number; // 0 - 100%
  isBoosting: boolean;
  nitroDepletionRate: number; // % per second
  nitroRechargeRate: number; // % per second

  // Drift System
  driftFactor: number;
  driftAngle: number;
  driftDirection: number;
  isDrifting: boolean;
  driftScore: number;
  currentDriftPoints: number;
  driftMultiplier: number;
  driftComboTimer: number;

  // Burnout Paradise Mechanics
  wasBrakePressed: boolean;
  lateralG: number;
  visualSteer: number;
  burnoutEarnedInCurrentBurn: number;
  burnoutChainCount: number;
  burnoutAlertTimer: number;

  // Input States
  inputs: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    handbrake: boolean;
    boost: boolean;
    horn: boolean;
  };

  // Collision parameters
  carRadius: number;
  lastCrashTime: number;

  constructor(scene: THREE.Scene, streamer: any, particles: any, sound: any, roads: any) {
    this.scene = scene;
    this.streamer = streamer;
    this.particles = particles;
    this.sound = sound;
    this.roads = roads;
    this.camera = null;

    // Vehicle 3D Visual Model
    this.model = new CarModel(scene);

    // Transform State
    this.position = new THREE.Vector3(0, 5, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // heading in radians
    this.pitch = 0;
    this.roll = 0;

    // Dynamics State
    this.speed = 0; // km/h
    this.speedMs = 0; // m/s
    this.steerAngle = 0;
    this.targetSteer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.isBraking = false;
    this.isReversing = false;

    // Engine & Transmission
    this.rpm = 800; // Idle RPM
    this.gear = 1;
    this.gearRatios = [3.8, 2.4, 1.7, 1.3, 1.0, 0.78];
    this.maxSpeedPerGear = [45, 90, 140, 190, 240, 280]; // km/h

    // Nitro System
    this.nitro = 100; // 0 - 100%
    this.isBoosting = false;
    this.nitroDepletionRate = 35; // % per second
    this.nitroRechargeRate = 8; // % per second

    // Drift System
    this.driftFactor = 0;
    this.driftAngle = 0;
    this.driftDirection = 1;
    this.isDrifting = false;
    this.driftScore = 0;
    this.currentDriftPoints = 0;
    this.driftMultiplier = 1.0;
    this.driftComboTimer = 0;

    // Burnout Paradise Mechanics
    this.wasBrakePressed = false;
    this.lateralG = 0;
    this.visualSteer = 0;
    this.burnoutEarnedInCurrentBurn = 0;
    this.burnoutChainCount = 0;
    this.burnoutAlertTimer = 0;

    // Input States
    this.inputs = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      handbrake: false,
      boost: false,
      horn: false,
    };

    // Collision parameters
    this.carRadius = 1.8;
    this.lastCrashTime = 0;

    this.setupKeyboard();
  }

  setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      const el = document.activeElement;
      if (el?.tagName === 'INPUT') return;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.inputs.forward = true;
          this.sound?.ensureContext();
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.inputs.backward = true;
          this.sound?.ensureContext();
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.inputs.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.inputs.right = true;
          break;
        case 'Space':
          this.inputs.handbrake = true;
          e.preventDefault();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.inputs.boost = true;
          break;
        case 'KeyH':
          this.inputs.horn = true;
          this.sound?.setHorn(true);
          break;
        case 'KeyL':
          this.model.toggleHeadlights();
          break;
        case 'KeyU':
          this.model.cycleUnderglow();
          break;
        case 'KeyK':
          this.model.cycleColor();
          break;
        case 'KeyR':
          this.respawnOnRoad();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.inputs.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.inputs.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.inputs.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.inputs.right = false;
          break;
        case 'Space':
          this.inputs.handbrake = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.inputs.boost = false;
          break;
        case 'KeyH':
          this.inputs.horn = false;
          this.sound?.setHorn(false);
          break;
      }
    });
  }

  addStuntNitro(amount: number) {
    this.nitro = Math.min(100, this.nitro + amount);
    if (this.isBoosting) {
      this.burnoutEarnedInCurrentBurn += amount;
    }
  }

  // Initial placement of car on a prime road near center
  spawnAt(x: number, z: number, heading = 0) {
    this.position.x = x;
    this.position.z = z;
    this.position.y = this.streamer.surface(x, z) + 0.1;
    this.yaw = heading;
    this.speed = 0;
    this.speedMs = 0;
    this.velocity.set(0, 0, 0);
    this.isDrifting = false;
    this.driftFactor = 0;
    this.driftAngle = 0;
    this.burnoutChainCount = 0;
    this.burnoutEarnedInCurrentBurn = 0;
    this.updateModelTransform();
  }

  // Reset onto nearest road lane
  respawnOnRoad() {
    let nearestDist = Infinity;
    let targetX = this.position.x;
    let targetZ = this.position.z;
    let targetYaw = this.yaw;

    if (this.roads?.edges) {
      for (const e of this.roads.edges) {
        if (!e.pts || e.pts.length < 6) continue;
        for (let i = 0; i < e.pts.length - 3; i += 3) {
          const px = e.pts[i], pz = e.pts[i + 2];
          const dist = Math.hypot(px - this.position.x, pz - this.position.z);
          if (dist < nearestDist) {
            nearestDist = dist;
            targetX = px;
            targetZ = pz;
            const nx = e.pts[i + 3], nz = e.pts[i + 5];
            targetYaw = Math.atan2(nx - px, nz - pz);
          }
        }
      }
    }

    this.position.x = targetX;
    this.position.z = targetZ;
    this.position.y = this.streamer.surface(targetX, targetZ) + 0.2;
    this.yaw = targetYaw;
    this.speed = 0;
    this.speedMs = 0;
    this.velocity.set(0, 0, 0);
    this.isDrifting = false;
    this.driftFactor = 0;
    this.driftAngle = 0;
    this.burnoutChainCount = 0;
    this.burnoutEarnedInCurrentBurn = 0;
    this.updateModelTransform();
    // Teleport: put the chase camera straight on the car, otherwise it sweeps
    // through buildings on its way over (black flashes).
    try { (this.camera as any)?.snap?.(); } catch { /* camera not attached yet */ }
  }

  update(dt: number, traffic: any) {
    if (dt > 0.1) dt = 0.1; // Safety clamp on frame drops

    // Update Burnout Alert Timer
    if (this.burnoutAlertTimer > 0) {
      this.burnoutAlertTimer = Math.max(0, this.burnoutAlertTimer - dt);
    }

    // 1. Process Steering Inputs
    let steerDir = 0;
    if (this.inputs.left) steerDir += 1;
    if (this.inputs.right) steerDir -= 1;

    const isForward = this.inputs.forward;
    const isBrakingInput = this.inputs.backward;
    const isHandbrake = this.inputs.handbrake;
    const isBoostInput = this.inputs.boost;

    // Detect Brake tap for Burnout "Brake-To-Drift"
    const brakeJustTapped = isBrakingInput && !this.wasBrakePressed;
    this.wasBrakePressed = isBrakingInput;

    const currentSpeedKmh = Math.abs(this.speed);
    const headingX = Math.sin(this.yaw);
    const headingZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    // Current longitudinal and lateral speed components
    const vLong = this.velocity.x * headingX + this.velocity.z * headingZ;
    const vLat = this.velocity.x * rightX + this.velocity.z * rightZ;

    // --- BURNOUT BRAKE-TO-DRIFT INITIATION ---
    const canDrift = currentSpeedKmh > 30;
    const steerActive = Math.abs(steerDir) > 0.15 || Math.abs(this.steerAngle) > 0.08;

    if (canDrift && steerActive) {
      // Trigger 1: Tap brake while steering
      // Trigger 2: Tap handbrake while steering
      // Trigger 3: Hard steer at speed while boosting
      if (brakeJustTapped || isHandbrake || (isBoostInput && Math.abs(this.steerAngle) > 0.28 && currentSpeedKmh > 75)) {
        if (!this.isDrifting) {
          this.isDrifting = true;
          this.driftDirection = steerDir !== 0 ? steerDir : Math.sign(this.steerAngle || 1);
          // Initial weight transfer: crisp momentary scrub (-4%), NOT stopping the car!
          this.velocity.multiplyScalar(0.96);
          this.sound?.playTurboFlutter?.();
          this.camera?.addImpactShake?.(0.12);
        }
      }
    }

    // Determine target throttle and braking
    let targetThrottle = 0;
    let targetBrake = 0;

    if (this.isDrifting) {
      // While in Burnout drift:
      // Tapping or holding W gives FULL forward drive along car yaw
      // S / Backward slows down only if held without forward throttle
      if (isForward) {
        targetThrottle = 1.0;
      } else if (isBrakingInput && !brakeJustTapped) {
        targetBrake = 0.5;
      }
    } else {
      if (isForward) {
        targetThrottle = 1.0;
      } else if (isBrakingInput) {
        if (vLong > 1.0) {
          targetBrake = 1.0;
        } else {
          targetThrottle = -0.65; // Reverse
        }
      }
    }

    this.handbrake = isHandbrake;
    this.throttle = THREE.MathUtils.lerp(this.throttle, targetThrottle, dt * 14);
    this.brake = THREE.MathUtils.lerp(this.brake, targetBrake, dt * 14);
    this.isBraking = this.brake > 0.1 || (isHandbrake && currentSpeedKmh > 10);
    this.isReversing = targetThrottle < 0;

    // --- BURNOUT NITRO & BOOST CHAINING SYSTEM ---
    const canBoost = isBoostInput && this.nitro > 1 && (this.throttle > 0 || this.isDrifting);
    if (canBoost) {
      this.isBoosting = true;
      this.nitro = Math.max(0, this.nitro - this.nitroDepletionRate * dt);
    } else {
      this.isBoosting = false;
    }

    // Stunt Boost Refills
    let stuntRefill = 0;
    if (this.isDrifting && currentSpeedKmh > 35) {
      // Drifting refills nitro rapidly!
      stuntRefill += 32 * dt;
    }
    if (currentSpeedKmh > 150) {
      // High speed refills nitro
      stuntRefill += 12 * dt;
    }
    if (!this.isBoosting) {
      // Passive trickle when not boosting
      stuntRefill += this.nitroRechargeRate * dt;
    }

    if (this.isBoosting) {
      // Track boost stunts earned during this continuous burn
      this.burnoutEarnedInCurrentBurn += stuntRefill;
      // Check for Burnout Chain trigger when boost bar empties!
      if (this.nitro <= 0.6) {
        if (this.burnoutEarnedInCurrentBurn >= 75) {
          // BURNOUT! +100% BOOST REFILL CHAIN!
          this.nitro = 100;
          this.burnoutChainCount++;
          this.burnoutEarnedInCurrentBurn = 0;
          this.burnoutAlertTimer = 2.4;
          this.sound?.playBurnoutFanfare?.();
          this.sound?.playTurboFlutter?.();
          this.camera?.addImpactShake?.(0.45);
        } else {
          // Burnout failed, empty boost
          this.burnoutChainCount = 0;
          this.burnoutEarnedInCurrentBurn = 0;
        }
      }
    } else {
      // Apply stunt refill to nitro meter
      this.nitro = Math.min(100, this.nitro + stuntRefill);
      if (!isBoostInput) {
        this.burnoutEarnedInCurrentBurn = 0;
      }
    }

    // --- STEERING DYNAMICS ---
    // Snappy, arcade-responsive steering
    const speedRatio = Math.min(1.0, currentSpeedKmh / 240);
    const maxSteerDeg = 36 - speedRatio * 16; // 36° low speed, 20° at 240 km/h
    const maxSteer = THREE.MathUtils.degToRad(maxSteerDeg);
    this.targetSteer = steerDir * maxSteer;
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, this.targetSteer, dt * 18);

    // --- DYNAMICS & FORCES ---
    // Top speed & acceleration curves
    const chainBonus = Math.min(30, this.burnoutChainCount * 8);
    const maxForwardSpeed = this.isBoosting ? (340 + chainBonus) : 260; // km/h
    const maxForwardSpeedMs = maxForwardSpeed / 3.6;
    const baseAccel = this.isBoosting ? 22.5 : 11.2; // m/s^2 (0-100 km/h in 2.2s normal, 1.8s boost)

    let accelFwd = 0;
    if (this.throttle > 0) {
      const powerFactor = Math.max(0.12, 1 - (vLong / maxForwardSpeedMs));
      // In drift, boost forward propulsion through corner exit
      const driftDriveBonus = this.isDrifting ? 1.25 : 1.0;
      accelFwd = this.throttle * baseAccel * powerFactor * driftDriveBonus;
    } else if (this.throttle < 0) {
      accelFwd = this.throttle * 6.5; // Reverse
    }

    // Braking deceleration
    if (this.brake > 0) {
      accelFwd -= Math.sign(vLong || 1) * this.brake * 16.0;
    }

    // Aerodynamic drag and rolling resistance
    const dragCoeff = 0.00065;
    const totalDrag = (dragCoeff * vLong * vLong + 0.38) * Math.sign(vLong || 1);
    accelFwd -= totalDrag;

    // --- DRIFT STATE & LATERAL GRIP ---
    if (this.isDrifting) {
      this.driftFactor = THREE.MathUtils.lerp(this.driftFactor, Math.min(1.0, Math.abs(vLat) / 8 + 0.45), dt * 8);

      // Score drift points
      const points = Math.round(currentSpeedKmh * (this.driftFactor + 0.5) * 28 * dt);
      this.currentDriftPoints += points;
      this.driftMultiplier = Math.min(5.0, this.driftMultiplier + dt * 0.4);
      this.driftComboTimer = 2.0;

      // Oversteer Yaw Torque
      const wheelBase = 2.8;
      let turnRate = (vLong / wheelBase) * Math.tan(this.steerAngle);

      // Burnout Oversteer: car tail steps out into drift
      const oversteerAmount = this.driftDirection * (1.6 + this.driftFactor * 1.8) * Math.sign(vLong || 1);
      turnRate += oversteerAmount;

      // Counter-steering control:
      // If player steers against driftDirection, reduce turn rate and straighten out
      if (steerDir === -this.driftDirection) {
        turnRate -= this.driftDirection * 2.4;
      } else if (steerDir === this.driftDirection) {
        turnRate += this.driftDirection * 1.2;
      }

      this.yaw += turnRate * dt;

      // Lateral Grip in drift: low grip lets car slide sideways
      const driftGripCoeff = 3.4; // m/s^2 per m/s slip
      const accelLat = -vLat * driftGripCoeff;

      // Update horizontal velocity
      this.velocity.x += (headingX * accelFwd + rightX * accelLat) * dt;
      this.velocity.z += (headingZ * accelFwd + rightZ * accelLat) * dt;

      // Compute slip angle beta
      const currentVLong = this.velocity.x * headingX + this.velocity.z * headingZ;
      const currentVLat = this.velocity.x * rightX + this.velocity.z * rightZ;
      this.driftAngle = Math.atan2(currentVLat, Math.max(0.1, Math.abs(currentVLong)));

      // Visual counter-steer for front wheels
      this.visualSteer = THREE.MathUtils.clamp(
        this.steerAngle - (this.driftAngle * 0.9),
        -THREE.MathUtils.degToRad(42),
        THREE.MathUtils.degToRad(42)
      );

      // Check for drift exit
      const isStraightening = (steerDir === -this.driftDirection || steerDir === 0);
      const isAligned = Math.abs(currentVLat) < 1.6;
      if ((isStraightening && isAligned) || currentSpeedKmh < 20) {
        this.isDrifting = false;
        // Grip-Snap Forward Boost on clean exit!
        if (currentSpeedKmh > 70 && this.throttle > 0.5) {
          this.velocity.x += headingX * 2.8;
          this.velocity.z += headingZ * 2.8;
          this.sound?.playTurboFlutter?.();
          this.camera?.addImpactShake?.(0.15);
        }
      }
    } else {
      // Normal Grip Driving (car tracks faithfully)
      this.driftFactor = THREE.MathUtils.lerp(this.driftFactor, 0, dt * 6);
      this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, 0, dt * 8);
      this.visualSteer = this.steerAngle;

      // Normal turn rate
      const wheelBase = 2.8;
      const turnRate = (vLong / wheelBase) * Math.tan(this.steerAngle);
      this.yaw += turnRate * dt;

      // Tight lateral grip (no unwanted slide)
      const normalGripCoeff = 18.0;
      const accelLat = -vLat * normalGripCoeff;

      // Update horizontal velocity
      this.velocity.x += (headingX * accelFwd + rightX * accelLat) * dt;
      this.velocity.z += (headingZ * accelFwd + rightZ * accelLat) * dt;

      // Bank drift combo points
      if (this.driftComboTimer > 0) {
        this.driftComboTimer -= dt;
        if (this.driftComboTimer <= 0) {
          this.driftScore += Math.round(this.currentDriftPoints * this.driftMultiplier);
          this.currentDriftPoints = 0;
          this.driftMultiplier = 1.0;
        }
      }
    }

    // Stop complete micro-drift jitter when stationary
    if (this.velocity.lengthSq() < 0.04 && this.throttle === 0 && this.brake === 0) {
      this.velocity.set(0, 0, 0);
    }

    // Update speeds
    const updatedVLong = this.velocity.x * headingX + this.velocity.z * headingZ;
    this.speedMs = updatedVLong;
    this.speed = this.speedMs * 3.6;

    // Lateral G acceleration for chassis roll and camera
    this.lateralG = (vLong * (this.steerAngle / 2.8)) + (this.isDrifting ? -this.driftDirection * 1.5 : 0);

    // 5. Update Position
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // 6. Terrain / Road Surface Conformance
    const surfaceY = this.streamer.surface(this.position.x, this.position.z);
    this.position.y = THREE.MathUtils.lerp(this.position.y, surfaceY + 0.05, dt * 18);

    // Road pitch
    const probeDist = 1.6;
    const frontGround = this.streamer.surface(this.position.x + headingX * probeDist, this.position.z + headingZ * probeDist);
    const rearGround = this.streamer.surface(this.position.x - headingX * probeDist, this.position.z - headingZ * probeDist);
    const roadPitch = Math.atan2(frontGround - rearGround, probeDist * 2);
    this.pitch = THREE.MathUtils.lerp(this.pitch, roadPitch, dt * 12);

    // 7. Transmission
    this.updateTransmission();

    // 8. Building Collisions & Glancing wall scrapes
    this.checkBuildingCollisions();
    this.checkCollisions(traffic);

    // 9. Particle Effects
    this.updateParticles(headingX, headingZ);

    // 10. Sound Engine Update
    if (this.sound) {
      this.sound.update({
        speed: this.speed,
        rpm: this.rpm,
        gear: this.gear,
        throttle: this.throttle,
        driftFactor: this.driftFactor,
        isBoosting: this.isBoosting,
        vLat: vLat,
      });
    }

    // 11. Sync 3D Visual Model
    this.updateModelTransform();
    this.model.update(
      {
        speed: this.speed,
        steerAngle: this.steerAngle,
        visualSteer: this.visualSteer,
        lateralG: this.lateralG,
        isBraking: this.isBraking,
        isReversing: this.isReversing,
        handbrake: this.handbrake,
        throttle: this.throttle,
        driftFactor: this.driftFactor,
        isBoosting: this.isBoosting,
      },
      dt
    );
  }

  // Building & Barrier Collision Physics
  checkBuildingCollisions() {
    if (!this.streamer?.getCollidersNear) return;

    const carY = this.position.y;
    const now = performance.now();

    let totalCollided = false;
    let strongestImpactDot = 0;
    let finalNormX = 0, finalNormZ = 0;
    let bestContactX = this.position.x, bestContactZ = this.position.z;

    // 2 iterations of relaxation to prevent sticking in corners or sharp building angles
    for (let iter = 0; iter < 2; iter++) {
      const carX = this.position.x;
      const carZ = this.position.z;

      // Search for wall segments within 12 meters of the car
      const segments = this.streamer.getCollidersNear(carX, carZ, carY, 12);
      if (!segments || !segments.length) break;

      const effectiveYaw = this.yaw + this.driftAngle;
      const fwdX = Math.sin(effectiveYaw);
      const fwdZ = Math.cos(effectiveYaw);

      // 3 probes along car body: front bumper, center, and rear bumper
      const probes = [
        { x: carX + fwdX * 1.35, z: carZ + fwdZ * 1.35, r: 1.1 },
        { x: carX, z: carZ, r: 1.15 },
        { x: carX - fwdX * 1.35, z: carZ - fwdZ * 1.35, r: 1.1 },
      ];

      let maxOverlap = 0;
      let pushX = 0, pushZ = 0;
      let hitContactX = carX, hitContactZ = carZ;
      let iterCollided = false;

      for (let s = 0; s < segments.length; s += 4) {
        const xA = segments[s], zA = segments[s + 1], xB = segments[s + 2], zB = segments[s + 3];
        const dx = xB - xA, dz = zB - zA;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 0.05) continue;
        const segLen = Math.sqrt(lenSq);
        const wallOutX = -dz / segLen;
        const wallOutZ = dx / segLen;

        for (const p of probes) {
          const t = Math.max(0, Math.min(1, ((p.x - xA) * dx + (p.z - zA) * dz) / lenSq));
          const projX = xA + t * dx;
          const projZ = zA + t * dz;
          const distSq = (p.x - projX) ** 2 + (p.z - projZ) ** 2;

          if (distSq < p.r * p.r) {
            const dist = Math.sqrt(distSq) || 0.001;
            const overlap = p.r - dist;

            let nx = (p.x - projX) / dist;
            let nz = (p.z - projZ) / dist;

            // Ensure push direction always points outward away from the building interior
            if (nx * wallOutX + nz * wallOutZ < 0) {
              nx = wallOutX;
              nz = wallOutZ;
            }

            if (overlap > maxOverlap) {
              maxOverlap = overlap;
              pushX = nx * overlap;
              pushZ = nz * overlap;
              hitContactX = projX;
              hitContactZ = projZ;
            }
            iterCollided = true;
          }
        }
      }

      if (iterCollided && maxOverlap > 0) {
        totalCollided = true;
        this.position.x += pushX * 1.06;
        this.position.z += pushZ * 1.06;

        const nLen = Math.hypot(pushX, pushZ) || 1;
        finalNormX = pushX / nLen;
        finalNormZ = pushZ / nLen;
        bestContactX = hitContactX;
        bestContactZ = hitContactZ;
      } else {
        break;
      }
    }

    if (totalCollided) {
      const velX = this.velocity.x;
      const velZ = this.velocity.z;
      const dot = velX * finalNormX + velZ * finalNormZ;

      if (dot < 0) {
        const impactSpeed = Math.abs(this.speed);
        strongestImpactDot = dot;

        // Sound, sparks & crash feedback
        if (impactSpeed > 10 && now - this.lastCrashTime > 150) {
          this.sound?.playCrash(Math.min(1.0, impactSpeed / 70));
          this.particles?.emitCrashSparks(
            new THREE.Vector3(bestContactX, carY + 0.35, bestContactZ),
            new THREE.Vector3(finalNormX, 0.45, finalNormZ)
          );
          // Camera punch trauma shake
          if (impactSpeed > 18) {
            this.camera?.addImpactShake(Math.min(1.0, impactSpeed / 55));
          }
          this.lastCrashTime = now;
        }

        // Tangent and normal decomposition
        const tangentX = -finalNormZ, tangentZ = finalNormX;
        const tangSpeed = velX * tangentX + velZ * tangentZ;
        const restitution = 0.22;
        const friction = 0.88; // Glancing wall-scrape preserves speed

        // Normal rebound and tangent friction
        const resNormal = -dot * restitution;
        const resTang = tangSpeed * friction;

        const resVelX = finalNormX * resNormal + tangentX * resTang;
        const resVelZ = finalNormZ * resNormal + tangentZ * resTang;

        const absTang = Math.abs(tangSpeed);
        const absNorm = Math.abs(dot);

        // Turn gently along the wall if sliding/scraping
        if (absTang > absNorm * 0.35) {
          const targetYaw = Math.atan2(tangentX * Math.sign(tangSpeed || 1), tangentZ * Math.sign(tangSpeed || 1));
          this.yaw = THREE.MathUtils.lerp(this.yaw, targetYaw, 0.24);
          // Reward wall scrape with stunt nitro!
          this.addStuntNitro(12);
        }

        if (absNorm > absTang * 1.15) {
          // Hard head-on bounce: push car backwards
          this.velocity.set(resVelX * 0.35, 0, resVelZ * 0.35);
          this.isBoosting = false; // cancel nitro on head-on collision
          this.burnoutChainCount = 0;
          this.burnoutEarnedInCurrentBurn = 0;
        } else {
          // Wall scrape / glancing blow: maintain forward slide with high speed
          this.velocity.set(resVelX, 0, resVelZ);
        }

        const headingX = Math.sin(this.yaw);
        const headingZ = Math.cos(this.yaw);
        this.speedMs = this.velocity.x * headingX + this.velocity.z * headingZ;
        this.speed = this.speedMs * 3.6;
      }
    }
  }

  updateTransmission() {
    const absSpeed = Math.abs(this.speed);
    // Determine gear
    let g = 1;
    for (let i = 0; i < this.maxSpeedPerGear.length; i++) {
      if (absSpeed <= this.maxSpeedPerGear[i]) {
        g = i + 1;
        break;
      }
      g = this.maxSpeedPerGear.length;
    }
    this.gear = g;

    // Calculate RPM
    const minSpeed = g === 1 ? 0 : this.maxSpeedPerGear[g - 2];
    const maxSpeed = this.maxSpeedPerGear[g - 1];
    const ratio = Math.max(0, Math.min(1, (absSpeed - minSpeed) / (maxSpeed - minSpeed || 1)));

    const idleRpm = 850;
    const redlineRpm = 8200;
    this.rpm = THREE.MathUtils.lerp(idleRpm + 1800 * ratio, redlineRpm * (0.6 + 0.4 * ratio), ratio);
    if (absSpeed < 2 && this.throttle === 0) this.rpm = idleRpm + (Math.random() - 0.5) * 50;
    else if (absSpeed < 2 && this.throttle > 0) this.rpm = THREE.MathUtils.lerp(this.rpm, 4500, 0.1);
  }

  // Collision with NPC Traffic cars
  checkCollisions(traffic) {
    if (!traffic || !traffic.cars) return;
    const now = performance.now();

    for (const car of traffic.cars) {
      if (!car.pos) continue;
      const dx = this.position.x - car.pos.x;
      const dz = this.position.z - car.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist < this.carRadius + 1.6) {
        // Crash reaction!
        if (now - this.lastCrashTime > 400) {
          const impactSpeed = Math.abs(this.speed);
          this.sound?.playCrash(Math.min(1.0, impactSpeed / 80));

          // Normal of collision
          const nx = dx / (dist || 1);
          const nz = dz / (dist || 1);

          // Emit sparks
          this.particles?.emitCrashSparks(
            new THREE.Vector3(this.position.x - nx * 0.8, this.position.y + 0.3, this.position.z - nz * 0.8),
            new THREE.Vector3(nx, 0.4, nz)
          );

          // Bounce player car
          this.velocity.multiplyScalar(-0.35);
          const headingX = Math.sin(this.yaw);
          const headingZ = Math.cos(this.yaw);
          this.speedMs = this.velocity.x * headingX + this.velocity.z * headingZ;
          this.speed = this.speedMs * 3.6;
          this.position.x += nx * 0.4;
          this.position.z += nz * 0.4;

          this.lastCrashTime = now;
        }
      }
    }
  }

  updateParticles(forwardX, forwardZ) {
    if (!this.particles) return;

    const tires = this.model.getRearTirePositionsWorld();
    const exhausts = this.model.getExhaustPositionsWorld();
    const fwdVec = new THREE.Vector3(forwardX, 0, forwardZ);

    // Tire smoke when drifting or hard braking
    if (this.isDrifting || (this.isBraking && Math.abs(this.speed) > 30)) {
      const intensity = Math.max(this.driftFactor * 1.5, (Math.abs(this.speed) - 25) / 60);
      this.particles.emitTireSmoke(tires.left, fwdVec, intensity);
      this.particles.emitTireSmoke(tires.right, fwdVec, intensity);
      this.particles.addSkid(tires.left, tires.right, true);
    } else {
      this.particles.addSkid(tires.left, tires.right, false);
    }

    // Nitro flames from exhausts
    if (this.isBoosting || (this.throttle > 0.8 && this.rpm > 6800)) {
      if (exhausts.length >= 2) {
        this.particles.emitNitroFlames(exhausts[0], exhausts[1], fwdVec, this.isBoosting);
      }
    }
  }

  updateModelTransform() {
    this.model.group.position.copy(this.position);
    this.model.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }

  getTelemetry() {
    return {
      speed: Math.round(Math.abs(this.speed)),
      rpm: Math.round(this.rpm),
      gear: this.isReversing ? 'R' : this.speedMs === 0 && this.throttle === 0 ? 'N' : this.gear,
      nitro: Math.round(this.nitro),
      isBoosting: this.isBoosting,
      isDrifting: this.isDrifting,
      driftFactor: this.driftFactor,
      driftAngle: Math.round(THREE.MathUtils.radToDeg(this.driftAngle)),
      currentDriftPoints: this.currentDriftPoints,
      driftMultiplier: this.driftMultiplier.toFixed(1),
      totalDriftScore: this.driftScore + this.currentDriftPoints,
      burnoutChainCount: this.burnoutChainCount,
      burnoutAlert: this.burnoutAlertTimer > 0,
      color: this.model.carColors[this.model.currentColorIndex].name,
      underglow: this.model.underglowColors[this.model.currentUnderglowIndex].name,
      headlights: this.model.headlightsOn,
    };
  }
}
