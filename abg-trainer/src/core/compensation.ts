import type { Chronicity, Compensation, Ctx, Disorder, Flag, Step } from './types';

export interface CompensationOutcome {
  step: Step;
  chronicity?: Chronicity;
  compensation?: Compensation;
  added: Disorder[];
}

export function expectedPCO2MetAcid(HCO3: number): number {
  return 1.5 * HCO3 + 8;
}

export function expectedPCO2MetAlk(HCO3: number, ceiling = 55): number {
  return Math.min(0.7 * HCO3 + 21, ceiling);
}

export function expectedHCO3Resp(pCO2: number, kind: 'acid' | 'alk', chronicity: 'acute' | 'chronic'): number {
  if (kind === 'acid') return 24 + (chronicity === 'acute' ? 0.1 : 0.35) * (pCO2 - 40);
  return 24 - (chronicity === 'acute' ? 0.2 : 0.4) * (40 - pCO2);
}

/** Step 4: expected compensation (Boston approach) plus a Copenhagen SBE cross-check when BE is given. */
export function compensationStep(ctx: Ctx, base: Disorder | undefined): CompensationOutcome {
  const { input, norms, HCO3 } = ctx;
  const tol = norms.compensationTolerance;
  const flags: Flag[] = [];
  if (input.ageCategory === 'preterm' || input.ageCategory === 'term_neonate') {
    flags.push({ code: 'neonatal_compensation', severity: 'info' });
  }
  if (!base) {
    return {
      step: { id: 'compensation', status: 'disabled', explanationKey: 'step.compensation.none', flags, details: {} },
      added: [],
    };
  }
  const pCO2 = input.pCO2;
  const details: Step['details'] = {};
  const added: Disorder[] = [];
  let compensation: Compensation = 'adequate';
  let chronicity: Chronicity | undefined;
  let value: number;
  let range: [number, number];
  let verdict: string;

  if (base === 'metabolic_acidosis' || base === 'metabolic_alkalosis') {
    const acid = base === 'metabolic_acidosis';
    const expected = acid ? expectedPCO2MetAcid(HCO3) : expectedPCO2MetAlk(HCO3, norms.metAlkPCO2Ceiling);
    value = expected;
    range = [expected - tol, expected + tol];
    details.expectedPCO2 = expected;
    if (pCO2 > range[1]) {
      added.push('respiratory_acidosis');
      compensation = acid ? 'insufficient' : 'excessive';
    } else if (pCO2 < range[0]) {
      added.push('respiratory_alkalosis');
      compensation = acid ? 'excessive' : 'insufficient';
    }
    verdict = added.length ? 'plus_' + added[0] : 'adequate';
    if (input.BE !== undefined) {
      // Copenhagen: ΔpCO2 ≈ SBE (acidosis), ≈ 0.6·SBE (alkalosis)
      details.copenhagenPCO2 = 40 + (acid ? 1 : 0.6) * input.BE;
    }
  } else {
    const kind = base === 'respiratory_acidosis' ? 'acid' : 'alk';
    const acute = expectedHCO3Resp(pCO2, kind, 'acute');
    const chronic = expectedHCO3Resp(pCO2, kind, 'chronic');
    details.expectedAcute = acute;
    details.expectedChronic = chronic;
    value = acute;
    // For acidosis HCO3 rises: acute < chronic; for alkalosis HCO3 falls: chronic < acute.
    const lo = Math.min(acute, chronic);
    const hi = Math.max(acute, chronic);
    range = [lo - tol, hi + tol];
    const inAcute = Math.abs(HCO3 - acute) <= tol;
    const inChronic = Math.abs(HCO3 - chronic) <= tol;
    if (inAcute || inChronic) {
      chronicity = inAcute && inChronic
        ? (Math.abs(HCO3 - chronic) < Math.abs(HCO3 - acute) ? 'chronic' : 'acute')
        : inAcute ? 'acute' : 'chronic';
      verdict = chronicity;
    } else if (HCO3 > lo && HCO3 < hi) {
      chronicity = 'acute_on_chronic';
      verdict = chronicity;
    } else if (kind === 'acid') {
      if (HCO3 > chronic + tol) {
        added.push('metabolic_alkalosis');
        compensation = 'excessive';
      } else {
        added.push('metabolic_acidosis');
        compensation = 'insufficient';
      }
      verdict = 'plus_' + added[0];
    } else {
      if (HCO3 < chronic - tol) {
        added.push('metabolic_acidosis');
        compensation = 'excessive';
      } else {
        added.push('metabolic_alkalosis');
        compensation = 'insufficient';
      }
      verdict = 'plus_' + added[0];
    }
    if (input.BE !== undefined) {
      // Copenhagen: acute respiratory disorders SBE ≈ 0; chronic acidosis SBE ≈ 0.4·ΔpCO2
      details.copenhagenSBEChronic = 0.4 * (pCO2 - 40);
    }
  }
  return {
    step: {
      id: 'compensation',
      status: 'done',
      value,
      normalRange: range,
      verdict,
      explanationKey: 'step.compensation.' + base,
      flags,
      details,
    },
    chronicity,
    compensation,
    added,
  };
}
