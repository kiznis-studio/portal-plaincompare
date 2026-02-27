// PlainCompare type definitions

export interface Metro {
  slug: string;
  name: string;
  cbsa: string;
  state_abbr: string | null;
  population: number | null;
  wagedex_area: string | null;
}

export interface State {
  slug: string;
  abbr: string;
  name: string;
  fips: string | null;
}

export interface PopularComparison {
  slug_a: string;
  slug_b: string;
  level: 'metro' | 'state';
}

// --- Cross-DB data dimensions ---

export interface CostData {
  rpp_all: number | null;
  rpp_goods: number | null;
  rpp_services: number | null;
  rpp_rents: number | null;
  year: number | null;
}

export interface RentData {
  br0: number | null;
  br1: number | null;
  br2: number | null;
  br3: number | null;
  br4: number | null;
  year: number | null;
}

export interface CrimeData {
  violent_crime: number | null;
  property_crime: number | null;
  murder: number | null;
  robbery: number | null;
  burglary: number | null;
  population: number | null;
  year: number | null;
}

export interface WageData {
  median_salary: number | null;
  mean_salary: number | null;
  total_employment: number | null;
  top_occupations: { title: string; median: number }[];
}

export interface SchoolsData {
  num_schools: number | null;
  total_enrollment: number | null;
  avg_student_teacher_ratio: number | null;
  charter_pct: number | null;
  title_i_pct: number | null;
}

export interface ChildcareData {
  center_infant: number | null;
  center_toddler: number | null;
  center_preschool: number | null;
  center_school_age: number | null;
  family_infant: number | null;
  family_toddler: number | null;
}

export interface EnviroData {
  num_facilities: number | null;
  num_water_systems: number | null;
  num_superfund_sites: number | null;
  num_violations: number | null;
}

export interface ComparisonData {
  cost: CostData | null;
  rent: RentData | null;
  crime: CrimeData | null;
  wages: WageData | null;
  schools: SchoolsData | null;
  childcare: ChildcareData | null;
  enviro: EnviroData | null;
}

export interface ComparisonResult {
  a: { entity: Metro | State; data: ComparisonData };
  b: { entity: Metro | State; data: ComparisonData };
  level: 'metro' | 'state';
}

// ---- County types ----

export interface County {
  slug: string;
  name: string;
  state_abbr: string;
  state_name: string;
  fips: string;
  population: number | null;
}

export interface CountyChildcareData {
  center_infant: number | null;
  center_toddler: number | null;
  center_preschool: number | null;
  center_school_age: number | null;
  family_infant: number | null;
  family_toddler: number | null;
  family_preschool: number | null;
  family_school_age: number | null;
  median_income: number | null;
  poverty_rate: number | null;
}

export interface CountyComparisonData {
  childcare: CountyChildcareData | null;
  rent: RentData | null;
  // State-level fallbacks
  cost: CostData | null;
  crime: CrimeData | null;
  wages: WageData | null;
  schools: SchoolsData | null;
  enviro: EnviroData | null;
}

// ---- Life Score types ----

export interface LifeScore {
  slug: string;
  type: 'metro' | 'state';
  name: string;
  cost_score: number | null;
  wages_score: number | null;
  rent_score: number | null;
  crime_score: number | null;
  schools_score: number | null;
  childcare_score: number | null;
  enviro_score: number | null;
  composite_score: number;
  grade: string;
}
