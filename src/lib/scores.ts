// Life Score weights and grade functions

export const DIMENSION_WEIGHTS = {
  cost: 0.20,
  wages: 0.20,
  rent: 0.15,
  crime: 0.15,
  schools: 0.10,
  childcare: 0.10,
  enviro: 0.10,
} as const;

export type Dimension = keyof typeof DIMENSION_WEIGHTS;

export const DIMENSION_LABELS: Record<Dimension, string> = {
  cost: 'Cost of Living',
  wages: 'Wages',
  rent: 'Rent',
  crime: 'Safety',
  schools: 'Schools',
  childcare: 'Childcare',
  enviro: 'Environment',
};

// Lower is better for these dimensions — invert their percentile
export const LOWER_IS_BETTER: Dimension[] = ['cost', 'rent', 'crime', 'childcare'];

export function computeGrade(composite: number): string {
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

export function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#059669'; // emerald-600
  if (grade.startsWith('B')) return '#2563eb'; // blue-600
  if (grade.startsWith('C')) return '#d97706'; // amber-600
  if (grade.startsWith('D')) return '#ea580c'; // orange-600
  return '#dc2626'; // red-600
}

export function gradeBgClass(grade: string): string {
  if (grade.startsWith('A')) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (grade.startsWith('B')) return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
  if (grade.startsWith('C')) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (grade.startsWith('D')) return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
  return 'bg-red-500/10 text-red-600 dark:text-red-400';
}
