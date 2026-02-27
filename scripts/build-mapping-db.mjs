#!/usr/bin/env node
// Build the plaincompare mapping DB from 7 local source databases
// Reads local SQLite files, outputs plaincompare.db

import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const HOME = process.env.HOME;

const SOURCE_DBS = {
  cost: resolve('/storage/plaincost/plaincost.db'),
  rent: resolve(HOME, 'Projects/portal-plainrent/data/plainrent.db'),
  crime: resolve(HOME, 'Projects/portal-plaincrime/data/plaincrime.db'),
  wage: resolve(HOME, 'Projects/portal-wagedex/data/wagedex.db'),
  schools: resolve(HOME, 'Projects/portal-plainschools/data/plainschools.db'),
  childcare: resolve('/storage/plainchildcare/plainchildcare.db'),
  enviro: resolve(HOME, 'Projects/portal-plainenviro/data/plainenviro.db'),
};

// Verify all exist
for (const [name, path] of Object.entries(SOURCE_DBS)) {
  if (!existsSync(path)) {
    console.error(`Missing: ${name} at ${path}`);
    process.exit(1);
  }
}

const OUT = resolve(import.meta.dirname, '..', 'data', 'plaincompare.db');
if (existsSync(OUT)) unlinkSync(OUT);

const db = new Database(OUT);
db.pragma('journal_mode = WAL');

// Create schema
db.exec(`
  CREATE TABLE metros (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cbsa TEXT NOT NULL,
    state_abbr TEXT,
    population INTEGER,
    wagedex_area TEXT
  );
  CREATE TABLE states (
    slug TEXT PRIMARY KEY,
    abbr TEXT NOT NULL,
    name TEXT NOT NULL,
    fips TEXT
  );
  CREATE TABLE counties (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    state_abbr TEXT NOT NULL,
    state_name TEXT NOT NULL,
    fips TEXT NOT NULL,
    population INTEGER
  );
  CREATE TABLE popular_comparisons (
    slug_a TEXT NOT NULL,
    slug_b TEXT NOT NULL,
    level TEXT NOT NULL,
    PRIMARY KEY (slug_a, slug_b)
  );
  CREATE INDEX idx_metros_cbsa ON metros(cbsa);
  CREATE INDEX idx_metros_state ON metros(state_abbr);
  CREATE INDEX idx_counties_fips ON counties(fips);
  CREATE INDEX idx_counties_state ON counties(state_abbr);
`);

// ---- METROS (from PlainCost as canonical source) ----
const costDb = new Database(SOURCE_DBS.cost, { readonly: true });
const costMetros = costDb.prepare('SELECT cbsa, name, slug, state_abbr FROM msas ORDER BY name COLLATE NOCASE').all();
console.log(`PlainCost metros: ${costMetros.length}`);

// Build WageDex metro area lookup
const wageDb = new Database(SOURCE_DBS.wage, { readonly: true });
const wageAreas = new Map(
  wageDb.prepare("SELECT area_code, area_title FROM areas WHERE area_type='metro'").all()
    .map(r => [r.area_code, r.area_title])
);
console.log(`WageDex metro areas: ${wageAreas.size}`);

const insertMetro = db.prepare(
  'INSERT INTO metros (slug, name, cbsa, state_abbr, population, wagedex_area) VALUES (?, ?, ?, ?, ?, ?)'
);

const insertMetros = db.transaction(() => {
  for (const m of costMetros) {
    const wagedexArea = '00' + m.cbsa;
    const hasWage = wageAreas.has(wagedexArea) ? wagedexArea : null;
    insertMetro.run(m.slug, m.name, m.cbsa, m.state_abbr, null, hasWage);
  }
});
insertMetros();
console.log(`Inserted ${costMetros.length} metros`);

// ---- STATES ----
const costStates = costDb.prepare('SELECT abbr, name, slug FROM states ORDER BY name COLLATE NOCASE').all();

const crimeDb = new Database(SOURCE_DBS.crime, { readonly: true });
const crimeFips = new Map(
  crimeDb.prepare('SELECT state_abbr, state_fips FROM states').all()
    .map(r => [r.state_abbr, r.state_fips])
);

const insertState = db.prepare(
  'INSERT INTO states (slug, abbr, name, fips) VALUES (?, ?, ?, ?)'
);

const insertStates = db.transaction(() => {
  for (const s of costStates) {
    const fips = crimeFips.get(s.abbr) || null;
    insertState.run(s.slug, s.abbr, s.name, fips);
  }
});
insertStates();
console.log(`Inserted ${costStates.length} states`);

// ---- COUNTIES (from PlainChildcare as canonical source — has slugs, names, state codes) ----
const childcareDb = new Database(SOURCE_DBS.childcare, { readonly: true });

// Build state abbr → state name map
const stateNameMap = new Map(costStates.map(s => [s.abbr, s.name]));

