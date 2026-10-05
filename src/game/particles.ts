import * as THREE from 'three';

export class ParticleSystem {
  scene: THREE.Scene;
  maxSmoke: number;
  smokeParticles: any[];
  smokePoints: THREE.Points;
  maxSparks: number;
  sparks: any[];
  sparkPoints: THREE.Points;
  maxSkids: number;
  skidPos: Float32Array;
  skidCol: Float32Array;
  skidCount: number;
  skidIndex: number;
  skidMesh: THREE.Mesh;
  lastLeftSkid: THREE.Vector3 | null;
  lastRightSkid: THREE.Vector3 | null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // --- 1. Drift Smoke Particles ---
    this.maxSmoke = 300;
    this.smokeParticles = [];
    const smokeGeo = new THREE.BufferGeometry();
    const smokePositions = new Float32Array(this.maxSmoke * 3);
    const smokeSizes = new Float32Array(this.maxSmoke);
    const smokeAlphas = new Float32Array(this.maxSmoke);
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
    smokeGeo.setAttribute('size', new THREE.BufferAttribute(smokeSizes, 1));
    smokeGeo.setAttribute('alpha', new THREE.BufferAttribute(smokeAlphas, 1));

    // Simple procedural circular puff texture
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.3, 'rgba(230,235,245,0.5)');
    grad.addColorStop(0.7, 'rgba(200,210,225,0.2)');
    grad.addColorStop(1, 'rgba(180,190,210,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const smokeTex = new THREE.CanvasTexture(canvas);

    const smokeMat = new THREE.ShaderMaterial({
      uniforms: { uTexture: { value: smokeTex } },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (260.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.smokePoints = new THREE.Points(smokeGeo, smokeMat);
    this.smokePoints.frustumCulled = false;
    scene.add(this.smokePoints);

    // --- 2. Nitro Flame & Sparks ---
    this.maxSparks = 200;
    this.sparks = [];
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array(this.maxSparks * 3);
    const sparkColors = new Float32Array(this.maxSparks * 3);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));

    const sparkMat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    this.sparkPoints.frustumCulled = false;
    scene.add(this.sparkPoints);

    // --- 3. Skid Marks on the road ---
    this.maxSkids = 600;
    this.skidPos = new Float32Array(this.maxSkids * 3 * 6); // triangles
    this.skidCol = new Float32Array(this.maxSkids * 4 * 6);
    this.skidCount = 0;
    this.skidIndex = 0;

    const skidGeo = new THREE.BufferGeometry();
    skidGeo.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3));
    skidGeo.setAttribute('color', new THREE.BufferAttribute(this.skidCol, 4));
    const skidMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skidMesh = new THREE.Mesh(skidGeo, skidMat);
    this.skidMesh.frustumCulled = false;
    scene.add(this.skidMesh);

    this.lastLeftSkid = null;
    this.lastRightSkid = null;
  }

  // Spawn smoke at left and right rear tires
  emitTireSmoke(pos, dir, intensity = 1.0) {
    if (this.smokeParticles.length >= this.maxSmoke) return;
    const count = Math.ceil(intensity * 3);
    for (let i = 0; i < count; i++) {
      this.smokeParticles.push({
        x: pos.x + (Math.random() - 0.5) * 0.4,
        y: pos.y + 0.15 + Math.random() * 0.2,
        z: pos.z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.8 - dir.x * 0.4,
        vy: 0.8 + Math.random() * 1.2,
        vz: (Math.random() - 0.5) * 0.8 - dir.z * 0.4,
        size: 0.7 + Math.random() * 0.5,
        maxSize: 3.2 + Math.random() * 1.5,
        alpha: 0.65 * intensity,
        life: 0,
        maxLife: 0.9 + Math.random() * 0.6,
      });
    }
  }

  // Emit nitro flame particles from exhaust
  emitNitroFlames(leftExhaustPos, rightExhaustPos, forwardDir, isBoosting) {
    const exhaustList = [leftExhaustPos, rightExhaustPos];
    for (const ep of exhaustList) {
      const pCount = isBoosting ? 4 : 1;
      for (let i = 0; i < pCount; i++) {
        if (this.sparks.length >= this.maxSparks) break;
        const speed = isBoosting ? 6 + Math.random() * 5 : 2 + Math.random() * 2;
        const color = isBoosting
          ? (Math.random() > 0.3 ? [0.1, 0.7, 1.0] : [0.7, 0.2, 1.0]) // Cyber cyan/purple
          : (Math.random() > 0.4 ? [1.0, 0.5, 0.1] : [1.0, 0.9, 0.2]); // Orange backfire
        this.sparks.push({
          x: ep.x + (Math.random() - 0.5) * 0.1,
          y: ep.y + (Math.random() - 0.5) * 0.1,
          z: ep.z + (Math.random() - 0.5) * 0.1,
          vx: -forwardDir.x * speed + (Math.random() - 0.5) * 1.0,
          vy: -forwardDir.y * speed + (Math.random() - 0.5) * 0.6,
          vz: -forwardDir.z * speed + (Math.random() - 0.5) * 1.0,
          r: color[0], g: color[1], b: color[2],
          life: 0,
          maxLife: isBoosting ? 0.25 : 0.15,
        });
      }
    }
  }

  // Emit sparks upon collision
  emitCrashSparks(pos, normal) {
    for (let i = 0; i < 25; i++) {
      if (this.sparks.length >= this.maxSparks) break;
      const speed = 4 + Math.random() * 8;
      this.sparks.push({
        x: pos.x,
        y: pos.y + 0.3,
        z: pos.z,
        vx: (normal.x + (Math.random() - 0.5) * 1.2) * speed,
        vy: Math.abs(normal.y + (Math.random() * 0.8 + 0.2)) * speed,
        vz: (normal.z + (Math.random() - 0.5) * 1.2) * speed,
        r: 1.0, g: 0.85 + Math.random() * 0.15, b: 0.3,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3,
      });
    }
  }

  // Add skid marks on road
  addSkid(leftPos, rightPos, isDrifting) {
    if (!isDrifting) {
      this.lastLeftSkid = null;
      this.lastRightSkid = null;
      return;
    }

    const width = 0.24;
    const addSegment = (pA, pB, lastP) => {
      if (!lastP) return pA.clone();
      const dist = pA.distanceTo(lastP);
      if (dist < 0.2 || dist > 4.0) return pA.clone();

      // Quad between lastP and pA
      const idx = this.skidIndex * 18;
      const cIdx = this.skidIndex * 24;
      const nx = -(pA.z - lastP.z);
      const nz = (pA.x - lastP.x);
      const len = Math.hypot(nx, nz) || 1;
      const ox = (nx / len) * (width * 0.5);
      const oz = (nz / len) * (width * 0.5);

      const yOffset = 0.04;
      // 2 triangles = 6 vertices
      const p1 = [lastP.x - ox, lastP.y + yOffset, lastP.z - oz];
      const p2 = [lastP.x + ox, lastP.y + yOffset, lastP.z + oz];
      const p3 = [pA.x + ox, pA.y + yOffset, pA.z + oz];
      const p4 = [pA.x - ox, pA.y + yOffset, pA.z - oz];

      const verts = [
        ...p1, ...p2, ...p3,
        ...p1, ...p3, ...p4
      ];

      for (let i = 0; i < 18; i++) this.skidPos[idx + i] = verts[i];
      for (let i = 0; i < 6; i++) {
        this.skidCol[cIdx + i * 4] = 0.05;
        this.skidCol[cIdx + i * 4 + 1] = 0.05;
        this.skidCol[cIdx + i * 4 + 2] = 0.05;
        this.skidCol[cIdx + i * 4 + 3] = 0.45;
      }

      this.skidIndex = (this.skidIndex + 1) % this.maxSkids;
      this.skidCount = Math.min(this.skidCount + 1, this.maxSkids);
      this.skidMesh.geometry.attributes.position.needsUpdate = true;
      this.skidMesh.geometry.attributes.color.needsUpdate = true;
      return pA.clone();
    };

    this.lastLeftSkid = addSegment(leftPos, null, this.lastLeftSkid);
    this.lastRightSkid = addSegment(rightPos, null, this.lastRightSkid);
  }

  update(dt) {
    // 1. Update Smoke
    const smokePos = this.smokePoints.geometry.attributes.position.array;
    const smokeSize = this.smokePoints.geometry.attributes.size.array;
    const smokeAlpha = this.smokePoints.geometry.attributes.alpha.array;

    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.smokeParticles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const progress = p.life / p.maxLife;
      const curSize = THREE.MathUtils.lerp(p.size, p.maxSize, progress);
      const curAlpha = p.alpha * (1 - progress);

      smokePos[i * 3] = p.x;
      smokePos[i * 3 + 1] = p.y;
      smokePos[i * 3 + 2] = p.z;
      smokeSize[i] = curSize;
      smokeAlpha[i] = curAlpha;
    }

    // Clear unused
    for (let i = this.smokeParticles.length; i < this.maxSmoke; i++) {
      smokePos[i * 3 + 1] = -9999;
      smokeAlpha[i] = 0;
    }
    this.smokePoints.geometry.attributes.position.needsUpdate = true;
    this.smokePoints.geometry.attributes.size.needsUpdate = true;
    this.smokePoints.geometry.attributes.alpha.needsUpdate = true;

    // 2. Update Sparks
    const sparkPos = this.sparkPoints.geometry.attributes.position.array;
    const sparkCol = this.sparkPoints.geometry.attributes.color.array;

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy -= 9.8 * dt * 0.4; // gravity

      sparkPos[i * 3] = s.x;
      sparkPos[i * 3 + 1] = s.y;
      sparkPos[i * 3 + 2] = s.z;
      const progress = 1 - s.life / s.maxLife;
      sparkCol[i * 3] = s.r * progress;
      sparkCol[i * 3 + 1] = s.g * progress;
      sparkCol[i * 3 + 2] = s.b * progress;
    }

    for (let i = this.sparks.length; i < this.maxSparks; i++) {
      sparkPos[i * 3 + 1] = -9999;
    }
    this.sparkPoints.geometry.attributes.position.needsUpdate = true;
    this.sparkPoints.geometry.attributes.color.needsUpdate = true;
  }
}
