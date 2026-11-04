import { tbwFactor } from './deficits';
import type { Ctx } from './types';

export interface NaCorrectionItem {
  id: string;
  /** Predicted change of serum Na per litre of infusate, mmol/L. */
  deltaPerL: number;
  /** Litres that produce the maximum safe change in 24 h; undefined when the infusate moves Na the wrong way. */
  litres24h?: number;
  mlPerHour?: number;
  wrongDirection: boolean;
}

export interface NaCorrection {
  direction: 'raise' | 'lower';
  tbw: number;
  /** Maximum change in 24 h, mmol/L. */
  limit: number;
  items: NaCorrectionItem[];
}

/** Adrogué–Madias estimate of the effect of 1 L of each infusate on serum sodium. */
export function sodiumCorrection(ctx: Ctx): NaCorrection | undefined {
  const { input, norms } = ctx;
  const D = norms.deficits;
  if (input.weightKg === undefined || input.Na === undefined) return undefined;
  const raise = input.Na < D.naLow;
  const lower = input.Na > D.naHigh;
  if (!raise && !lower) return undefined;
  const tbw = tbwFactor(ctx) * input.weightKg;
  const limit = raise ? D.naMaxRise24h : D.naMaxFall24h;
  const items = D.infusates.map((inf) => {
    const deltaPerL = (inf.Na + inf.K - input.Na!) / (tbw + 1);
    const wrongDirection = raise ? deltaPerL <= 0 : deltaPerL >= 0;
    const litres24h = wrongDirection ? undefined : limit / Math.abs(deltaPerL);
    return { id: inf.id, deltaPerL, litres24h, mlPerHour: litres24h === undefined ? undefined : (litres24h * 1000) / 24, wrongDirection };
  });
  return { direction: raise ? 'raise' : 'lower', tbw, limit, items };
}
