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
  CREATE TABLE life_scores (
    slug TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    cost_score REAL,
    wages_score REAL,
    rent_score REAL,
    crime_score REAL,
    schools_score REAL,
    childcare_score REAL,
    enviro_score REAL,
    composite_score REAL NOT NULL,
    grade TEXT NOT NULL
  );
  CREATE INDEX idx_metros_cbsa ON metros(cbsa);
  CREATE INDEX idx_metros_state ON metros(state_abbr);
  CREATE INDEX idx_counties_fips ON counties(fips);
  CREATE INDEX idx_counties_state ON counties(state_abbr);
  CREATE INDEX idx_life_scores_type ON life_scores(type);
  CREATE INDEX idx_life_scores_composite ON life_scores(composite_score DESC);
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

// ---- LIFE SCORES (percentile-based composite scores for metros and states) ----
console.log('\n--- Computing Life Scores ---');

const schoolsDb = new Database(SOURCE_DBS.schools, { readonly: true });
const enviroDb = new Database(SOURCE_DBS.enviro, { readonly: true });
const rentDb = new Database(SOURCE_DBS.rent, { readonly: true });

// Weights: cost 20%, wages 20%, rent 15%, crime 15%, schools 10%, childcare 10%, enviro 10%
const WEIGHTS = { cost: 0.20, wages: 0.20, rent: 0.15, crime: 0.15, schools: 0.10, childcare: 0.10, enviro: 0.10 };
// Lower is better for these (invert percentile)
const LOWER_IS_BETTER = new Set(['cost', 'rent', 'crime', 'childcare']);

function computeGrade(composite) {
  if (composite >= 95) return 'A+';
  if (composite >= 90) return 'A';
  if (composite >= 85) return 'A-';
  if (composite >= 80) return 'B+';
  if (composite >= 75) return 'B';
  if (composite >= 70) return 'B-';
  if (composite >= 65) return 'C+';
  if (composite >= 60) return 'C';
  if (composite >= 55) return 'C-';
  if (composite >= 45) return 'D';
  return 'F';
}

function percentileRank(values) {
  // Return map of index → percentile (0-100)
  const sorted = values.map((v, i) => ({ v, i })).filter(x => x.v !== null).sort((a, b) => a.v - b.v);
  const ranks = new Map();
  for (let k = 0; k < sorted.length; k++) {
    ranks.set(sorted[k].i, (k / (sorted.length - 1)) * 100);
  }
  return ranks;
}

// ---- Gather raw data for metros ----
// Cost: rpp_all (higher = more expensive → lower is better)
const metroCostMap = new Map(
  costDb.prepare('SELECT cbsa, rpp_all FROM msas WHERE rpp_all IS NOT NULL').all()
    .map(r => [r.cbsa, r.rpp_all])
);

// Wages: avg median salary (higher = better)
const metroWageMap = new Map(
  wageDb.prepare(`
    SELECT area_code, CAST(AVG(a_median) AS INTEGER) as avg_median
    FROM metro_wages WHERE a_median IS NOT NULL AND a_median > 0
    GROUP BY area_code
  `).all().map(r => [r.area_code, r.avg_median])
);

// Rent: br2 (2-bedroom FMR, lower is better)
const metroRentMap = new Map(
  rentDb.prepare(`
    SELECT cbsa_code, br2 FROM fmr_metro
    WHERE year = (SELECT MAX(year) FROM fmr_metro) AND br2 IS NOT NULL
  `).all().map(r => [r.cbsa_code, r.br2])
);

// Crime: violent crime rate per 100K (state level, lower is better)
const stateCrimeMap = new Map(
  crimeDb.prepare(`
    SELECT s.state_abbr, ROUND(sc.violent_crime * 100000.0 / sc.population, 1) as rate
    FROM state_crime sc JOIN states s ON sc.state_fips = s.state_fips
    WHERE sc.year = (SELECT MAX(year) FROM state_crime) AND sc.population > 0
  `).all().map(r => [r.state_abbr, r.rate])
);

