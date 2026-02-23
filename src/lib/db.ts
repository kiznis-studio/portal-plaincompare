// PlainCompare cross-database query library
// All functions accept D1Database bindings — NEVER at module scope

import type {
  Metro, State, PopularComparison,
  CostData, RentData, CrimeData, WageData,
  SchoolsData, ChildcareData, EnviroData, ComparisonData,
} from './types';

// ---- Own DB (mapping tables) ----

export async function getMetroBySlug(db: D1Database, slug: string): Promise<Metro | null> {
  return db.prepare('SELECT * FROM metros WHERE slug = ?').bind(slug).first<Metro>();
}

export async function getAllMetros(db: D1Database): Promise<Metro[]> {
  const { results } = await db.prepare('SELECT * FROM metros ORDER BY name COLLATE NOCASE').all<Metro>();
  return results;
}

export async function getStateBySlug(db: D1Database, slug: string): Promise<State | null> {
  return db.prepare('SELECT * FROM states WHERE slug = ?').bind(slug).first<State>();
}

export async function getAllStates(db: D1Database): Promise<State[]> {
  const { results } = await db.prepare('SELECT * FROM states ORDER BY name COLLATE NOCASE').all<State>();
  return results;
}

export async function getPopularComparisons(db: D1Database, level: string, limit = 50): Promise<PopularComparison[]> {
  const { results } = await db.prepare(
    'SELECT * FROM popular_comparisons WHERE level = ? LIMIT ?'
  ).bind(level, limit).all<PopularComparison>();
  return results;
}

export async function searchMetros(db: D1Database, query: string, limit = 20): Promise<Metro[]> {
  const like = '%' + query.trim() + '%';
  const { results } = await db.prepare(
    'SELECT * FROM metros WHERE name LIKE ? OR cbsa = ? ORDER BY name COLLATE NOCASE LIMIT ?'
  ).bind(like, query.trim(), limit).all<Metro>();
  return results;
}

export async function searchStates(db: D1Database, query: string, limit = 10): Promise<State[]> {
  const like = '%' + query.trim() + '%';
  const { results } = await db.prepare(
    'SELECT * FROM states WHERE name LIKE ? OR abbr = ? ORDER BY name COLLATE NOCASE LIMIT ?'
  ).bind(like, query.trim().toUpperCase(), limit).all<State>();
  return results;
}

// ---- Cost of Living (PlainCost DB) ----

export async function getMetroCost(db: D1Database, cbsa: string): Promise<CostData | null> {
  const row = await db.prepare(
    'SELECT rpp_all, rpp_goods, rpp_services, rpp_rents, year FROM msas WHERE cbsa = ?'
  ).bind(cbsa).first<CostData>();
  return row;
}

export async function getStateCost(db: D1Database, abbr: string): Promise<CostData | null> {
  const row = await db.prepare(
    'SELECT rpp_all, rpp_goods, rpp_services, rpp_rents, year FROM states WHERE abbr = ?'
  ).bind(abbr).first<CostData>();
  return row;
}

export async function getAllStateCosts(db: D1Database): Promise<(CostData & { abbr: string; name: string; slug: string })[]> {
  const { results } = await db.prepare(
    'SELECT abbr, name, slug, rpp_all, rpp_goods, rpp_services, rpp_rents, year FROM states ORDER BY name COLLATE NOCASE'
  ).all();
  return results as any;
}

export async function getAllMetroCosts(db: D1Database): Promise<(CostData & { cbsa: string; name: string; slug: string })[]> {
  const { results } = await db.prepare(
    'SELECT cbsa, name, slug, rpp_all, rpp_goods, rpp_services, rpp_rents, year FROM msas ORDER BY name COLLATE NOCASE'
  ).all();
  return results as any;
}

// ---- Rent (PlainRent DB) ----

export async function getMetroRent(db: D1Database, cbsa: string): Promise<RentData | null> {
  // PlainRent cbsa_code matches PlainCost cbsa (5-digit)
  const row = await db.prepare(
    'SELECT br0, br1, br2, br3, br4, year FROM fmr_metro WHERE cbsa_code = ? ORDER BY year DESC LIMIT 1'
  ).bind(cbsa).first<RentData>();
  return row;
}

export async function getStateRent(db: D1Database, stateAbbr: string): Promise<RentData | null> {
  // Aggregate county FMRs for the state
  const row = await db.prepare(`
    SELECT CAST(AVG(fc.br0) AS INTEGER) as br0,
           CAST(AVG(fc.br1) AS INTEGER) as br1,
           CAST(AVG(fc.br2) AS INTEGER) as br2,
           CAST(AVG(fc.br3) AS INTEGER) as br3,
           CAST(AVG(fc.br4) AS INTEGER) as br4,
           fc.year
    FROM fmr_county fc
    JOIN counties c ON fc.fips = c.fips
    JOIN states s ON c.state_code = s.state_code
    WHERE s.state_abbr = ? AND fc.year = (SELECT MAX(year) FROM fmr_county)
    GROUP BY s.state_abbr
  `).bind(stateAbbr).first<RentData>();
  return row;
}

