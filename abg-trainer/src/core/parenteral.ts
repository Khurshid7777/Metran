import normsJson from '../content/norms.json';

type PnNorms = typeof normsJson.pn;
export type PnGroup = 'preterm' | 'term_neonate' | 'child' | 'adult';

export interface PnInput {
  group: PnGroup;
  weightKg: number;
  /** Targets per kg per day. */
  aa: number;
  lipid: number;
  /** Glucose infusion rate, mg/kg/min. */
  gir: number;
  /** Total fluid, mL/kg/day. */
  fluid: number;
  na: number;
  k: number;
  /** Product concentrations: amino acid solution %, lipid emulsion %, glucose stock %, NaCl and KCl stocks in mmol/mL. */
  aaPct: number;
  lipidPct: number;
  glucosePct: number;
  naMmolMl: number;
  kMmolMl: number;
}

export type PnWarning =
  | 'aa_high'
  | 'lipid_high'
  | 'gir_high'
  | 'volume_exceeded'
  | 'osm_peripheral'
  | 'glucose_peripheral'
  | 'energy_low'
  | 'energy_high';

export interface PnResult {
  /** Per component: g/day, mL/day and kcal/day. */
  aa: { g: number; ml: number; kcal: number };
  lipid: { g: number; ml: number; kcal: number };
  glucose: { g: number; ml: number; kcal: number };
  na: { mmol: number; ml: number };
  k: { mmol: number; ml: number };
  /** mL/day of water or diluent that completes the total volume (negative = volume exceeded). */
  waterMl: number;
  totalMl: number;
  mlPerHour: number;
  kcalPerDay: number;
  kcalPerKg: number;
  /** Share of energy from protein, glucose and lipid (%). */
  shares: { aa: number; glucose: number; lipid: number };
  /** Glucose concentration and osmolarity of the aqueous admixture (without the lipid emulsion). */
  glucosePct: number;
  osm: number;
  warnings: PnWarning[];
}

/** Parenteral-nutrition arithmetic: volumes of the products, energy, glucose load, osmolarity and limit checks. */
export function planPN(i: PnInput, norms: PnNorms = normsJson.pn): PnResult {
  const w = i.weightKg;
  const aaG = i.aa * w;
  const lipG = i.lipid * w;
  const gluG = (i.gir * 60 * 24 * w) / 1000;
  const emul = (norms.emulsionKcalMl as Record<string, number>)[String(i.lipidPct)] ?? 2;
  const aaMl = aaG / (i.aaPct / 100);
  const lipMl = lipG / (i.lipidPct / 100);
  const gluMl = gluG / (i.glucosePct / 100);
  const naMmol = i.na * w;
  const kMmol = i.k * w;
  const naMl = naMmol / i.naMmolMl;
  const kMl = kMmol / i.kMmolMl;
  const totalMl = i.fluid * w;
  const waterMl = totalMl - aaMl - lipMl - gluMl - naMl - kMl;

  const kcalAa = aaG * norms.kcal.aa;
  const kcalGlu = gluG * norms.kcal.glucose;
  const kcalLip = lipMl * emul;
  const kcal = kcalAa + kcalGlu + kcalLip;

  // Aqueous admixture: everything except the lipid emulsion, which runs separately
  const aqueousMl = Math.max(1, totalMl - lipMl);
  const glucosePct = (gluG / aqueousMl) * 100;
  const osm = (gluG * norms.osm.glucosePerG + aaG * norms.osm.aaPerG + (naMmol + kMmol) * norms.osm.ionPerMmol) / (aqueousMl / 1000);

  const L = norms.limits[i.group] as { gir: number; lipid: number; aminoAcid?: number };
  const warnings: PnWarning[] = [];
  if (L.aminoAcid !== undefined && i.aa > L.aminoAcid) warnings.push('aa_high');
  if (i.lipid > L.lipid) warnings.push('lipid_high');
  if (i.gir > L.gir) warnings.push('gir_high');
  if (waterMl < 0) warnings.push('volume_exceeded');
  if (osm > norms.peripheral.osm) warnings.push('osm_peripheral');
  if (glucosePct > norms.peripheral.glucosePct) warnings.push('glucose_peripheral');
  if (i.group === 'child') {
    const perKg = kcal / w;
    if (perKg < norms.energyChildPN[0]) warnings.push('energy_low');
    else if (perKg > norms.energyChildPN[1]) warnings.push('energy_high');
  }

  const sum = kcal || 1;
  return {
    aa: { g: aaG, ml: aaMl, kcal: kcalAa },
    lipid: { g: lipG, ml: lipMl, kcal: kcalLip },
    glucose: { g: gluG, ml: gluMl, kcal: kcalGlu },
    na: { mmol: naMmol, ml: naMl },
    k: { mmol: kMmol, ml: kMl },
    waterMl,
    totalMl,
    mlPerHour: totalMl / 24,
    kcalPerDay: kcal,
    kcalPerKg: kcal / w,
    shares: { aa: (kcalAa / sum) * 100, glucose: (kcalGlu / sum) * 100, lipid: (kcalLip / sum) * 100 },
    glucosePct,
    osm,
    warnings,
  };
}
