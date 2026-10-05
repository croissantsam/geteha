import * as THREE from 'three';

export const GAME_MODES = {
  FREE_CRUISE: 'Free Cruise',
  TIME_ATTACK: 'Time Attack',
  DRIFT_KING: 'Drift Challenge',
  SPEED_RUN: 'Tokyo Speed Run',
};

// Notable Tokyo landmarks by district
export const TOKYO_LANDMARKS = [
  { name: 'Shibuya Scramble Crossing', jp: '渋谷スクランブル交差点', x: 0, z: 0, radius: 120, area: 'shibuya' },
  { name: 'Tokyo Tower', jp: '東京タワー', x: 0, z: 0, radius: 160, area: 'shiba' },
  { name: 'Shinjuku Skyscraper Alley', jp: '新宿超高層ビル街', x: -200, z: 100, radius: 250, area: 'shinjuku' },
  { name: 'Tokyo Station Marunouchi', jp: '東京駅丸の内', x: 50, z: 0, radius: 180, area: 'tokyo' },
  { name: 'Akihabara Electric Town', jp: '秋葉原電気街', x: 0, z: -100, radius: 200, area: 'chiyoda' },
  { name: 'Tsukiji Waterfront & Moat', jp: '築地水辺・運河', x: 0, z: 0, radius: 250, area: 'chuo' },
  { name: 'Mt Fuji Base Foothills', jp: '富士山麓街道', x: 0, z: 0, radius: 300, area: 'fujinomiya' },
];

export class GameModeManager {
  scene: THREE.Scene;
  vehicle: any;
  streamer: any;
  hud: any;
  currentMode: string;
  discoveredLandmarks: Set<string>;
  checkpoints: any[];
  currentCheckpointIndex: number;
  raceTimer: number;
  isRacing: boolean;
  bestTime: string | null;
  driftChallengeTimer: number;
  driftChallengeActive: boolean;
  driftChallengeScore: number;
  bestDriftScore: number;
  nearMissCount: number;
  speedRunPoints: number;
  maxRecordedSpeed: number;
  lastSpeedMilestone: number;
  checkpointGroup: THREE.Group;
  checkpointRing!: THREE.Mesh;

  constructor(scene: THREE.Scene, vehicle: any, streamer: any, hud: any) {
    this.scene = scene;
    this.vehicle = vehicle;
    this.streamer = streamer;
    this.hud = hud;

    this.currentMode = GAME_MODES.FREE_CRUISE;
    this.discoveredLandmarks = new Set();

    // Time Attack state
    this.checkpoints = [];
    this.currentCheckpointIndex = 0;
    this.raceTimer = 0;
    this.isRacing = false;
    this.bestTime = localStorage.getItem('tokyo:bestTime') || null;

    // Drift King state
    this.driftChallengeTimer = 60;
    this.driftChallengeActive = false;
    this.driftChallengeScore = 0;
    this.bestDriftScore = Number(localStorage.getItem('tokyo:bestDrift')) || 0;

    // Speed Run state
    this.speedRunPoints = 0;
    this.maxRecordedSpeed = Number(localStorage.getItem('tokyo:maxSpeed')) || 0;
    this.lastSpeedMilestone = 0;

    // 3D Visual checkpoint beacon
    this.checkpointGroup = new THREE.Group();
    this.scene.add(this.checkpointGroup);
    this.buildCheckpointMesh();
  }

