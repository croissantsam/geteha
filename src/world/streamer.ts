// Keeps the tiles within `radius` of a focus point loaded, nearest first, and drops the ones
// that fall beyond radius + hysteresis. Meshing happens in a small pool of workers.
import * as THREE from 'three';
import { tileKey } from '../shared/geo.js';
import { sampleGrid } from '../shared/terrain.js';
import { makeSurface, makeCover } from '../shared/decks.js';
import { SIGN_LOD_DISTANCE } from './signs.js';
import { shared } from './materials.js';
import { cachedFetchJson, cachedFetchArrayBuffer } from '../shared/cache.js';

const WORKERS = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) >> 1));
const MAX_IN_FLIGHT = WORKERS * 2;
// Distance (m) from the eye within which a tile shows its full-size photo atlas instead of the small one.
const ROOFS_FULL = 600, WALLS_FULL = 900;

function geometry(arrays, attrs) {
  const g = new THREE.BufferGeometry();
  for (const [name, size] of attrs) if (arrays[name]?.length) g.setAttribute(name, new THREE.BufferAttribute(arrays[name], size));
  if (arrays.index) g.setIndex(new THREE.BufferAttribute(arrays.index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export class Streamer {
  scene: THREE.Scene;
  materials: any;
  props: any;
  signs: any;
  base: string;
  radius: number;
  hysteresis: number;
  tiles: Map<string, any>;
  inFlight: number;
  stats: { loaded: number; buildings: number; triangles: number };
  manifest: any;
  grid: any;
  surface: (x: number, z: number) => number;
  cover: any;
  available: Map<string, any>;
  workers: Worker[];
  nextWorker: number;
  // Decoded tiles waiting to be assembled on the main thread. Assembly
  // (geometry alloc, instancing, scene add) is the frame hitch felt when
  // driving fast: at most BUILD_BUDGET tiles are built per frame.
  queue: any[];
  // Point ahead of the car the loader prioritises (focus + velocity lead).
  lookAhead: THREE.Vector3;
  // Request tokens: a worker answer only counts for the request still on
  // record (stale answers from a timed-out request are ignored, so the
  // in-flight accounting can never drift and wedge all future loads).
  seq: number;
  failed: number;
  stuck: number;

  constructor(scene: any, materials: any, props: any, signs: any, { base = '', radius = 1100, hysteresis = 250 }: { base?: string; radius?: number; hysteresis?: number } = {}) {
    this.scene = scene;
    this.materials = materials;
    this.props = props;
    this.signs = signs;
    this.base = base;
    this.radius = radius;
    this.hysteresis = hysteresis;
    this.tiles = new Map(); // key -> { state, group, info, ends, tris }
    this.inFlight = 0;
    this.stats = { loaded: 0, buildings: 0, triangles: 0 };
    this.nextWorker = 0;
    this.surface = (x, z) => 0;
    this.workers = [];
    this.queue = [];
    this.lookAhead = new THREE.Vector3();
    this.seq = 0;
    this.failed = 0;
    this.stuck = 0;
  }

  async init() {
    this.manifest = await cachedFetchJson(`${this.base}/manifest.json`);
    const t = this.manifest.terrain;
    const data = new Float32Array(await cachedFetchArrayBuffer(`${this.base}/${t.file}`));
    this.grid = { x0: t.x0, z0: t.z0, step: t.step, w: t.w, h: t.h, data };
    const decks = this.manifest.decks ?? [];
    this.surface = makeSurface(this.grid, decks);
    this.cover = makeCover(this.grid, decks);
    this.available = new Map(this.manifest.tiles.map((tl) => [tileKey(tl.x, tl.z), tl]));
    this.workers = Array.from({ length: WORKERS }, () => {
      const w = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' });
      w.postMessage({ type: 'init', decks, grid: { ...this.grid, data: data.slice().buffer } });
      w.onmessage = (e) => this.onResult(e.data);
      return w;
    });
    this.nextWorker = 0;
    return this.manifest;
  }

  // Terrain height, and the height of whatever one stands on (the terrain, or a bridge deck).
  ground(x, z) { return sampleGrid(this.grid, x, z); }

  // focus: the point tiles are streamed around; eye: the camera position, for level of detail.
  // velocity: the focus' velocity (m/s) — tiles ahead of the movement are
  // fetched first so driving into unloaded land no longer opens black holes.
  update(focus, eye = focus, velocity: any = null) {
    // Assemble queued tiles first, on a per-frame budget (see onResult).
    // One bad tile must never kill the frame loop: it is marked failed.
    let budget = 2;
    while (this.queue.length && budget-- > 0) {
      const msg = this.queue.shift();
      try {
        this.build(msg);
      } catch (e) {
        console.error(`tile ${msg.key}: assembly failed`, e);
        this.tiles.delete(msg.key);
        this.failed++;
      }
    }

    // Look-ahead point: up to ~150 m in front of a fast car. Slow/still: the focus itself.
    let ax = focus.x, az = focus.z;
    if (velocity) {
      const sp = Math.hypot(velocity.x, velocity.z);
      if (sp > 4) {
        const lead = Math.min(150, sp * 1.6); // ~1.6 s of travel
        ax += (velocity.x / sp) * lead;
        az += (velocity.z / sp) * lead;
      }
    }
    this.lookAhead.set(ax, focus.y, az);
    const size = this.manifest.tileSize;
    for (const [key, t] of this.tiles) {
      if (t.state !== 'ready' || (!t.trees && !t.signs && !t.atlases.length)) continue;
      // Distance from the eye to the nearest point of the tile, so things next to the camera are never the
      // simple versions; a margin on the way out stops a tile flickering at the threshold.
      const tl = this.available.get(key), x0 = tl.x * size, z0 = tl.z * size;
      const dx = Math.max(x0 - eye.x, 0, eye.x - (x0 + size)), dz = Math.max(z0 - eye.z, 0, eye.z - (z0 + size));
      const dy = Math.max(0, eye.y - this.ground(x0 + size / 2, z0 + size / 2) - 25);
      const d = Math.hypot(dx, dy, dz);
      if (t.trees) {
        // a tile full of trees (a wood) keeps its detailed ones closer: thousands of them are too much to draw
        const limit = this.props.constructor.lodDistance * (t.trees.count > 120 ? 0.5 : 1);
        const near = t.trees.near.visible ? d < limit * 1.25 : d < limit;
        t.trees.near.visible = near; t.trees.far.visible = !near;
      }
      for (const a of t.atlases) {
        if (a.dead) continue;
        const want = d < a.dist * (a.full || a.loading ? 1.3 : 1);
        if (want && !a.full && !a.loading) {
          a.loading = true;
          this.loadTexture(a.file, (map) => {
            a.loading = false;
            if (this.tiles.get(key) !== t || a.gone) { map.dispose(); a.gone = false; return; }
            a.full = map; a.apply(map);
          }, () => { a.loading = false; });
        } else if (!want && a.loading) a.gone = true;      // arrived too late: drop it on arrival
        else if (want && a.loading) a.gone = false;
        else if (!want && a.full) { if (a.small) a.apply(a.small); a.full.dispose(); a.full = null; }
      }
      if (t.signs) {
        // sign text is drawn into a texture when the tile comes near, and freed when it is far again
        const near = t.signNear ? d < SIGN_LOD_DISTANCE * 1.3 : d < SIGN_LOD_DISTANCE;
        if (near !== t.signNear) { t.signNear = near; t.signs.setNear(near); }
      }
    }
    const dist = (tl) => Math.hypot((tl.x + 0.5) * size - focus.x, (tl.z + 0.5) * size - focus.z);
    // unload
    for (const [key, t] of this.tiles) {
      if (t.state === 'ready' && dist(this.available.get(key)) > this.radius + this.hysteresis) this.unload(key);
    }
    // Reclaim requests a worker never answered (crashed/wedged): without
    // this, inFlight stays saturated and loading stops for good — the city
    // unloads around the car until the screen goes black.
    const now = performance.now();
    for (const [key, t] of this.tiles) {
      if (t.state === 'loading' && now - (t.requestedAt ?? now) > 25000) {
        this.tiles.delete(key);
        this.inFlight = Math.max(0, this.inFlight - 1);
        this.stuck++;
        console.warn(`tile ${key}: worker timeout, request reclaimed`);
      }
    }
    // load, nearest to the look-ahead point first (what the car drives into)
    if (this.inFlight >= MAX_IN_FLIGHT) return;
    const wanted = [];
    for (const [key, tl] of this.available) {
      if (this.tiles.has(key)) continue;
      const d = dist(tl);
      if (d <= this.radius) wanted.push([Math.hypot((tl.x + 0.5) * size - ax, (tl.z + 0.5) * size - az), key, tl]);
    }
    wanted.sort((a, b) => a[0] - b[0]);
    for (const [, key, tl] of wanted) {
      if (this.inFlight >= MAX_IN_FLIGHT) break;
      const token = ++this.seq;
      this.tiles.set(key, { state: 'loading', requestedAt: performance.now(), token });
      this.inFlight++;
      const w = this.workers[this.nextWorker++ % this.workers.length];
      const url = (file) => new URL(`${this.base}/${file}`, location.href).href;
      w.postMessage({ type: 'tile', key, url: url(tl.file), meshUrl: tl.mesh && url(tl.mesh), tileSize: size, token });
    }
  }

  onResult(msg) {
    const t = this.tiles.get(msg.key);
    if (!t || t.token !== msg.token) return; // stale answer to a reclaimed request: already accounted for
    this.inFlight = Math.max(0, this.inFlight - 1);
    // a tile that cannot be read stays marked as failed: asking for it again every frame would only repeat the error
    if (msg.type === 'error') { console.warn(`tile ${msg.key}: ${msg.message}`); t.state = 'failed'; this.failed++; return; }
    // assembly runs on the main thread: queue it so a burst of finished
    // tiles (typical when driving fast) is spread over several frames
    // instead of freezing one of them.
    this.queue.push(msg);
  }

  build(msg) {
    const t = this.tiles.get(msg.key);
    if (!t || t.token !== msg.token) return; // reclaimed or superseded meanwhile
    if (t.state !== 'loading') return; // unloaded and re-requested meanwhile: the newer request wins
    const { terrain, roads, paint, decals, buildings, info, props, wires, signs: signList, models } = msg.mesh;
    const group = new THREE.Group();
    group.name = `tile ${msg.key}`;
    const atlases = [];

    const ground = new THREE.Mesh(geometry(terrain, [['position', 3], ['normal', 3]]), this.materials.terrain);
    ground.receiveShadow = true;
    group.add(ground);

    if (roads.position.length) {
      const m = new THREE.Mesh(geometry(roads, [['position', 3], ['normal', 3], ['color', 3], ['aLayer', 1]]), this.materials.road);
      m.receiveShadow = true;
      group.add(m);
      // the tile's water (for the mirror): the sphere around it, and its level
      const box = new THREE.Box3(), v = new THREE.Vector3();
      let sum = 0, n = 0;
      for (let i = 0; i < roads.aLayer.length; i++) if (roads.aLayer[i] > 3.5) { box.expandByPoint(v.fromArray(roads.position, i * 3)); sum += v.y; n++; }
      if (n) t.water = { y: sum / n, sphere: box.getBoundingSphere(new THREE.Sphere()) };
    }
    if (paint.position.length) {
      const m = new THREE.Mesh(geometry(paint, [['position', 3], ['normal', 3], ['color', 3], ['aLayer', 1]]), this.materials.paint);
      m.receiveShadow = true;
      group.add(m);
    }
    if (decals.position.length) {
      const m = new THREE.Mesh(geometry(decals, [['position', 3], ['normal', 3], ['uv', 2]]), this.props.mats.decal);
      m.receiveShadow = true;
      m.renderOrder = 2;
      group.add(m);
    }
    let trees = null;
    if (props.length || wires.length) {
      trees = this.props.build(props, wires, this.surface);
      trees.near.visible = false; // update() picks the level of detail on the next frame
      group.add(trees.group);
    }
    let signs = null;
    if (signList.length) {
      signs = this.signs.build(signList);
      group.add(signs.group);
    }
    if (buildings.position.length) {
      const walls = this.available.get(msg.key).walls;
      const m = new THREE.Mesh(
        geometry(buildings, [['position', 3], ['normal', 3], ['color', 3], ['aFacade', 4], ['aBldg', 4], ['aPhoto', 2]]),
        walls ? this.materials.facadeFor() : this.materials.facade,
      );
      if (walls) { // the tile's wall photos, blended in by the facade shader with distance
        group.userData.own = [m.material]; // (kept off the mesh: its userData is the picking record)
        const at = this.atlas(msg.key, t, walls, WALLS_FULL, (map) => { m.material.userData.photo.value = map; m.material.userData.photoOn.value = 1; });
        if (at) atlases.push(at);
      }
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData = { tile: msg.key, info, ends: buildings.ends, facade: true };
      group.add(m);
    }
    if (models) { // PLATEAU's own models of bridges, street furniture and trees
      const m = new THREE.Mesh(geometry(models, [['position', 3], ['normal', 3], ['color', 3]]), this.materials.models);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    if (buildings.photo.position.length) { // LOD2 roofs under their aerial photo (the tile's atlas)
      // plain grey until the photo has arrived
      const m = new THREE.Mesh(geometry(buildings.photo, [['position', 3], ['normal', 3], ['uv', 2]]), new THREE.MeshStandardMaterial({ color: 0x777776, roughness: 0.9, metalness: 0 }));
      m.castShadow = m.receiveShadow = true;
      m.material.onBeforeCompile = (shader) => { shader.uniforms.uLampOn = { value: 0 }; shader.uniforms.uLampMap = shared.uLampMap; }; // (no lamp light up here: see lamplight.js)
      m.userData.own = [m.material]; // freed with the tile
      const roofAtlas = this.atlas(msg.key, t, this.available.get(msg.key).atlas, ROOFS_FULL, (map) => {
        const first = !m.material.map;
        m.material.map = map; m.material.color.set(0xffffff);
        if (first) m.material.needsUpdate = true;
      });
      if (roofAtlas) atlases.push(roofAtlas);
      group.add(m);
    }
    const tris = terrain.index.length / 3 + roads.position.length / 9 + buildings.triangles;
    // Vertical street furniture for camera anti-clip (a pole 30 cm from the
    // lens fills the frame with a razor-edged black block at night): [x, z, kind].
    // Trees included (trunks); crowns are covered separately. Flat road paint excluded.
    let sticks: number[] | null = null;
    if (props.length) {
      sticks = [];
      for (let i = 0; i < props.length; i += 6) {
        const kind = props[i];
        if (kind === 5) continue; // PROP.DECAL: flat paint on the road
        sticks.push(props[i + 3], props[i + 4], kind);
      }
      if (!sticks.length) sticks = null;
    }
    Object.assign(t, { state: 'ready', group, trees, signs, atlases, signNear: false, buildings: info.length, tris, colliders: msg.mesh.colliders, crowns: trees?.roosts ?? [], sticks });
    this.scene.add(group);
    this.stats.loaded++; this.stats.buildings += info.length; this.stats.triangles += tris;
  }

  // A photo atlas of a tile: its small version is loaded now and stays; update() swaps the full one in
  // while the eye is within `dist` of the tile. apply(map) puts a texture on the material.
  // Returns null when the tile declares no photo (a missing file here used to throw mid-frame).
  atlas(key, t, file, dist, apply) {
    if (!file) return null;
    const a = { file, dist, apply, small: null, full: null, loading: false, dead: false };
    this.loadTexture(file.replace(/\.jpg$/, '_s.jpg'), (map) => {
      if (this.tiles.get(key) !== t) { map.dispose(); return; } // unloaded meanwhile
      a.small = map;
      if (!a.full) apply(map);
    }, () => { a.dead = true; });
    return a;
  }

  loadTexture(file, done, onError?) {
    new THREE.TextureLoader().load(`${this.base}/${file}`, (map) => {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      done(map);
    }, undefined, () => onError?.());
  }

  unload(key) {
    const t = this.tiles.get(key);
    for (const a of t.atlases ?? []) { a.small?.dispose(); a.full?.dispose(); }
    this.scene.remove(t.group);
    t.signs?.dispose();
    // prop models are shared between tiles; only per-tile geometry is freed
    t.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); else if (!o.isGroup) o.geometry?.dispose(); o.userData.own?.forEach((r) => r.dispose()); });
    this.tiles.delete(key);
    this.stats.loaded--; this.stats.buildings -= t.buildings; this.stats.triangles -= t.tris;
  }

  // Returns all building and barrier wall segments near (x, z, y): [x0, z0, x1, z1, ...]
  getCollidersNear(x, z, y, radius = 10) {
    const segments = [];
    const size = this.manifest.tileSize;
    const minTx = Math.floor((x - radius) / size);
    const maxTx = Math.floor((x + radius) / size);
    const minTz = Math.floor((z - radius) / size);
    const maxTz = Math.floor((z + radius) / size);

    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let tz = minTz; tz <= maxTz; tz++) {
        const key = tileKey(tx, tz);
        const t = this.tiles.get(key);
        if (!t || t.state !== 'ready' || !t.colliders) continue;

        const c = t.colliders;
        const radiusSq = radius * radius;
        for (let i = 0; i < c.length; i += 6) {
          const bBase = c[i + 4], bTop = c[i + 5];
          // Height check: car height y must be within the wall height
          if (y < bBase - 2.5 || y > bTop + 1.5) continue;

          const xA = c[i], zA = c[i + 1], xB = c[i + 2], zB = c[i + 3];
          const minX = Math.min(xA, xB) - radius, maxX = Math.max(xA, xB) + radius;
          const minZ = Math.min(zA, zB) - radius, maxZ = Math.max(zA, zB) + radius;
          if (x < minX || x > maxX || z < minZ || z > maxZ) continue;

          segments.push(xA, zA, xB, zB);
        }
      }
    }
    return segments;
  }

  // Tree-crown centres near (x, z) for camera anti-clip: [x, y, z, ...].
  // Foliage at the lens reads as a pure-black razor-edged block at night,
  // and wall colliders don't cover trees.
  getCrownsNear(x, z, radius = 12) {
    const out = [];
    const size = this.manifest.tileSize;
    const minTx = Math.floor((x - radius) / size);
    const maxTx = Math.floor((x + radius) / size);
    const minTz = Math.floor((z - radius) / size);
    const maxTz = Math.floor((z + radius) / size);
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let tz = minTz; tz <= maxTz; tz++) {
        const t = this.tiles.get(tileKey(tx, tz));
        if (!t || t.state !== 'ready' || !t.crowns) continue;
        const c = t.crowns;
        for (let i = 0; i < c.length; i += 3) {
          const dx = c[i] - x, dz = c[i + 2] - z;
          if (dx * dx + dz * dz <= radius * radius) out.push(c[i], c[i + 1], c[i + 2]);
        }
      }
    }
    return out;
  }

  // Vertical street furniture near (x, z) for camera anti-clip: [x, z, kind].
  getSticksNear(x, z, radius = 12) {
    const out = [];
    const size = this.manifest.tileSize;
    const minTx = Math.floor((x - radius) / size);
    const maxTx = Math.floor((x + radius) / size);
    const minTz = Math.floor((z - radius) / size);
    const maxTz = Math.floor((z + radius) / size);
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let tz = minTz; tz <= maxTz; tz++) {
        const t = this.tiles.get(tileKey(tx, tz));
        if (!t || t.state !== 'ready' || !t.sticks) continue;
        const p = t.sticks;
        for (let i = 0; i < p.length; i += 3) {
          const dx = p[i] - x, dz = p[i + 1] - z;
          if (dx * dx + dz * dz <= radius * radius) out.push(p[i], p[i + 1], p[i + 2]);
        }
      }
    }
    return out;
  }

  // Building under a raycast hit on a facade mesh: { usage, storeys, height, base }.
  buildingAt(hit) {
    const { info, ends } = hit.object.userData ?? {};
    if (!info || !hit.face) return null;
    const v = hit.face.a;
    let lo = 0, hi = ends.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ends[mid] > v) hi = mid; else lo = mid + 1; }
    const [usage, storeys, height, base] = info[lo];
    return { usage, storeys, height, base };
  }

  get pending() { return this.inFlight; }
}
