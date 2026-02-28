/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// D1-compatible adapter injected by middleware
import type { D1Database } from './lib/d1-adapter';

declare namespace App {
  interface Locals {
    runtime: {
      env: {
        DB: D1Database;
        DB_COST: D1Database;
        DB_RENT: D1Database;
        DB_CRIME: D1Database;
        DB_WAGE: D1Database;
        DB_SCHOOLS: D1Database;
        DB_CHILDCARE: D1Database;
        DB_ENVIRO: D1Database;
      };
    };
  }
}
