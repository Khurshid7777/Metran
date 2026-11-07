import normsJson from '../content/norms.json';

type Inf = typeof normsJson.infusion;

export interface InfusionInput {
  group: 'child' | 'adult';
  weightKg: number;
  /** Adults: water, mL/kg/day. */
  adultMlKgDay?: number;
  /** Share of the calculated maintenance actually given, % (100 = no restriction). */
  restrictionPct: number;
  /** Body temperature, °C, and the correction per degree above `feverFrom`, %; 0 = no correction. */
  temperature?: number;
  feverPctPerDeg: number;
  dehydrationPct: number;
  replaceHours: 24 | 48;
  lossesMl: number;
}

export interface HsBand {
  kg: number;
  mlKgDay: number;
  ml: number;
}

export interface InfusionPlan {
  /** Holliday–Segar bands used (children) — the weight in each band and its contribution. */
  bands: HsBand[];
  maintenanceMl: number;
  restrictedMl: number;
  feverMl: number;
  deficitMl: number;
  deficitTotalMl: number;
  lossesMl: number;
  totalMl: number;
  mlPerHour: number;
  mlPerKgDay: number;
  bolusMl: number;
  bolusMinutes: number;
  /** Adults: daily Na/K/Cl (mmol) and glucose (g) for routine maintenance. */
  electrolytesMmol?: number;
  glucoseG?: [number, number];
}

export function hollidaySegar(weightKg: number, inf: Inf = normsJson.infusion): HsBand[] {
  let rest = weightKg;
  const out: HsBand[] = [];
  for (const [kg, rate] of inf.hsPerDay) {
    const part = Math.min(rest, kg);
    if (part <= 0) break;
    out.push({ kg: part, mlKgDay: rate, ml: part * rate });
    rest -= part;
  }
  return out;
}

/** Daily IV fluid plan: maintenance (Holliday–Segar or adult mL/kg), restriction, fever, deficit and losses. */
export function infusionPlan(i: InfusionInput, inf: Inf = normsJson.infusion): InfusionPlan {
  const w = i.weightKg;
  const bands = i.group === 'child' ? hollidaySegar(w, inf) : [];
  const maintenanceMl = i.group === 'child' ? bands.reduce((s, b) => s + b.ml, 0) : (i.adultMlKgDay ?? inf.adultMlKgDay[0]) * w;
  const restrictedMl = (maintenanceMl * i.restrictionPct) / 100;
  const over = i.temperature !== undefined ? Math.max(0, i.temperature - inf.feverFrom) : 0;
  const feverMl = (restrictedMl * i.feverPctPerDeg * over) / 100;
  const deficitTotalMl = i.dehydrationPct * w * 10;
  const deficitMl = (deficitTotalMl / i.replaceHours) * 24;
  const totalMl = restrictedMl + feverMl + deficitMl + i.lossesMl;
  const adult = i.group === 'adult';
  return {
    bands,
    maintenanceMl,
    restrictedMl,
    feverMl,
    deficitMl,
    deficitTotalMl,
    lossesMl: i.lossesMl,
    totalMl,
    mlPerHour: totalMl / 24,
    mlPerKgDay: totalMl / w,
    bolusMl: adult ? inf.adultBolusMl : inf.bolusMlKg * w,
    bolusMinutes: adult ? inf.adultBolusMinutes : inf.bolusMinutes,
    electrolytesMmol: adult ? inf.adultElectrolytesMmolKg * w : undefined,
    glucoseG: adult ? (inf.adultGlucoseG as [number, number]) : undefined,
  };
}
