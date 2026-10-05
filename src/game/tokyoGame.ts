// Procedural Tokyo Driving Game Engine
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import GUI from 'lil-gui';
import { makeProjection } from '../shared/geo.js';
import { createMaterials, shared } from '../world/materials.js';
import { loadTextures } from '../world/textures.js';
import { Streamer } from '../world/streamer.js';
import { Props } from '../world/props.js';
import { Signs } from '../world/signs.js';
import { buildRailways } from '../world/rails.js';
import { buildFlyovers } from '../world/flyovers.js';
import { buildStructures } from '../world/structures.js';
import { loadOrtho } from '../world/ortho.js';
import { Environment } from '../world/environment.js';
import { Atmosphere } from '../world/atmosphere.js';
import { createBirds, MAX_BIRDS } from '../world/birds.js';
import { loadBackdrop } from '../world/backdrop.js';
import { WaterMirror } from '../world/mirror.js';
import { LampLight, installLampLight } from '../world/lamplight.js';

// Driving Game Modules
import { VehicleController } from './vehicle.js';
import { CameraController } from './camera.js';
import { ParticleSystem } from './particles.js';
import { cachedFetch, cachedFetchJson } from '../shared/cache.js';
import { SoundEngine } from './audio.js';
import { GameModeManager } from './gameModes.js';
import { RacingHUD } from './hud.js';

installLampLight();

const BUILD = '2026-10-06F'; // bump on every diagnostic build so reports stay attributable

const REMOTE_ROOT = 'https://jeantimex.github.io/tokyo';

async function resolveDataBases(area: string) {
  try {
    const res = await cachedFetch(`tiles/${area}/manifest.json`);
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('json')) {
      return { tileBase: 'tiles', orthoBase: 'ortho' };
    }
  } catch {}
  return {
    tileBase: `${REMOTE_ROOT}/tiles`,
    orthoBase: `${REMOTE_ROOT}/ortho`,
  };
}

export type QualityPreset = 'fast' | 'balanced' | 'ultra';

export interface TokyoGameOptions {
  area?: string;
  quality?: QualityPreset;
  onProgress?: (fraction: number, step: string) => void;
  onReady?: (info: { area: string; name: string }) => void;
  onChangeArea?: (id: string) => void;
  onFpsUpdate?: (fps: number) => void;
}

export interface TokyoGameInstance {
  dispose: () => void;
  vehicle: VehicleController;
  sound: SoundEngine;
  cameraCtrl: CameraController;
  hud: RacingHUD;
  setTime: (hour: number) => void;
  getArea: () => string;
  setQualityPreset: (preset: QualityPreset) => void;
  getQualityPreset: () => QualityPreset;
}

