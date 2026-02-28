import { defineMiddleware } from 'astro:middleware';
import { existsSync } from 'node:fs';
import { createD1Adapter } from './lib/d1-adapter';

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

function getDb() {
  if (!db) { if (!existsSync(DATABASE_PATH)) return null as any; db = createD1Adapter(DATABASE_PATH); }
  return db;
}
function getDbCost() {
  if (!dbCost) { if (!existsSync(DATABASE_COST_PATH)) return null as any; dbCost = createD1Adapter(DATABASE_COST_PATH); }
  return dbCost;
}
function getDbRent() {
  if (!dbRent) { if (!existsSync(DATABASE_RENT_PATH)) return null as any; dbRent = createD1Adapter(DATABASE_RENT_PATH); }
  return dbRent;
}
function getDbCrime() {
  if (!dbCrime) { if (!existsSync(DATABASE_CRIME_PATH)) return null as any; dbCrime = createD1Adapter(DATABASE_CRIME_PATH); }
  return dbCrime;
}
function getDbWage() {
  if (!dbWage) { if (!existsSync(DATABASE_WAGE_PATH)) return null as any; dbWage = createD1Adapter(DATABASE_WAGE_PATH); }
  return dbWage;
}
function getDbSchools() {
  if (!dbSchools) { if (!existsSync(DATABASE_SCHOOLS_PATH)) return null as any; dbSchools = createD1Adapter(DATABASE_SCHOOLS_PATH); }
  return dbSchools;
}
function getDbChildcare() {
  if (!dbChildcare) { if (!existsSync(DATABASE_CHILDCARE_PATH)) return null as any; dbChildcare = createD1Adapter(DATABASE_CHILDCARE_PATH); }
  return dbChildcare;
}
function getDbEnviro() {
  if (!dbEnviro) { if (!existsSync(DATABASE_ENVIRO_PATH)) return null as any; dbEnviro = createD1Adapter(DATABASE_ENVIRO_PATH); }
  return dbEnviro;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) { rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW }); return false; }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

function cleanupRateLimits() {
  const now = Date.now();
  if (rateLimitMap.size > 1000) { for (const [ip, entry] of rateLimitMap) { if (now > entry.resetAt) rateLimitMap.delete(ip); } }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  (context.locals as any).runtime = { env: {
    DB: getDb(), DB_COST: getDbCost(), DB_RENT: getDbRent(), DB_CRIME: getDbCrime(),
    DB_WAGE: getDbWage(), DB_SCHOOLS: getDbSchools(), DB_CHILDCARE: getDbChildcare(), DB_ENVIRO: getDbEnviro()
  } };

  if (path.startsWith('/api/')) {
    const ip = context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || context.request.headers.get('cf-connecting-ip') || 'unknown';
    cleanupRateLimits();
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60', 'Cache-Control': 'no-store' } });
    }
    return next();
  }

  const response = await next();
  if (response.status === 200 && context.request.method === 'GET') {
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('text/html') || ct.includes('xml')) {
      const ttl = ct.includes('xml') ? 86400 : 3600;
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Cache-Control', `public, max-age=300, s-maxage=${ttl}`);
      return newResponse;
    }
  }
  return response;
});
