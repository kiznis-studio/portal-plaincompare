import { defineMiddleware } from 'astro:middleware';
import { existsSync } from 'node:fs';
import { isbot } from 'isbot';
import { createD1Adapter } from './lib/d1-adapter';
import { warmQueryCache } from './lib/db';

// --- DB initialization (8 databases) ---
const DATABASE_PATH = process.env.DATABASE_PATH || '/data/portal.db';
const DATABASE_COST_PATH = process.env.DATABASE_COST_PATH || '/data/cost.db';
const DATABASE_RENT_PATH = process.env.DATABASE_RENT_PATH || '/data/rent.db';
const DATABASE_CRIME_PATH = process.env.DATABASE_CRIME_PATH || '/data/crime.db';
const DATABASE_WAGE_PATH = process.env.DATABASE_WAGE_PATH || '/data/wage.db';
const DATABASE_SCHOOLS_PATH = process.env.DATABASE_SCHOOLS_PATH || '/data/schools.db';
const DATABASE_CHILDCARE_PATH = process.env.DATABASE_CHILDCARE_PATH || '/data/childcare.db';
const DATABASE_ENVIRO_PATH = process.env.DATABASE_ENVIRO_PATH || '/data/enviro.db';

let db: ReturnType<typeof createD1Adapter> | null = null;
let dbCost: ReturnType<typeof createD1Adapter> | null = null;
let dbRent: ReturnType<typeof createD1Adapter> | null = null;
let dbCrime: ReturnType<typeof createD1Adapter> | null = null;
let dbWage: ReturnType<typeof createD1Adapter> | null = null;
let dbSchools: ReturnType<typeof createD1Adapter> | null = null;
let dbChildcare: ReturnType<typeof createD1Adapter> | null = null;
let dbEnviro: ReturnType<typeof createD1Adapter> | null = null;

function getDb() { if (!db) { if (!existsSync(DATABASE_PATH)) return null as any; db = createD1Adapter(DATABASE_PATH); } return db; }
function getDbCost() { if (!dbCost) { if (!existsSync(DATABASE_COST_PATH)) return null as any; dbCost = createD1Adapter(DATABASE_COST_PATH); } return dbCost; }
function getDbRent() { if (!dbRent) { if (!existsSync(DATABASE_RENT_PATH)) return null as any; dbRent = createD1Adapter(DATABASE_RENT_PATH); } return dbRent; }
function getDbCrime() { if (!dbCrime) { if (!existsSync(DATABASE_CRIME_PATH)) return null as any; dbCrime = createD1Adapter(DATABASE_CRIME_PATH); } return dbCrime; }
function getDbWage() { if (!dbWage) { if (!existsSync(DATABASE_WAGE_PATH)) return null as any; dbWage = createD1Adapter(DATABASE_WAGE_PATH); } return dbWage; }
function getDbSchools() { if (!dbSchools) { if (!existsSync(DATABASE_SCHOOLS_PATH)) return null as any; dbSchools = createD1Adapter(DATABASE_SCHOOLS_PATH); } return dbSchools; }
function getDbChildcare() { if (!dbChildcare) { if (!existsSync(DATABASE_CHILDCARE_PATH)) return null as any; dbChildcare = createD1Adapter(DATABASE_CHILDCARE_PATH); } return dbChildcare; }
function getDbEnviro() { if (!dbEnviro) { if (!existsSync(DATABASE_ENVIRO_PATH)) return null as any; dbEnviro = createD1Adapter(DATABASE_ENVIRO_PATH); } return dbEnviro; }

function getAllEnv() {
  return {
    DB: getDb(), DB_COST: getDbCost(), DB_RENT: getDbRent(), DB_CRIME: getDbCrime(),
    DB_WAGE: getDbWage(), DB_SCHOOLS: getDbSchools(), DB_CHILDCARE: getDbChildcare(), DB_ENVIRO: getDbEnviro(),
  };
}

// --- Concurrency guard ---
let inflightRequests = 0;
const MAX_CONCURRENT = 15;

// --- Event loop lag tracking ---
let eventLoopLag = 0;
const lagInterval = setInterval(() => {
  const start = performance.now();
  setImmediate(() => { eventLoopLag = performance.now() - start; });
}, 1000);
lagInterval.unref();

// --- Cache warming ---
let cacheWarmed = false;
let cacheWarmedAt: string | null = null;
let warmingPromise: Promise<void> | null = null;

async function ensureWarmed(): Promise<void> {
  if (cacheWarmed) return;
  if (!warmingPromise) {
    warmingPromise = (async () => {
      const env = getAllEnv();
      if (!env.DB) { cacheWarmed = true; return; }
      try {
        await warmQueryCache(env as any);
        cacheWarmedAt = new Date().toISOString();
      } catch (err) {
        console.error('[cache] Warming failed:', err);
      }
      cacheWarmed = true;
    })();
  }
  await warmingPromise;
}

// --- LRU response cache ---
interface CacheEntry {
  body: string;
  headers: Record<string, string>;
  hits: number;
}
const responseCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = parseInt(process.env.CACHE_ENTRIES || '1500', 10);
let totalHits = 0;
let totalMisses = 0;

function getCachedResponse(key: string): Response | null {
  const entry = responseCache.get(key);
  if (!entry) { totalMisses++; return null; }
  responseCache.delete(key);
  entry.hits++;
  responseCache.set(key, entry);
  totalHits++;
  return new Response(entry.body, {
    headers: { ...entry.headers, 'X-Cache': 'HIT' },
  });
}

function cacheResponse(key: string, body: string, headers: Record<string, string>) {
  if (responseCache.has(key)) responseCache.delete(key);
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, { body, headers, hits: 0 });
}

function getCacheStats() {
  const entries: Array<{ url: string; hits: number }> = [];
  for (const [key, entry] of responseCache) {
    entries.push({ url: key, hits: entry.hits });
  }
  entries.sort((a, b) => b.hits - a.hits);
  return {
    size: responseCache.size,
    maxSize: MAX_CACHE_ENTRIES,
    totalHits,
    totalMisses,
    hitRate: (totalHits + totalMisses) > 0
      ? Math.round((totalHits / (totalHits + totalMisses)) * 1000) / 1000
      : 0,
    top10: entries.slice(0, 10),
  };
}

export { inflightRequests, eventLoopLag, responseCache, cacheWarmed, cacheWarmedAt, getCacheStats };

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  (context.locals as any).runtime = { env: getAllEnv() };

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

  if (path.startsWith('/_astro/') || path.startsWith('/favicon')) return next();

  if (!cacheWarmed) {
    await ensureWarmed();
  }

  if (context.request.method === 'GET') {
    const cacheKey = path + context.url.search;
    const cached = getCachedResponse(cacheKey);
    if (cached) return cached;

    const ua = context.request.headers.get('user-agent') || '';
    const isBotUA = isbot(ua);
    if (!isBotUA && inflightRequests >= MAX_CONCURRENT) {
      return new Response('Service busy', {
        status: 503,
        headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' },
      });
    }

    if (!isBotUA) inflightRequests++;
    const start = performance.now();
    try {
      const response = await next();
      const elapsed = performance.now() - start;
      if (elapsed > 500) {
        console.warn(`[slow] ${path} ${Math.round(elapsed)}ms lag=${Math.round(eventLoopLag)}ms`);
      }

      if (response.status === 200) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('text/html') || ct.includes('xml')) {
          const ttl = ct.includes('xml') ? 86400 : 3600;
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
      if (!isBotUA) inflightRequests--;
    }
  }

  return next();
});
