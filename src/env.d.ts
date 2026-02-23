/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
  DB: D1Database;
  DB_COST: D1Database;
  DB_RENT: D1Database;
  DB_CRIME: D1Database;
  DB_WAGE: D1Database;
  DB_SCHOOLS: D1Database;
  DB_CHILDCARE: D1Database;
  DB_ENVIRO: D1Database;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
