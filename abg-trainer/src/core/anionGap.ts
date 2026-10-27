import type { Ctx, DeltaClass, Flag, Step } from './types';

export interface AgOutcome {
  step: Step;
  ag?: number;
  agCorr?: number;
  elevated?: boolean;
}

export function agNorm(ctx: Ctx): [number, number] {
  if (ctx.settings.agNormOverride) return ctx.settings.agNormOverride;
  return (ctx.settings.agWithK ? ctx.norms.AG.withK : ctx.norms.AG.withoutK) as [number, number];
}

/** Step 5: anion gap with albumin correction. */
export function anionGapStep(ctx: Ctx): AgOutcome {
  const { input, norms, HCO3, settings } = ctx;
  const flags: Flag[] = [];
  const range = agNorm(ctx);
  if (input.Na === undefined || input.Cl === undefined || (settings.agWithK && input.K === undefined)) {
    return {
      step: { id: 'anionGap', status: 'insufficient', explanationKey: 'step.anionGap.insufficient', flags, details: {}, normalRange: range },
    };
  }
  const k = settings.agWithK ? input.K ?? 0 : 0;
  const ag = input.Na + k - (input.Cl + HCO3);
  let agCorr = ag;
  if (input.albumin === undefined) {
    flags.push({ code: 'ag_without_albumin', severity: 'warning' });
  } else {
    agCorr = ag + norms.AG.albuminFactor * (norms.AG.albuminRef - input.albumin);
  }
  const elevated = agCorr > range[1];
  // Hypoalbuminaemia masking: raw AG normal, corrected AG elevated
  if (elevated && ag <= range[1]) flags.push({ code: 'ag_masked_by_albumin', severity: 'warning' });
  return {
    ag,
    agCorr,
    elevated,
    step: {
      id: 'anionGap',
      status: 'done',
      value: agCorr,
      normalRange: range,
      verdict: elevated ? 'elevated' : agCorr < range[0] ? 'low' : 'normal',
      explanationKey: 'step.anionGap.result',
      flags,
      details: { ag, agCorr, albumin: input.albumin },
    },
  };
}

export function classifyDelta(ratio: number, bands: { low: number; mid: number; high: number }): DeltaClass {
  if (ratio < bands.low) return 'normal_ag';
  if (ratio < bands.mid) return 'mixed_ag';
  if (ratio <= bands.high) return 'pure_high_ag';
  return 'plus_met_alk';
}

/** Step 6: delta ratio, only with elevated AG_corr and HCO3 < 24. */
export function deltaStep(ctx: Ctx, ag: AgOutcome): { step: Step; ratio?: number; cls?: DeltaClass } {
  const { norms, HCO3, settings } = ctx;
  if (ag.agCorr === undefined || !ag.elevated || HCO3 >= norms.baseline.HCO3) {
    return {
      step: {
        id: 'deltaRatio',
        status: ag.agCorr === undefined ? 'insufficient' : 'disabled',
        explanationKey: 'step.deltaRatio.notApplicable',
        flags: [],
        details: {},
      },
    };
  }
  const baseAg = settings.agWithK ? norms.AG.deltaBaseWithK : norms.AG.deltaBase;
  const ratio = (ag.agCorr - baseAg) / (norms.baseline.HCO3 - HCO3);
  const cls = classifyDelta(ratio, norms.deltaRatio);
  return {
    ratio,
    cls,
    step: {
      id: 'deltaRatio',
      status: 'done',
      value: ratio,
      normalRange: [norms.deltaRatio.mid, norms.deltaRatio.high],
      verdict: cls,
      explanationKey: 'step.deltaRatio.' + cls,
      flags: [],
      details: { deltaAG: ag.agCorr - baseAg, deltaHCO3: norms.baseline.HCO3 - HCO3 },
    },
  };
}