  buildCheckpointMesh() {
    // Neon Torus Ring + Light Column
    const ringGeo = new THREE.TorusGeometry(6.5, 0.4, 16, 32);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
    });
    this.checkpointRing = new THREE.Mesh(ringGeo, ringMat);

    // Vertical neon light beacon
    const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, 40, 16);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 20;

    this.checkpointGroup.add(this.checkpointRing, beam);
    this.checkpointGroup.visible = false;
  }

  setMode(mode) {
    this.currentMode = mode;
    this.resetMode();

    if (mode === GAME_MODES.TIME_ATTACK) {
      this.initTimeAttack();
    } else if (mode === GAME_MODES.DRIFT_KING) {
      this.initDriftChallenge();
    }
    return this.currentMode;
  }

  resetMode() {
    this.isRacing = false;
    this.raceTimer = 0;
    this.currentCheckpointIndex = 0;
    this.driftChallengeActive = false;
    this.driftChallengeTimer = 60;
    this.driftChallengeScore = 0;
    this.nearMissCount = 0;
    this.checkpointGroup.visible = false;
  }

  // Generate a dynamic street circuit from nearby road nodes
  initTimeAttack() {
    this.checkpoints = [];
    const carPos = this.vehicle.position;
    const yaw = this.vehicle.yaw;

    // Create 6 checkpoints in a loop around the current area
    const count = 6;
    const loopRadius = 380;
    for (let i = 0; i < count; i++) {
      const angle = yaw + (i / count) * Math.PI * 2;
      const dist = loopRadius * (0.7 + Math.random() * 0.4);
      const cpX = carPos.x + Math.sin(angle) * dist;
      const cpZ = carPos.z + Math.cos(angle) * dist;
      const cpY = this.streamer.surface(cpX, cpZ);
      this.checkpoints.push(new THREE.Vector3(cpX, cpY, cpZ));
    }

    this.currentCheckpointIndex = 0;
    this.raceTimer = 0;
    this.isRacing = true;
    this.updateCheckpointPosition();
    this.checkpointGroup.visible = true;
    this.hud?.showBanner('TIME ATTACK STARTED', 'Foncez à travers les checkpoints !');
  }

  updateCheckpointPosition() {
    if (this.currentCheckpointIndex < this.checkpoints.length) {
      const cp = this.checkpoints[this.currentCheckpointIndex];
      this.checkpointGroup.position.copy(cp);
      this.checkpointGroup.position.y += 0.5;
      (this.checkpointRing.material as THREE.MeshBasicMaterial).color.setHex(
        this.currentCheckpointIndex === this.checkpoints.length - 1 ? 0xff0055 : 0x00f0ff
      );
    }
  }

  initDriftChallenge() {
    this.driftChallengeActive = true;
    this.driftChallengeTimer = 60;
    this.driftChallengeScore = 0;
    this.vehicle.driftScore = 0;
    this.hud?.showBanner('DRIFT KING CHALLENGE', '60s pour devenir le roi du drift à Tokyo !');
  }

  update(dt, traffic) {
    const carPos = this.vehicle.position;

    // 1. Landmark Discovery in Free Cruise
    for (const lm of TOKYO_LANDMARKS) {
      if (this.discoveredLandmarks.has(lm.name)) continue;
      const dist = Math.hypot(carPos.x - lm.x, carPos.z - lm.z);
      if (dist < lm.radius) {
        this.discoveredLandmarks.add(lm.name);
        this.hud?.showLandmark(lm.name, lm.jp);
      }
    }

    // 2. Time Attack logic
    if (this.currentMode === GAME_MODES.TIME_ATTACK && this.isRacing) {
      this.raceTimer += dt;
      // Animate checkpoint ring
      this.checkpointRing.rotation.z += dt * 2.0;

      const targetCp = this.checkpoints[this.currentCheckpointIndex];
      if (targetCp) {
        const dist = Math.hypot(carPos.x - targetCp.x, carPos.z - targetCp.z);
        if (dist < 14) {
          // Checkpoint cleared!
          this.currentCheckpointIndex++;
          if (this.currentCheckpointIndex >= this.checkpoints.length) {
            // Finished!
            this.isRacing = false;
            this.checkpointGroup.visible = false;
            const timeStr = this.raceTimer.toFixed(2) + 's';
            if (!this.bestTime || this.raceTimer < Number(this.bestTime)) {
              this.bestTime = this.raceTimer.toFixed(2);
              localStorage.setItem('tokyo:bestTime', this.bestTime);
              this.hud?.showBanner('RECORD BATTU ! 🏆', `Temps : ${timeStr} (Nouveau Record)`);
            } else {
              this.hud?.showBanner('COURSE TERMINÉE !', `Temps : ${timeStr} · Meilleur : ${this.bestTime}s`);
            }
          } else {
            this.updateCheckpointPosition();
            this.hud?.showNotification(`Checkpoint ${this.currentCheckpointIndex}/${this.checkpoints.length}!`);
          }
        }
      }
    }

    // 3. Drift Challenge logic
    if (this.currentMode === GAME_MODES.DRIFT_KING && this.driftChallengeActive) {
      this.driftChallengeTimer -= dt;
      this.driftChallengeScore = this.vehicle.driftScore + this.vehicle.currentDriftPoints;

      if (this.driftChallengeTimer <= 0) {
        this.driftChallengeActive = false;
        this.driftChallengeTimer = 0;
        if (this.driftChallengeScore > this.bestDriftScore) {
          this.bestDriftScore = this.driftChallengeScore;
          localStorage.setItem('tokyo:bestDrift', String(this.bestDriftScore));
          this.hud?.showBanner('NOUVEAU RECORD DRIFT ! 🔥', `${this.driftChallengeScore} pts (Tokyo Drift God)`);
        } else {
          this.hud?.showBanner('DÉFI DRIFT TERMINÉ', `Score : ${this.driftChallengeScore} pts · Record : ${this.bestDriftScore}`);
        }
      }
    }

    // 4. Tokyo Speed Run challenge (Maintain high speed & beat top speed records)
    if (this.currentMode === GAME_MODES.SPEED_RUN) {
      const curSpeed = Math.round(this.vehicle.speed);
      if (curSpeed > 160) {
        this.speedRunPoints += Math.round((curSpeed - 150) * dt * 2);
      }
      if (curSpeed > this.maxRecordedSpeed) {
        this.maxRecordedSpeed = curSpeed;
        localStorage.setItem('tokyo:maxSpeed', String(this.maxRecordedSpeed));
      }
      if (curSpeed >= 200 && this.lastSpeedMilestone < 200) {
        this.lastSpeedMilestone = 200;
        this.hud?.showBanner('⚡ 200 KM/H DÉPASSÉS !', 'Wangan Speed Demon');
      } else if (curSpeed >= 260 && this.lastSpeedMilestone < 260) {
        this.lastSpeedMilestone = 260;
        this.hud?.showBanner('🚀 260 KM/H ATTEINTS !', 'Midnight Club Tokyo');
      } else if (curSpeed >= 300 && this.lastSpeedMilestone < 300) {
        this.lastSpeedMilestone = 300;
        this.hud?.showBanner('🔥 300 KM/H TOKYO EXPRESS !', 'VITESSE MAXIMALE !');
      }
      if (curSpeed < 140) this.lastSpeedMilestone = 0;
    }
  }

  getModeData() {
    return {
      mode: this.currentMode,
      isRacing: this.isRacing,
      raceTimer: this.raceTimer.toFixed(1),
      checkpointCurrent: this.currentCheckpointIndex + 1,
      checkpointTotal: this.checkpoints.length,
      bestTime: this.bestTime,
      driftTimer: Math.ceil(this.driftChallengeTimer),
      driftScore: this.driftChallengeScore,
      bestDrift: this.bestDriftScore,
      speedRunPoints: this.speedRunPoints,
      maxRecordedSpeed: this.maxRecordedSpeed,
      targetCheckpoint: this.checkpoints[this.currentCheckpointIndex] || null,
    };
  }
}
