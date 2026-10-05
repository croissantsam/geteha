// Procedural Tokyo client: streams the compiled city and renders it, under a free camera.
//
// URL parameters: ?area=tokyo  ?time=18.5 (Tokyo hour; default: now)  ?night=1  ?cam=x,z,distance,azimuthDeg,elevationDeg  ?radius=3000  ?traffic=0  ?ortho=0  ?clouds=0.25 (on, with that cover)  ?birds=150  ?cars=600
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import GUI from 'lil-gui';
import { makeProjection } from './shared/geo.js';
import { createMaterials, shared } from './world/materials.js';
import { loadTextures } from './world/textures.js';
import { Streamer } from './world/streamer.js';
import { Props } from './world/props.js';
import { Signs } from './world/signs.js';
import { buildRailways } from './world/rails.js';
import { buildFlyovers } from './world/flyovers.js';
import { Traffic, MAX_CARS } from './world/traffic.js';
import { buildStructures } from './world/structures.js';
import { loadOrtho } from './world/ortho.js';
import { Environment } from './world/environment.js';
import { Atmosphere } from './world/atmosphere.js';
import { createBirds, MAX_BIRDS } from './world/birds.js';
import { loadBackdrop } from './world/backdrop.js';
import { WaterMirror } from './world/mirror.js';
import { LampLight, installLampLight } from './world/lamplight.js';

// Driving Game Modules
import { VehicleController } from './game/vehicle.js';
import { CameraController, CAMERA_MODES } from './game/camera.js';
import { ParticleSystem } from './game/particles.js';
import { SoundEngine } from './game/audio.js';
import { GameModeManager } from './game/gameModes.js';
import { RacingHUD } from './game/hud.js';

installLampLight(); // (before any material is compiled)

const params = new URLSearchParams(location.search);
const AREA = params.get('area') || 'tokyo'; // (the first of the city switch)

// The loading screen (index.html): the city's name, a bar and what is being done.
const loader = {
  el: document.getElementById('loader'),
  show(city, step = '') { this.el.classList.remove('done'); if (city) this.el.querySelector('.city').textContent = city; this.set(0, step); },
  set(fraction, step) { this.el.querySelector('.fill').style.width = `${Math.round(fraction * 100)}%`; if (step != null) this.el.querySelector('.step').textContent = step; },
  hide() { this.el.classList.add('done'); },
};
loader.show(null, 'textures'); // (index.html has already written the city's name)
const USAGE = {
  401: 'office', 402: 'commercial', 403: 'hotel', 404: 'commercial complex', 411: 'house', 412: 'apartments',
  413: 'house + shop', 414: 'apartments + shop', 415: 'house + workshop', 421: 'government', 422: 'school / hospital / culture',
  431: 'transport / warehouse', 441: 'factory', 452: 'utility', 454: 'other', 461: 'unknown',
};

// ---------------------------------------------------------------- renderer, scene, camera
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false; // the composer renders several passes; count the whole frame
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// near 0.3 (bumper cam) / far 25000: keeps depth precision usable for the
// depth-based passes (AO, screen-space reflections) instead of 1/60000.
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 25000);
const controls = new MapControls(camera, renderer.domElement);
controls.enabled = false; // the CameraController owns the camera while driving
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
controls.minDistance = 8;
controls.maxDistance = 3500;
controls.enableZoom = false; // the wheel is handled below, with inertia

const env = new Environment(scene, renderer);
// Time of day, as Tokyo's clock (JST = UTC + 9 h): the real time, or an hour set by hand.
const clockTime = {
  live: params.get('time') == null && params.get('night') !== '1',
  hour: params.get('time') != null ? Number(params.get('time')) : params.get('night') === '1' ? 22 : 12,
  // the moment on today's Tokyo date at which its clock shows `hour`
  date() {
    const JST = 9 * 3600e3, now = Date.now();
    if (this.live) { const t = new Date(now + JST); this.hour = t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600; return new Date(now); }
    const midnight = Math.floor((now + JST) / 864e5) * 864e5 - JST;
    return new Date(midnight + this.hour * 3600e3);
  },
  // the hour and the minute on their own, for the panel; setting either stops the live clock
  get h() { return Math.floor(this.hour) % 24; },
  set h(v) { this.live = false; this.hour = v + this.m / 60; },
  get m() { return Math.floor((this.hour % 1) * 60 + 1e-6); },
  set m(v) { this.live = false; this.hour = this.h + v / 60; },
  label() { const h = this.h, m = this.m; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; },
};

const REMOTE_ROOT = 'https://jeantimex.github.io/tokyo';

