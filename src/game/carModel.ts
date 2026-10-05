import * as THREE from 'three';

export class CarModel {
  scene: THREE.Scene;
  group: THREE.Group;
  carColors: any[];
  currentColorIndex: number;
  underglowColors: any[];
  currentUnderglowIndex: number;
  headlightsOn: boolean;
  brakesOn: boolean;
  reversing: boolean;

  bodyMat!: THREE.MeshStandardMaterial;
  carbonMat!: THREE.MeshStandardMaterial;
  glassMat!: THREE.MeshStandardMaterial;
  chromeMat!: THREE.MeshStandardMaterial;
  interiorMat!: THREE.MeshStandardMaterial;
  headlightMat!: THREE.MeshStandardMaterial;
  taillightMat!: THREE.MeshStandardMaterial;

  exhaustPositions!: THREE.Vector3[];
  headlights!: THREE.Mesh[];
  taillights!: THREE.Mesh[];
  headlightBeams!: THREE.Object3D;
  beamMaterial!: THREE.MeshBasicMaterial;
  underglowMesh!: THREE.Mesh;
  underglowMat!: THREE.MeshBasicMaterial;
  wheels!: any[];
  chassis!: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'player-car';

    this.chassis = new THREE.Group();
    this.chassis.name = 'player-car-chassis';
    this.group.add(this.chassis);

    this.carColors = [
      { name: 'Midnight Purple', hex: 0x2e0854, paint: [0.18, 0.03, 0.33] },
      { name: 'Tokyo Crimson', hex: 0x9b111e, paint: [0.61, 0.07, 0.12] },
      { name: 'Ghost Pearl White', hex: 0xedf0f5, paint: [0.93, 0.94, 0.96] },
      { name: 'Cyber Neon Cyan', hex: 0x00c8e0, paint: [0.0, 0.78, 0.88] },
      { name: 'Gunmetal Metallic', hex: 0x2b2d30, paint: [0.17, 0.18, 0.19] },
      { name: 'Sunset Gold', hex: 0xd4a017, paint: [0.83, 0.63, 0.09] },
    ];
    this.currentColorIndex = 0;

    this.underglowColors = [
      { name: 'Cyan Neon', hex: 0x00f0ff },
      { name: 'Purple Neon', hex: 0xbb00ff },
      { name: 'Hot Pink', hex: 0xff0077 },
      { name: 'Lime Green', hex: 0x00ff66 },
      { name: 'Amber Gold', hex: 0xffaa00 },
      { name: 'Off', hex: 0x000000 },
    ];
    this.currentUnderglowIndex = 0;

    this.headlightsOn = true;
    this.brakesOn = false;
    this.reversing = false;