// Schools: student-teacher ratio (state level, lower is better — but we invert meaning:
// use enrollment_per_school as proxy for quality; actually use avg student_teacher_ratio lower=better)
const stateSchoolsMap = new Map(
  schoolsDb.prepare(`
    SELECT s.state_abbr, ROUND(AVG(sc.student_teacher_ratio), 1) as avg_str
    FROM schools sc JOIN states s ON sc.state_fips = s.state_fips
    WHERE sc.student_teacher_ratio IS NOT NULL AND sc.student_teacher_ratio > 0
    GROUP BY s.state_abbr
  `).all().map(r => [r.state_abbr, r.avg_str])
);

// Childcare: center infant cost (state avg, lower is better)
const stateChildcareMap = new Map(
  childcareDb.prepare(`
    SELECT state as state_abbr, CAST(AVG(center_infant) AS INTEGER) as avg_cost
    FROM counties WHERE center_infant IS NOT NULL AND center_infant > 0
    GROUP BY state
  `).all().map(r => [r.state_abbr, r.avg_cost])
);

// Environment: violations per facility (state level, lower is better)
const stateEnviroMap = new Map(
  enviroDb.prepare(`
    SELECT state_abbr, ROUND(CAST(num_violations AS REAL) / NULLIF(num_facilities, 0), 3) as viol_rate
    FROM states WHERE num_facilities > 0
  `).all().map(r => [r.state_abbr, r.viol_rate])
);

// Build metro score entries
const metroEntries = [];
const allMetroSlugs = db.prepare('SELECT slug, name, cbsa, state_abbr, wagedex_area FROM metros').all();

for (const m of allMetroSlugs) {
  const entry = {
    slug: m.slug, type: 'metro', name: m.name,
    cost_raw: metroCostMap.get(m.cbsa) ?? null,
    wages_raw: m.wagedex_area ? (metroWageMap.get(m.wagedex_area) ?? null) : null,
    rent_raw: metroRentMap.get(m.cbsa) ?? null,
    crime_raw: m.state_abbr ? (stateCrimeMap.get(m.state_abbr) ?? null) : null,
    schools_raw: m.state_abbr ? (stateSchoolsMap.get(m.state_abbr) ?? null) : null,
    childcare_raw: m.state_abbr ? (stateChildcareMap.get(m.state_abbr) ?? null) : null,
    enviro_raw: m.state_abbr ? (stateEnviroMap.get(m.state_abbr) ?? null) : null,
  };
  metroEntries.push(entry);
}

// Compute percentiles for each dimension across metros
const dims = ['cost', 'wages', 'rent', 'crime', 'schools', 'childcare', 'enviro'];
const metroPercentiles = {};
for (const dim of dims) {
  const vals = metroEntries.map(e => e[dim + '_raw']);
  metroPercentiles[dim] = percentileRank(vals);
}

