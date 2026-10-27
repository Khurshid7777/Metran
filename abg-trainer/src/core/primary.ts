import type { AgeCategory, Ctx, Disorder, Flag, Norms, PhStatus, PrimaryKind, SampleType, Step } from './types';

export interface CategoryNorms {
  pH: [number, number];
  pCO2: [number, number];
  HCO3: [number, number];
  BE: [number, number];
  PaO2Air: [number, number];
  pCO2Target: [number, number];
}

/** Norms for an age category, with sample-specific adjustments (cord artery pH, BPD target). */
export function categoryNorms(norms: Norms, age: AgeCategory, sample?: SampleType, bpd?: boolean): CategoryNorms {
  const c = norms.categories[age] as unknown as CategoryNorms & { pCO2TargetBPD?: [number, number] };
  const out: CategoryNorms = {
    pH: [...c.pH] as [number, number],
    pCO2: [...c.pCO2] as [number, number],
    HCO3: [...c.HCO3] as [number, number],
    BE: [...c.BE] as [number, number],
    PaO2Air: [...c.PaO2Air] as [number, number],
    pCO2Target: [...c.pCO2Target] as [number, number],
  };
  if (bpd && c.pCO2TargetBPD) {
    out.pCO2 = [...c.pCO2TargetBPD] as [number, number];
    out.pCO2Target = [...c.pCO2TargetBPD] as [number, number];
  }
  if (sample === 'cord_artery' || sample === 'cord_vein') out.pH[0] = norms.cord.arteryPHMin;
  return out;
}

export interface PrimaryOutcome {
  phStep: Step;
  primaryStep: Step;
  phStatus: PhStatus;
  primary: PrimaryKind;
  /** Disorder used for the compensation step (for mixed: the dominant one). */
  compensationBase?: Disorder;
  mixedPair?: [Disorder, Disorder];
}

/** Steps 2–3: pH status and primary disorder. */
export function primaryStep(ctx: Ctx): PrimaryOutcome {
  const { input, norms, HCO3 } = ctx;
  const n = categoryNorms(norms, input.ageCategory, input.sampleType, input.bpd);
  const { pH, pCO2 } = input;
  const phStatus: PhStatus = pH < n.pH[0] ? 'acidemia' : pH > n.pH[1] ? 'alkalemia' : 'normal';

  const phStep: Step = {
    id: 'ph',
    status: 'done',
    value: pH,
    normalRange: n.pH,
    verdict: phStatus,
    explanationKey: 'step.ph.' + phStatus,
    flags: [],
    details: {},
  };

  const pco2High = pCO2 > n.pCO2[1];
  const pco2Low = pCO2 < n.pCO2[0];
  const hcoLow = HCO3 < n.HCO3[0];
  const hcoHigh = HCO3 > n.HCO3[1];
  const base = norms.baseline;
  // Relative deviation from the Boston baselines, used to pick the dominant process.
  const respDev = Math.abs(pCO2 - base.pCO2) / base.pCO2;
  const metDev = Math.abs(HCO3 - base.HCO3) / base.HCO3;

  const flags: Flag[] = [];
  let primary: PrimaryKind = 'none';
  let compensationBase: Disorder | undefined;
  let mixedPair: [Disorder, Disorder] | undefined;

  const acidSide = phStatus === 'acidemia' || (phStatus === 'normal' && pH < 7.4);

  if (phStatus === 'acidemia') {
    if (pco2High && hcoLow) {
      primary = 'mixed_acidosis';
      mixedPair = ['metabolic_acidosis', 'respiratory_acidosis'];
      compensationBase = metDev >= respDev ? 'metabolic_acidosis' : 'respiratory_acidosis';
    } else if (pco2High) primary = 'respiratory_acidosis';
    else if (hcoLow) primary = 'metabolic_acidosis';
    else primary = pickDominant(true, pCO2, HCO3, respDev, metDev, base);
  } else if (phStatus === 'alkalemia') {
    if (pco2Low && hcoHigh) {
      primary = 'mixed_alkalosis';
      mixedPair = ['metabolic_alkalosis', 'respiratory_alkalosis'];
      compensationBase = metDev >= respDev ? 'metabolic_alkalosis' : 'respiratory_alkalosis';
    } else if (pco2Low) primary = 'respiratory_alkalosis';
    else if (hcoHigh) primary = 'metabolic_alkalosis';
    else primary = pickDominant(false, pCO2, HCO3, respDev, metDev, base);
  } else {
    const deviated = pco2High || pco2Low || hcoLow || hcoHigh;
    if (deviated) {
      if ((pco2High && hcoHigh) || (pco2Low && hcoLow)) {
        flags.push({ code: 'normal_ph_mixed', severity: 'warning' });
      }
      primary = pickDominant(acidSide, pCO2, HCO3, respDev, metDev, base);
    }
  }
  if (primary !== 'none' && !compensationBase) compensationBase = primary as Disorder;

  const primaryStepResult: Step = {
    id: 'primary',
    status: 'done',
    verdict: primary,
    explanationKey: 'step.primary.' + primary,
    flags,
    details: { pCO2, HCO3, pco2High, pco2Low, hcoLow, hcoHigh },
    normalRange: n.pCO2,
  };
  return { phStep, primaryStep: primaryStepResult, phStatus, primary, compensationBase, mixedPair };
}

function pickDominant(
  acidSide: boolean,
  pCO2: number,
  HCO3: number,
  respDev: number,
  metDev: number,
  base: { pCO2: number; HCO3: number },
): PrimaryKind {
  const resp = acidSide ? pCO2 > base.pCO2 : pCO2 < base.pCO2;
  const met = acidSide ? HCO3 < base.HCO3 : HCO3 > base.HCO3;
  if (resp && (!met || respDev >= metDev)) return acidSide ? 'respiratory_acidosis' : 'respiratory_alkalosis';
  if (met) return acidSide ? 'metabolic_acidosis' : 'metabolic_alkalosis';
  return 'none';
}
