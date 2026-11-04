import type { Ctx, Flag } from './types';

export type DkaSeverity = 'mild' | 'moderate' | 'severe';

export interface DkaAssessment {
  population: 'child' | 'adult';
  /** Diagnostic criteria met (glucose or BHB, plus acidosis). */
  met: boolean;
  /** BHB-confirmed ketoacidosis with glucose below the threshold (e.g. SGLT2 inhibitors). */
  euglycemic: boolean;
  severity?: DkaSeverity;
  /** Effective osmolality 2×Na + glucose, mmol/kg. */
  effOsm?: number;
  /** Child insulin infusion range, U/h, from weight. */
  insulin?: { lo: number; hi: number; lowRateAllowed: boolean };
  /** Criteria that were not entered. */
  missing: string[];
}

export interface DkaOutcome {
  assessment?: DkaAssessment;
  flags: Flag[];
}

/**
 * Diabetic ketoacidosis module. Applies to children and adults with a glucose value;
 * thresholds are in norms.dka (see norms.sources.dka for which ones are verified).
 */
export function dkaAssessment(ctx: Ctx, HCO3: number): DkaOutcome {
  const { input, norms } = ctx;
  const flags: Flag[] = [];
  const adult = input.ageCategory === 'adult';
  if (input.ageCategory !== 'child' && !adult) return { flags };
  if (input.glucose === undefined && input.bhb === undefined) return { flags };

  const n = adult ? norms.dka.adult : norms.dka.child;
  const acidosis = input.pH < n.pH || HCO3 < n.HCO3;
  const bhbHigh = adult && input.bhb !== undefined && input.bhb >= norms.dka.adult.bhb;
  const glucoseHigh = input.glucose !== undefined && input.glucose >= n.glucose;
  const met = acidosis && (glucoseHigh || bhbHigh);
  const euglycemic = adult && acidosis && bhbHigh && !glucoseHigh && input.glucose !== undefined;
  if (!met && !euglycemic) return { flags };

  const missing: string[] = [];
  if (adult && input.bhb === undefined) missing.push('bhb');

  let severity: DkaSeverity | undefined;
  const sev = n.severity;
  if (input.pH < sev.severe.pH || HCO3 < sev.severe.HCO3) severity = 'severe';
  else if (input.pH < sev.moderate.pH || HCO3 < sev.moderate.HCO3) severity = 'moderate';
  else severity = 'mild';

  const a: DkaAssessment = { population: adult ? 'adult' : 'child', met: met || euglycemic, euglycemic, severity, missing };
  if (input.Na !== undefined && input.glucose !== undefined) a.effOsm = 2 * input.Na + input.glucose;

  flags.push({ code: euglycemic ? 'dka_euglycemic' : 'dka_met', severity: 'critical', params: { sev: '@dka.sev.' + severity } });

  if (!adult) {
    const c = norms.dka.child;
    if (input.weightKg !== undefined) {
      a.insulin = {
        lo: Math.round(c.insulinRate[0] * input.weightKg * 100) / 100,
        hi: Math.round(c.insulinRate[1] * input.weightKg * 100) / 100,
        lowRateAllowed: input.pH > c.insulinLowRatePH,
      };
    }
    if (input.K !== undefined) {
      if (input.K < c.kDeferInsulin) flags.push({ code: 'dka_k_hold_insulin', severity: 'critical', params: { K: input.K } });
      else if (input.K > c.kDeferK) flags.push({ code: 'dka_k_defer', severity: 'warning', params: { K: input.K } });
    }
    if (input.glucose !== undefined && input.glucose <= c.dextrose[1]) {
      flags.push({ code: 'dka_dextrose', severity: 'warning', params: { g: input.glucose, lo: c.dextrose[0], hi: c.dextrose[1] } });
    }
  }
  if (a.effOsm !== undefined && a.effOsm >= norms.dka.effOsmHigh) {
    flags.push({ code: 'dka_osm_high', severity: 'warning', params: { osm: Math.round(a.effOsm) } });
  }
  return { assessment: a, flags };
}