const childcareCounties = childcareDb.prepare(
  'SELECT fips, name, state as state_abbr, slug, population FROM counties ORDER BY name COLLATE NOCASE'
).all();
console.log(`PlainChildcare counties: ${childcareCounties.length}`);

const insertCounty = db.prepare(
  'INSERT INTO counties (slug, name, state_abbr, state_name, fips, population) VALUES (?, ?, ?, ?, ?, ?)'
);

const insertCounties = db.transaction(() => {
  for (const c of childcareCounties) {
    const stateName = stateNameMap.get(c.state_abbr) || c.state_abbr;
    insertCounty.run(c.slug, c.name, c.state_abbr, stateName, c.fips, c.population || null);
  }
});
insertCounties();
console.log(`Inserted ${childcareCounties.length} counties`);

// ---- POPULAR COMPARISONS ----
const topMetros = [
  'new-york-newark-jersey-city-ny-nj',
  'los-angeles-long-beach-anaheim-ca',
  'chicago-naperville-elgin-il-in',
  'dallas-fort-worth-arlington-tx',
  'houston-pasadena-the-woodlands-tx',
  'washington-arlington-alexandria-dc-va-md-wv',
  'miami-fort-lauderdale-west-palm-beach-fl',
  'philadelphia-camden-wilmington-pa-nj-de-md',
  'atlanta-sandy-springs-roswell-ga',
  'phoenix-mesa-chandler-az',
  'boston-cambridge-newton-ma-nh',
  'san-francisco-oakland-fremont-ca',
  'riverside-san-bernardino-ontario-ca',
  'detroit-warren-dearborn-mi',
  'seattle-tacoma-bellevue-wa',
  'minneapolis-st-paul-bloomington-mn-wi',
  'san-diego-chula-vista-carlsbad-ca',
  'tampa-st-petersburg-clearwater-fl',
  'denver-aurora-centennial-co',
  'st-louis-mo-il',
  'baltimore-columbia-towson-md',
  'orlando-kissimmee-sanford-fl',
  'charlotte-concord-gastonia-nc-sc',
  'san-antonio-new-braunfels-tx',
  'portland-vancouver-hillsboro-or-wa',
  'sacramento-roseville-folsom-ca',
  'pittsburgh-pa',
  'austin-round-rock-san-marcos-tx',
  'las-vegas-henderson-north-las-vegas-nv',
  'nashville-davidson-murfreesboro-franklin-tn',
  'raleigh-cary-nc',
  'salt-lake-city-murray-ut',
  'indianapolis-carmel-greenwood-in',
  'columbus-oh',
  'kansas-city-mo-ks',
];

const allSlugs = new Set(costMetros.map(m => m.slug));
const validTopMetros = topMetros.filter(s => allSlugs.has(s));
console.log(`Valid top metros for comparisons: ${validTopMetros.length} / ${topMetros.length}`);

const insertComparison = db.prepare(
  'INSERT OR IGNORE INTO popular_comparisons (slug_a, slug_b, level) VALUES (?, ?, ?)'
);

const insertComparisons = db.transaction(() => {
  let count = 0;
  for (let i = 0; i < validTopMetros.length; i++) {
    for (let j = i + 1; j < validTopMetros.length; j++) {
      const [a, b] = [validTopMetros[i], validTopMetros[j]].sort();
      insertComparison.run(a, b, 'metro');
      count++;
    }
  }

  const topStates = [
    'california', 'texas', 'florida', 'new-york', 'pennsylvania',
    'illinois', 'ohio', 'georgia', 'north-carolina', 'michigan',
    'new-jersey', 'virginia', 'washington', 'arizona', 'massachusetts',
    'tennessee', 'indiana', 'maryland', 'missouri', 'wisconsin',
    'colorado', 'minnesota', 'south-carolina', 'alabama', 'louisiana',
    'kentucky', 'oregon', 'connecticut', 'utah', 'nevada',
  ];
  const stateSet = new Set(costStates.map(s => s.slug));
  const validStates = topStates.filter(s => stateSet.has(s));
  for (let i = 0; i < validStates.length; i++) {
    for (let j = i + 1; j < validStates.length; j++) {
      const [a, b] = [validStates[i], validStates[j]].sort();
      insertComparison.run(a, b, 'state');
      count++;
    }
  }
  // County comparisons — top 30 by population
  const topCounties = childcareDb.prepare(
    'SELECT slug FROM counties WHERE population IS NOT NULL ORDER BY population DESC LIMIT 30'
  ).all().map(r => r.slug);

  for (let i = 0; i < topCounties.length; i++) {
    for (let j = i + 1; j < topCounties.length; j++) {
      const [a, b] = [topCounties[i], topCounties[j]].sort();
      insertComparison.run(a, b, 'county');
      count++;
    }
  }

  return count;
});
const compCount = insertComparisons();
console.log(`Inserted ${compCount} popular comparisons`);

// Cleanup
costDb.close();
wageDb.close();
crimeDb.close();
childcareDb.close();
db.close();

console.log(`\nDone! Output: ${OUT}`);
