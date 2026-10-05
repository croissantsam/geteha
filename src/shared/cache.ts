// High-Performance Two-Tier Local Cache for Tokyo 3D Game
// Level 1: Instant In-Memory RAM Cache (0 ms)
// Level 2: Persistent Browser CacheStorage (Indexed disk, works in Window & Web Workers)

const CACHE_NAME = 'tokyo-drive-cache-v1';

export interface CacheStats {
  hits: number;
  misses: number;
  memoryHits: number;
  diskHits: number;
  total: number;
  hitRatio: number;
}

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  memoryHits: 0,
  diskHits: 0,
  total: 0,
  hitRatio: 0,
};

const subscribers = new Set<(stats: CacheStats) => void>();

function updateStats(type: 'memory' | 'disk' | 'miss') {
  stats.total++;
  if (type === 'memory') {
    stats.hits++;
    stats.memoryHits++;
  } else if (type === 'disk') {
    stats.hits++;
    stats.diskHits++;
  } else {
    stats.misses++;
  }
  stats.hitRatio = stats.total > 0 ? Math.round((stats.hits / stats.total) * 100) : 0;
  for (const sub of subscribers) {
    try { sub({ ...stats }); } catch {}
  }
}

export function subscribeCacheStats(cb: (stats: CacheStats) => void): () => void {
  subscribers.add(cb);
  cb({ ...stats });
  return () => subscribers.delete(cb);
}

export function getCacheStats(): CacheStats {
  return { ...stats };
}

// Memory RAM Cache
const memoryCache = new Map<string, Response>();

// CacheStorage handle
let cacheStoragePromise: Promise<Cache | null> | null = null;

async function getCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  if (!cacheStoragePromise) {
    cacheStoragePromise = caches.open(CACHE_NAME).catch((err) => {
      console.warn('[TokyoCache] CacheStorage not accessible:', err);
      return null;
    });
  }
  return cacheStoragePromise;
}

function normalizeKey(url: string): string {
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost:5280/';
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/**
 * Universal cached fetch:
 * Checks L1 Memory Cache -> Checks L2 Persistent Storage -> Fetches if missing -> Caches result
 */
export async function cachedFetch(url: string, init?: RequestInit): Promise<Response> {
  const key = normalizeKey(url);

  // 1. Check L1 In-Memory Cache (0ms)
  const memHit = memoryCache.get(key);
  if (memHit) {
    updateStats('memory');
    return memHit.clone();
  }

  // 2. Check L2 Persistent CacheStorage
  const storage = await getCache();
  if (storage) {
    try {
      const diskHit = await storage.match(key);
      if (diskHit) {
        updateStats('disk');
        memoryCache.set(key, diskHit.clone());
        return diskHit;
      }
    } catch {}
  }

  // 3. Cache Miss: Execute external request
  updateStats('miss');
  const res = await fetch(url, init);

  if (!res.ok) {
    return res;
  }

  // 4. Save into both L1 and L2 caches
  try {
    const memClone = res.clone();
    const diskClone = res.clone();
    memoryCache.set(key, memClone);

    if (storage) {
      storage.put(key, diskClone).catch(() => {});
    }
  } catch {}

  return res;
}

/**
 * Fetch and decode JSON with local caching
 */
export async function cachedFetchJson<T = any>(url: string): Promise<T> {
  const res = await cachedFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.json();
}

/**
 * Fetch binary data (ArrayBuffer) with local caching
 */
export async function cachedFetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await cachedFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.arrayBuffer();
}

/**
 * Fetch image / blob with local caching
 */
export async function cachedFetchBlob(url: string): Promise<Blob> {
  const res = await cachedFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.blob();
}

/**
 * Purge all local cache
 */
export async function clearLocalCache(): Promise<void> {
  memoryCache.clear();
  stats.hits = 0;
  stats.misses = 0;
  stats.memoryHits = 0;
  stats.diskHits = 0;
  stats.total = 0;
  stats.hitRatio = 0;

  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(CACHE_NAME);
      cacheStoragePromise = null;
    } catch {}
  }
  for (const sub of subscribers) {
    try { sub({ ...stats }); } catch {}
  }
}
