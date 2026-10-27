import type { Deficit } from './deficits';
import type { AbgInput, Norms, Settings, Step, StepId, TreatmentResult } from './types';

/** One formula with the patient's numbers substituted, rendered from the i18n template `work.<key>`. */
export interface Working {
  stepId: StepId | 'treatment' | 'deficits';
  key: string;
  params: Record<string, number | string>;
}

const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Builds the worked calculations shown under each step and in the correction block. */
export function buildWorkings(
  input: AbgInput,
  steps: Step[],
  HCO3: number,
  settings: Settings,
  norms: Norms,
  treatment: TreatmentResult,
  defs: Deficit[],
): Working[] {
  const out: Working[] = [];
  const add = (stepId: Working['stepId'], key: string, params: Working['params']) => out.push({ stepId, key, params });
  const step = (id: StepId) => steps.find((s) => s.id === id);
  const H = r(HCO3);

  const cons = step('consistency');
  if (cons?.verdict === 'calculated') add('consistency', 'hco3Calc', { pCO2: input.pCO2, pH: input.pH, v: H });
  else if (cons) {
    const d = cons.details;
    add('consistency', 'consistency', {
      pH: input.pH, h1: r(d.hMeasured as number), pCO2: input.pCO2, HCO3: H, h2: r(d.hCalc as number), d: r((d.discrepancy as number) * 100),
    });
  }

  const comp = step('compensation');
  if (comp?.status === 'done') {
    const d = comp.details;
    const tol = norms.compensationTolerance;
    if (typeof d.expectedPCO2 === 'number') {
      const exp = r(d.expectedPCO2);
      const acid = comp.explanationKey.endsWith('metabolic_acidosis');
      add('compensation', acid ? 'metAcid' : 'metAlk', { HCO3: H, exp, lo: r(exp - tol), hi: r(exp + tol), pCO2: input.pCO2 });
      if (typeof d.copenhagenPCO2 === 'number') add('compensation', acid ? 'copenAcid' : 'copenAlk', { BE: input.BE!, v: r(d.copenhagenPCO2) });
    } else if (typeof d.expectedAcute === 'number') {
      const acid = comp.explanationKey.endsWith('respiratory_acidosis');
      add('compensation', acid ? 'respAcid' : 'respAlk', { pCO2: input.pCO2, a: r(d.expectedAcute as number), c: r(d.expectedChronic as number), HCO3: H, tol });
    }
  }

  const ag = step('anionGap');
  if (ag?.status === 'done') {
    const d = ag.details;
    if (settings.agWithK) add('anionGap', 'agK', { Na: input.Na!, K: input.K!, Cl: input.Cl!, HCO3: H, ag: r(d.ag as number) });
    else add('anionGap', 'ag', { Na: input.Na!, Cl: input.Cl!, HCO3: H, ag: r(d.ag as number) });
    if (input.albumin !== undefined) add('anionGap', 'agCorr', { ag: r(d.ag as number), alb: r(input.albumin), v: r(d.agCorr as number) });
  }
  const dd = step('deltaRatio');
  if (dd?.status === 'done') {
    const base = settings.agWithK ? norms.AG.deltaBaseWithK : norms.AG.deltaBase;
    add('deltaRatio', 'delta', { agc: r(ag!.value!), base, HCO3: H, v: r(dd.value!, 2) });
  }
  const osm = step('osmolar');
  if (osm?.status === 'done') {
    add('osmolar', 'osm', { Na: input.Na!, glu: input.glucose!, urea: input.urea!, calc: r(osm.details.calc as number), meas: input.measuredOsm!, gap: r(osm.value!) });
  }
  const st = step('stewart');
  if (st?.status === 'done') {
    const d = st.details;
    add('stewart', 'stewart', {
      Na: input.Na!, Cl: input.Cl!, naCl: r(d.naCl as number), alb: r(input.albumin!), albE: r(d.albumin as number),
      lac: r(input.lactate ?? 0), SBE: input.BE!, uma: r(d.uma as number),
    });
  }
  const ox = step('oxygenation');
  if (ox?.status === 'done') {
    const d = ox.details;
    const FiO2 = d.FiO2 as number;
    if (typeof d.PAO2 === 'number') {
      add('oxygenation', 'PAO2', { FiO2, Patm: d.Patm as number, pCO2: input.pCO2, v: r(d.PAO2) });
      add('oxygenation', 'Aa', { PAO2: r(d.PAO2), pO2: input.pO2!, v: r(d.Aa as number) });
      add('oxygenation', 'PF', { pO2: input.pO2!, FiO2, v: Math.round(d.PF as number) });
    }
    if (typeof d.OI === 'number') add('oxygenation', 'OI', { MAP: input.MAP!, FiO2, pO2: input.pO2!, v: r(d.OI) });
    if (typeof d.SF === 'number') add('oxygenation', 'SF', { SpO2: input.SpO2!, FiO2, v: Math.round(d.SF) });
    if (typeof d.OSI === 'number') add('oxygenation', 'OSI', { MAP: input.MAP!, FiO2, SpO2: input.SpO2!, v: r(d.OSI) });
  }
  const labs = step('labs');
  if (labs && typeof labs.details.ctO2 === 'number') {
    add('labs', 'ctO2', { Hb: r(input.Hb! / 10), sO2: input.SaO2!, pO2: input.pO2 ?? 0, v: r(labs.details.ctO2, 1) });
  }

  const b = treatment.bicarbonate;
  if (b) {
    add('treatment', 'bicarb', {
      f: b.factor, w: input.weightKg!, BE: input.BE!, def: r(b.deficit), dose: r(b.firstDose),
      c: b.concentration === '4.2' ? 0.5 : 1, vol: r(b.volumeMl),
    });
  }
  const v = treatment.ventilation;
  if (v) add('treatment', 'vent', { rate: v.currentRate, pCO2: input.pCO2, target: v.targetPCO2, raw: r((v.currentRate * input.pCO2) / v.targetPCO2), next: v.newRate });
  const k = treatment.potassium;
  if (k) {
    add('treatment', k.perKg ? 'kPed' : 'kAdult', { w: input.weightKg!, dose: r(k.doseMmol), rate: r(k.maxRateMmolH), h: r(k.minHours) });
  }
  const ca = treatment.calcium;
  if (ca?.perKg) add('treatment', 'caPed', { w: input.weightKg!, ml: r(ca.gluconateMl), mg: Math.round(ca.gluconateMl * 100) });

  for (const d of defs) {
    const p = d.params;
    if (d.id === 'sodium') add('deficits', 'sodium', { f: p.f, w: p.w, tbw: r(p.tbw), target: p.target, Na: p.Na, v: Math.round(d.amount), max: p.max, first: Math.round(d.first24h!) });
    if (d.id === 'freeWater') add('deficits', 'freeWater', { f: p.f, w: p.w, tbw: r(p.tbw), Na: p.Na, ref: p.ref, v: r(d.amount, 2), max: p.max, first: r(d.first24h!, 2) });
    if (d.id === 'chloride') add('deficits', 'chloride', { f: p.f, w: p.w, target: p.target, Cl: p.Cl, v: Math.round(d.amount) });
  }
  return out;
}
