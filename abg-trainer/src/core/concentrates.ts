import { kclMmolMl, mix, naclMmolPerL } from './solutions';
import type { Ctx } from './types';
import type { CalciumPlan, PotassiumPlan } from './labs';

/** One hypo-state with the concentrated solution to prepare and the numbers to give it. */
export type ConcentrateItem =
  | {
      id: 'K';
      /** KCl solution in use, %, and its strength in mmol/mL. */
      kclPct: number;
      mmolMl: number;
      doseMmol: number;
      /** KCl concentrate to draw (mL) and the final volume (mL) at the peripheral and the central concentration. */
      stockMl: number;
      peripheral: { conc: number; volumeMl: number; diluentMl: number; maxRateMmolH: number; maxRateMlH: number };
      central: { conc: number; volumeMl: number; diluentMl: number; maxRateMmolH: number; maxRateMlH: number };
    }
  | {
      id: 'Na';
      mmol24h: number;
      /** Volume of 3 % NaCl that carries the 24-h ceiling, and a 100 mL recipe of it. */
      ml3pct: number;
      recipe100: { stockMl: number; diluentMl: number };
      limit: number;
    }
  | { id: 'Ca'; gluconateMl: number; gluconateMlMax?: number; mmol: number }
  | { id: 'glucose'; target: number; recipes: { stockPct: number; stockMl: number; diluentMl: number }[] };

export interface ConcentratePlans {
  potassium?: PotassiumPlan;
  calcium?: CalciumPlan;
  sodium24h?: number;
  naLimit?: number;
  glucoseLow: boolean;
}

/** Concentrated solutions for the hypo-states present: K⁺, Na⁺ (3 % NaCl), Ca²⁺ and glucose. */
export function concentrates(ctx: Ctx, p: ConcentratePlans): ConcentrateItem[] {
  const C = ctx.norms.concentrates;
  const out: ConcentrateItem[] = [];

  if (p.potassium) {
    const k = p.potassium;
    const kclPct = ctx.settings.kclPct && ctx.settings.kclPct > 0 ? ctx.settings.kclPct : C.kclPct;
    const mmolMl = kclMmolMl(kclPct);
    const at = (conc: number, rateMmolH: number) => {
      const volumeMl = (k.doseMmol / conc) * 1000;
      return { conc, volumeMl, diluentMl: volumeMl - k.doseMmol / mmolMl, maxRateMmolH: rateMmolH, maxRateMlH: (rateMmolH / conc) * 1000 };
    };
    out.push({
      id: 'K',
      kclPct,
      mmolMl,
      doseMmol: k.doseMmol,
      stockMl: k.doseMmol / mmolMl,
      peripheral: at(k.concPeripheral, k.maxRateMmolH),
      central: at(k.concCentral, k.maxRateIcuMmolH ?? k.maxRateMmolH),
    });
  }

  if (p.sodium24h && p.sodium24h > 0) {
    const mmolMl = naclMmolPerL(C.naclTarget) / 1000;
    const r = mix(C.naclTarget, 100, C.naclStock, C.naclDiluent);
    out.push({
      id: 'Na',
      mmol24h: p.sodium24h,
      ml3pct: p.sodium24h / mmolMl,
      recipe100: { stockMl: r.stockMl, diluentMl: r.diluentMl },
      limit: p.naLimit ?? ctx.norms.deficits.naMaxRise24h,
    });
  }

  if (p.calcium) {
    out.push({ id: 'Ca', gluconateMl: p.calcium.gluconateMl, gluconateMlMax: p.calcium.gluconateMlMax, mmol: p.calcium.gluconateMl * C.caGluconateMmolMl });
  }

  if (p.glucoseLow) {
    out.push({
      id: 'glucose',
      target: C.glucoseTarget,
      recipes: C.glucoseStocks.map((s) => {
        const r = mix(C.glucoseTarget, 100, s, 0);
        return { stockPct: s, stockMl: r.stockMl, diluentMl: r.diluentMl };
      }),
    });
  }
  return out;
}
