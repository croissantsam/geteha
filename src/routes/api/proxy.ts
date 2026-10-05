// TanStack Server Route Proxy with Server Caching & Compression
import { createFileRoute } from '@tanstack/react-router';

const serverProxyCache = new Map<string, { buffer: ArrayBuffer; contentType: string; timestamp: number }>();
const PROXY_TTL = 1000 * 60 * 60 * 24; // 24 hours

export const Route = createFileRoute('/api/proxy')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const target = reqUrl.searchParams.get('url');

        if (!target) {
          return new Response(JSON.stringify({ error: 'Missing target url parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // 1. Check Server-Side Memory Cache
        const cached = serverProxyCache.get(target);
        if (cached && Date.now() - cached.timestamp < PROXY_TTL) {
          return new Response(cached.buffer, {
            status: 200,
            headers: {
              'Content-Type': cached.contentType,
              'Cache-Control': 'public, max-age=86400, immutable',
              'X-Tokyo-Cache': 'SERVER-HIT',
            },
          });
        }

        // 2. Fetch external target
        try {
          const res = await fetch(target);
          if (!res.ok) {
            return new Response(`Remote error: HTTP ${res.status}`, { status: res.status });
          }

          const contentType = res.headers.get('content-type') || 'application/octet-stream';
          const buffer = await res.arrayBuffer();

          // Store in server-side cache
          serverProxyCache.set(target, {
            buffer,
            contentType,
            timestamp: Date.now(),
          });

          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400, immutable',
              'X-Tokyo-Cache': 'SERVER-MISS',
            },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
