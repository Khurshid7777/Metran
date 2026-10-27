import { categoryNorms } from './primary';
import type { AcidosisType, BicarbResult, Ctx, Disorder, Flag, TreatmentResult, VentResult } from './types';

export interface TreatmentContext {
  disorders: Disorder[];
  acidosisType?: AcidosisType;
  oxygenationPoor: boolean;
  hyperoxia: boolean;
  /** Ventilation judged adequate (no respiratory acidosis). */
  ventilationAdequate: boolean;
}

/** HCO3 deficit (mmol) = factor · weight · |BE|. */
export function bicarbDeficit(weightKg: number, BE: number, factor = 0.3): number {
  return factor * weightKg * Math.abs(BE);
}

export function bicarbonate(ctx: Ctx, t: TreatmentContext): BicarbResult | undefined {
  const { input, norms, settings } = ctx;
  if (input.weightKg === undefined || input.BE === undefined || input.BE >= 0) return undefined;
  if (!t.disorders.includes('metabolic_acidosis')) return undefined;
  const tr = norms.treatment;
  const factor = settings.bicarbFactor ?? tr.bicarbFactor;
  const deficit = bicarbDeficit(input.weightKg, input.BE, factor);
  const firstDose = deficit * tr.firstDoseFraction;
  const infant =
    input.ageCategory === 'preterm' ||
    input.ageCategory === 'term_neonate' ||
    (input.ageCategory === 'child' && input.ageYears !== undefined && input.ageYears < 1);
  const concentration: '4.2' | '8.4' = infant ? '4.2' : '8.4';
  const volumeMl = firstDose / (infant ? tr.conc42 : tr.conc84);

  const blockers: Flag[] = [];
  const warnings: Flag[] = [];
  if (t.disorders.includes('respiratory_acidosis') || !t.ventilationAdequate) {
    blockers.push({ code: 'bicarb_resp_acidosis', severity: 'block' });
  }
  const lactic = input.lactate !== undefined && input.lactate >= tr.lactateAcidosis;
  const keto = input.glucose !== undefined && input.glucose >= norms.electrolytes.glucoseDKA && t.acidosisType !== 'normal_ag';
  // Lactic acidosis: SSC 2021 — no bicarbonate while pH ≥ 7.2; DKA: ADA — only if pH < 7.0
  if (lactic && input.pH >= tr.severeAcidosisPH) {
    blockers.push({ code: 'bicarb_lactic', severity: 'block', params: { pH: tr.severeAcidosisPH } });
  } else if (!lactic && keto && input.pH >= tr.dkaBicarbPH) {
    blockers.push({ code: 'bicarb_keto', severity: 'block', params: { pH: tr.dkaBicarbPH } });
  }
  if (input.Na !== undefined && input.Na > tr.hypernatremia) blockers.push({ code: 'bicarb_hypernatremia', severity: 'block' });
  if (input.iCa !== undefined && input.iCa < norms.electrolytes.iCaLow) blockers.push({ code: 'bicarb_hypocalcemia', severity: 'block' });
  if (input.ageCategory === 'preterm') warnings.push({ code: 'bicarb_preterm_ivh', severity: 'warning' });
  if (input.ageCategory === 'preterm' || input.ageCategory === 'term_neonate') {
    warnings.push({ code: 'bicarb_neonatal_slow', severity: 'warning', params: { min: tr.neonatalInfusionMinutes } });
  }
  if (t.acidosisType === 'normal_ag') warnings.push({ code: 'bicarb_normal_ag', severity: 'info' });

  return { deficit, firstDose, concentration, volumeMl, factor, blocked: blockers.length > 0, blockers, warnings };
}

/** Conventional ventilation: new rate = current rate · pCO2 current / pCO2 target (constant tidal volume). */
export function ventilationRate(ctx: Ctx): VentResult | undefined {
  const { input, norms } = ctx;
  const v = input.ventilation;
  if (!v || v.mode !== 'conventional' || v.rate === undefined) return undefined;
  const n = categoryNorms(norms, input.ageCategory, input.sampleType, input.bpd);
  const [lo, hi] = n.pCO2Target;
  if (input.pCO2 >= lo && input.pCO2 <= hi) return undefined;
  const targetPCO2 = input.pCO2 > hi ? hi : lo;
  const raw = (v.rate * input.pCO2) / targetPCO2;
  const limits = norms.ventilation.rateLimits[input.ageCategory] as [number, number];
  const rounded = Math.round(raw);
  const newRate = Math.min(Math.max(rounded, limits[0]), limits[1]);
  return { currentRate: v.rate, targetPCO2, newRate, limits, outOfLimits: rounded !== newRate };
}

export function treatment(ctx: Ctx, t: TreatmentContext): TreatmentResult {
  const { input, norms } = ctx;
  const hfoHints: string[] = [];
  const causeHints: string[] = [];
  const n = categoryNorms(norms, input.ageCategory, input.sampleType, input.bpd);
  if (input.ventilation?.mode === 'hfo') {
    if (input.pCO2 > n.pCO2Target[1]) hfoHints.push('treat.hfo.lowerPCO2');
    if (input.pCO2 < n.pCO2Target[0]) hfoHints.push('treat.hfo.raisePCO2');
  }
  if (t.oxygenationPoor) hfoHints.push('treat.hfo.oxygenation');
  if (t.hyperoxia) hfoHints.push('treat.hfo.hyperoxia');

  const lactic = input.lactate !== undefined && input.lactate >= norms.treatment.lactateAcidosis;
  if (t.disorders.includes('metabolic_acidosis')) {
    if (lactic) causeHints.push('treat.cause.lactate');
    if (t.acidosisType === 'normal_ag' || t.acidosisType === 'mixed_ag') causeHints.push('treat.cause.saline');
  }
  if (t.disorders.includes('metabolic_alkalosis')) causeHints.push('treat.cause.chlorideAlkalosis');

  const bicarb = bicarbonate(ctx, t);
  const vent = ventilationRate(ctx);
  return {
    available: Boolean(bicarb || vent || hfoHints.length || causeHints.length),
    bicarbonate: bicarb,
    ventilation: vent,
    hfoHints,
    causeHints,
  };
}
