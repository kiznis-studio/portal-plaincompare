// Multi-DB middleware v2 — compressed cache, bot guard, rolling metrics
// Auto-discovers all env vars matching DATABASE_*_PATH or DB_*_PATH,
// initializes a D1 adapter for each, and exposes them all via context.locals.runtime.env.

import { defineMiddleware } from 'astro:middleware';
import { existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isbot } from 'isbot';
import { createD1Adapter, type D1Database } from './lib/d1-adapter';
import { warmQueryCache } from './lib/db';

// --- Multi-DB initialization (auto-discovers DATABASE_*_PATH and DB_*_PATH env vars) ---
const dbInstances: Record<string, ReturnType<typeof createD1Adapter> | null> = {};

function discoverDatabases(): Record<string, string> {
  const paths: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (key === 'DATABASE_PATH') {
      paths['DB'] = value;
    } else if (key.startsWith('DATABASE_') && key.endsWith('_PATH')) {
      // DATABASE_RENT_PATH → DB_RENT
      const name = 'DB_' + key.slice('DATABASE_'.length, -'_PATH'.length);
      paths[name] = value;
    } else if (key.startsWith('DB_') && key.endsWith('_PATH')) {
      // DB_COST_PATH → DB_COST
      const name = key.slice(0, -'_PATH'.length);
      paths[name] = value;
    }
  }
  return paths;
}

const DB_PATHS = discoverDatabases();

function getDb(key: string): ReturnType<typeof createD1Adapter> | null {
  if (key in dbInstances) return dbInstances[key];
  const path = DB_PATHS[key];
  if (!path || !existsSync(path)) {
    dbInstances[key] = null;
    return null;
  }
  dbInstances[key] = createD1Adapter(path);
  return dbInstances[key];
}

function getAllDbs(): Record<string, D1Database> {
  const env: Record<string, D1Database> = {};
  for (const key of Object.keys(DB_PATHS)) {
    const db = getDb(key);
    if (db) env[key] = db;
  }
  return env;
}

console.log(`[middleware] Multi-DB: discovered ${Object.keys(DB_PATHS).length} databases: ${Object.keys(DB_PATHS).join(', ')}`);

// --- Concurrency guard (split human/bot) ---
let inflightHuman = 0;
let inflightBot = 0;
const MAX_HUMAN_CONCURRENT = 15;
const MAX_BOT_CONCURRENT = parseInt(process.env.MAX_BOT_CONCURRENT || '25', 10);

// --- Event loop lag tracking ---
let eventLoopLag = 0;
const lagInterval = setInterval(() => {
  const start = performance.now();
  setImmediate(() => { eventLoopLag = performance.now() - start; });
}, 1000);
lagInterval.unref();

// --- Rolling demand metrics (15s window) ---
interface RequestSample { ts: number; latency: number; }
const samples: RequestSample[] = [];
const WINDOW_MS = 15000;

function recordRequest(latencyMs: number) {
  const now = Date.now();
  samples.push({ ts: now, latency: latencyMs });
  const cutoff = now - WINDOW_MS;
  while (samples.length > 0 && samples[0].ts < cutoff) samples.shift();
}

function getRollingMetrics() {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  while (samples.length > 0 && samples[0].ts < cutoff) samples.shift();
  if (samples.length === 0) return { requestRate: 0, avgLatency: 0 };
  const latencySum = samples.reduce((sum, s) => sum + s.latency, 0);
  return {
    requestRate: Math.round(samples.length / (WINDOW_MS / 1000) * 100) / 100,
    avgLatency: Math.round(latencySum / samples.length),
  };
}

// --- Cache warming ---
let cacheWarmed = false;
let cacheWarmedAt: string | null = null;
let warmingPromise: Promise<void> | null = null;

async function ensureWarmed(): Promise<void> {
  if (cacheWarmed) return;
  if (!warmingPromise) {
    warmingPromise = (async () => {
      const env = getAllDbs();
      if (Object.keys(env).length === 0) { cacheWarmed = true; return; }
      try {
        await warmQueryCache(env);
        cacheWarmedAt = new Date().toISOString();
      } catch (err) {
        console.error('[cache] Warming failed:', err);
      }
      cacheWarmed = true;
    })();
  }
  await warmingPromise;
}

ensureWarmed();

// --- Compressed LRU response cache ---
interface CacheEntry {
  compressed: Buffer;
  headers: Record<string, string>;
  hits: number;
  size: number;
}
const responseCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = parseInt(process.env.CACHE_ENTRIES || '5000', 10);
let totalHits = 0;
let totalMisses = 0;

