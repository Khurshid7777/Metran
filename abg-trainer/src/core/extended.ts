import { p50FromPoint, predictedSO2, P50_STD, virtualPO2 } from './odc';
import type { Ctx, Flag } from './types';

export type MetricGroup = 'acidBase' | 'electrolytes' | 'oxygen' | 'temperature' | 'neonatal';
export type MetricVerdict = 'normal' | 'low' | 'high' | 'info';

/** A derived value with its formula (i18n `work.x.<id>`), normal range and verdict. */
export interface Metric {
  group: MetricGroup;
  id: string;
  value: number;
  digits: number;
  unit?: string;
  normal?: [number, number];
  verdict: MetricVerdict;
  params: Record<string, number | string>;
}

const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const verdictOf = (v: number, n?: [number, number]): MetricVerdict => (!n ? 'info' : v < n[0] ? 'low' : v > n[1] ? 'high' : 'normal');

export interface ExtendedInput {
  HCO3: number;
  agCorr?: number;
  PAO2?: number;
  Patm?: number;
  SIDa?: number;
}

/** Extended assessment: secondary acid–base, electrolyte, oxygen and temperature-corrected values. */
export function extendedMetrics(ctx: Ctx, x: ExtendedInput): { metrics: Metric[]; flags: Flag[] } {
  const { input, norms } = ctx;
  const E = norms.extended;
  const m: Metric[] = [];
  const flags: Flag[] = [];
  const add = (group: MetricGroup, id: string, value: number, digits: number, params: Metric['params'], unit?: string, normal?: [number, number]) =>
    m.push({ group, id, value, digits, unit, normal, verdict: verdictOf(value, normal), params });
  const { pH, pCO2 } = input;
  const H = x.HCO3;

  // --- Acid–base ---
  // [H+] in nmol/L
  add('acidBase', 'hPlus', 10 ** (9 - pH), 1, { pH }, 'nmolL', E.hPlus as [number, number]);
  // Van Slyke SBE (the ABL cBase(Ecf) uses the same equation)
  const sbe = 0.93 * (H - 24.4 + 14.83 * (pH - 7.4));
  add('acidBase', 'sbeVanSlyke', sbe, 1, { HCO3: r(H), pH, v: r(sbe) }, 'mmolL', E.sbe as [number, number]);
  if (input.BE !== undefined && Math.abs(sbe - input.BE) > E.sbeMismatch) {
    flags.push({ code: 'sbe_mismatch', severity: 'warning', params: { be: input.BE, calc: r(sbe) } });
  }
  // Expected pH for a purely acute / chronic respiratory change
  const acutePH = 7.4 + E.acutePHperMmHg * (40 - pCO2);
  const chronicPH = 7.4 + E.chronicPHperMmHg * (40 - pCO2);
  add('acidBase', 'pHacute', acutePH, 2, { pCO2, v: r(acutePH, 2) });
  add('acidBase', 'pHchronic', chronicPH, 2, { pCO2, v: r(chronicPH, 2) });
  if (x.agCorr !== undefined) {
    // Corrected bicarbonate: HCO3 + (AG_corr − 12) — what HCO3 would be without the AG acidosis
    const corrHCO3 = H + (x.agCorr - norms.AG.deltaBase);
    add('acidBase', 'hco3Corrected', corrHCO3, 1, { HCO3: r(H), agc: r(x.agCorr), base: norms.AG.deltaBase, v: r(corrHCO3) }, 'mmolL', E.hco3Corrected as [number, number]);
    if (input.albumin !== undefined) {
      const agExp = norms.AG.albuminFactor * input.albumin;
      add('acidBase', 'agExpected', agExp, 1, { alb: input.albumin, v: r(agExp) }, 'mmolL');
    }
    const dAG = x.agCorr - norms.AG.deltaBase;
    if (input.lactate !== undefined && dAG > 0) {
      const share = Math.min(100, (input.lactate / dAG) * 100);
      add('acidBase', 'lactateShare', share, 0, { lac: input.lactate, dAG: r(dAG), v: Math.round(share) }, 'percent');
    }
  }
  // Strong ion gap (Figge): SIDe = HCO3 + albumin charge + phosphate charge; SIG = SIDa − SIDe
  if (x.SIDa !== undefined && input.albumin !== undefined) {
    const albCharge = input.albumin * (0.123 * pH - 0.631);
    const pi = input.phosphate ?? E.defaultPhosphate;
    const piCharge = pi * (0.309 * pH - 0.469);
    const side = H + albCharge + piCharge;
    add('acidBase', 'SIDe', side, 1, { HCO3: r(H), alb: input.albumin, pH, pi, albC: r(albCharge), piC: r(piCharge), v: r(side) }, 'mmolL');
    const sig = x.SIDa - side;
    add('acidBase', 'SIG', sig, 1, { sida: r(x.SIDa), side: r(side), v: r(sig) }, 'mmolL', E.sig as [number, number]);
    if (sig > E.sig[1]) flags.push({ code: 'sig_high', severity: 'warning', params: { v: r(sig) } });
  }

  // --- Electrolytes ---
  if (input.Na !== undefined && input.Cl !== undefined) {
    const diff = input.Na - input.Cl;
    add('electrolytes', 'naClDiff', diff, 0, { Na: input.Na, Cl: input.Cl, v: diff }, 'mmolL', E.naClDiff as [number, number]);
    const ratio = input.Cl / input.Na;
    add('electrolytes', 'clNaRatio', ratio, 2, { Na: input.Na, Cl: input.Cl, v: r(ratio, 2) }, undefined, E.clNaRatio as [number, number]);
    const clCorr = (input.Cl * E.naRef) / input.Na;
    add('electrolytes', 'clCorrected', clCorr, 0, { Cl: input.Cl, Na: input.Na, ref: E.naRef, v: Math.round(clCorr) }, 'mmolL', E.clCorrected as [number, number]);
  }
  if (input.Na !== undefined && input.glucose !== undefined) {
    // Hillier 1999: +2.4 mmol/L Na per 5.55 mmol/L glucose above 5.55
    const naCorr = input.Na + E.naGlucoseFactor * Math.max(0, (input.glucose - 5.55) / 5.55);
    add('electrolytes', 'naCorrected', naCorr, 0, { Na: input.Na, glu: input.glucose, v: Math.round(naCorr) }, 'mmolL', [135, 145]);
    const eff = 2 * input.Na + input.glucose;
    add('electrolytes', 'osmEffective', eff, 0, { Na: input.Na, glu: input.glucose, v: Math.round(eff) }, 'mosm', E.osmEffective as [number, number]);
    if (input.urea !== undefined) {
      const calc = 2 * input.Na + input.glucose + input.urea;
      add('electrolytes', 'osmCalculated', calc, 0, { Na: input.Na, glu: input.glucose, urea: input.urea, v: Math.round(calc) }, 'mosm', E.osmCalc as [number, number]);
    }
  }
  if (input.iCa !== undefined) {
    // Radiometer: log cCa2+(7.4) = log cCa2+ − 0.24 × (7.4 − pH)
    const ca74 = input.iCa * 10 ** (-0.24 * (7.4 - pH));
    add('electrolytes', 'ca74', ca74, 2, { ca: input.iCa, pH, v: r(ca74, 2) }, 'mmolL', [1.15, 1.3]);
  }
  if (input.glucose !== undefined) add('electrolytes', 'glucoseMg', input.glucose * 18.016, 0, { g: input.glucose, v: Math.round(input.glucose * 18.016) }, 'mgdl');

  // --- Oxygen ---
  const arterial = input.sampleType === 'arterial';
  if (arterial && input.pO2 !== undefined && x.PAO2 !== undefined) {
    const aA = input.pO2 / x.PAO2;
    add('oxygen', 'aARatio', aA, 2, { pO2: input.pO2, PAO2: r(x.PAO2), v: r(aA, 2) }, undefined, [E.aARatioMin, 1]);
    const ri = (x.PAO2 - input.pO2) / input.pO2;
    add('oxygen', 'RI', ri, 2, { PAO2: r(x.PAO2), pO2: input.pO2, v: r(ri, 2) });
    if (input.Hb !== undefined && input.SaO2 !== undefined) {
      // Shunt from the content equation, assuming C(a−v)O2 = 5.15 mL/dL (2.3 mmol/L, as on Radiometer analyzers)
      const hb = input.Hb / 10;
      const cc = 1.39 * hb + 0.003 * x.PAO2;
      const ca = 1.39 * hb * (input.SaO2 / 100) + 0.003 * input.pO2;
      const shunt = ((cc - ca) / (cc - ca + E.avDiff)) * 100;
      add('oxygen', 'shunt', shunt, 0, { cc: r(cc), ca: r(ca), av: E.avDiff, v: Math.round(shunt) }, 'percent', [0, E.shuntMax]);
      if (shunt > E.shuntMax) flags.push({ code: 'shunt_high', severity: 'warning', params: { v: Math.round(shunt) } });
    }
    if (input.ageCategory === 'adult' && input.ageYears !== undefined) {
      const expected = 104.2 - 0.27 * input.ageYears;
      add('oxygen', 'pO2Expected', expected, 0, { age: input.ageYears, v: Math.round(expected) }, 'mmHg');
    }
  }
  if (input.FiO2 !== undefined && x.Patm !== undefined) {
    const pio2 = input.FiO2 * (x.Patm - norms.oxygenation.waterVapour);
    add('oxygen', 'PIO2', pio2, 0, { FiO2: input.FiO2, Patm: x.Patm, v: Math.round(pio2) }, 'mmHg');
  }
  if (input.pO2 !== undefined) {
    const temp = input.temperature ?? 37;
    const pv = virtualPO2(input.pO2, pH, pCO2, temp);
    const pred = predictedSO2(input.pO2, pH, pCO2, temp);
    add('oxygen', 'sO2Predicted', pred, 0, { pO2: input.pO2, pH, pCO2, t: temp, pv: r(pv), v: Math.round(pred) }, 'percent');
    if (input.SaO2 !== undefined) {
      const p50 = p50FromPoint(input.pO2, input.SaO2);
      if (p50 !== undefined) {
        add('oxygen', 'p50', p50, 1, { std: P50_STD, pO2: input.pO2, sO2: input.SaO2, v: r(p50) }, 'mmHg', E.p50 as [number, number]);
      }
      if (Math.abs(pred - input.SaO2) > E.sO2PredictedGap) {
        flags.push({ code: 'so2_mismatch', severity: 'warning', params: { meas: input.SaO2, pred: Math.round(pred) } });
      }
    }
  }
  if (input.SaO2 !== undefined && (input.FCOHb !== undefined || input.FMetHb !== undefined)) {
    const fo2hb = input.SaO2 * (1 - ((input.FCOHb ?? 0) + (input.FMetHb ?? 0)) / 100);
    add('oxygen', 'FO2Hb', fo2hb, 1, { s: input.SaO2, co: input.FCOHb ?? 0, met: input.FMetHb ?? 0, v: r(fo2hb) }, 'percent', [94, 99]);
  }
  if (input.etCO2 !== undefined) {
    const vdvt = (pCO2 - input.etCO2) / pCO2;
    add('oxygen', 'deadSpace', vdvt, 2, { pCO2, et: input.etCO2, v: r(vdvt, 2) }, undefined, E.deadSpace as [number, number]);
    if (vdvt > E.deadSpaceHigh) flags.push({ code: 'dead_space_high', severity: 'warning', params: { v: r(vdvt, 2) } });
  }
  if (input.Hb !== undefined) {
    add('oxygen', 'hct', (input.Hb / 10) * 3, 0, { hb: r(input.Hb / 10), v: Math.round((input.Hb / 10) * 3) }, 'percent');
    add('oxygen', 'o2Capacity', 1.39 * (input.Hb / 10), 1, { hb: r(input.Hb / 10), v: r(1.39 * (input.Hb / 10)) }, 'mldl');
  }

  // --- Temperature correction (when the patient's temperature is entered) ---
  if (input.temperature !== undefined && input.temperature !== 37) {
    const dT = input.temperature - 37;
    const pHT = pH - 0.0147 * dT;
    const pCO2T = pCO2 * 10 ** (0.019 * dT);
    add('temperature', 'pHT', pHT, 3, { pH, t: input.temperature, v: r(pHT, 3) });
    add('temperature', 'pCO2T', pCO2T, 1, { pCO2, t: input.temperature, v: r(pCO2T) }, 'mmHg');
  }

  // --- Neonatal: bilirubin in mg/dL and bilirubin/albumin ratio ---
  if (input.bilirubin !== undefined) {
    const mg = input.bilirubin / 17.1;
    add('neonatal', 'biliMg', mg, 1, { b: input.bilirubin, v: r(mg) }, 'mgdl');
    if (input.albumin !== undefined) {
      const ba = mg / (input.albumin / 10);
      const ga = input.gestationalWeeks ?? (input.ageCategory === 'term_neonate' ? 39 : 34);
      const thr = ga >= 38 ? (input.biliRisk ? E.baRatio.risk38 : E.baRatio.well38) : input.biliRisk ? E.baRatio.risk35 : E.baRatio.well35;
      add('neonatal', 'baRatio', ba, 1, { mg: r(mg), alb: r(input.albumin / 10), v: r(ba), thr }, undefined, ga >= 35 ? [0, thr] : undefined);
      if (ga >= 35 && ba >= thr) flags.push({ code: 'ba_ratio_high', severity: 'warning', params: { v: r(ba), thr } });
    }
  }
  return { metrics: m, flags };
}