// Assign scores and compute composite
const insertScore = db.prepare(
  'INSERT INTO life_scores (slug, type, name, cost_score, wages_score, rent_score, crime_score, schools_score, childcare_score, enviro_score, composite_score, grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

const insertScores = db.transaction(() => {
  let count = 0;
  for (let i = 0; i < metroEntries.length; i++) {
    const e = metroEntries[i];
    const scores = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const dim of dims) {
      const pctRank = metroPercentiles[dim].get(i);
      if (pctRank !== undefined) {
        // Invert for "lower is better" dimensions
        scores[dim] = LOWER_IS_BETTER.has(dim) ? (100 - pctRank) : pctRank;
        weightedSum += scores[dim] * WEIGHTS[dim];
        totalWeight += WEIGHTS[dim];
      } else {
        scores[dim] = null;
      }
    }

    // Re-normalize if some dimensions are missing
    const composite = totalWeight > 0 ? weightedSum / totalWeight : 50;
    const grade = computeGrade(composite);

    insertScore.run(
      e.slug, 'metro', e.name,
      scores.cost, scores.wages, scores.rent, scores.crime,
      scores.schools, scores.childcare, scores.enviro,
      Math.round(composite * 10) / 10, grade
    );
    count++;
  }

  // ---- STATE SCORES ----
  // Gather per-state data
  const stateRows = db.prepare('SELECT slug, abbr, name FROM states').all();

  // State cost: RPP from PlainCost states table
  const stateCostMap = new Map(
    costDb.prepare('SELECT abbr, rpp_all FROM states WHERE rpp_all IS NOT NULL').all()
      .map(r => [r.abbr, r.rpp_all])
  );

  // State wages: from WageDex state_wages (slug = full state name like "california")
  const stateWageMap = new Map(
    wageDb.prepare(`
      SELECT a.slug, CAST(AVG(sw.a_median) AS INTEGER) as avg_median
      FROM state_wages sw
      JOIN areas a ON sw.area_code = a.area_code
      WHERE a.area_type='state' AND sw.a_median IS NOT NULL AND sw.a_median > 0
      GROUP BY a.area_code
    `).all().map(r => [r.slug, r.avg_median])
  );

  // State rent: avg county br2
  const stateRentMap = new Map(
    rentDb.prepare(`
      SELECT s.state_abbr, CAST(AVG(fc.br2) AS INTEGER) as avg_rent
      FROM fmr_county fc
      JOIN counties c ON fc.fips = c.fips
      JOIN states s ON c.state_code = s.state_code
      WHERE fc.year = (SELECT MAX(year) FROM fmr_county) AND fc.br2 IS NOT NULL
      GROUP BY s.state_abbr
    `).all().map(r => [r.state_abbr, r.avg_rent])
  );

  const stateEntries = [];
  for (const s of stateRows) {
    stateEntries.push({
      slug: s.slug, type: 'state', name: s.name,
      cost_raw: stateCostMap.get(s.abbr) ?? null,
      wages_raw: stateWageMap.get(s.slug) ?? null,
      rent_raw: stateRentMap.get(s.abbr) ?? null,
      crime_raw: stateCrimeMap.get(s.abbr) ?? null,
      schools_raw: stateSchoolsMap.get(s.abbr) ?? null,
      childcare_raw: stateChildcareMap.get(s.abbr) ?? null,
      enviro_raw: stateEnviroMap.get(s.abbr) ?? null,
    });
  }

  // Percentiles for states
  const statePercentiles = {};
  for (const dim of dims) {
    const vals = stateEntries.map(e => e[dim + '_raw']);
    statePercentiles[dim] = percentileRank(vals);
  }

  for (let i = 0; i < stateEntries.length; i++) {
    const e = stateEntries[i];
    const scores = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const dim of dims) {
      const pctRank = statePercentiles[dim].get(i);
      if (pctRank !== undefined) {
        scores[dim] = LOWER_IS_BETTER.has(dim) ? (100 - pctRank) : pctRank;
        weightedSum += scores[dim] * WEIGHTS[dim];
        totalWeight += WEIGHTS[dim];
      } else {
        scores[dim] = null;
      }
    }

    const composite = totalWeight > 0 ? weightedSum / totalWeight : 50;
    const grade = computeGrade(composite);

    insertScore.run(
      e.slug, 'state', e.name,
      scores.cost, scores.wages, scores.rent, scores.crime,
      scores.schools, scores.childcare, scores.enviro,
      Math.round(composite * 10) / 10, grade
    );
    count++;
  }

  return count;
});

const scoreCount = insertScores();
console.log(`Inserted ${scoreCount} life scores`);

// Cleanup
costDb.close();
wageDb.close();
crimeDb.close();
childcareDb.close();
schoolsDb.close();
enviroDb.close();
rentDb.close();
db.close();

console.log(`\nDone! Output: ${OUT}`);