async function resolveDataBases(area) {
  try {
    const res = await fetch(`tiles/${area}/manifest.json`);
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

const { tileBase, orthoBase } = await resolveDataBases(AREA);

const materials = createMaterials(await loadTextures(renderer));
const props = new Props();
const signs = new Signs();
const streamer = new Streamer(scene, materials, props, signs, { base: `${tileBase}/${AREA}`, radius: Number(params.get('radius')) || 900 }); // (progressive by default: the control panel can ask for the whole city)
loader.set(0.08, 'terrain');
const manifest = await streamer.init();
loader.set(0.14, 'railways and roads');
const proj = makeProjection(manifest.origin.lon, manifest.origin.lat);
// Beyond the area: plain ground in the grey of the area's own unbuilt land, out to the haze of the horizon.
{
  const b = manifest.bounds, plain = new THREE.Mesh(new THREE.CircleGeometry(20000, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.95, metalness: 0 }));
  plain.position.set((b.minX + b.maxX) / 2, manifest.terrain.min - 1, (b.minZ + b.maxZ) / 2); // just under the lowest ground
  plain.receiveShadow = true;
  plain.name = 'plain';
  scene.add(plain);
  // an area with the land around it (mountains on the horizon): the plain becomes the sea, at sea level
  if (manifest.backdrop) {
    plain.position.y = -0.5; plain.material.color.set(0x2c4a5e); plain.material.roughness = 0.35;
    loadBackdrop(`${tileBase}/${AREA}`, `${orthoBase}/${AREA}/backdrop`, manifest, proj, renderer).then((mesh) => scene.add(mesh));
  }
}
const birds = createBirds();
if (params.get('birds') != null) birds.geometry.instanceCount = Math.min(MAX_BIRDS, Number(params.get('birds')) || 0);
scene.add(birds);
const lampLight = new LampLight(renderer);
const waterMirror = new WaterMirror(renderer);
// post-processing: ambient occlusion, sky, aerial perspective, volumetric clouds, bloom, tone mapping
const atmosphere = new Atmosphere(renderer, scene, camera, manifest.origin, manifest.bounds);
env.sky.visible = false; // the atmosphere draws the sky (the environment map keeps its own)
const ao = atmosphere.ao;
if (params.get('reflect') === '0') atmosphere.reflect = false;
if (Number(params.get('clouds')) > 0) { atmosphere.coverage = Number(params.get('clouds')); atmosphere.cloudsOn = true; }
let orthoLoaded = false, orthoWanted = true; // (the photo fills in when the tiles arrive; the panel may have switched it off by then)
if (params.get('ortho') !== '0') loadOrtho(`${orthoBase}/${AREA}`, proj, manifest.bounds, renderer).then((ok) => { orthoLoaded = ok; shared.uOrthoOn.value = ok && orthoWanted ? 1 : 0; });
const railways = await buildRailways(`${tileBase}/${AREA}/${manifest.rails}`, (x, z) => streamer.ground(x, z), streamer.cover);
scene.add(railways);
scene.add(await buildFlyovers(`${tileBase}/${AREA}/${manifest.roads}`, (x, z) => streamer.ground(x, z)));
if (manifest.structures) scene.add(await buildStructures(`${tileBase}/${AREA}/${manifest.structures}`, (x, z) => streamer.ground(x, z)));
const roadData = await (await fetch(`${tileBase}/${AREA}/${manifest.roads}`)).json();
const traffic = null; // Traffic removed
document.getElementById('credits').textContent = manifest.attribution.map((a) => a.split(' (')[0]).join(' · ');

// initial spawn point from area center
const [cx, cz] = (params.get('cam') || manifest.view || '0,0,420,215,32').split(',').map(Number);

// Initialize Driving Game Subsystems
const particles = new ParticleSystem(scene);
const sound = new SoundEngine();
const vehicle = new VehicleController(scene, streamer, particles, sound, roadData);

// Find the best road lane near (cx, cz) to spawn the vehicle facing in the direction of the road
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
        spawnX = px; spawnZ = pz;
        const nx = e.pts[i + 3], nz = e.pts[i + 5];
        spawnYaw = Math.atan2(nx - px, nz - pz);
      }
    }
  }
}
vehicle.spawnAt(spawnX, spawnZ, spawnYaw);

// Camera and Game Mode Managers
const cameraCtrl = new CameraController(camera, vehicle, renderer.domElement);
vehicle.camera = cameraCtrl;
cameraCtrl.snap(); // start on the car, not lerping in from the world origin
const gameModes = new GameModeManager(scene, vehicle, streamer, null);

