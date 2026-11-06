/** Arithmetic for preparing and dosing infusion solutions. Concentrations are % w/v (g per 100 mL). */

export const NACL_MMOL_PER_PCT = 10 / 58.44 * 1000; // 171.1 mmol/L per 1 %
export const GLUCOSE_MOSM_PER_G = 5.05; // dextrose monohydrate

export interface MixResult {
  ok: boolean;
  /** Volume of the concentrated stock and of the diluent (mL). */
  stockMl: number;
  diluentMl: number;
  reason?: 'range' | 'volume';
}

/**
 * Mix a concentrated stock (cStock %) with a diluent (cDiluent %) to get `finalMl` of `target` %.
 * Alligation: V_stock = V × (target − cDiluent) / (cStock − cDiluent).
 */
export function mix(target: number, finalMl: number, cStock: number, cDiluent: number): MixResult {
  if (!(finalMl > 0)) return { ok: false, stockMl: 0, diluentMl: 0, reason: 'volume' };
  if (!(cDiluent < target && target < cStock)) return { ok: false, stockMl: 0, diluentMl: 0, reason: 'range' };
  const stockMl = (finalMl * (target - cDiluent)) / (cStock - cDiluent);
  return { ok: true, stockMl, diluentMl: finalMl - stockMl };
}

export const naclMmolPerL = (pct: number) => pct * NACL_MMOL_PER_PCT;
/** NaCl osmolarity, mOsm/L (two particles per formula unit). */
export const naclOsm = (pct: number) => 2 * naclMmolPerL(pct);
export const glucoseOsm = (pct: number) => pct * 10 * GLUCOSE_MOSM_PER_G;

/** Glucose infusion rate, mg/kg/min, from concentration %, rate mL/h and weight. */
export function gir(pct: number, mlPerHour: number, weightKg: number): number {
  return (pct * 10 * mlPerHour) / (60 * weightKg);
}

/** Rate (mL/h) that delivers a target glucose infusion rate. */
export function rateForGir(pct: number, girMgKgMin: number, weightKg: number): number {
  return (girMgKgMin * 60 * weightKg) / (pct * 10);
}
