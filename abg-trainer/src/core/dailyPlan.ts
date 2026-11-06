/** Fluid plan for 24 h: maintenance plus a share of the dehydration deficit and the ongoing losses. */
export interface DailyFluid {
  maintenanceMl: number;
  deficitMl: number;
  lossesMl: number;
  totalMl: number;
  mlPerHour: number;
  mlPerKgDay: number;
}

/**
 * @param maintenanceMlH Holliday–Segar maintenance, mL/h
 * @param weightKg body weight
 * @param dehydrationPct estimated dehydration, % of body weight (deficit = % × weight × 10 mL)
 * @param replaceHours period over which the deficit is replaced (24 or 48 h)
 * @param lossesMl ongoing losses to replace in 24 h (vomiting, diarrhoea, drains, urine excess)
 */
export function dailyFluid(maintenanceMlH: number, weightKg: number, dehydrationPct: number, replaceHours: 24 | 48, lossesMl: number): DailyFluid {
  const maintenanceMl = maintenanceMlH * 24;
  const deficitTotal = dehydrationPct * weightKg * 10;
  const deficitMl = (deficitTotal / replaceHours) * 24;
  const totalMl = maintenanceMl + deficitMl + lossesMl;
  return { maintenanceMl, deficitMl, lossesMl, totalMl, mlPerHour: totalMl / 24, mlPerKgDay: totalMl / weightKg };
}

/** Sodium over time at the largest safe rate of change, until it enters the normal range. */
export function sodiumCorridor(na: number, limitPer24h: number, normal: [number, number]): { hours: number; target: number } {
  const target = na < normal[0] ? normal[0] : na > normal[1] ? normal[1] : na;
  return { hours: (Math.abs(target - na) / limitPer24h) * 24, target };
}
