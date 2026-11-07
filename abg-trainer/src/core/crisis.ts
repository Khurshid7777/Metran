import type { Ctx } from './types';
import type { HyperKPlan } from './hyperK';
import type { CalciumPlan, PotassiumPlan } from './labs';

export type CrisisId = 'K' | 'Na' | 'iCa' | 'Mg' | 'phosphate' | 'glucose' | 'lactate' | 'pH';
export type CrisisLevel = 'mild' | 'moderate' | 'severe';

/** A coloured stretch of the value axis. */
export interface Zone {
  from: number;
  to: number;
  kind: 'normal' | CrisisLevel;
}

/** One abnormal analyte with its place on a scale and the short actions that go with it. */
export interface Crisis {
  id: CrisisId;
  dir: 'low' | 'high';
  level: CrisisLevel;
  value: number;
  normal: [number, number];
  scale: [number, number];
  zones: Zone[];
  /** i18n keys of the action lines and their parameters. */
  actions: { key: string; params?: Record<string, number | string> }[];
}

export interface CrisisPlans {
  potassium?: PotassiumPlan;
  calcium?: CalciumPlan;
  hyperK?: HyperKPlan;
  /** Free-water deficit (L) and sodium deficit (mmol) for the first 24 h. */
  freeWater24h?: number;
  sodium24h?: number;
  naLimit?: number;
}

type Cuts = readonly [number, number, number];

/** Axis zones from the cut-offs: low [mild, moderate, severe] are descending, high ascending. */
function zones(scale: [number, number], normal: [number, number], low?: Cuts, high?: Cuts): Zone[] {
  const z: Zone[] = [];
  if (low) {
    z.push({ from: scale[0], to: low[2], kind: 'severe' }, { from: low[2], to: low[1], kind: 'moderate' }, { from: low[1], to: normal[0], kind: 'mild' });
  }
  z.push({ from: normal[0], to: normal[1], kind: 'normal' });
  if (high) {
    z.push({ from: normal[1], to: high[1], kind: 'mild' }, { from: high[1], to: high[2], kind: 'moderate' }, { from: high[2], to: scale[1], kind: 'severe' });
  }
  return z.filter((x) => x.to > x.from);
}