// Areas list for quick-travel switcher
const areas = await fetch(`${tileBase}/areas.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) ?? [{ id: AREA, name: manifest.name }];

const changeArea = (id) => {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('area', id);
  loader.show(areas.find((a) => a.id === id)?.name ?? id, 'leaving for the next city');
  setTimeout(() => { location.href = url.href; }, 60);
};

const setTime = (hour) => {
  clockTime.live = false;
  clockTime.hour = hour;
};

// Arcade Racing HUD
const hud = new RacingHUD(vehicle, cameraCtrl, gameModes, sound, areas, AREA, changeArea, setTime);
gameModes.hud = hud;

// ---------------------------------------------------------------- control panel
let guiState, clockText;
{
  const trains = railways.userData.trains.group, AO = ao.configuration.intensity;
  const state = {
    city: AREA,
    get info() { return document.getElementById('hud').style.display !== 'none'; }, set info(v) { document.getElementById('hud').style.display = v ? '' : 'none'; },
    get traffic() { return !!traffic.group.parent; }, set traffic(v) { if (v) scene.add(traffic.group); else scene.remove(traffic.group); },
    get trains() { return trains.visible; }, set trains(v) { trains.visible = v; },
    get photo() { return orthoWanted; }, set photo(v) { orthoWanted = v; shared.uOrthoOn.value = v && orthoLoaded ? 1 : 0; },
    get shadows() { return env.sun.castShadow; }, set shadows(v) { env.sun.castShadow = v; },
    get occlusion() { return ao.configuration.intensity > 0; }, set occlusion(v) { ao.configuration.intensity = v ? AO : 0; },
    bloom: true,
    wholeCity: false, near: Number(params.get('radius')) || 900,
    get whole() { return this.wholeCity; }, set whole(v) { this.wholeCity = v; streamer.radius = v ? 1e5 : this.near; },
    get radius() { return this.near; }, set radius(v) { this.near = v; if (!this.wholeCity) streamer.radius = v; },
  };
  guiState = state;

  const gui = new GUI({ title: 'Settings' });
  gui.close();
  gui.add(state, 'city', Object.fromEntries(areas.map((a) => [a.name, a.id]))).onChange(changeArea);
  const time = gui.addFolder('Time (Tokyo)');
  time.add(clockTime, 'live').name('live clock').listen();
  const slider = time.add(clockTime, 'hour', 0, 24, 1 / 60).name('time').listen().onChange(() => { clockTime.live = false; });
  (slider as any).$input.style.display = 'none';
  clockText = document.createElement('span');
  clockText.style.cssText = 'min-width: 3.4em; padding-left: 8px; text-align: right; font-variant-numeric: tabular-nums;';
  (slider as any).$widget.appendChild(clockText);
  gui.add(props, 'streetLights', 0, 3, 0.05).name('street lights');
  gui.add(props, 'parkLights', 0, 3, 0.05).name('park lights');
  gui.add(state, 'trains');
  gui.add(state, 'photo').name('aerial photo').listen();
  gui.add(birds.geometry, 'instanceCount', 0, MAX_BIRDS, 10).name('birds');
  const sky = gui.addFolder('Clouds');
  sky.add(atmosphere, 'cloudsOn').name('clouds');
  sky.add(atmosphere, 'coverage', 0, 1, 0.05);
  sky.add(atmosphere, 'base', 200, 2000, 50).name('base altitude (m)');
  const quality = gui.addFolder('Rendering');
  quality.add(state, 'whole').name('whole city');
  quality.add(state, 'radius', 300, 3000, 50).name('view radius (m), if not');
  quality.add(atmosphere, 'reflect').name('window and water reflections');
  quality.add(state, 'shadows');
  quality.add(state, 'occlusion').name('ambient occlusion');
  quality.add(state, 'bloom');
}

// ---------------------------------------------------------------- input & resize
addEventListener('keydown', (e) => {
  if (e.code === 'KeyN') { clockTime.live = false; clockTime.hour = env.dark > 0.5 ? 12 : 22; }
  // KeyP: bypass post-processing (direct scene render) to isolate a black
  // frame coming from the composer chain vs the scene/camera.
  if (e.code === 'KeyP') {
    directRender = !directRender;
    try { hud.showNotification(directRender ? 'Rendu direct (sans post-processing) 🎥' : 'Rendu compositeur (normal) ✨'); } catch {}
    console.info('[tokyo] directRender =', directRender);
  }
  // KeyO: bisect the composer — disable passes one group at a time.
  if (e.code === 'KeyO') {
    composerStage = (composerStage + 1) % 3;
    const at: any = atmosphere;
    at.tonePass.enabled = composerStage === 0;
    at.skyPass.enabled = composerStage === 0;
    const label = ['compositeur complet', 'SANS bloom/tone-mapping', 'SANS bloom/tone-mapping NI ciel (aerial)'][composerStage];
    try { hud.showNotification(`Compositeur : ${label} 🔬`); } catch {}
    console.info('[tokyo] composerStage =', composerStage, label);
  }
  // KeyT: debug snapshot at the glitch spot (paste the console line).
  if (e.code === 'KeyT') {
    try {
      const db = renderer.getDrawingBufferSize(new THREE.Vector2());
      const segs = streamer.getCollidersNear(camera.position.x, camera.position.z, camera.position.y, 3) ?? [];
      const p = camera.projectionMatrix.elements;
      const v = camera.matrixWorld.elements;
      console.info('[tokyo-snap]', {
        cam: [Math.round(camera.position.x * 10) / 10, Math.round(camera.position.y * 10) / 10, Math.round(camera.position.z * 10) / 10],
        car: [Math.round(vehicle.position.x), Math.round(vehicle.position.z)],
        mode: cameraCtrl.mode,
        fov: Math.round(camera.fov * 100) / 100,
        aspect: Math.round(camera.aspect * 1000) / 1000,
        projFinite: p.every(Number.isFinite),
        viewFinite: v.every(Number.isFinite),
        directRender,
        calls: lastRender.calls, tris: lastRender.tris,
        geoms: lastRender.geoms, textures: lastRender.textures,
        wallsNear: segs.length / 4,
        carCamDist: Math.round(camera.position.distanceTo(vehicle.position) * 10) / 10,
      });
      hud.showNotification('Snapshot enregistré — voir console F12 (tokyo-snap) 📸');
    } catch (err) { console.error('[tokyo-snap] failed', err); }
  }
}, { capture: true });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  atmosphere.setSize(innerWidth, innerHeight);
});

// A lost GPU context leaves the canvas black while the DOM HUD keeps running.
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  console.error('[tokyo] WebGL context lost');
  try { hud.showBanner('GPU SATURÉ', 'Contexte WebGL perdu — rechargez la page si la 3D reste noire'); } catch {}
}, false);
renderer.domElement.addEventListener('webglcontextrestored', () => {
  console.info('[tokyo] WebGL context restored');
  try { hud.showNotification('Contexte WebGL restauré ✅'); } catch {}
}, false);

// ---------------------------------------------------------------- render loop
const clock = new THREE.Clock();
let loading = true;
let mirrorTick = 0;
let diagTick = 0;
let lastFrameError = 0;
let directRender = false; // KeyP: bypass the composer (diagnostic)
let composerStage = 0; // KeyO: composer bisection (diagnostic)
let lastRender = { calls: 0, tris: 0, geoms: 0, textures: 0 };

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  renderer.info.reset();

  // 1. Vehicle, Camera, Game Mode, and HUD simulation
  vehicle.update(dt, null);
  particles.update(dt);
  cameraCtrl.update(dt);
  gameModes.update(dt, null);
  hud.update(dt, null);

  // 2. Streamer focuses dynamically on the player vehicle (with velocity:
  // tiles ahead of the car load first, so no black holes open up in front).
  const focus = vehicle.position;
  streamer.update(focus, camera.position, vehicle.velocity);

  // Watchdog: non-finite positions render the whole view black while the
  // loop keeps running. Detect, recover, and log hard numbers periodically.
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

  // Loading screen management
  if (loading) {
    const size = manifest.tileSize;
    const wanted = manifest.tiles.filter((t) => Math.hypot((t.x + 0.5) * size - focus.x, (t.z + 0.5) * size - focus.z) <= Math.min(streamer.radius, 900)).length || 1;
    const got = Math.min(1, streamer.stats.loaded / wanted);
    loader.set(0.2 + 0.8 * got, `city tiles ${streamer.stats.loaded} / ${manifest.tiles.length}`);
    if (got >= 1) {
      loading = false;
      loader.hide();
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
  if (clockText) clockText.textContent = clockTime.label();
  env.update(dt);
  env.follow(focus, camera);
  lampLight.update(scene, focus, camera.position, env.night);
  atmosphere.bloom.intensity = guiState.bloom ? env.bloom * 3 : 0;
  waterMirror.enabled = atmosphere.reflect;
  // At speed the mirror re-renders every 2nd/3rd frame: a full extra scene
  // render per frame is the biggest hitch felt while driving.
  {
    const spd = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
    const every = spd > 35 ? 3 : spd > 20 ? 2 : 1;
    mirrorTick++;
    if (waterMirror.enabled && mirrorTick % every === 0) waterMirror.update(scene, camera, streamer.tiles, focus, []);
    else if (!waterMirror.enabled) shared.uMirrorOn.value = 0;
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

function frame() {
  // The loop must never die on a single bad frame. Report, skip, keep going.
  try {
    tick();
  } catch (e) {
    console.error('[tokyo] frame error (loop kept alive):', e);
    const t = performance.now();
    if (t - lastFrameError > 10000) {
      lastFrameError = t;
      try { hud.showNotification('Accroc moteur détecté — la boucle continue ⚠️ (voir console F12)'); } catch {}
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as any).__app = { scene, camera, vehicle, cameraCtrl, gameModes, hud, streamer, env, renderer, materials, ao, atmosphere, traffic, shared, tick, clockTime };
