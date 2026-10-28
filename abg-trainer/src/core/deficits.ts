import type { Ctx } from './types';

export interface Deficit {
  id: 'sodium' | 'freeWater' | 'chloride' | 'bicarbHCO3' | 'maintenance';
  /** mmol for sodium/chloride, litres for free water. */
  amount: number;
  /** Safe amount for the first 24 h (sodium/free water), honouring the max rate of change. */
  first24h?: number;
  tbwFactor: number;
  params: Record<string, number>;
}

/** Fraction of body weight that is water, by age (sex unknown → 0.6 for adults). */
export function tbwFactor(ctx: Ctx): number {
  return ctx.norms.deficits.tbw[ctx.input.ageCategory];
}

/** Electrolyte and water deficits that follow from the sample; each needs the weight. */
export function deficits(ctx: Ctx, metabolicAlkalosis: boolean, metabolicAcidosis = false): Deficit[] {
  const { input, norms } = ctx;
  const D = norms.deficits;
  const w = input.weightKg;
  if (w === undefined) return [];
  const f = tbwFactor(ctx);
  const tbw = f * w;
  const out: Deficit[] = [];
  if (input.Na !== undefined && input.Na < D.naLow) {
    // Adrogué–Madias: Na deficit = TBW × (target − Na); limit the rise to 8 mmol/L in 24 h
    const amount = tbw * (D.naTarget - input.Na);
    const first24h = tbw * Math.min(D.naTarget - input.Na, D.naMaxRise24h);
    out.push({ id: 'sodium', amount, first24h, tbwFactor: f, params: { f, w, tbw, Na: input.Na, target: D.naTarget, max: D.naMaxRise24h } });
  }
  if (input.Na !== undefined && input.Na > D.naHigh) {
    // Free water deficit (L) = TBW × (Na / 140 − 1); fall ≤ 10 mmol/L in 24 h
    const amount = tbw * (input.Na / D.waterRefNa - 1);
    const first24h = tbw * (input.Na / Math.max(D.waterRefNa, input.Na - D.naMaxFall24h) - 1);
    out.push({ id: 'freeWater', amount, first24h, tbwFactor: f, params: { f, w, tbw, Na: input.Na, ref: D.waterRefNa, max: D.naMaxFall24h } });
  }
  if (metabolicAlkalosis && input.Cl !== undefined && input.Cl < D.clTarget) {
    // Cl deficit = 0.2 L/kg × weight × (100 − Cl)
    const amount = D.clDistribution * w * (D.clTarget - input.Cl);
    out.push({ id: 'chloride', amount, tbwFactor: D.clDistribution, params: { f: D.clDistribution, w, Cl: input.Cl, target: D.clTarget } });
  }
  if (metabolicAcidosis && ctx.HCO3 < D.bicarbTarget) {
    // Kassirer: HCO3 deficit = 0.5 L/kg × weight × (24 − HCO3) — a second estimate next to the BE-based one
    const amount = D.kassirerFactor * w * (D.bicarbTarget - ctx.HCO3);
    out.push({ id: 'bicarbHCO3', amount, tbwFactor: D.kassirerFactor, params: { f: D.kassirerFactor, w, HCO3: Math.round(ctx.HCO3 * 10) / 10, target: D.bicarbTarget } });
  }
  if (input.ageCategory === 'child' || input.ageCategory === 'adult') {
    // Holliday–Segar 4-2-1: mL/h for the first 10 kg, the next 10 kg and every kg above 20
    let rest = w;
    let mlh = 0;
    for (const [kg, rate] of D.hollidaySegar) {
      const part = Math.min(rest, kg);
      mlh += part * rate;
      rest -= part;
      if (rest <= 0) break;
    }
    out.push({ id: 'maintenance', amount: mlh, first24h: mlh * 24, tbwFactor: 0, params: { w, mlh } });
  }
  return out;
}
