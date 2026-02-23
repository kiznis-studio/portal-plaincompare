// Formatting utilities for PlainCompare

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString('en-US');
}

export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'N/A';
  return '$' + Math.round(amount).toLocaleString('en-US');
}

export function formatRpp(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return value.toFixed(1);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return 'N/A';
  return value.toFixed(decimals) + '%';
}

export function formatRate(count: number | null, population: number | null): string {
  if (count === null || population === null || population === 0) return 'N/A';
  return ((count / population) * 100000).toFixed(1);
}

export function rateValue(count: number | null, population: number | null): number | null {
  if (count === null || population === null || population === 0) return null;
  return (count / population) * 100000;
}

export function salaryEquivalent(salary: number, fromRpp: number, toRpp: number): number {
  return Math.round(salary * (toRpp / fromRpp));
}

export function diffLabel(a: number | null, b: number | null, lowerIsBetter = false): { text: string; winner: 'a' | 'b' | 'tie' | null } {
  if (a === null || b === null) return { text: 'N/A', winner: null };
  const diff = b - a;
  if (Math.abs(diff) < 0.01) return { text: 'Tied', winner: 'tie' };
  const better = lowerIsBetter ? (diff > 0 ? 'a' : 'b') : (diff > 0 ? 'b' : 'a');
  return { text: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`, winner: better };
}

export function shortName(fullName: string): string {
  // "Austin-Round Rock-San Marcos, TX" → "Austin"
  return fullName.split(',')[0].split('-')[0].trim();
}