// ---- Crime (PlainCrime DB — state level only) ----

export async function getStateCrime(db: D1Database, stateAbbr: string): Promise<CrimeData | null> {
  const row = await db.prepare(`
    SELECT sc.violent_crime, sc.property_crime, sc.murder, sc.robbery, sc.burglary,
           sc.population, sc.year
    FROM state_crime sc
    JOIN states s ON sc.state_fips = s.state_fips
    WHERE s.state_abbr = ? ORDER BY sc.year DESC LIMIT 1
  `).bind(stateAbbr).first<CrimeData>();
  return row;
}

export async function getAllStateCrime(db: D1Database): Promise<(CrimeData & { state_abbr: string; state_name: string; slug: string })[]> {
  const { results } = await db.prepare(`
    SELECT s.state_abbr, s.state_name, s.slug, sc.violent_crime, sc.property_crime,
           sc.murder, sc.robbery, sc.burglary, sc.population, sc.year
    FROM state_crime sc
    JOIN states s ON sc.state_fips = s.state_fips
    WHERE sc.year = (SELECT MAX(year) FROM state_crime)
    ORDER BY s.state_name COLLATE NOCASE
  `).all();
  return results as any;
}

// ---- Wages (WageDex DB) ----

export async function getMetroWages(db: D1Database, wagedexArea: string): Promise<WageData | null> {
  // Get top 5 occupations by employment, plus compute overall median
  const overallRow = await db.prepare(`
    SELECT CAST(SUM(tot_emp) AS INTEGER) as total_employment,
           CAST(AVG(a_median) AS INTEGER) as median_salary,
           CAST(AVG(a_mean) AS INTEGER) as mean_salary
    FROM metro_wages WHERE area_code = ? AND a_median IS NOT NULL AND a_median > 0
  `).bind(wagedexArea).first<{ total_employment: number; median_salary: number; mean_salary: number }>();

  if (!overallRow || !overallRow.total_employment) return null;

  const { results: topOcc } = await db.prepare(`
    SELECT o.occ_title as title, mw.a_median as median
    FROM metro_wages mw
    JOIN occupations o ON mw.occ_code = o.occ_code
    WHERE mw.area_code = ? AND mw.a_median IS NOT NULL AND mw.tot_emp IS NOT NULL
    ORDER BY mw.tot_emp DESC LIMIT 5
  `).bind(wagedexArea).all<{ title: string; median: number }>();

  return {
    median_salary: overallRow.median_salary,
    mean_salary: overallRow.mean_salary,
    total_employment: overallRow.total_employment,
    top_occupations: topOcc,
  };
}

export async function getStateWages(db: D1Database, stateAbbr: string): Promise<WageData | null> {
  // State area_code is 2-digit FIPS — need to find it from areas table
  const area = await db.prepare(
    "SELECT area_code FROM areas WHERE area_type='state' AND slug = ?"
  ).bind(stateAbbr.toLowerCase()).first<{ area_code: string }>();

  // If not found by slug, try by looking up the state_slug
  let areaCode = area?.area_code;
  if (!areaCode) {
    const areaBySlug = await db.prepare(
      "SELECT area_code FROM areas WHERE area_type='state' AND state_slug = ?"
    ).bind(stateAbbr.toLowerCase()).first<{ area_code: string }>();
    areaCode = areaBySlug?.area_code;
  }
  if (!areaCode) return null;

  const overallRow = await db.prepare(`
    SELECT CAST(SUM(tot_emp) AS INTEGER) as total_employment,
           CAST(AVG(a_median) AS INTEGER) as median_salary,
           CAST(AVG(a_mean) AS INTEGER) as mean_salary
    FROM state_wages WHERE area_code = ? AND a_median IS NOT NULL AND a_median > 0
  `).bind(areaCode).first<{ total_employment: number; median_salary: number; mean_salary: number }>();

  if (!overallRow || !overallRow.total_employment) return null;

  const { results: topOcc } = await db.prepare(`
    SELECT o.occ_title as title, sw.a_median as median
    FROM state_wages sw
    JOIN occupations o ON sw.occ_code = o.occ_code
    WHERE sw.area_code = ? AND sw.a_median IS NOT NULL AND sw.tot_emp IS NOT NULL
    ORDER BY sw.tot_emp DESC LIMIT 5
  `).bind(areaCode).all<{ title: string; median: number }>();

  return {
    median_salary: overallRow.median_salary,
    mean_salary: overallRow.mean_salary,
    total_employment: overallRow.total_employment,
    top_occupations: topOcc,
  };
}

// ---- Schools (PlainSchools DB — state level only) ----

