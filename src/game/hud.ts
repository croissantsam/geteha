// Tokyo Arcade Racing HUD and Minimap Radar
import { GAME_MODES } from './gameModes.js';

export class RacingHUD {
  vehicle: any;
  cameraCtrl: any;
  gameModes: any;
  sound: any;
  areas: any[];
  currentArea: string;
  onChangeArea: (id: string) => void;
  onSetTime: (hour: number) => void;
  bannerTimeout: any;
  notifTimeout: any;
  container!: HTMLDivElement;
  radarCanvas!: HTMLCanvasElement;
  radarCtx!: CanvasRenderingContext2D;

  constructor(vehicle: any, cameraCtrl: any, gameModes: any, sound: any, areas: any[], currentArea: string, onChangeArea: (id: string) => void, onSetTime: (hour: number) => void) {
    this.vehicle = vehicle;
    this.cameraCtrl = cameraCtrl;
    this.gameModes = gameModes;
    this.sound = sound;
    this.areas = areas;
    this.currentArea = currentArea;
    this.onChangeArea = onChangeArea;
    this.onSetTime = onSetTime;

    this.bannerTimeout = null;
    this.notifTimeout = null;

    this.createDom();
    this.setupMinimap();
    this.setupEvents();
  }

  createDom() {
    this.container = document.createElement('div');
    this.container.id = 'racing-hud';
    this.container.innerHTML = `
      <style>
        #racing-hud {
          position: fixed; inset: 0; pointer-events: none; z-index: 1000;
          font-family: 'Rajdhani', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          user-select: none; color: #fff;
        }

        /* Top Bar: Title & Quick Travel */
        .hud-top-bar {
          position: absolute; top: 12px; left: 16px; right: 16px;
          display: flex; justify-content: space-between; align-items: flex-start;
          pointer-events: auto;
        }

        .hud-brand {
          background: rgba(10, 14, 26, 0.75);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(0, 240, 255, 0.3);
          border-radius: 10px;
          padding: 8px 16px;
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.15);
        }
        .hud-brand .title {
          font-size: 20px; font-weight: 800; letter-spacing: 2px;
          background: linear-gradient(90deg, #00f0ff, #ff0077);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .hud-brand .sub {
          font-size: 11px; letter-spacing: 3px; color: #a0aec0; text-transform: uppercase;
        }

        .hud-districts {
          display: flex; gap: 6px; flex-wrap: wrap; max-width: 550px; justify-content: flex-end;
        }
        .hud-btn {
          background: rgba(15, 20, 35, 0.85);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #e2e8f0;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex; align-items: center; gap: 5px;
        }
        .hud-btn:hover {
          background: rgba(0, 240, 255, 0.25);
          border-color: #00f0ff;
          color: #fff;
          box-shadow: 0 0 12px rgba(0, 240, 255, 0.4);
          transform: translateY(-1px);
        }
        .hud-btn.active {
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.4), rgba(255, 0, 119, 0.4));
          border-color: #00f0ff;
          color: #fff;
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.5);
        }

        /* Mode Selector */
        .hud-modes {
          position: absolute; top: 76px; left: 16px;
          display: flex; gap: 6px; pointer-events: auto;
        }

        /* Top Center Banner / Landmark alert */
        .hud-banner {
          position: absolute; top: 70px; left: 50%; transform: translateX(-50%);
          text-align: center; opacity: 0; transition: opacity 0.4s ease, transform 0.4s ease;
          pointer-events: none;
        }
        .hud-banner.show {
          opacity: 1; transform: translateX(-50%) translateY(10px);
        }
        .hud-banner .main {
          font-size: 28px; font-weight: 900; letter-spacing: 3px;
          color: #fff; text-shadow: 0 0 20px #00f0ff, 0 0 40px #ff0077;
        }
        .hud-banner .sub {
          font-size: 14px; letter-spacing: 2px; color: #22e6ff; margin-top: 4px;
        }

        /* Drift Notification */
        .hud-drift-alert {
          position: absolute; top: 180px; left: 50%; transform: translateX(-50%);
          text-align: center; opacity: 0; transition: opacity 0.2s ease;
          pointer-events: none;
        }
        .hud-drift-alert.show {
          opacity: 1;
        }
        .hud-drift-alert .score {
          font-size: 38px; font-weight: 900; color: #ffeb3b;
          text-shadow: 0 0 25px rgba(255, 235, 59, 0.8), 0 0 50px rgba(255, 87, 34, 0.8);
          font-style: italic;
        }
        .hud-drift-alert .combo {
          font-size: 16px; font-weight: 800; color: #ff5722; letter-spacing: 3px;
        }

        /* Time Attack Challenge Card */
        .hud-challenge-card {
          position: absolute; top: 125px; left: 16px;
          background: rgba(10, 14, 26, 0.8);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(0, 240, 255, 0.4);
          border-radius: 8px;
          padding: 10px 16px;
          min-width: 180px;
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.2);
          display: none;
        }
        .hud-challenge-card.visible { display: block; }
        .hud-challenge-card .row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; font-weight: 700; }
        .hud-challenge-card .val { color: #00f0ff; }

        /* Minimap Radar (Bottom Left) */
        .hud-radar-wrap {
          position: absolute; bottom: 20px; left: 20px;
          width: 170px; height: 170px;
          background: radial-gradient(circle, rgba(10, 15, 30, 0.85) 0%, rgba(5, 8, 18, 0.95) 100%);
          border: 2px solid rgba(0, 240, 255, 0.5);
          border-radius: 50%;
          box-shadow: 0 0 25px rgba(0, 240, 255, 0.25), inset 0 0 15px rgba(0, 240, 255, 0.15);
          overflow: hidden;
          pointer-events: auto;
        }
        #radar-canvas { width: 100%; height: 100%; display: block; border-radius: 50%; }
        .radar-label {
          position: absolute; bottom: 6px; width: 100%; text-align: center;
          font-size: 10px; font-weight: 800; letter-spacing: 2px; color: #00f0ff;
        }

        /* Speedometer & Tachometer Cluster (Bottom Right) */
        .hud-cluster {
          position: absolute; bottom: 20px; right: 20px;
          display: flex; align-items: flex-end; gap: 16px;
          pointer-events: auto;
        }

        .speedo-wrap {
          background: radial-gradient(circle, rgba(12, 18, 36, 0.9) 0%, rgba(5, 8, 20, 0.95) 100%);
          border: 2px solid rgba(255, 0, 119, 0.4);
          border-radius: 16px;
          padding: 14px 22px;
          min-width: 160px;
          box-shadow: 0 0 25px rgba(255, 0, 119, 0.25);
          text-align: right;
        }
        .speedo-num {
          font-size: 58px; font-weight: 900; line-height: 0.9;
          background: linear-gradient(180deg, #ffffff 0%, #00f0ff 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          font-style: italic; letter-spacing: -2px;
        }
        .speedo-unit {
          font-size: 13px; font-weight: 800; letter-spacing: 2px; color: #a0aec0;
        }
        .gear-badge {
          display: inline-block; font-size: 26px; font-weight: 900;
          color: #ff0077; text-shadow: 0 0 15px #ff0077; margin-right: 12px;
        }

        /* Nitro Bar */
        .nitro-container {
          margin-top: 8px; width: 100%;
        }
        .nitro-label {
          display: flex; justify-content: space-between; font-size: 10px; font-weight: 800;
          letter-spacing: 1px; color: #00f0ff; margin-bottom: 2px;
        }
        .nitro-bar-bg {
          height: 6px; background: rgba(255, 255, 255, 0.15); border-radius: 3px; overflow: hidden;
        }
        .nitro-bar-fill {
          height: 100%; width: 100%;
          background: linear-gradient(90deg, #00f0ff, #0088ff);
          box-shadow: 0 0 10px #00f0ff;
          transition: width 0.1s linear;
        }

        /* Quick Tools Toolbar (Bottom Center) */
        .hud-tools {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 8px; pointer-events: auto;
          background: rgba(10, 14, 26, 0.7);
          backdrop-filter: blur(10px);
          padding: 6px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        /* Touch Controls for Mobile / Tablet */
        .hud-touch-controls {
          position: absolute; bottom: 85px; left: 20px; right: 20px;
          display: flex; justify-content: space-between; align-items: flex-end;
          pointer-events: none;
        }
        @media (min-width: 1200px) {
          .hud-touch-controls { display: none; }
        }
        .touch-group {
          display: flex; gap: 10px; pointer-events: auto;
        }
        .touch-btn {
          width: 54px; height: 54px; border-radius: 50%;
          background: rgba(10, 16, 32, 0.8);
          backdrop-filter: blur(8px);
          border: 2px solid rgba(0, 240, 255, 0.4);
          color: #fff; font-size: 18px; font-weight: bold;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; touch-action: none;
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.2);
          transition: all 0.1s ease;
        }
        .touch-btn:active, .touch-btn.active {
          background: rgba(0, 240, 255, 0.45);
          border-color: #00f0ff;
          transform: scale(0.92);
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.6);
        }
        .touch-btn.gas {
          width: 64px; height: 64px; border-color: rgba(0, 255, 120, 0.6);
          background: rgba(0, 180, 80, 0.25);
        }
        .touch-btn.brake {
          width: 58px; height: 58px; border-color: rgba(255, 0, 119, 0.6);
          background: rgba(200, 0, 80, 0.25);
        }
        .touch-btn.drift {
          border-color: rgba(255, 235, 59, 0.6);
          background: rgba(200, 160, 0, 0.25); font-size: 11px;
        }
        .touch-btn.boost {
          border-color: rgba(0, 240, 255, 0.8);
          background: rgba(0, 180, 255, 0.35); font-size: 15px;
        }

        /* Help Modal */
        #hud-help-modal {
          position: fixed; inset: 0; background: rgba(5, 7, 15, 0.85);
          backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center;
          z-index: 2000; pointer-events: auto;
        }
        #hud-help-modal.show { display: flex; }
        .help-box {
          background: rgba(15, 22, 42, 0.95);
          border: 2px solid #00f0ff;
          box-shadow: 0 0 35px rgba(0, 240, 255, 0.35);
          border-radius: 14px;
          padding: 24px 32px;
          max-width: 500px;
          width: 90%;
        }
        .help-box h2 {
          margin: 0 0 16px 0; font-size: 24px; font-weight: 800;
          color: #00f0ff; text-shadow: 0 0 12px #00f0ff;
        }
        .help-grid {
          display: grid; grid-template-columns: 140px 1fr; row-gap: 8px; column-gap: 16px;
          font-size: 14px; margin-bottom: 20px;
        }
        .key-badge {
          background: rgba(0, 240, 255, 0.2); border: 1px solid #00f0ff;
          padding: 2px 8px; border-radius: 4px; font-weight: bold; text-align: center;
          font-family: monospace;
        }
      </style>

      <!-- Top Bar -->
      <div class="hud-top-bar">
        <div class="hud-brand">
          <div class="title">TOKYO MIDNIGHT DRIVE</div>
          <div class="sub">東京ストリートレーサー · JDM SIMULATOR</div>
        </div>

        <div class="hud-districts" id="district-buttons"></div>
      </div>

      <!-- Mode Selector -->
      <div class="hud-modes">
        <button class="hud-btn active" data-mode="${GAME_MODES.FREE_CRUISE}">🚗 Balade Libre</button>
        <button class="hud-btn" data-mode="${GAME_MODES.TIME_ATTACK}">⏱️ Course Checkpoints</button>
        <button class="hud-btn" data-mode="${GAME_MODES.DRIFT_KING}">🔥 Défi Drift (60s)</button>
        <button class="hud-btn" data-mode="${GAME_MODES.SPEED_RUN}">⚡ Défi Vitesse Max</button>
      </div>

      <!-- Challenge Overlay Card -->
      <div class="hud-challenge-card" id="challenge-card">
        <div class="row"><span>OBJECTIF</span><span class="val" id="card-mode-title">TIME ATTACK</span></div>
        <div class="row" id="card-timer-row"><span>TEMPS</span><span class="val" id="card-timer">0.0s</span></div>
        <div class="row" id="card-cp-row"><span>CHECKPOINTS</span><span class="val" id="card-cp">1/6</span></div>
        <div class="row" id="card-score-row" style="display:none"><span>SCORE</span><span class="val" id="card-score">0 pts</span></div>
        <div class="row"><span>RECORD</span><span class="val" id="card-best">--</span></div>
      </div>

      <!-- Central Alerts -->
      <div class="hud-banner" id="hud-banner">
        <div class="main" id="banner-main">SHIBUYA CROSSING</div>
        <div class="sub" id="banner-sub">渋谷スクランブル交差点</div>
      </div>

      <div class="hud-drift-alert" id="hud-drift-alert">
        <div class="score" id="drift-alert-score">+850 DRIFT</div>
        <div class="combo" id="drift-alert-combo">x2.4 TOKYO DRIFT MASTER!</div>
      </div>

      <!-- Bottom Left Minimap Radar -->
      <div class="hud-radar-wrap">
        <canvas id="radar-canvas" width="170" height="170"></canvas>
        <div class="radar-label" id="radar-label">SHIBUYA GPS</div>
      </div>

      <!-- Bottom Center Controls / Customization Toolbar -->
      <div class="hud-tools">
        <button class="hud-btn" id="btn-cam" title="Changer de caméra (C)">🎥 Caméra [C]</button>
        <button class="hud-btn" id="btn-time" title="Changer l'heure (N)">🌆 Nuit/Jour [N]</button>
        <button class="hud-btn" id="btn-color" title="Couleur carrosserie (K)">🎨 Peinture [K]</button>
        <button class="hud-btn" id="btn-neon" title="Néon sous châssis (U)">💡 Néon [U]</button>
        <button class="hud-btn" id="btn-radio" title="Radio Synthwave Tokyo">📻 Radio FM</button>
        <button class="hud-btn" id="btn-reset" title="Replacer la voiture sur la route (R)">🔄 Reset [R]</button>
        <button class="hud-btn" id="btn-help" title="Aide et Contrôles">❓ Contrôles</button>
      </div>

      <!-- Bottom Right Speedometer Cluster -->
      <div class="hud-cluster">
        <div class="speedo-wrap">
          <div>
            <span class="gear-badge" id="speedo-gear">1</span>
            <span class="speedo-num" id="speedo-val">0</span>
            <span class="speedo-unit">KM/H</span>
          </div>
          <div class="nitro-container">
            <div class="nitro-label">
              <span>NITRO BOOST [SHIFT]</span>
              <span id="nitro-val">100%</span>
            </div>
            <div class="nitro-bar-bg">
              <div class="nitro-bar-fill" id="nitro-bar"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Touch Controls for Mobile / Tablets -->
      <div class="hud-touch-controls">
        <div class="touch-group">
          <button class="touch-btn" id="touch-left">◀</button>
          <button class="touch-btn" id="touch-right">▶</button>
        </div>
        <div class="touch-group">
          <button class="touch-btn drift" id="touch-drift">DRIFT</button>
          <button class="touch-btn boost" id="touch-boost">⚡</button>
          <button class="touch-btn brake" id="touch-brake">REC</button>
          <button class="touch-btn gas" id="touch-gas">GAS</button>
        </div>
      </div>

      <!-- Help / Controls Modal -->
      <div id="hud-help-modal">
        <div class="help-box">
          <h2>CONTRÔLES DU VÉHICULE (BURNOUT STYLE)</h2>
          <div class="help-grid">
            <span class="key-badge">Z / W / ↑</span> <span>Accélérer (Plein Gaz)</span>
            <span class="key-badge">S / ↓ (Tap)</span> <span>Brake-to-Drift (Burnout Paradise)</span>
            <span class="key-badge">ESPACE</span> <span>Frein à main / Power Slide</span>
            <span class="key-badge">SHIFT</span> <span>NITRO BOOST (Maintenir pour BURNOUT CHAIN !)</span>
            <span class="key-badge">Q / A / ←</span> <span>Tourner à gauche / Contre-braquer</span>
            <span class="key-badge">D / →</span> <span>Tourner à droite / Contre-braquer</span>
            <span class="key-badge">C</span> <span>Changer de caméra (Chase Action, FPV, Bumper, Drone)</span>
            <span class="key-badge">N</span> <span>Basculer Nuit / Coucher de soleil / Jour</span>
            <span class="key-badge">L</span> <span>Phares avant Allumés / Éteints</span>
            <span class="key-badge">K</span> <span>Changer couleur de carrosserie</span>
            <span class="key-badge">U</span> <span>Changer le néon sous châssis</span>
            <span class="key-badge">H</span> <span>Klaxonner</span>
            <span class="key-badge">R</span> <span>Replacer le véhicule sur la route</span>
          </div>
          <button class="hud-btn" id="btn-close-help" style="width: 100%; justify-content: center; padding: 10px;">FERMER</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Build District Buttons
    const distContainer = this.container.querySelector('#district-buttons');
    this.areas.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = `hud-btn ${a.id === this.currentArea ? 'active' : ''}`;
      btn.textContent = a.name;
      btn.onclick = () => this.onChangeArea(a.id);
      distContainer.appendChild(btn);
    });

    // Time presets (Day, Sunset, Night)
    const timeBtn = this.container.querySelector('#btn-time') as HTMLButtonElement | null;
    let timeStep = 0;
    if (timeBtn) {
      timeBtn.onclick = () => {
        timeStep = (timeStep + 1) % 3;
        if (timeStep === 0) this.onSetTime(22); // Night
        else if (timeStep === 1) this.onSetTime(18.2); // Sunset
        else this.onSetTime(12); // Noon
      };
    }
  }

  setupMinimap() {
    this.radarCanvas = document.getElementById('radar-canvas') as HTMLCanvasElement;
    this.radarCtx = this.radarCanvas?.getContext('2d')!;
  }

  setupEvents() {
    // Mode Buttons
    const modeButtons = this.container.querySelectorAll<HTMLButtonElement>('.hud-modes .hud-btn');
    modeButtons.forEach((btn) => {
      btn.onclick = () => {
        modeButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.gameModes.setMode(btn.dataset.mode);
      };
    });

    // Toolbar buttons
    const btnCam = this.container.querySelector('#btn-cam') as HTMLElement | null;
    if (btnCam) btnCam.onclick = () => {
      const mode = this.cameraCtrl.nextMode();
      this.showNotification(`Caméra : ${mode}`);
    };

    const btnColor = this.container.querySelector('#btn-color') as HTMLElement | null;
    if (btnColor) btnColor.onclick = () => {
      const c = this.vehicle.model.cycleColor();
      this.showNotification(`Peinture : ${c}`);
    };

    const btnNeon = this.container.querySelector('#btn-neon') as HTMLElement | null;
    if (btnNeon) btnNeon.onclick = () => {
      const u = this.vehicle.model.cycleUnderglow();
      this.showNotification(`Néon : ${u}`);
    };

    const btnRadio = this.container.querySelector('#btn-radio') as HTMLElement | null;
    if (btnRadio) btnRadio.onclick = () => {
      const active = this.sound.toggleRadio();
      this.showNotification(active ? 'Radio Tokyo FM : Active 🎵' : 'Radio FM : Éteinte');
    };

    const btnReset = this.container.querySelector('#btn-reset') as HTMLElement | null;
    if (btnReset) btnReset.onclick = () => {
      this.vehicle.respawnOnRoad();
      this.showNotification('Véhicule replacé sur la route !');
    };

    const helpModal = document.getElementById('hud-help-modal');
    const btnHelp = this.container.querySelector('#btn-help') as HTMLElement | null;
    if (btnHelp && helpModal) {
      btnHelp.onclick = () => {
        helpModal.classList.add('show');
      };
    }
    const btnCloseHelp = this.container.querySelector('#btn-close-help') as HTMLElement | null;
    if (btnCloseHelp && helpModal) {
      btnCloseHelp.onclick = () => {
        helpModal.classList.remove('show');
      };
    }

    // Touch controls bindings
    const bindTouch = (id, inputKey) => {
      const btn = this.container.querySelector(id);
      if (!btn) return;
      const start = (e) => {
        e.preventDefault();
        this.sound?.ensureContext();
        this.vehicle.inputs[inputKey] = true;
        btn.classList.add('active');
      };
      const end = (e) => {
        e.preventDefault();
        this.vehicle.inputs[inputKey] = false;
        btn.classList.remove('active');
      };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointerleave', end);
      btn.addEventListener('pointercancel', end);
    };

    bindTouch('#touch-left', 'left');
    bindTouch('#touch-right', 'right');
    bindTouch('#touch-gas', 'forward');
    bindTouch('#touch-brake', 'backward');
    bindTouch('#touch-drift', 'handbrake');
    bindTouch('#touch-boost', 'boost');
  }

  showBanner(title, sub = '') {
    const el = document.getElementById('hud-banner');
    document.getElementById('banner-main').textContent = title;
    document.getElementById('banner-sub').textContent = sub;
    el.classList.add('show');
    clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => el.classList.remove('show'), 3500);
  }

  showLandmark(name, jp = '') {
    this.showBanner(name, jp);
  }

  showNotification(text) {
    this.showBanner(text, '');
  }

  showNearMiss(score) {
    const el = document.getElementById('hud-drift-alert');
    document.getElementById('drift-alert-score').textContent = `NEAR MISS +${score}`;
    document.getElementById('drift-alert-combo').textContent = '⚡ VITESSE PURE ! +NITRO';
    el.classList.add('show');
    clearTimeout(this.notifTimeout);
    this.notifTimeout = setTimeout(() => el.classList.remove('show'), 1200);
  }

  update(dt, traffic) {
    const t = this.vehicle.getTelemetry();

    // 1. Update Speedometer & Gear
    document.getElementById('speedo-val').textContent = t.speed;
    document.getElementById('speedo-gear').textContent = t.gear;

    // 2. Update Nitro bar
    const nitroBar = document.getElementById('nitro-bar');
    nitroBar.style.width = `${t.nitro}%`;
    document.getElementById('nitro-val').textContent = `${t.nitro}%`;
    if (t.isBoosting) {
      nitroBar.style.background = 'linear-gradient(90deg, #ff0077, #ffeb3b)';
      nitroBar.style.boxShadow = '0 0 15px #ff0077';
    } else {
      nitroBar.style.background = 'linear-gradient(90deg, #00f0ff, #0088ff)';
      nitroBar.style.boxShadow = '0 0 10px #00f0ff';
    }

    // 3. Burnout & Drift score alert
    const driftAlert = document.getElementById('hud-drift-alert');
    if (driftAlert) {
      if (t.burnoutAlert) {
        document.getElementById('drift-alert-score')!.textContent = `🔥 BURNOUT! 🔥`;
        document.getElementById('drift-alert-combo')!.textContent = `BURNOUT CHAIN x${t.burnoutChainCount || 1} • 100% REFILL!`;
        driftAlert.classList.add('show');
      } else if (t.isDrifting && t.currentDriftPoints > 50) {
        const angleDeg = Math.abs(t.driftAngle || 0);
        document.getElementById('drift-alert-score')!.textContent = `+${t.currentDriftPoints} DRIFT (${angleDeg}°)`;
        document.getElementById('drift-alert-combo')!.textContent = `x${t.driftMultiplier} ${
          t.driftMultiplier >= 3.5 ? 'TOKYO DRIFT GOD! 🔥' : t.driftMultiplier >= 2.0 ? 'INSANE OVERSTEER! ⚡' : 'BURNOUT POWER SLIDE!'
        }`;
        driftAlert.classList.add('show');
      } else if (!t.isDrifting && !t.burnoutAlert && driftAlert.classList.contains('show')) {
        clearTimeout(this.notifTimeout);
        this.notifTimeout = setTimeout(() => driftAlert.classList.remove('show'), 500);
      }
    }

    // 4. Update Challenge Overlay Card
    const modeData = this.gameModes.getModeData();
    const card = document.getElementById('challenge-card');
    if (modeData.mode === GAME_MODES.TIME_ATTACK) {
      card.classList.add('visible');
      document.getElementById('card-mode-title').textContent = 'TIME ATTACK';
      document.getElementById('card-timer-row').style.display = 'flex';
      document.getElementById('card-timer').textContent = `${modeData.raceTimer}s`;
      document.getElementById('card-cp-row').style.display = 'flex';
      document.getElementById('card-cp').textContent = `${modeData.checkpointCurrent}/${modeData.checkpointTotal}`;
      document.getElementById('card-score-row').style.display = 'none';
      document.getElementById('card-best').textContent = modeData.bestTime ? `${modeData.bestTime}s` : '--';
    } else if (modeData.mode === GAME_MODES.DRIFT_KING) {
      card.classList.add('visible');
      document.getElementById('card-mode-title').textContent = 'DRIFT KING';
      document.getElementById('card-timer-row').style.display = 'flex';
      document.getElementById('card-timer').textContent = `${modeData.driftTimer}s`;
      document.getElementById('card-cp-row').style.display = 'none';
      document.getElementById('card-score-row').style.display = 'flex';
      document.getElementById('card-score').textContent = `${modeData.driftScore} pts`;
      document.getElementById('card-best').textContent = modeData.bestDrift ? `${modeData.bestDrift} pts` : '--';
    } else if (modeData.mode === GAME_MODES.SPEED_RUN) {
      card.classList.add('visible');
      document.getElementById('card-mode-title').textContent = 'VITESSE MAX';
      document.getElementById('card-timer-row').style.display = 'none';
      document.getElementById('card-cp-row').style.display = 'none';
      document.getElementById('card-score-row').style.display = 'flex';
      document.getElementById('card-score').textContent = `${modeData.speedRunPoints} pts (>160 km/h)`;
      document.getElementById('card-best').textContent = modeData.maxRecordedSpeed ? `${modeData.maxRecordedSpeed} km/h` : '--';
    } else {
      card.classList.remove('visible');
    }

    // 5. Draw Minimap Radar
    this.drawRadar(modeData, traffic);
  }

  drawRadar(modeData, traffic) {
    if (!this.radarCtx) return;
    const ctx = this.radarCtx;
    const w = 170, h = 170;
    const cx = w / 2, cy = h / 2;
    const scale = 0.38; // radar meters to pixels

    ctx.clearRect(0, 0, w, h);

    // Radar grid rings
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.arc(cx, cy, 60, 0, Math.PI * 2);
    ctx.stroke();

    const carPos = this.vehicle.position;
    const carYaw = this.vehicle.yaw;

    ctx.save();
    ctx.translate(cx, cy);
    // Rotate radar so player car always points UP
    ctx.rotate(-carYaw);

    // 1. Draw Nearby Road Edges
    if (this.vehicle.roads?.edges) {
      ctx.strokeStyle = 'rgba(100, 140, 180, 0.45)';
      ctx.lineWidth = 2.5;
      for (const e of this.vehicle.roads.edges) {
        if (!e.pts || e.pts.length < 6) continue;
        const midX = (e.pts[0] + e.pts[e.pts.length - 3]) / 2;
        const midZ = (e.pts[2] + e.pts[e.pts.length - 1]) / 2;
        if (Math.hypot(midX - carPos.x, midZ - carPos.z) > 220) continue;

        ctx.beginPath();
        for (let i = 0; i < e.pts.length; i += 3) {
          const rx = (e.pts[i] - carPos.x) * scale;
          const rz = (e.pts[i + 2] - carPos.z) * scale;
          if (i === 0) ctx.moveTo(rx, rz);
          else ctx.lineTo(rx, rz);
        }
        ctx.stroke();
      }
    }

    // 2. Draw Checkpoint Beacon
    if (modeData.targetCheckpoint) {
      const cp = modeData.targetCheckpoint;
      const rx = (cp.x - carPos.x) * scale;
      const rz = (cp.z - carPos.z) * scale;

      ctx.fillStyle = '#ff0055';
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(rx, rz, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 3. Draw NPC Traffic Cars
    if (traffic?.cars) {
      ctx.fillStyle = '#ffaa00';
      for (const c of traffic.cars) {
        if (!c.pos) continue;
        const rx = (c.pos.x - carPos.x) * scale;
        const rz = (c.pos.z - carPos.z) * scale;
        if (Math.hypot(rx, rz) < cx - 4) {
          ctx.beginPath();
          ctx.arc(rx, rz, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();

    // 4. Draw Player Car Arrow at Center
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  destroy() {
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    if (this.notifTimeout) clearTimeout(this.notifTimeout);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