function getCachedResponse(key: string): Response | null {
  const entry = responseCache.get(key);
  if (!entry) { totalMisses++; return null; }
  responseCache.delete(key);
  entry.hits++;
  responseCache.set(key, entry);
  totalHits++;
  try {
    const html = gunzipSync(entry.compressed);
    const prefix = html.subarray(0, 15).toString();
    if (!prefix.includes('<!') && !prefix.includes('<html')) {
      console.error(`[cache] Corrupt entry for ${key} — purging`);
      responseCache.delete(key);
      return null;
    }
    return new Response(html, {
      headers: { ...entry.headers, 'X-Cache': 'HIT' },
    });
  } catch (e) {
    console.error(`[cache] Decompress failed for ${key}: ${(e as Error).message}`);
    responseCache.delete(key);
    return null;
  }
}

function cacheResponse(key: string, body: string, headers: Record<string, string>) {
  if (!body || body.length < 50 || (!body.startsWith('<!') && !body.startsWith('<html'))) return;
  if (responseCache.has(key)) responseCache.delete(key);
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  try {
    const compressed = gzipSync(body, { level: 6 });
    const { 'Content-Length': _, ...safeHeaders } = headers;
    responseCache.set(key, { compressed, headers: safeHeaders, hits: 0, size: body.length });
  } catch { /* skip caching */ }
}

function getCacheStats() {
  const entries: Array<{ url: string; hits: number }> = [];
  for (const [key, entry] of responseCache) entries.push({ url: key, hits: entry.hits });
  entries.sort((a, b) => b.hits - a.hits);
  return {
    size: responseCache.size,
    maxSize: MAX_CACHE_ENTRIES,
    totalHits,
    totalMisses,
    hitRate: (totalHits + totalMisses) > 0 ? Math.round((totalHits / (totalHits + totalMisses)) * 1000) / 1000 : 0,
    top10: entries.slice(0, 10),
  };
}

export { inflightHuman, inflightBot, eventLoopLag, responseCache, cacheWarmed, cacheWarmedAt, getCacheStats, getRollingMetrics };

function getEdgeTtl(path: string): number {
  if (path.match(/^\/(provider|employer|school|facility|drug|breed|county|city|metro|state|airport|lender|system|occupation|company|chapter|product|zip|compare)\//)) return 86400;
  if (path.match(/^\/(rankings|guides|states|metros|counties|cities)\//)) return 21600;
  return 3600;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  // Expose ALL databases to page components
  (context.locals as any).runtime = { env: getAllDbs() };

  if (path === '/health') {
    if (!cacheWarmed) {
      ensureWarmed();
      return new Response(JSON.stringify({ status: 'warming' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    return next();
  }

  if (path.startsWith('/_astro/') || path.startsWith('/favicon') || path.startsWith('/_cluster')) return next();
  if (!cacheWarmed) await ensureWarmed();

  if (context.request.method === 'GET') {
    const cacheKey = path + context.url.search;
    const cached = getCachedResponse(cacheKey);
    if (cached) return cached;

    const ua = context.request.headers.get('user-agent') || '';
    const isBotUA = isbot(ua);

    if (isBotUA) {
      if (inflightBot >= MAX_BOT_CONCURRENT) {
        return new Response('Service busy', { status: 503, headers: { 'Retry-After': '10', 'Cache-Control': 'no-store' } });
      }
      inflightBot++;
    } else {
      if (inflightHuman >= MAX_HUMAN_CONCURRENT) {
        return new Response('Service busy', { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } });
      }
      inflightHuman++;
    }

    const start = performance.now();
    try {
      const response = await next();
      const elapsed = performance.now() - start;
      recordRequest(elapsed);
      if (elapsed > 500) {
        console.warn(`[slow] ${path} ${Math.round(elapsed)}ms lag=${Math.round(eventLoopLag)}ms`);
      }

      if (response.status === 200) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('text/html') || ct.includes('xml')) {
          const ttl = ct.includes('xml') ? 86400 : getEdgeTtl(path);
          const body = await response.text();
          const headers: Record<string, string> = {
            'Content-Type': ct,
            'Cache-Control': `public, max-age=300, s-maxage=${ttl}`,
          };
          cacheResponse(cacheKey, body, headers);
          return new Response(body, { headers: { ...headers, 'X-Cache': 'MISS' } });
        }
      }
      return response;
    } finally {
      if (isBotUA) inflightBot--;
      else inflightHuman--;
    }
  }

  return next();
});
