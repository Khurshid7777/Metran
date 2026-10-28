import type { AbgInput, Ctx, Flag, InputError, Norms, Step } from './types';

/** Allowed input ranges (internal units). Out of range blocks the calculation. */
export const INPUT_RANGES: Record<string, [number, number]> = {
  pH: [6.5, 7.9],
  pCO2: [5, 200],
  HCO3: [2, 60],
  BE: [-40, 40],
  gestationalWeeks: [22, 42],
  weightKg: [0.4, 200],
  ageYears: [0, 110],
  Na: [100, 180],
  K: [1, 10],
  Cl: [70, 140],
  albumin: [10, 60],
  lactate: [0, 30],
  glucose: [0.5, 60],
  urea: [0.5, 100],
  measuredOsm: [200, 450],
  iCa: [0.3, 3],
  Mg: [0.2, 3],
  pO2: [10, 600],
  SpO2: [50, 100],
  SaO2: [50, 100],
  FiO2: [0.21, 1.0],
  MAP: [3, 40],
  PEEP: [0, 25],
  Patm: [500, 800],
  temperature: [25, 43],
  Hb: [30, 250],
  FCOHb: [0, 60],
  FMetHb: [0, 60],
  bilirubin: [0, 900],
  ageHours: [0, 720],
  pO2FO2: [20, 700],
  etCO2: [5, 150],
  phosphate: [0.2, 5],
  ScvO2: [20, 100],
  pvO2: [10, 100],
  pvCO2: [10, 200],
  cardiacOutput: [0.1, 20],
  PIP: [5, 60],
  VE: [0.1, 40],
  heightCm: [30, 230],
};

export function validateInput(input: AbgInput): InputError[] {
  const errors: InputError[] = [];
  for (const field of ['pH', 'pCO2'] as const) {
    if (input[field] === undefined || input[field] === null) errors.push({ field, code: 'required' });
  }
  if (!input.sampleType) errors.push({ field: 'sampleType', code: 'required' });
  if (!input.ageCategory) errors.push({ field: 'ageCategory', code: 'required' });
  const rec = input as unknown as Record<string, unknown>;
  for (const [field, range] of Object.entries(INPUT_RANGES)) {
    const v = rec[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || Number.isNaN(v)) {
      errors.push({ field, code: 'not_a_number' });
    } else if (v < range[0] || v > range[1]) {
      errors.push({ field, code: 'out_of_range', range });
    }
  }
  return errors;
}

/** Henderson–Hasselbalch: HCO3 = 0.0307 · pCO2 · 10^(pH − 6.1). */
export function hcoFromPh(pH: number, pCO2: number): number {
  return 0.0307 * pCO2 * 10 ** (pH - 6.1);
}

/** pH = 6.1 + log10(HCO3 / (0.0307 · pCO2)). */
export function phFromHco(HCO3: number, pCO2: number): number {
  return 6.1 + Math.log10(HCO3 / (0.0307 * pCO2));
}

/** Step 1: internal consistency of the sample. */
export function consistencyStep(input: AbgInput, norms: Norms): { step: Step; HCO3: number } {
  const flags: Flag[] = [];
  const hMeasured = 10 ** (9 - input.pH);
  if (input.HCO3 === undefined) {
    const HCO3 = hcoFromPh(input.pH, input.pCO2);
    return {
      HCO3,
      step: {
        id: 'consistency',
        status: 'done',
        value: HCO3,
        verdict: 'calculated',
        explanationKey: 'step.consistency.calculated',
        flags,
        details: { HCO3, hMeasured },
      },
    };
  }
  const hCalc = (24 * input.pCO2) / input.HCO3;
  const discrepancy = Math.abs(hCalc - hMeasured) / hMeasured;
  const consistent = discrepancy <= norms.consistencyTolerance;
  if (!consistent) {
    flags.push({
      code: 'inconsistent_sample',
      severity: 'critical',
      params: { hMeasured: Math.round(hMeasured), hCalc: Math.round(hCalc) },
    });
  }
  return {
    HCO3: input.HCO3,
    step: {
      id: 'consistency',
      status: 'done',
      value: discrepancy,
      verdict: consistent ? 'consistent' : 'inconsistent',
      explanationKey: 'step.consistency.check',
      flags,
      details: { hMeasured, hCalc, discrepancy },
    },
  };
}

/** Flags that do not depend on step order: critical pH, potassium, temperature, sample type. */
export function generalFlags(ctx: Ctx): Flag[] {
  const { input, norms } = ctx;
  const flags: Flag[] = [];
  if (input.pH < norms.critical.pHLow || input.pH > norms.critical.pHHigh) {
    flags.push({ code: 'critical_ph', severity: 'critical', params: { pH: input.pH } });
  }
  if (input.temperature !== undefined) {
    const [lo, hi] = norms.temperatureRange;
    if (input.temperature < lo || input.temperature > hi) {
      flags.push({ code: 'temperature', severity: 'warning', params: { t: input.temperature } });
    }
  }
  if (input.sampleType === 'venous') flags.push({ code: 'venous_sample', severity: 'warning' });
  if (input.sampleType === 'capillary') flags.push({ code: 'capillary_sample', severity: 'warning' });
  if (input.sampleType === 'cord_vein') flags.push({ code: 'cord_vein_sample', severity: 'info' });
  if (input.ageCategory === 'preterm' && input.gestationalWeeks === undefined) {
    flags.push({ code: 'ga_missing', severity: 'info' });
  }
  return flags;
}
