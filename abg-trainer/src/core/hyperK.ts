import type { Ctx } from './types';

export interface HyperKPlan {
  severity: 'mild' | 'moderate' | 'severe';
  perKg: boolean;
  /** Treatment to shift potassium is shown from the moderate band; mild is cause-directed. */
  shift: boolean;
  /** Calcium gluconate 10 %, mL (adults: range). */
  calciumMl: [number, number];
  insulinUnits: number;
  glucoseG: number;
  /** Children: 10 % dextrose volume that carries the glucose dose, mL. */
  dextrose10Ml?: number;
  /** Nebulised salbutamol, mg (adults: range). */
  salbutamolMg: [number, number];
  glucoseCheckMin: number;
  /** Weight is needed for the paediatric doses. */
  needsWeight: boolean;
}

/** Acute hyperkalaemia plan for children and adults; neonates have other thresholds and are not covered. */
export function hyperKPlan(ctx: Ctx): HyperKPlan | undefined {
  const { input, norms } = ctx;
  const age = input.ageCategory;
  if (input.K === undefined || (age !== 'child' && age !== 'adult')) return undefined;
  const K = norms.labs.K;
  if (input.K < K.hyperMild) return undefined;
  const severity = input.K >= K.hyperSevere ? 'severe' : input.K >= K.hyperModerate ? 'moderate' : 'mild';
  const H = norms.hyperK;
  const C = norms.labs.iCa;
  const base = { severity, shift: severity !== 'mild', glucoseCheckMin: H.glucoseCheckMin } as const;

  if (age === 'adult') {
    return {
      ...base,
      perKg: false,
      calciumMl: [C.adultGluconateMl[0], C.adultGluconateMl[1]],
      insulinUnits: H.insulin.adult.units,
      glucoseG: H.insulin.adult.glucoseG,
      salbutamolMg: [H.salbutamolMg.adult[0], H.salbutamolMg.adult[1]],
      needsWeight: false,
    };
  }
  const w = input.weightKg;
  if (w === undefined) {
    return { ...base, perKg: true, calciumMl: [0, 0], insulinUnits: 0, glucoseG: 0, salbutamolMg: [0, 0], needsWeight: true };
  }
  const ch = H.insulin.child;
  const salb = H.salbutamolMg.child.find(([kg]) => w < kg)![1];
  const ca = Math.min(C.gluconateMlKg * w, C.gluconateMaxMl);
  return {
    ...base,
    perKg: true,
    calciumMl: [ca, ca],
    insulinUnits: Math.min(ch.unitsKg * w, ch.maxUnits),
    glucoseG: ch.glucoseGKg * w,
    dextrose10Ml: ch.dextrose10MlKg * w,
    salbutamolMg: [salb, salb],
    needsWeight: false,
  };
}