export async function getStateSchools(db: D1Database, stateAbbr: string): Promise<SchoolsData | null> {
  const stateFips = await db.prepare(
    'SELECT state_fips FROM states WHERE state_abbr = ?'
  ).bind(stateAbbr).first<{ state_fips: string }>();
  if (!stateFips) return null;

  const row = await db.prepare(`
    SELECT COUNT(*) as num_schools,
           CAST(SUM(enrollment) AS INTEGER) as total_enrollment,
           ROUND(AVG(student_teacher_ratio), 1) as avg_student_teacher_ratio,
           ROUND(100.0 * SUM(CASE WHEN charter = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as charter_pct,
           ROUND(100.0 * SUM(CASE WHEN title_i = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as title_i_pct
    FROM schools WHERE state_fips = ?
  `).bind(stateFips.state_fips).first<SchoolsData>();
  return row;
}

export async function getAllStateSchools(db: D1Database): Promise<(SchoolsData & { state_abbr: string; state_name: string; slug: string })[]> {
  const { results } = await db.prepare(`
    SELECT s.state_abbr, s.state_name, s.slug,
           COUNT(*) as num_schools,
           CAST(SUM(sc.enrollment) AS INTEGER) as total_enrollment,
           ROUND(AVG(sc.student_teacher_ratio), 1) as avg_student_teacher_ratio,
           ROUND(100.0 * SUM(CASE WHEN sc.charter = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as charter_pct,
           ROUND(100.0 * SUM(CASE WHEN sc.title_i = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as title_i_pct
    FROM schools sc
    JOIN states s ON sc.state_fips = s.state_fips
    GROUP BY s.state_abbr
    ORDER BY s.state_name COLLATE NOCASE
  `).all();
  return results as any;
}

// ---- Childcare (PlainChildcare DB — state level) ----

export async function getStateChildcare(db: D1Database, abbr: string): Promise<ChildcareData | null> {
  const row = await db.prepare(`
    SELECT avg_center_infant as center_infant, avg_center_toddler as center_toddler,
           avg_center_preschool as center_preschool,
           min_center_infant as center_school_age,
           0 as family_infant, 0 as family_toddler
    FROM states WHERE abbr = ?
  `).bind(abbr).first<ChildcareData>();
  return row;
}

export async function getAllStateChildcare(db: D1Database): Promise<(ChildcareData & { abbr: string; name: string; slug: string })[]> {
  const { results } = await db.prepare(`
    SELECT abbr, name, slug,
           avg_center_infant as center_infant, avg_center_toddler as center_toddler,
           avg_center_preschool as center_preschool
    FROM states ORDER BY name COLLATE NOCASE
  `).all();
  return results as any;
}

// ---- Environment (PlainEnviro DB — state level) ----

export async function getStateEnviro(db: D1Database, stateAbbr: string): Promise<EnviroData | null> {
  const row = await db.prepare(`
    SELECT num_facilities, num_water_systems, num_superfund_sites, num_violations
    FROM states WHERE state_abbr = ?
  `).bind(stateAbbr).first<EnviroData>();
  return row;
}

export async function getAllStateEnviro(db: D1Database): Promise<(EnviroData & { state_abbr: string; state_name: string; slug: string })[]> {
  const { results } = await db.prepare(`
    SELECT state_abbr, state_name, slug, num_facilities, num_water_systems, num_superfund_sites, num_violations
    FROM states ORDER BY state_name COLLATE NOCASE
  `).all();
  return results as any;
}

// ---- Composite: Fetch all data for a metro/state comparison ----

interface Bindings {
  DB: D1Database;
  DB_COST: D1Database;
  DB_RENT: D1Database;
  DB_CRIME: D1Database;
  DB_WAGE: D1Database;
  DB_SCHOOLS: D1Database;
  DB_CHILDCARE: D1Database;
  DB_ENVIRO: D1Database;
}

export async function getMetroComparisonData(env: Bindings, metro: Metro): Promise<ComparisonData> {
  const [cost, rent, wages] = await Promise.all([
    getMetroCost(env.DB_COST, metro.cbsa),
    getMetroRent(env.DB_RENT, metro.cbsa),
    metro.wagedex_area ? getMetroWages(env.DB_WAGE, metro.wagedex_area) : null,
  ]);
  return { cost, rent, crime: null, wages, schools: null, childcare: null, enviro: null };
}

export async function getStateComparisonData(env: Bindings, state: State): Promise<ComparisonData> {
  const [cost, rent, crime, wages, schools, childcare, enviro] = await Promise.all([
    getStateCost(env.DB_COST, state.abbr),
    getStateRent(env.DB_RENT, state.abbr),
    getStateCrime(env.DB_CRIME, state.abbr),
    getStateWages(env.DB_WAGE, state.abbr),
    getStateSchools(env.DB_SCHOOLS, state.abbr),
    getStateChildcare(env.DB_CHILDCARE, state.abbr),
    getStateEnviro(env.DB_ENVIRO, state.abbr),
  ]);
  return { cost, rent, crime, wages, schools, childcare, enviro };
}

// ---- Stats for homepage ----

export async function getStats(db: D1Database) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM metros) as metro_count,
      (SELECT COUNT(*) FROM states) as state_count,
      (SELECT COUNT(*) FROM popular_comparisons) as comparison_count
  `).first<{ metro_count: number; state_count: number; comparison_count: number }>();
}
