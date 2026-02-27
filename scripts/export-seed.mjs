#!/usr/bin/env node
// Export plaincompare.db to SQL seed files for D1

import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const DB_PATH = resolve(import.meta.dirname, '..', 'data', 'plaincompare.db');
const SEED_DIR = resolve(import.meta.dirname, '..', 'data', 'seed');
mkdirSync(SEED_DIR, { recursive: true });

const db = new Database(DB_PATH, { readonly: true });

function exportTable(table, fileName) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (!rows.length) return;

  const cols = Object.keys(rows[0]);
  const lines = [`-- ${table}: ${rows.length} rows`];
  lines.push(`DELETE FROM ${table};`);

  // Batch 500 rows per INSERT
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const values = batch.map(r =>
      '(' + cols.map(c => {
        const v = r[c];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return v;
        return "'" + String(v).replace(/'/g, "''") + "'";
      }).join(',') + ')'
    );
    lines.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES\n${values.join(',\n')};`);
  }

  writeFileSync(resolve(SEED_DIR, fileName), lines.join('\n') + '\n');
  console.log(`${table}: ${rows.length} rows → ${fileName}`);
}

// Schema file
const schema = `
CREATE TABLE IF NOT EXISTS metros (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cbsa TEXT NOT NULL,
  state_abbr TEXT,
  population INTEGER,
  wagedex_area TEXT
);
CREATE TABLE IF NOT EXISTS states (
  slug TEXT PRIMARY KEY,
  abbr TEXT NOT NULL,
  name TEXT NOT NULL,
  fips TEXT
);
CREATE TABLE IF NOT EXISTS counties (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state_abbr TEXT NOT NULL,
  state_name TEXT NOT NULL,
  fips TEXT NOT NULL,
  population INTEGER
);
CREATE TABLE IF NOT EXISTS popular_comparisons (
  slug_a TEXT NOT NULL,
  slug_b TEXT NOT NULL,
  level TEXT NOT NULL,
  PRIMARY KEY (slug_a, slug_b)
);
CREATE INDEX IF NOT EXISTS idx_metros_cbsa ON metros(cbsa);
CREATE INDEX IF NOT EXISTS idx_metros_state ON metros(state_abbr);
CREATE INDEX IF NOT EXISTS idx_counties_fips ON counties(fips);
CREATE INDEX IF NOT EXISTS idx_counties_state ON counties(state_abbr);
`.trim();

writeFileSync(resolve(SEED_DIR, '00-schema.sql'), schema + '\n');
console.log('Schema → 00-schema.sql');

exportTable('metros', '01-metros.sql');
exportTable('states', '02-states.sql');
exportTable('counties', '03-counties.sql');
exportTable('popular_comparisons', '04-comparisons.sql');

db.close();
console.log('\nDone!');