    this.buildCar();
    this.scene.add(this.group);
  }

  buildCar() {
    // Car Dimensions: L = 4.5m, W = 1.84m, H = 1.32m
    const L = 4.5, W = 1.84, H = 1.32;

    // Materials
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: this.carColors[this.currentColorIndex].hex,
      roughness: 0.15,
      metalness: 0.85,
    });

    this.carbonMat = new THREE.MeshStandardMaterial({
      color: 0x151618,
      roughness: 0.5,
      metalness: 0.3,
    });

    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0x080c14,
      roughness: 0.05,
      metalness: 0.95,
      transparent: true,
      opacity: 0.92,
    });

    this.chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde5,
      roughness: 0.1,
      metalness: 0.95,
    });

    this.interiorMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      roughness: 0.8,
    });

    // Lights materials
    this.headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.5,
      roughness: 0.1,
    });

    this.taillightMat = new THREE.MeshStandardMaterial({
      color: 0x880000,
      emissive: 0xff1100,
      emissiveIntensity: 1.0,
      roughness: 0.1,
    });

    // 1. Lower Body Chassis
    const lowerBodyGeo = new THREE.BoxGeometry(W * 0.98, 0.42, L * 0.98);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, this.bodyMat);
    lowerBody.position.y = 0.38;
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    this.chassis.add(lowerBody);

    // Front Splitter / Carbon Bumper
    const splitterGeo = new THREE.BoxGeometry(W * 1.02, 0.08, 0.45);
    const splitter = new THREE.Mesh(splitterGeo, this.carbonMat);
    splitter.position.set(0, 0.16, L * 0.48);
    this.chassis.add(splitter);

    // Rear Diffuser
    const diffuserGeo = new THREE.BoxGeometry(W * 0.96, 0.14, 0.35);
    const diffuser = new THREE.Mesh(diffuserGeo, this.carbonMat);
    diffuser.position.set(0, 0.22, -L * 0.48);
    this.chassis.add(diffuser);

    // 2. Hood & Aerodynamic Top Body
    const hoodGeo = new THREE.BoxGeometry(W * 0.92, 0.22, L * 0.4);
    const hood = new THREE.Mesh(hoodGeo, this.bodyMat);
    hood.position.set(0, 0.58, L * 0.28);
    hood.rotation.x = 0.06;
    hood.castShadow = true;
    this.chassis.add(hood);

    // Hood Vents (Carbon)
    for (const sx of [-0.35, 0.35]) {
      const ventGeo = new THREE.BoxGeometry(0.24, 0.02, 0.4);
      const vent = new THREE.Mesh(ventGeo, this.carbonMat);
      vent.position.set(sx, 0.69, L * 0.26);
      this.chassis.add(vent);
    }

    // 3. Cabin & Glasshouse
    const cabinGeo = new THREE.BoxGeometry(W * 0.78, 0.48, L * 0.44);
    const cabin = new THREE.Mesh(cabinGeo, this.glassMat);
    cabin.position.set(0, 0.84, -0.15);
    cabin.castShadow = true;
    this.chassis.add(cabin);

    // Roof
    const roofGeo = new THREE.BoxGeometry(W * 0.74, 0.06, L * 0.36);
    const roof = new THREE.Mesh(roofGeo, this.bodyMat);
    roof.position.set(0, 1.08, -0.2);
    roof.castShadow = true;
    this.chassis.add(roof);

    // Windshield frame & pillars
    const pillarGeo = new THREE.BoxGeometry(0.06, 0.52, 0.06);
    for (const sx of [-W * 0.38, W * 0.38]) {
      const pFront = new THREE.Mesh(pillarGeo, this.bodyMat);
      pFront.position.set(sx, 0.82, 0.14);
      pFront.rotation.x = -0.55;
      this.chassis.add(pFront);

      const pRear = new THREE.Mesh(pillarGeo, this.bodyMat);
      pRear.position.set(sx, 0.82, -0.42);
      pRear.rotation.x = 0.5;
      this.chassis.add(pRear);
    }

    // Side Mirrors
    for (const sx of [-1, 1]) {
      const mirrorGeo = new THREE.BoxGeometry(0.12, 0.08, 0.18);
      const mirror = new THREE.Mesh(mirrorGeo, this.bodyMat);
      mirror.position.set(sx * (W * 0.5 + 0.06), 0.75, 0.18);
      this.chassis.add(mirror);
    }

    // 4. Rear GT Wing / Spoiler
    const wingGeo = new THREE.BoxGeometry(W * 0.94, 0.05, 0.32);
    const wing = new THREE.Mesh(wingGeo, this.carbonMat);
    wing.position.set(0, 0.98, -L * 0.44);
    wing.castShadow = true;
    this.chassis.add(wing);

    // Spoiler Struts
    for (const sx of [-0.55, 0.55]) {
      const strutGeo = new THREE.BoxGeometry(0.04, 0.32, 0.16);
      const strut = new THREE.Mesh(strutGeo, this.carbonMat);
      strut.position.set(sx, 0.82, -L * 0.43);
      this.chassis.add(strut);
    }

    // 5. Dual Chrome Exhausts
    this.exhaustPositions = [];
    for (const sx of [-0.42, 0.42]) {
      const exhaustGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.22, 12);
      exhaustGeo.rotateX(Math.PI / 2);
      const exhaust = new THREE.Mesh(exhaustGeo, this.chromeMat);
      exhaust.position.set(sx, 0.22, -L * 0.5 - 0.04);
      this.chassis.add(exhaust);
      this.exhaustPositions.push(new THREE.Vector3(sx, 0.22, -L * 0.5 - 0.12));
    }

    // 6. License Plates (Tokyo Japanese Plate style)
    const plateGeo = new THREE.BoxGeometry(0.38, 0.19, 0.02);
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 256; plateCanvas.height = 128;
    const pCtx = plateCanvas.getContext('2d');
    pCtx.fillStyle = '#f0f3f5';
    pCtx.fillRect(0, 0, 256, 128);
    pCtx.fillStyle = '#1b5e20'; // Green text
    pCtx.font = 'bold 24px sans-serif';
    pCtx.fillText('品川 300', 70, 36);
    pCtx.font = 'bold 44px sans-serif';
    pCtx.fillText('さ 86-99', 42, 95);
    const plateTex = new THREE.CanvasTexture(plateCanvas);
    const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });

    const frontPlate = new THREE.Mesh(plateGeo, plateMat);
    frontPlate.position.set(0, 0.25, L * 0.495);
    this.chassis.add(frontPlate);

    const rearPlate = new THREE.Mesh(plateGeo, plateMat);
    rearPlate.position.set(0, 0.42, -L * 0.495);
    rearPlate.rotation.y = Math.PI;
    this.chassis.add(rearPlate);

    // 7. Headlight & Taillight Units
    // Headlights (Aggressive JDM LED lamps)
    this.headlights = [];
    for (const sx of [-1, 1]) {
      const hlGeo = new THREE.BoxGeometry(0.38, 0.12, 0.14);
      const hlMesh = new THREE.Mesh(hlGeo, this.headlightMat);
      hlMesh.position.set(sx * (W * 0.38), 0.52, L * 0.47);
      this.chassis.add(hlMesh);
      this.headlights.push(hlMesh);
    }

    // Taillights (Twin round GT-R style LED clusters)
    this.taillights = [];
    for (const sx of [-1, 1]) {
      for (const offset of [-0.09, 0.09]) {
        const tlGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.06, 16);
        tlGeo.rotateX(Math.PI / 2);
        const tlMesh = new THREE.Mesh(tlGeo, this.taillightMat);
        tlMesh.position.set(sx * (W * 0.36 + offset), 0.55, -L * 0.49);
        this.chassis.add(tlMesh);
        this.taillights.push(tlMesh);
      }
    }

    // 8. Projected Headlight Cones (lights hitting the road)
    this.headlightBeams = this.createHeadlightBeams(L);
    this.chassis.add(this.headlightBeams);

    // 9. Underglow Neon Light Plane
    this.underglowMesh = this.createUnderglow(W, L);
    this.chassis.add(this.underglowMesh);

    // 10. Wheels (4 wheels with rims and disc brakes)
    this.wheels = [];
    const wheelTrack = W * 0.48;
    const wheelBase = L * 0.32;
    const wheelRadius = 0.34;
    const wheelWidth = 0.26;

    const wheelConfig = [
      { isFront: true, isLeft: true, x: -wheelTrack, z: wheelBase },
      { isFront: true, isLeft: false, x: wheelTrack, z: wheelBase },
      { isFront: false, isLeft: true, x: -wheelTrack, z: -wheelBase },
      { isFront: false, isLeft: false, x: wheelTrack, z: -wheelBase },
    ];

    wheelConfig.forEach((cfg) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(cfg.x, wheelRadius, cfg.z);

      // Rotating hub
      const spinGroup = new THREE.Group();

      // Tire (Rubber)
      const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 20);
      tireGeo.rotateZ(Math.PI / 2);
      const tireMat = new THREE.MeshStandardMaterial({ color: 0x161618, roughness: 0.9 });
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      spinGroup.add(tire);

      // Rim (5-spoke sport alloy)
      const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.65, wheelRadius * 0.65, wheelWidth + 0.01, 16);
      rimGeo.rotateZ(Math.PI / 2);
      const rimMat = new THREE.MeshStandardMaterial({ color: 0xc0c8d0, metalness: 0.9, roughness: 0.2 });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      spinGroup.add(rim);

      // Brake Rotor / Disc
      const rotorGeo = new THREE.CylinderGeometry(wheelRadius * 0.52, wheelRadius * 0.52, 0.04, 16);
      rotorGeo.rotateZ(Math.PI / 2);
      const rotorMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.95, roughness: 0.3 });
      const rotor = new THREE.Mesh(rotorGeo, rotorMat);
      rotor.position.x = cfg.isLeft ? 0.05 : -0.05;
      wGroup.add(rotor);

      // Red Brake Caliper
      const caliperGeo = new THREE.BoxGeometry(0.06, 0.12, 0.14);
      const caliperMat = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.3 });
      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(cfg.isLeft ? 0.05 : -0.05, wheelRadius * 0.25, 0);
      wGroup.add(caliper);

      wGroup.add(spinGroup);
      this.group.add(wGroup);

      this.wheels.push({
        group: wGroup,
        spinGroup,
        isFront: cfg.isFront,
        isLeft: cfg.isLeft,
        basePos: new THREE.Vector3(cfg.x, wheelRadius, cfg.z),
      });
    });
  }

  // Create illuminated road projection for headlights
  createHeadlightBeams(L) {
    const beamGeo = new THREE.PlaneGeometry(16, 40);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0.08, 22);

    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 230, 10, 64, 200, 220);
    grad.addColorStop(0, 'rgba(255, 250, 230, 0.65)');
    grad.addColorStop(0.3, 'rgba(240, 245, 255, 0.35)');
    grad.addColorStop(0.7, 'rgba(180, 210, 255, 0.1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 256);

    const tex = new THREE.CanvasTexture(canvas);
    this.beamMaterial = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.8,
    });

    const beamMesh = new THREE.Mesh(beamGeo, this.beamMaterial);
    beamMesh.position.set(0, 0, L * 0.4);
    return beamMesh;
  }

  // Create underglow neon plane
  createUnderglow(W, L) {
    const uGeo = new THREE.PlaneGeometry(W * 1.5, L * 1.3);
    uGeo.rotateX(-Math.PI / 2);

    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 15, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    this.underglowMat = new THREE.MeshBasicMaterial({
      map: tex,
      color: this.underglowColors[this.currentUnderglowIndex].hex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.65,
    });

    const uMesh = new THREE.Mesh(uGeo, this.underglowMat);
    uMesh.position.y = 0.05;
    return uMesh;
  }

  // Change Paint Color
  cycleColor() {
    this.currentColorIndex = (this.currentColorIndex + 1) % this.carColors.length;
    const c = this.carColors[this.currentColorIndex];
    this.bodyMat.color.setHex(c.hex);
    return c.name;
  }

  // Change Underglow Neon
  cycleUnderglow() {
    this.currentUnderglowIndex = (this.currentUnderglowIndex + 1) % this.underglowColors.length;
    const u = this.underglowColors[this.currentUnderglowIndex];
    this.underglowMat.color.setHex(u.hex);
    this.underglowMesh.visible = u.hex !== 0x000000;
    return u.name;
  }

  // Toggle Headlights
  toggleHeadlights() {
    this.headlightsOn = !this.headlightsOn;
    this.headlightBeams.visible = this.headlightsOn;
    this.headlightMat.emissiveIntensity = this.headlightsOn ? 2.5 : 0.2;
    return this.headlightsOn;
  }

  // Update wheel rotation & steering, lights, brake glow, and chassis suspension
  update(carState, dt) {
    const { speed, steerAngle, isBraking, isReversing, driftFactor, isBoosting, throttle } = carState;

    // 1. Wheel steering and spinning
    const speedMs = speed / 3.6;
    const spinDelta = (speedMs / 0.34) * dt;

    // Front wheels counter-steer visually in drift for that authentic Burnout slide look
    const visualSteer = carState.visualSteer !== undefined ? carState.visualSteer : steerAngle;

    this.wheels.forEach((w) => {
      // Front wheel steer with counter-steer
      if (w.isFront) {
        w.group.rotation.y = THREE.MathUtils.lerp(w.group.rotation.y, visualSteer, dt * 25);
      }
      // Spin around axle
      w.spinGroup.rotation.x += spinDelta;
    });

    // 2. Brake / Reverse lights
    if (isBraking || carState.handbrake) {
      this.taillightMat.emissive.setHex(0xff0000);
      this.taillightMat.emissiveIntensity = 4.0;
    } else if (isReversing) {
      this.taillightMat.emissive.setHex(0xffffff);
      this.taillightMat.emissiveIntensity = 2.0;
    } else {
      this.taillightMat.emissive.setHex(0xff1100);
      this.taillightMat.emissiveIntensity = this.headlightsOn ? 1.0 : 0.1;
    }

    // 3. Dynamic Suspension & Weight Transfer on Chassis
    // Visible muscle: the body leans, squats and dives so you feel 1.5t
    // shifting around. The CAMERA stays locked (no horizon roll) — the
    // weight reads on the car, not in your inner ear.
    const speedRatio = Math.min(1.0, Math.abs(speed) / 130);
    const lateralG = carState.lateralG !== undefined ? carState.lateralG : (-steerAngle * speedRatio * 1.5);
    const targetRoll = THREE.MathUtils.clamp(-lateralG * 0.085, -0.09, 0.09);

    // Longitudinal pitch: rear squats under acceleration/nitro, nose dives under heavy braking
    let targetPitch = 0;
    if (isBoosting) {
      targetPitch = -0.07; // Violent squat when firing nitro
    } else if (throttle > 0.1) {
      targetPitch = -0.04 * Math.min(1.0, throttle);
    }
    if (isBraking) {
      targetPitch = 0.07; // Nose dive on brake
    }

    // Firm damping: weight moves fast enough to feel, never wobbles.
    this.chassis.rotation.z = THREE.MathUtils.lerp(this.chassis.rotation.z, targetRoll, Math.min(1, dt * 9));
    this.chassis.rotation.x = THREE.MathUtils.lerp(this.chassis.rotation.x, targetPitch, Math.min(1, dt * 8));

    // Dynamic Underglow intensity pulse during boost
    if (isBoosting && this.underglowMesh.visible) {
      const pulse = 1.0 + Math.sin(performance.now() * 0.02) * 0.25;
      this.underglowMat.opacity = Math.min(1.0, 0.7 * pulse);
    }
  }

  getExhaustPositionsWorld() {
    const pos = [];
    for (const ep of this.exhaustPositions) {
      const v = ep.clone().applyMatrix4(this.group.matrixWorld);
      pos.push(v);
    }
    return pos;
  }

  getRearTirePositionsWorld() {
    const leftTire = this.wheels.find(w => !w.isFront && w.isLeft);
    const rightTire = this.wheels.find(w => !w.isFront && !w.isLeft);
    const lPos = new THREE.Vector3().setFromMatrixPosition(leftTire.group.matrixWorld);
    const rPos = new THREE.Vector3().setFromMatrixPosition(rightTire.group.matrixWorld);
    return { left: lPos, right: rPos };
  }
}
