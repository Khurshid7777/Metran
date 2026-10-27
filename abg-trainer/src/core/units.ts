/** Unit conversion. The core works in mmHg, mmol/L and g/L; conversion happens only on input/output. */

export type UnitId =
  | 'mmHg' | 'kPa'
  | 'g/L' | 'g/dL'
  | 'mmol/L' | 'mg/dL' | 'mg/dL_BUN'
  | 'fraction' | 'percent';

export const KPA_TO_MMHG = 7.50062;
export const GLUCOSE_MGDL_PER_MMOL = 18.016;
export const UREA_MGDL_PER_MMOL = 6.006;
export const BUN_MGDL_PER_MMOL = 2.801;

/** Converts a value given in `unit` into the internal unit of that quantity. */
export function toInternal(value: number, unit: UnitId, quantity?: 'glucose' | 'urea'): number {
  switch (unit) {
    case 'kPa':
      return value * KPA_TO_MMHG;
    case 'g/dL':
      return value * 10;
    case 'mg/dL':
      return quantity === 'urea' ? value / UREA_MGDL_PER_MMOL : value / GLUCOSE_MGDL_PER_MMOL;
    case 'mg/dL_BUN':
      return value / BUN_MGDL_PER_MMOL;
    case 'percent':
      return value / 100;
    default:
      return value;
  }
}

/** Converts an internal value into `unit`. */
export function fromInternal(value: number, unit: UnitId, quantity?: 'glucose' | 'urea'): number {
  switch (unit) {
    case 'kPa':
      return value / KPA_TO_MMHG;
    case 'g/dL':
      return value / 10;
    case 'mg/dL':
      return quantity === 'urea' ? value * UREA_MGDL_PER_MMOL : value * GLUCOSE_MGDL_PER_MMOL;
    case 'mg/dL_BUN':
      return value * BUN_MGDL_PER_MMOL;
    case 'percent':
      return value * 100;
    default:
      return value;
  }
}

/** FiO2 may be entered as a fraction (0.21–1) or as percent (21–100). */
export function normalizeFiO2(value: number): number {
  return value > 1 ? value / 100 : value;
}

/** Parses a number typed with either decimal separator. Returns NaN when not a number. */
export function parseLocaleNumber(raw: string): number {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.').replace('−', '-');
  if (s === '' || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

/** Formats a number with the decimal separator of the language (ru/uz – comma, en – dot). */
export function formatNumber(value: number, lang: string, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(digits);
  const trimmed = digits > 0 ? fixed.replace(/\.?0+$/, '') : fixed;
  const out = trimmed === '-0' ? '0' : trimmed;
  return lang === 'en' ? out : out.replace('.', ',');
}

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
