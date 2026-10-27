import type { Ctx, Flag, Step } from './types';

export interface PotassiumPlan {
  doseMmol: number;
  maxRateMmolH: number;
  /** ICU with ECG monitoring (children/neonates only). */
  maxRateIcuMmolH?: number;
  minHours: number;
  concPeripheral: number;
  concCentral: number;
  perKg: boolean;
}

export interface CalciumPlan {
  gluconateMl: number;
  gluconateMlMax?: number;
  perKg: boolean;
}

export interface LabsOutcome {
  step: Step;
  potassium?: PotassiumPlan;
  calcium?: CalciumPlan;
}

const neonate = (age: string) => age === 'preterm' || age === 'term_neonate';

/** Lower limit of normal haemoglobin, g/L, by age (WHO 2024; neonatal ranges from reference tables). */
export function hbLowerLimit(ctx: Ctx): number {
  const { input, norms } = ctx;
  const h = norms.labs.hbLower;
  if (neonate(input.ageCategory)) {
    if (input.ageHours === undefined || input.ageHours < 168) return input.ageCategory === 'preterm' ? h.preterm_0_7d : h.term_0_7d;
    return h.neonate_1_4w;
  }
  if (input.ageCategory === 'adult') return h.adult;
  const y = input.ageYears;
  if (y === undefined) return h.m24_59;
  if (y < 0.5) return h.infant_1_6m;
  if (y < 2) return h.m6_23;
  if (y < 5) return h.m24_59;
  if (y < 12) return h.y5_11;
  if (y < 15) return h.y12_14;
  return h.adult;
}

/** Restrictive transfusion threshold (g/L). Preterm: TOP trial by postnatal week and respiratory support. */
export function transfusionThreshold(ctx: Ctx): number | undefined {
  const { input, norms } = ctx;
  const t = norms.labs.transfusion;
  if (input.ageCategory === 'preterm') {
    if (input.ageHours === undefined) return undefined;
    const support =
      (input.FiO2 !== undefined && input.FiO2 > norms.oxygenation.airFiO2Max) || input.ventilation !== undefined || input.MAP !== undefined || input.PEEP !== undefined;
    const week = input.ageHours < 168 ? t.topWeek1 : input.ageHours < 336 ? t.topWeek2 : t.topWeek3;
    return support ? week[0] : week[1];
  }
  if (input.ageCategory === 'term_neonate') return undefined;
  return input.ageCategory === 'child' ? t.child : t.adult;
}

