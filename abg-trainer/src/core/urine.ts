import type { AcidosisType, Ctx, Disorder, Flag } from './types';

export interface UrineAssessment {
  /** Urine anion gap UNa + UK − UCl, mmol/L (normal-AG metabolic acidosis). */
  uag?: number;
  uagClass?: 'negative' | 'positive';
  /** Urine chloride class in metabolic alkalosis. */
  clClass?: 'responsive' | 'resistant' | 'intermediate';
  /** Fractional excretion of sodium and urea, %. */
  fena?: number;
  fenaClass?: 'prerenal' | 'intrinsic' | 'intermediate';
  feurea?: number;
  feureaClass?: 'prerenal' | 'other';
}

export interface UrineOutcome {
  assessment?: UrineAssessment;
  flags: Flag[];
}

/** Urine indices that refine the acid–base and volume diagnosis; only what the entered values allow. */
export function urineAssessment(ctx: Ctx, disorders: Disorder[], acidosisType: AcidosisType | undefined): UrineOutcome {
  const { input, norms } = ctx;
  const U = norms.urine;
  const flags: Flag[] = [];
  const a: UrineAssessment = {};

  if (input.urineNa !== undefined && input.urineK !== undefined && input.urineCl !== undefined) {
    const uag = input.urineNa + input.urineK - input.urineCl;
    // Informative in metabolic acidosis without an elevated anion gap
    if (disorders.includes('metabolic_acidosis') && acidosisType !== 'high_ag') {
      a.uag = uag;
      a.uagClass = uag < U.uagNegative ? 'negative' : 'positive';
      flags.push({ code: a.uagClass === 'negative' ? 'urine_ag_negative' : 'urine_ag_positive', severity: 'info', params: { uag: Math.round(uag) } });
    }
  }
  if (input.urineCl !== undefined && disorders.includes('metabolic_alkalosis')) {
    a.clClass = input.urineCl < U.clResponsive ? 'responsive' : input.urineCl > U.clResistant ? 'resistant' : 'intermediate';
    if (a.clClass !== 'intermediate') flags.push({ code: 'urine_cl_' + a.clClass, severity: 'info', params: { cl: input.urineCl } });
  }

  const adultOrChild = input.ageCategory === 'child' || input.ageCategory === 'adult';
  if (adultOrChild && input.creatinine !== undefined && input.urineCreatinine !== undefined) {
    if (input.urineNa !== undefined && input.Na !== undefined) {
      a.fena = (input.urineNa * input.creatinine) / (input.Na * input.urineCreatinine) * 100;
      a.fenaClass = a.fena < U.fenaPrerenal ? 'prerenal' : a.fena > U.fenaIntrinsic ? 'intrinsic' : 'intermediate';
      if (a.fenaClass !== 'intermediate') flags.push({ code: 'fena_' + a.fenaClass, severity: 'info', params: { fe: Math.round(a.fena * 100) / 100 } });
    }
    if (input.urineUrea !== undefined && input.urea !== undefined) {
      a.feurea = (input.urineUrea * input.creatinine) / (input.urea * input.urineCreatinine) * 100;
      a.feureaClass = a.feurea < U.feureaPrerenal ? 'prerenal' : 'other';
      if (a.feureaClass === 'prerenal') flags.push({ code: 'feurea_prerenal', severity: 'info', params: { fe: Math.round(a.feurea) } });
    }
  }
  return { assessment: Object.keys(a).length ? a : undefined, flags };
}
