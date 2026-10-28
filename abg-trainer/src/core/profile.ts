import { categoryNorms } from './primary';
import type { Ctx } from './types';

/** One analyte placed on a common scale: 0 = middle of normal, ±1 = edges of the normal range. */
export interface ProfileItem {
  id: string;
  value: number;
  lo: number;
  hi: number;
  /** (value − mid) / half-width; |z| ≤ 1 is normal. */
  z: number;
}

/** Deviation profile of every entered analyte against its age-specific normal range. */
export function deviationProfile(ctx: Ctx, agCorr?: number): ProfileItem[] {
  const { input, norms } = ctx;
  const P = norms.profile;
  const n = categoryNorms(norms, input.ageCategory, input.sampleType, input.bpd);
  const neonate = input.ageCategory === 'preterm' || input.ageCategory === 'term_neonate';
  const rows: [string, number | undefined, number[]][] = [
    ['pH', input.pH, n.pH],
    ['pCO2', input.pCO2, n.pCO2],
    ['HCO3', ctx.HCO3, n.HCO3],
    ['BE', input.BE, n.BE],
    ['Na', input.Na, P.Na],
    ['K', input.K, P.K],
    ['Cl', input.Cl, P.Cl],
    ['iCa', input.iCa, P.iCa],
    ['glucose', input.glucose, neonate ? P.glucoseNeonate : P.glucose],
    ['lactate', input.lactate, P.lactate],
    ['albumin', input.albumin, P.albumin],
    ['agCorr', agCorr, P.agCorr],
    ['Hb', input.Hb, P.Hb[input.ageCategory]],
  ];
  return rows
    .filter((r): r is [string, number, number[]] => r[1] !== undefined && Number.isFinite(r[1]))
    .map(([id, value, [lo, hi]]) => {
      const mid = (lo + hi) / 2;
      const half = (hi - lo) / 2 || 1;
      return { id, value, lo, hi, z: (value - mid) / half };
    });
}
