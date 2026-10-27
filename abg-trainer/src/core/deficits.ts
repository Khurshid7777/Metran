import type { Ctx } from './types';

export interface Deficit {
  id: 'sodium' | 'freeWater' | 'chloride';
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
export function deficits(ctx: Ctx, metabolicAlkalosis: boolean): Deficit[] {
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
  return out;
}