export async function launchTokyoGame(
  container: HTMLElement,
  options: TokyoGameOptions = {}
): Promise<TokyoGameInstance> {
  const AREA = options.area || 'tokyo';
  let currentQuality: QualityPreset = options.quality || 'balanced';
  console.info('[tokyo] build', BUILD);

  options.onProgress?.(0.04, 'Textures et matériaux');

  // Renderer setup with optimized defaults
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    antialias: currentQuality !== 'fast',
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });

  const getTargetPixelRatio = (q: QualityPreset) => {
    const dpr = window.devicePixelRatio || 1;
    if (q === 'fast' || q === 'balanced') return 1.0;
    return Math.min(dpr, 2.0);
  };

  renderer.setPixelRatio(getTargetPixelRatio(currentQuality));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = currentQuality === 'ultra';
  renderer.info.autoReset = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // near 0.3: the bumper cam sits 0.35 m over the asphalt — with near = 1 the
  // road right under it is clipped away (dark see-through patches). far 25000
  // instead of 60000: a 60000/1 depth range starves depth precision and makes
  // the depth-based passes (AO, screen-space reflections) blotchy.
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.3, 25000);
  const controls = new MapControls(camera, renderer.domElement);
  controls.enabled = false; // the CameraController owns the camera while driving
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
  controls.minDistance = 8;
  controls.maxDistance = 3500;
  controls.enableZoom = false;

  const env = new Environment(scene, renderer);

  const clockTime = {
    live: false,
    hour: 22, // Default night for cyber vibes
    date() {
      const JST = 9 * 3600e3, now = Date.now();
      if (this.live) {
        const t = new Date(now + JST);
        this.hour = t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600;
        return new Date(now);
      }
      const midnight = Math.floor((now + JST) / 864e5) * 864e5 - JST;
      return new Date(midnight + this.hour * 3600e3);
    },
    get h() { return Math.floor(this.hour) % 24; },
    set h(v: number) { this.live = false; this.hour = v + this.m / 60; },
    get m() { return Math.floor((this.hour % 1) * 60 + 1e-6); },
    set m(v: number) { this.live = false; this.hour = this.h + v / 60; },
    label() { const h = this.h, m = this.m; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; },
  };

  const { tileBase, orthoBase } = await resolveDataBases(AREA);
  const materials = createMaterials(await loadTextures(renderer));
  const props = new Props();
  const signs = new Signs();
  const initialRadius = currentQuality === 'fast' ? 500 : currentQuality === 'balanced' ? 650 : 850;
  const streamer = new Streamer(scene, materials, props, signs, { base: `${tileBase}/${AREA}`, radius: initialRadius });

  options.onProgress?.(0.12, 'Chargement de la géométrie urbaine');
  const manifest = await streamer.init();
  options.onProgress?.(0.18, 'Génération des rails et routes');

  const proj = makeProjection(manifest.origin.lon, manifest.origin.lat);

  // Distant ground / horizon (kept inside the camera far plane)
  {
    const b = manifest.bounds;
    const plain = new THREE.Mesh(
      new THREE.CircleGeometry(20000, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.95, metalness: 0 })
    );
    plain.position.set((b.minX + b.maxX) / 2, manifest.terrain.min - 1, (b.minZ + b.maxZ) / 2);
    plain.receiveShadow = true;
    plain.name = 'plain';
    scene.add(plain);

    if (manifest.backdrop) {
      plain.position.y = -0.5;
      plain.material.color.set(0x2c4a5e);
      plain.material.roughness = 0.35;
      loadBackdrop(`${tileBase}/${AREA}`, `${orthoBase}/${AREA}/backdrop`, manifest, proj, renderer).then((mesh) => scene.add(mesh));
    }
  }

  const birds = createBirds();
  birds.geometry.instanceCount = currentQuality === 'fast' ? 40 : 80;
  scene.add(birds);

  const lampLight = new LampLight(renderer);
  const waterMirror = new WaterMirror(renderer);
  waterMirror.enabled = currentQuality !== 'fast';
  const atmosphere = new Atmosphere(renderer, scene, camera, manifest.origin, manifest.bounds);
  env.sky.visible = false;
  const ao = atmosphere.ao;

  if (currentQuality === 'fast') {
    atmosphere.occlusion = false;
    atmosphere.bloom.intensity = 0.4;
    atmosphere.bloomPass.enabled = false; // subtle glow only; keeps one suspect out of the fast chain
    atmosphere.reflect = false;
    // No depth-driven sky pass in fast mode: its night-sky branch paints
    // black over the city when the depth it reads goes wrong (GPU-specific).
    // The scene's own sky dome takes over instead (kept in sync by env).
    atmosphere.skyPass.enabled = false;
    atmosphere.scaleDownPass.enabled = false;
    atmosphere.scaleUpPass.enabled = false;
    env.sky.visible = true;
  } else if (currentQuality === 'balanced') {
    atmosphere.occlusion = true;
    if (ao) ao.configuration.intensity = 1.2;
    atmosphere.bloom.intensity = 1.0;
    atmosphere.reflect = false;
    atmosphere.skyPass.enabled = true;
    atmosphere.scaleDownPass.enabled = true;
    atmosphere.scaleUpPass.enabled = true;
    env.sky.visible = false;
  } else {
    atmosphere.occlusion = true;
    if (ao) ao.configuration.intensity = 2.2;
    atmosphere.bloom.intensity = 1.8;
    atmosphere.reflect = true;
    atmosphere.skyPass.enabled = true;
    atmosphere.scaleDownPass.enabled = true;
    atmosphere.scaleUpPass.enabled = true;
    env.sky.visible = false;
  }

  let orthoLoaded = false, orthoWanted = true;
  loadOrtho(`${orthoBase}/${AREA}`, proj, manifest.bounds, renderer).then((ok) => {
    orthoLoaded = ok;
    shared.uOrthoOn.value = ok && orthoWanted ? 1 : 0;
  });

  const railways = await buildRailways(`${tileBase}/${AREA}/${manifest.rails}`, (x, z) => streamer.ground(x, z), streamer.cover);
  scene.add(railways);

  scene.add(await buildFlyovers(`${tileBase}/${AREA}/${manifest.roads}`, (x, z) => streamer.ground(x, z)));
  if (manifest.structures) {
    scene.add(await buildStructures(`${tileBase}/${AREA}/${manifest.structures}`, (x, z) => streamer.ground(x, z)));
  }

  const roadData = await cachedFetchJson(`${tileBase}/${AREA}/${manifest.roads}`);

  // Initial spawn position from manifest
  const [cx, cz] = (manifest.view || '0,0,420,215,32').split(',').map(Number);

  // Initialize Driving Game Subsystems
  const particles = new ParticleSystem(scene);
  const sound = new SoundEngine();
  const vehicle = new VehicleController(scene, streamer, particles, sound, roadData);

  let spawnX = cx, spawnZ = cz, spawnYaw = 0;
  if (roadData?.edges) {
    let bestDist = Infinity;
    for (const e of roadData.edges) {
      if (!e.pts || e.pts.length < 6) continue;
      for (let i = 0; i < e.pts.length - 3; i += 3) {
        const px = e.pts[i], pz = e.pts[i + 2];
        const d = Math.hypot(px - cx, pz - cz);
        if (d < bestDist) {
          bestDist = d;
          spawnX = px;
          spawnZ = pz;
          const nx = e.pts[i + 3], nz = e.pts[i + 5];
          spawnYaw = Math.atan2(nx - px, nz - pz);
        }
      }
    }
  }
  vehicle.spawnAt(spawnX, spawnZ, spawnYaw);

  const cameraCtrl = new CameraController(camera, vehicle, renderer.domElement);
  vehicle.camera = cameraCtrl;
  cameraCtrl.snap(); // start on the car, not lerping in from the world origin
  const gameModes = new GameModeManager(scene, vehicle, streamer, null);

  const areas = await cachedFetchJson(`${tileBase}/areas.json`)
    .catch(() => null) ?? [{ id: AREA, name: manifest.name }];

  const changeArea = (id: string) => {
    if (options.onChangeArea) {
      options.onChangeArea(id);
    } else {
      const url = new URL(location.href);
      url.searchParams.set('area', id);
      location.href = url.href;
    }
  };

  const setTime = (hour: number) => {
    clockTime.live = false;
    clockTime.hour = hour;
  };

  // Arcade Racing HUD
  const hud = new RacingHUD(vehicle, cameraCtrl, gameModes, sound, areas, AREA, changeArea, setTime);
  gameModes.hud = hud;

  // lil-gui setup
  let gui: GUI | null = new GUI({ title: 'Paramètres Tokyo' });
  gui.close();
  const trains = railways.userData.trains.group;
  const AO = ao.configuration.intensity;
  const state = {
    city: AREA,
    get trains() { return trains.visible; }, set trains(v: boolean) { trains.visible = v; },
    get photo() { return orthoWanted; }, set photo(v: boolean) { orthoWanted = v; shared.uOrthoOn.value = v && orthoLoaded ? 1 : 0; },
    get shadows() { return env.sun.castShadow; }, set shadows(v: boolean) { env.sun.castShadow = v; },
    get occlusion() { return atmosphere.occlusion; }, set occlusion(v: boolean) { atmosphere.occlusion = v; },
    bloom: true,
  };

  gui.add(state, 'city', Object.fromEntries(areas.map((a: any) => [a.name, a.id]))).onChange(changeArea);
  const timeFolder = gui.addFolder('Heure de Tokyo');
  timeFolder.add(clockTime, 'hour', 0, 24, 1 / 60).name('Heure').listen().onChange(() => { clockTime.live = false; });
  gui.add(state, 'trains').name('Trains');
  gui.add(state, 'photo').name('Photos satellites');
  gui.add(birds.geometry, 'instanceCount', 0, MAX_BIRDS, 10).name('Oiseaux');
  gui.add(atmosphere, 'reflect').name('Reflets');
  gui.add(state, 'bloom').name('Effet Bloom');

  let isDestroyed = false;
  let animId = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyN') {
      clockTime.live = false;
      clockTime.hour = env.dark > 0.5 ? 12 : 22;
    }
    // P: bypass post-processing (direct scene render) to isolate a black
    // frame coming from the composer chain vs the scene/camera.
    if (e.code === 'KeyP') {
      directRender = !directRender;
      try { hud.showNotification(directRender ? 'Rendu direct (sans post-processing) 🎥' : 'Rendu compositeur (normal) ✨'); } catch {}
      console.info('[tokyo] directRender =', directRender);
    }
    // O: bisect the composer — disable passes one group at a time to find
    // which one paints the black region. Console logs each stage.
    if (e.code === 'KeyO') {
      composerStage = (composerStage + 1) % 3;
      const at: any = atmosphere;
      at.tonePass.enabled = composerStage === 0;
      at.skyPass.enabled = composerStage === 0;
      // renderToScreen must follow the last ENABLED pass, otherwise nothing
      // reaches the screen at all (black by design, not by bug).
      for (const p of at.composer.passes) p.renderToScreen = false;
      const order = [at.renderPass, at.reflectionPass, at.ao, at.scaleDownPass, at.cloudPass, at.skyPass, at.scaleUpPass, at.bloomPass, at.tonePass];
      for (let i = order.length - 1; i >= 0; i--) {
        if (order[i] && order[i].enabled) { order[i].renderToScreen = true; break; }
      }
      const label = ['compositeur complet', 'SANS bloom/tone-mapping', 'SANS bloom/tone-mapping NI ciel (aerial)'][composerStage];
      try { hud.showNotification(`Compositeur : ${label} 🔬`); } catch {}
      console.info('[tokyo] composerStage =', composerStage, label);
    }
    // Y: automated black-frame self-test — captures the screen after the
    // full composer, then after the RenderPass alone, and prints the verdict.
    // No interpretation needed: pixels decide.
    if (e.code === 'KeyY') {
      if (selfTestStage === 0) {
        selfTestStage = 1;
        try { hud.showNotification('Auto-test : frame compositeur… 📸'); } catch {}
      }
    }
    if (e.code === 'KeyT') {
      try {
        const db = renderer.getDrawingBufferSize(new THREE.Vector2());
        const segs = streamer.getCollidersNear(camera.position.x, camera.position.z, camera.position.y, 3) ?? [];
        const crowns = streamer.getCrownsNear?.(camera.position.x, camera.position.z, 4) ?? [];
        const sticks = streamer.getSticksNear?.(camera.position.x, camera.position.z, 4) ?? [];
        const p = camera.projectionMatrix.elements;
        const v = camera.matrixWorld.elements;
        console.info('[tokyo-snap]', {
          build: BUILD,
          cam: [Math.round(camera.position.x * 10) / 10, Math.round(camera.position.y * 10) / 10, Math.round(camera.position.z * 10) / 10],
          car: [Math.round(vehicle.position.x), Math.round(vehicle.position.z)],
          mode: cameraCtrl.mode,
          fov: Math.round(camera.fov * 100) / 100,
          aspect: Math.round(camera.aspect * 1000) / 1000,
          projFinite: p.every(Number.isFinite),
          viewFinite: v.every(Number.isFinite),
          directRender,
          canvas: `${renderer.domElement.width}x${renderer.domElement.height}`,
          drawBuffer: `${db.x}x${db.y}`,
          calls: lastRender.calls, tris: lastRender.tris,
          geoms: lastRender.geoms, textures: lastRender.textures,
          wallsNear: segs.length / 4, crownsNear: crowns.length / 3, sticksNear: sticks.length / 3,
          carCamDist: Math.round(camera.position.distanceTo(vehicle.position) * 10) / 10,
        });
        hud.showNotification('Snapshot enregistré — voir console F12 (tokyo-snap) 📸');
      } catch (err) { console.error('[tokyo-snap] failed', err); }
    }
  };

  const onResize = () => {
    if (isDestroyed) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    atmosphere.setSize(w, h);
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('resize', onResize);

  // A lost GPU context leaves the canvas black while the DOM HUD keeps
  // running — exactly the reported symptom. Surface it instead of silence.
  const onContextLost = (e: Event) => {
    e.preventDefault();
    console.error('[tokyo] WebGL context lost');
    try { hud.showBanner('GPU SATURÉ', 'Contexte WebGL perdu — rechargez la page si la 3D reste noire'); } catch {}
  };
  const onContextRestored = () => {
    console.info('[tokyo] WebGL context restored');
    try { hud.showNotification('Contexte WebGL restauré ✅'); } catch {}
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost as any, false);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored as any, false);

  const clock = new THREE.Clock();
  let loading = true;
  let frameCount = 0;
  let mirrorTick = 0;
  let diagTick = 0;
  let lastFrameError = 0;
  let lastRender = { calls: 0, tris: 0, geoms: 0, textures: 0 };
  let directRender = false; // KeyP: bypass the composer (diagnostic)
  let composerStage = 0; // KeyO: composer bisection (diagnostic)
  let lastFpsTime = performance.now();
  let lowFpsCounter = 0;

  // Toggling shadowMap.enabled after materials are compiled needs a recompile
  // of every material, otherwise lighting stays stale (black patches).
  // Rare path: only runs when the quality preset actually changes.
  const setShadowMap = (on: boolean) => {
    if (renderer.shadowMap.enabled === on) return;
    renderer.shadowMap.enabled = on;
    scene.traverse((o: any) => {
      const m = o.material;
      if (!m) return;
      for (const mm of (Array.isArray(m) ? m : [m])) {
        if (mm && 'needsUpdate' in mm) mm.needsUpdate = true;
      }
    });
  };

  const applyQuality = (preset: QualityPreset) => {
    currentQuality = preset;
    const dpr = window.devicePixelRatio || 1;
    if (preset === 'fast') {
      renderer.setPixelRatio(1.0);
      setShadowMap(false);
      streamer.radius = 500;
      waterMirror.enabled = false;
      atmosphere.occlusion = false;
      atmosphere.bloom.intensity = 0.4;
      atmosphere.reflect = false;
      // (see init: no depth-driven sky pass in fast mode)
      atmosphere.skyPass.enabled = false;
      atmosphere.scaleDownPass.enabled = false;
      atmosphere.scaleUpPass.enabled = false;
      env.sky.visible = true;
    } else if (preset === 'balanced') {
      renderer.setPixelRatio(1.0);
      setShadowMap(false);
      streamer.radius = 650;
      waterMirror.enabled = true;
      atmosphere.occlusion = true;
      if (ao) ao.configuration.intensity = 1.2;
      atmosphere.bloom.intensity = 1.0;
      atmosphere.bloomPass.enabled = true;
      atmosphere.reflect = false;
      atmosphere.skyPass.enabled = true;
      atmosphere.scaleDownPass.enabled = true;
      atmosphere.scaleUpPass.enabled = true;
      env.sky.visible = false;
    } else {
      renderer.setPixelRatio(Math.min(dpr, 2.0));
      setShadowMap(true);
      streamer.radius = 850;
      waterMirror.enabled = true;
      atmosphere.occlusion = true;
      if (ao) ao.configuration.intensity = 2.2;
      atmosphere.bloom.intensity = 1.8;
      atmosphere.bloomPass.enabled = true;
      atmosphere.reflect = true;
      atmosphere.skyPass.enabled = true;
      atmosphere.scaleDownPass.enabled = true;
      atmosphere.scaleUpPass.enabled = true;
      env.sky.visible = false;
    }
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    atmosphere.setSize(w, h);
  };

  function tick() {
    if (isDestroyed) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    renderer.info.reset();

    // FPS Tracking & Adaptive Performance
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 500) {
      const currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      frameCount = 0;
      lastFpsTime = now;
      options.onFpsUpdate?.(currentFps);

      // Auto-adapt if lag is detected: if FPS < 32 for 3 consecutive intervals, drop to fast
      if (currentFps < 32 && currentQuality !== 'fast') {
        lowFpsCounter++;
        if (lowFpsCounter >= 3) {
          applyQuality('fast');
          hud.showNotification('Mode Turbo 60 FPS activé pour supprimer les saccades ! 🚀');
          lowFpsCounter = 0;
        }
      } else {
        lowFpsCounter = 0;
      }
    }

    // 1. Vehicle, Camera, Game Mode, and HUD simulation
    vehicle.update(dt, null);
    particles.update(dt);
    cameraCtrl.update(dt);
    gameModes.update(dt, null);
    hud.update(dt, null);

    // 2. Streamer updates around vehicle (with velocity: tiles ahead load first)
    const focus = vehicle.position;
    streamer.update(focus, camera.position, vehicle.velocity);

    // Watchdog: a non-finite position (NaN) anywhere turns the whole view
    // black while the loop keeps running. Detect, recover, and say so.
    // Periodic diag line so a bug report can include hard numbers.
    diagTick++;
    if (diagTick % 30 === 0) {
      const p = vehicle.position;
      if (!Number.isFinite(p.x + p.y + p.z)) {
        console.error('[tokyo] vehicle position went non-finite, respawning');
        vehicle.respawnOnRoad();
        try { hud.showNotification('Position corrompue détectée — respawn ! ⚠️'); } catch {}
      } else if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) {
        cameraCtrl.snap();
      }
    }
    if (diagTick % 600 === 0) {
      console.info('[tokyo-diag]', {
        quality: currentQuality,
        tiles: streamer.stats.loaded,
        inFlight: streamer.inFlight,
        queued: streamer.queue.length,
        failed: streamer.failed,
        stuck: streamer.stuck,
        pos: [Math.round(focus.x), Math.round(focus.z)],
        calls: lastRender.calls, tris: lastRender.tris,
        geoms: lastRender.geoms, textures: lastRender.textures,
      });
    }

    // Loading progress
    if (loading) {
      const size = manifest.tileSize;
      const wanted = manifest.tiles.filter((t: any) => Math.hypot((t.x + 0.5) * size - focus.x, (t.z + 0.5) * size - focus.z) <= Math.min(streamer.radius, 900)).length || 1;
      const got = Math.min(1, streamer.stats.loaded / wanted);
      const frac = 0.2 + 0.8 * got;
      options.onProgress?.(frac, `Chargement des tuiles 3D (${streamer.stats.loaded}/${manifest.tiles.length})`);
      if (got >= 1) {
        loading = false;
        options.onProgress?.(1, 'Prêt !');
        options.onReady?.({ area: AREA, name: manifest.name });
        hud.showBanner(manifest.name.toUpperCase(), 'Bienvenue à Tokyo · Appuyez sur [W / Z] pour accélérer !');
      }
    }

    // 3. City World Updates
    props.update(dt);
    if (birds.geometry.instanceCount) birds.userData.update(dt, focus, camera, streamer);
    signs.update();
    railways.userData.trains.update(dt, env.night);

    // 4. Lighting, Sky & Environment
    const sunMoon = atmosphere.setDate(clockTime.date());
    env.setSky(sunMoon.sun, sunMoon.moon);
    env.update(dt);
    env.follow(focus, camera);
    lampLight.update(scene, focus, camera.position, env.night);
    atmosphere.bloom.intensity = state.bloom ? env.bloom * 3 : 0;
    
    // Water mirror is only updated when enabled (avoids double scene render on fast mode).
    // At speed the mirror re-renders every 2nd/3rd frame: a full extra scene
    // render per frame is the biggest hitch felt while driving, and ripples
    // hide the lower rate. The last picture stays bound between updates.
    if (waterMirror.enabled) {
      const spd = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
      const every = spd > 35 ? 3 : spd > 20 ? 2 : 1;
      mirrorTick++;
      if (mirrorTick % every === 0) waterMirror.update(scene, camera, streamer.tiles, focus, []);
    } else {
      shared.uMirrorOn.value = 0;
    }

    // 5. Final Render (or direct scene render when diagnosing the composer)
    if (directRender) {
      renderer.render(scene, camera);
    } else {
      atmosphere.render(dt);
    }
    lastRender = {
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geoms: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
  }

  // The loop must never die on a single bad frame (one throwing tile used
  // to freeze the game forever). Report, skip, keep going.
  const onFrameError = (e: any) => {
    console.error('[tokyo] frame error (loop kept alive):', e);
    const t = performance.now();
    if (t - lastFrameError > 10000) {
      lastFrameError = t;
      try { hud.showNotification('Accroc moteur détecté — la boucle continue ⚠️ (voir console F12)'); } catch {}
    }
  };

  // Screen pixel reader for the self-test (same task as the render, so the
  // drawing buffer is still valid without preserveDrawingBuffer).
  const snap2d = document.createElement('canvas');
  snap2d.width = 64; snap2d.height = 36;
  const snapCtx = snap2d.getContext('2d', { willReadFrequently: true })!;
  function frameBlackness() {
    snapCtx.drawImage(renderer.domElement, 0, 0, 64, 36);
    const d = snapCtx.getImageData(0, 0, 64, 36).data;
    let black = 0;
    const cols = new Array(64).fill(0);
    for (let i = 0; i < 64 * 36; i++) {
      const lum = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
      if (lum < 0.02) { black++; cols[i % 64]++; }
    }
    let edge = 0, edgeX = -1;
    for (let x = 0; x < 63; x++) {
      const jump = Math.abs(cols[x] - cols[x + 1]) / 36;
      if (jump > edge) { edge = jump; edgeX = x; }
    }
    return { black: Math.round((black / (64 * 36)) * 1000) / 1000, edgeX, edge: Math.round(edge * 100) / 100 };
  }
  let selfTestStage = 0;
  let selfTestA = { black: 0, edgeX: -1, edge: 0, jpg: '' };
  let selfTestB = { black: 0, edgeX: -1, edge: 0, jpg: '' };

  function frame() {
    if (isDestroyed) return;
    try {
      tick();
    } catch (e) {
      onFrameError(e);
    }
    if (selfTestStage === 1) {
      // Full composer just rendered: capture, then isolate the RenderPass.
      selfTestA = { ...frameBlackness(), jpg: snap2d.toDataURL('image/jpeg', 0.7) };
      const at: any = atmosphere;
      for (const p of at.composer.passes) p.renderToScreen = false;
      at.renderPass.renderToScreen = true;
      selfTestStage = 2;
      try { hud.showNotification('Auto-test 1/3 : RenderPass seul… 📸'); } catch {}
    } else if (selfTestStage === 2) {
      // RenderPass alone just rendered to screen: capture, then direct render.
      selfTestB = { ...frameBlackness(), jpg: snap2d.toDataURL('image/jpeg', 0.7) };
      const at: any = atmosphere;
      for (const p of at.composer.passes) p.renderToScreen = false;
      directRender = true;
      selfTestStage = 3;
      try { hud.showNotification('Auto-test 2/3 : rendu direct… 📸'); } catch {}
    } else if (selfTestStage === 3) {
      // Direct renderer.render just ran: capture, restore everything, verdict.
      const c = { ...frameBlackness(), jpg: snap2d.toDataURL('image/jpeg', 0.7) };
      directRender = false;
      const at: any = atmosphere;
      for (const p of at.composer.passes) p.renderToScreen = false;
      at.tonePass.renderToScreen = true;
      selfTestStage = 0;
      const verdict = selfTestA.black > 0.5
        ? (selfTestB.black > 0.5
          ? (c.black > 0.5 ? 'PARTOUT NOIR même en direct : scène/caméra (voir images)' : 'RENDERPASS : noir via compositeur, sain en direct')
          : 'TONEMAPPING/BLOOM : le RenderPass est sain, la fin de chaîne noircit')
        : 'SAIN sur ces frames — relance Y face au noir';
      console.info('[tokyo-selftest]', { build: BUILD, full: selfTestA, renderOnly: selfTestB, direct: c, verdict });
      try { hud.showNotification(`Auto-test : ${verdict} 🔬`); } catch {}
    }
    animId = requestAnimationFrame(frame);
  }
  (window as any).__tokyo = { renderer, scene, camera, atmosphere, vehicle, waterMirror, streamer, applyQuality };
  animId = requestAnimationFrame(frame);

  const dispose = () => {
    isDestroyed = true;
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    window.removeEventListener('resize', onResize);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost as any, false);
    renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored as any, false);

    try {
      hud.destroy();
    } catch {}
    try {
      sound.destroy();
    } catch {}
    try {
      if (gui) {
        gui.destroy();
        gui = null;
      }
    } catch {}
    try {
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    } catch {}
  };

  return {
    dispose,
    vehicle,
    sound,
    cameraCtrl,
    hud,
    setTime,
    getArea: () => AREA,
    setQualityPreset: applyQuality,
    getQualityPreset: () => currentQuality,
  };
}
