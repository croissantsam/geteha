// TanStack Start Server Functions for Tokyo Driving Game
import { createServerFn } from '@tanstack/react-start';

const REMOTE_ROOT = 'https://jeantimex.github.io/tokyo';

// Server-side in-memory cache to minimize external network requests
const serverCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

function getCached<T>(key: string): T | null {
  const item = serverCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL) {
    serverCache.delete(key);
    return null;
  }
  return item.data as T;
}

function setCache(key: string, data: any) {
  serverCache.set(key, { data, timestamp: Date.now() });
}

// 1. Fetch area manifest with server-side caching
export const getCityManifest = createServerFn({ method: 'GET' })
  .validator((area: string) => area || 'tokyo')
  .handler(async ({ data: area }) => {
    const cacheKey = `manifest:${area}`;
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return { source: 'server-cache', manifest: cached };
    }

    try {
      const res = await fetch(`${REMOTE_ROOT}/tiles/${area}/manifest.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = await res.json();
      setCache(cacheKey, manifest);
      return { source: 'remote-api', manifest };
    } catch (err: any) {
      throw new Error(`Failed to load manifest for ${area}: ${err.message}`);
    }
  });

// 2. Fetch areas list with server-side caching
export const getCityAreas = createServerFn({ method: 'GET' })
  .handler(async () => {
    const cacheKey = 'areas:list';
    const cached = getCached<any[]>(cacheKey);
    if (cached) {
      return { source: 'server-cache', areas: cached };
    }

    try {
      const res = await fetch(`${REMOTE_ROOT}/tiles/areas.json`);
      if (res.ok) {
        const areas = await res.json();
        setCache(cacheKey, areas);
        return { source: 'remote-api', areas };
      }
    } catch {}

    // Fallback default areas
    const fallback = [
      { id: 'tokyo', name: 'Tokyo Tower & Roppongi' },
      { id: 'shibuya', name: 'Shibuya Crossing' },
      { id: 'shinjuku', name: 'Shinjuku Skyscraper' },
      { id: 'ginza', name: 'Ginza Avenue' },
      { id: 'akihabara', name: 'Akihabara Electric Town' },
    ];
    setCache(cacheKey, fallback);
    return { source: 'fallback', areas: fallback };
  });

// 3. Generic server proxy for external city assets with caching
export const fetchCityAsset = createServerFn({ method: 'GET' })
  .validator((path: string) => path)
  .handler(async ({ data: path }) => {
    const cacheKey = `asset:${path}`;
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return { source: 'server-cache', data: cached };
    }

    const url = path.startsWith('http') ? path : `${REMOTE_ROOT}/${path.replace(/^\//, '')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      const data = await res.json();
      setCache(cacheKey, data);
      return { source: 'remote-api', data };
    }
    
    const text = await res.text();
    setCache(cacheKey, text);
    return { source: 'remote-api', data: text };
  });