/** Step 10: haemoglobin, co-oximetry, potassium, calcium, glucose, lactate, bilirubin — age-specific. */
export function labsStep(ctx: Ctx): LabsOutcome {
  const { input, norms } = ctx;
  const L = norms.labs;
  const age = input.ageCategory;
  const flags: Flag[] = [];
  const details: Step['details'] = {};
  let potassium: PotassiumPlan | undefined;
  let calcium: CalciumPlan | undefined;

  // Haemoglobin and oxygen content
  if (input.Hb !== undefined) {
    const lo = hbLowerLimit(ctx);
    details.HbLower = lo;
    if (input.Hb < lo) flags.push({ code: 'anemia', severity: 'warning', params: { hb: input.Hb, lo } });
    const thr = transfusionThreshold(ctx);
    if (thr !== undefined) {
      details.transfusionThreshold = thr;
      if (input.Hb < thr) flags.push({ code: age === 'preterm' ? 'hb_transfusion_preterm' : 'hb_transfusion', severity: 'critical', params: { hb: input.Hb, thr } });
    }
    if (input.SaO2 !== undefined) {
      // ctO2 (mL/dL) = 1.39 × Hb (g/dL) × sO2 + 0.003 × pO2
      details.ctO2 = 1.39 * (input.Hb / 10) * (input.SaO2 / 100) + 0.003 * (input.pO2 ?? 0);
    }
  }
  if (input.SaO2 !== undefined && input.SpO2 !== undefined && Math.abs(input.SpO2 - input.SaO2) > L.spo2Gap) {
    flags.push({ code: 'spo2_sao2_gap', severity: 'warning', params: { gap: Math.round(Math.abs(input.SpO2 - input.SaO2)) } });
  }

  // Co-oximetry
  if (input.FCOHb !== undefined) {
    const c = L.COHb;
    if (input.FCOHb > c.hbo) flags.push({ code: 'cohb_hbo', severity: 'critical', params: { v: input.FCOHb } });
    else if (input.FCOHb > c.smoker) flags.push({ code: 'cohb_poisoning', severity: 'critical', params: { v: input.FCOHb } });
    else if (input.FCOHb > c.nonSmoker) flags.push({ code: neonate(age) ? 'cohb_neonate' : 'cohb_elevated', severity: 'warning', params: { v: input.FCOHb } });
  }
  if (input.FMetHb !== undefined) {
    const m = L.MetHb;
    if (input.FMetHb > m.treatAlways) flags.push({ code: 'methb_treat', severity: 'critical', params: { v: input.FMetHb } });
    else if (input.FMetHb > m.symptomatic) flags.push({ code: 'methb_symptomatic', severity: 'critical', params: { v: input.FMetHb } });
    else if (input.FMetHb > m.cyanosis) flags.push({ code: 'methb_cyanosis', severity: 'warning', params: { v: input.FMetHb } });
    else if (input.FMetHb > m.normal) flags.push({ code: 'methb_elevated', severity: 'info', params: { v: input.FMetHb } });
  }

  // Potassium
  if (input.K !== undefined) {
    const k = L.K;
    const K = input.K;
    if (K < k.severe) flags.push({ code: 'hypokalemia_severe', severity: 'critical', params: { K } });
    else if (K < k.moderate) flags.push({ code: 'hypokalemia', severity: 'critical', params: { K } });
    else if (K < k.mild) flags.push({ code: 'hypokalemia_mild', severity: 'warning', params: { K } });
    else if (K >= k.hyperSevere) flags.push({ code: 'hyperkalemia_severe', severity: 'critical', params: { K } });
    else if (K >= k.hyperModerate) flags.push({ code: 'hyperkalemia', severity: 'critical', params: { K } });
    else if (K >= k.hyperMild) flags.push({ code: 'hyperkalemia_mild', severity: 'warning', params: { K } });
    if (K < k.moderate && input.weightKg !== undefined) {
      const perKg = age !== 'adult';
      const dose = perKg ? k.pedDoseMmolKg * input.weightKg : k.adultDoseMmol;
      const rate = perKg ? k.pedMaxRate * input.weightKg : k.adultRatePeripheral;
      potassium = {
        doseMmol: dose,
        maxRateMmolH: rate,
        maxRateIcuMmolH: perKg ? k.pedMaxRateICU * input.weightKg : k.adultRateCentral,
        minHours: dose / rate,
        concPeripheral: k.concPeripheral,
        concCentral: k.concCentral,
        perKg,
      };
    }
  }

  // Ionised calcium (actual cCa2+, not cCa2+(7.4))
  if (input.iCa !== undefined) {
    const c = L.iCa;
    const ca = input.iCa;
    let treat = false;
    if (age === 'preterm') {
      if (ca < c.pretermStableTreat) {
        flags.push({ code: 'hypocalcemia_severe', severity: 'critical', params: { ca } });
        treat = true;
      } else if (ca < c.termTreat) flags.push({ code: 'hypocalcemia_preterm', severity: 'warning', params: { ca } });
    } else if (age === 'term_neonate') {
      if (ca < c.termTreat) {
        flags.push({ code: 'hypocalcemia', severity: 'warning', params: { ca } });
        treat = true;
      }
    } else if (ca < c.severe) {
      flags.push({ code: 'hypocalcemia_severe', severity: 'critical', params: { ca } });
      treat = true;
    } else if (ca < c.significant) {
      flags.push({ code: 'hypocalcemia', severity: 'warning', params: { ca } });
      treat = true;
    } else if (ca < c.normal[0]) flags.push({ code: 'hypocalcemia_mild', severity: 'info', params: { ca } });
    if (treat && (input.weightKg !== undefined || age === 'adult')) {
      calcium =
        age === 'adult'
          ? { gluconateMl: c.adultGluconateMl[0], gluconateMlMax: c.adultGluconateMl[1], perKg: false }
          : { gluconateMl: Math.min(c.gluconateMlKg * input.weightKg!, c.gluconateMaxMl), perKg: true };
    }
  }

  // Glucose
  if (input.glucose !== undefined) {
    const g = L.glucose;
    const G = input.glucose;
    if (neonate(age)) {
      const early = input.ageHours === undefined || input.ageHours < 48;
      if (G < g.neoIV) flags.push({ code: 'glucose_neo_iv', severity: 'critical', params: { g: G } });
      else if (G < g.neoAct) flags.push({ code: 'glucose_neo_low', severity: 'critical', params: { g: G } });
      else if (G < (early ? g.neoTarget48h : g.neoTargetAfter)) {
        flags.push({ code: 'glucose_neo_target', severity: 'warning', params: { g: G, t: early ? g.neoTarget48h : g.neoTargetAfter } });
      } else if (G > g.neoInsulin) flags.push({ code: 'glucose_neo_insulin', severity: 'warning', params: { g: G } });
      else if (G > g.neoHyper) flags.push({ code: 'glucose_neo_high', severity: 'info', params: { g: G } });
    } else {
      const severe = age === 'child' ? g.childL2 : g.adultSevere;
      const low = age === 'child' ? g.childL1 : g.adultHypo;
      if (G < severe) flags.push({ code: 'hypoglycemia_severe', severity: 'critical', params: { g: G } });
      else if (G < low) flags.push({ code: 'hypoglycemia', severity: 'warning', params: { g: G } });
      else if (G > g.dka && (input.pH < 7.3 || ctx.HCO3 < 18)) flags.push({ code: 'dka_criteria', severity: 'critical', params: { g: G } });
      else if (age === 'adult' && G > g.adultInsulin) flags.push({ code: 'glucose_icu_high', severity: 'info', params: { g: G } });
    }
  }

  // Lactate
  if (input.lactate !== undefined) {
    const l = L.lactate;
    const lac = input.lactate;
    if (input.sampleType === 'cord_artery' || input.sampleType === 'cord_vein') {
      if (lac > l.cord) flags.push({ code: 'lactate_cord', severity: 'warning', params: { l: lac } });
    } else if (neonate(age)) {
      const early = input.ageHours !== undefined && input.ageHours < l.neoEarlyHours;
      if (lac > (early ? l.neoEarly : l.neoLate)) flags.push({ code: 'lactate_neo', severity: 'warning', params: { l: lac } });
    } else if (lac >= l.severe) flags.push({ code: 'lactate_severe', severity: 'critical', params: { l: lac } });
    else if (lac >= l.high) flags.push({ code: 'lactate_high', severity: 'warning', params: { l: lac } });
  }

  // Bilirubin (neonates)
  if (input.bilirubin !== undefined && neonate(age)) {
    const ga = input.gestationalWeeks ?? (age === 'term_neonate' ? 39 : undefined);
    if (ga !== undefined && ga < 35) {
      const band = L.bilirubinPreterm.find((b) => ga < b.gaMax) ?? L.bilirubinPreterm[L.bilirubinPreterm.length - 1];
      details.biliPhoto = band.photo[0];
      details.biliExchange = band.exchange[0];
      const p = { b: input.bilirubin, photo: `${band.photo[0]}–${band.photo[1]}`, ex: `${band.exchange[0]}–${band.exchange[1]}` };
      if (input.bilirubin >= band.exchange[0]) flags.push({ code: 'bili_exchange', severity: 'critical', params: p });
      else if (input.bilirubin >= band.photo[0]) flags.push({ code: 'bili_photo', severity: 'warning', params: p });
      else flags.push({ code: 'bili_below_preterm', severity: 'info', params: p });
    } else {
      flags.push({ code: 'bili_aap', severity: 'info', params: { b: input.bilirubin, h: input.ageHours ?? '—' } });
    }
  }

  const any = [input.Hb, input.FCOHb, input.FMetHb, input.K, input.iCa, input.glucose, input.lactate, input.bilirubin].some((v) => v !== undefined);
  return {
    potassium,
    calcium,
    step: {
      id: 'labs',
      status: any ? 'done' : 'insufficient',
      verdict: any ? (flags.some((f) => f.severity === 'critical') ? 'labs_critical' : flags.length ? 'labs_attention' : 'labs_normal') : undefined,
      explanationKey: any ? 'step.labs.result' : 'step.labs.insufficient',
      flags,
      details,
    },
  };
}