function levelLow(v: number, c: Cuts): CrisisLevel | null {
  return v < c[2] ? 'severe' : v < c[1] ? 'moderate' : v < c[0] ? 'mild' : null;
}
function levelHigh(v: number, c: Cuts): CrisisLevel | null {
  return v >= c[2] ? 'severe' : v >= c[1] ? 'moderate' : v >= c[0] ? 'mild' : null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Critical-shift board: every analyte outside its normal range, how far, and what to do about it. */
export function crises(ctx: Ctx, plans: CrisisPlans): Crisis[] {
  const { input, norms } = ctx;
  const C = norms.crisis;
  const out: Crisis[] = [];
  const neonate = input.ageCategory === 'preterm' || input.ageCategory === 'term_neonate';

  const push = (c: Omit<Crisis, 'zones'> & { zones?: Zone[]; low?: Cuts; high?: Cuts }) => {
    const { low, high, ...rest } = c;
    out.push({ ...rest, zones: c.zones ?? zones(c.scale, c.normal, low, high) });
  };

  if (input.K !== undefined) {
    const k = C.K;
    const lo = levelLow(input.K, k.low as unknown as Cuts);
    const hi = levelHigh(input.K, k.high as unknown as Cuts);
    const base = { id: 'K' as const, value: input.K, normal: k.normal as [number, number], scale: k.scale as [number, number], low: k.low as unknown as Cuts, high: k.high as unknown as Cuts };
    if (lo) {
      const p = plans.potassium;
      push({
        ...base, dir: 'low', level: lo,
        actions: [
          { key: 'crisis.K.low.ecg' },
          ...(p ? [{ key: 'crisis.K.low.dose', params: { dose: r1(p.doseMmol), rate: r1(p.maxRateMmolH) } }] : [{ key: 'crisis.K.low.oral' }]),
          { key: 'crisis.K.low.mg' },
          { key: 'crisis.K.low.recheck' },
        ],
      });
    } else if (hi) {
      const h = plans.hyperK;
      push({
        ...base, dir: 'high', level: hi,
        actions: [
          { key: 'crisis.K.high.ecg' },
          ...(hi !== 'mild'
            ? [
                h && !h.needsWeight
                  ? { key: 'crisis.K.high.shift', params: { ca: r1(h.calciumMl[0]), u: r1(h.insulinUnits), g: r1(h.glucoseG) } }
                  : { key: 'crisis.K.high.shiftNoDose' },
              ]
            : []),
          { key: 'crisis.K.high.cause' },
          { key: 'crisis.K.high.haemolysis' },
        ],
      });
    }
  }

  if (input.Na !== undefined && !neonate) {
    const na = C.Na;
    const lo = levelLow(input.Na, na.low as unknown as Cuts);
    const hi = levelHigh(input.Na, na.high as unknown as Cuts);
    const base = { id: 'Na' as const, value: input.Na, normal: na.normal as [number, number], scale: na.scale as [number, number], low: na.low as unknown as Cuts, high: na.high as unknown as Cuts };
    if (lo) {
      push({
        ...base, dir: 'low', level: lo,
        actions: [
          { key: 'crisis.Na.low.limit', params: { max: plans.naLimit ?? 8 } },
          ...(plans.sodium24h ? [{ key: 'crisis.Na.low.deficit', params: { mmol: Math.round(plans.sodium24h) } }] : []),
          { key: 'crisis.Na.low.symptoms' },
          { key: 'crisis.Na.low.monitor' },
        ],
      });
    } else if (hi) {
      push({
        ...base, dir: 'high', level: hi,
        actions: [
          { key: 'crisis.Na.high.limit', params: { max: plans.naLimit ?? 10 } },
          ...(plans.freeWater24h ? [{ key: 'crisis.Na.high.water', params: { l: Math.round(plans.freeWater24h * 100) / 100 } }] : []),
          { key: 'crisis.Na.high.route' },
          { key: 'crisis.Na.high.monitor' },
        ],
      });
    }
  }

  if (input.iCa !== undefined) {
    const ca = C.iCa;
    const lo = levelLow(input.iCa, ca.low as unknown as Cuts);
    if (lo) {
      const p = plans.calcium;
      push({
        id: 'iCa', dir: 'low', level: lo, value: input.iCa, normal: ca.normal as [number, number], scale: ca.scale as [number, number], low: ca.low as unknown as Cuts,
        actions: [
          { key: 'crisis.iCa.low.ecg' },
          ...(p ? [p.gluconateMlMax && p.gluconateMlMax !== p.gluconateMl ? { key: 'crisis.iCa.low.doseRange', params: { ml: r1(p.gluconateMl), max: r1(p.gluconateMlMax) } } : { key: 'crisis.iCa.low.doseOne', params: { ml: r1(p.gluconateMl) } }] : []),
          { key: 'crisis.iCa.low.line' },
          { key: 'crisis.iCa.low.ph' },
        ],
      });
    }
  }

  if (input.Mg !== undefined && !neonate) {
    const m = C.Mg;
    const lo = levelLow(input.Mg, m.low as unknown as Cuts);
    const hi = levelHigh(input.Mg, m.high as unknown as Cuts);
    const base = { id: 'Mg' as const, value: input.Mg, normal: m.normal as [number, number], scale: m.scale as [number, number], low: m.low as unknown as Cuts, high: m.high as unknown as Cuts };
    if (lo) push({ ...base, dir: 'low', level: lo, actions: [{ key: 'crisis.Mg.low.ecg' }, { key: 'crisis.Mg.low.kca' }, { key: 'crisis.Mg.low.cause' }] });
    else if (hi) push({ ...base, dir: 'high', level: hi, actions: [{ key: 'crisis.Mg.high.signs' }, { key: 'crisis.Mg.high.cause' }] });
  }

  if (input.phosphate !== undefined && input.ageCategory === 'adult') {
    const ph = C.phosphate;
    const lo = levelLow(input.phosphate, ph.low as unknown as Cuts);
    if (lo) {
      push({
        id: 'phosphate', dir: 'low', level: lo, value: input.phosphate, normal: ph.normal as [number, number], scale: ph.scale as [number, number], low: ph.low as unknown as Cuts,
        actions: [{ key: 'crisis.phosphate.low.refeeding' }, { key: 'crisis.phosphate.low.signs' }, { key: 'crisis.phosphate.low.treat' }],
      });
    }
  }

  if (input.glucose !== undefined) {
    const g = neonate ? C.glucose.neonate : C.glucose;
    const lo = levelLow(input.glucose, g.low as unknown as Cuts);
    const hi = levelHigh(input.glucose, g.high as unknown as Cuts);
    const base = { id: 'glucose' as const, value: input.glucose, normal: g.normal as [number, number], scale: C.glucose.scale as [number, number], low: g.low as unknown as Cuts, high: g.high as unknown as Cuts };
    if (lo) {
      push({ ...base, dir: 'low', level: lo, actions: [{ key: 'crisis.glucose.low.iv' }, { key: 'crisis.glucose.low.recheck' }, { key: 'crisis.glucose.low.cause' }] });
    } else if (hi) {
      push({
        ...base, dir: 'high', level: hi,
        actions: [{ key: 'crisis.glucose.high.ketones' }, { key: neonate ? 'crisis.glucose.high.neo' : 'crisis.glucose.high.fluids' }, { key: 'crisis.glucose.high.recheck' }],
      });
    }
  }

  if (input.lactate !== undefined && !neonate) {
    const l = C.lactate;
    const hi = levelHigh(input.lactate, l.high as unknown as Cuts);
    if (hi) {
      push({
        id: 'lactate', dir: 'high', level: hi, value: input.lactate, normal: l.normal as [number, number], scale: l.scale as [number, number], high: l.high as unknown as Cuts,
        actions: [{ key: 'crisis.lactate.high.perfusion' }, { key: 'crisis.lactate.high.source' }, { key: 'crisis.lactate.high.clearance' }],
      });
    }
  }

  {
    const p = C.pH;
    const lo = levelLow(input.pH, p.low as unknown as Cuts);
    const hi = levelHigh(input.pH, p.high as unknown as Cuts);
    const base = { id: 'pH' as const, value: input.pH, normal: p.normal as [number, number], scale: p.scale as [number, number], low: p.low as unknown as Cuts, high: p.high as unknown as Cuts };
    if (lo) push({ ...base, dir: 'low', level: lo, actions: [{ key: 'crisis.pH.low.cause' }, { key: 'crisis.pH.low.resp' }, { key: 'crisis.pH.low.bicarb' }] });
    else if (hi) push({ ...base, dir: 'high', level: hi, actions: [{ key: 'crisis.pH.high.cause' }, { key: 'crisis.pH.high.electrolytes' }, { key: 'crisis.pH.high.vent' }] });
  }

  const order = { severe: 0, moderate: 1, mild: 2 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
