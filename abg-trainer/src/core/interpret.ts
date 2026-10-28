import normsJson from '../content/norms.json';
import differentialsJson from '../content/differentials.json';
import { anionGapStep, deltaStep } from './anionGap';
import { compensationStep } from './compensation';
import { osmolarStep } from './osmolar';
import { deficits as computeDeficits } from './deficits';
import { labsStep } from './labs';
import { buildWorkings } from './workings';
import { extendedMetrics } from './extended';
import { deviationProfile } from './profile';
import { oxygenationStep } from './oxygenation';
import { categoryNorms, primaryStep } from './primary';
import { stewartStep } from './stewart';
import { treatment } from './treatment';
import { consistencyStep, generalFlags, validateInput } from './validate';
import type {
  AbgInput,
  AcidosisType,
  Ctx,
  DifferentialItem,
  Disorder,
  DisorderEntry,
  Flag,
  InterpretationResult,
  Norms,
  Settings,
  Step,
  SummaryPart,
} from './types';

export const DEFAULT_SETTINGS: Settings = { advanced: false, agWithK: false };

type DiffGroup = { causes: { key: string; ages: string[] }[]; checks: string[] };
const DIFFS = differentialsJson as Record<string, DiffGroup>;

/** Main entry point of the core: input → interpretation. Pure, no UI dependencies. */
export function interpret(input: AbgInput, settings: Settings = DEFAULT_SETTINGS, norms: Norms = normsJson): InterpretationResult {
  const inputErrors = validateInput(input);
  if (inputErrors.length) {
    return {
      blocked: true,
      inputErrors,
      steps: [],
      primary: 'none',
      disorders: [],
      secondary: [],
      flags: [],
      differentials: [],
      summary: [{ key: 'summary.blocked' }],
      workings: [],
      deficits: [],
      metrics: [],
      profile: [],
      computed: { HCO3: NaN, HCO3Calculated: input.HCO3 === undefined },
    };
  }

  const cons = consistencyStep(input, norms);
  const ctx: Ctx = { input, settings, norms, HCO3: cons.HCO3 };
  const steps: Step[] = [cons.step];
  const flags: Flag[] = [...cons.step.flags, ...generalFlags(ctx)];

  // Steps 2–3
  const prim = primaryStep(ctx);
  steps.push(prim.phStep, prim.primaryStep);
  flags.push(...prim.primaryStep.flags);

  const disorders: DisorderEntry[] = [];
  const add = (type: Disorder, role: DisorderEntry['role'], source: DisorderEntry['source']) => {
    if (!disorders.some((d) => d.type === type)) disorders.push({ type, role, source });
  };
  if (prim.mixedPair) prim.mixedPair.forEach((d) => add(d, 'primary', 'primary'));
  else if (prim.primary !== 'none') add(prim.primary as Disorder, 'primary', 'primary');

  // Step 4
  const comp = compensationStep(ctx, prim.compensationBase);
  steps.push(comp.step);
  flags.push(...comp.step.flags);
  comp.added.forEach((d) => add(d, 'secondary', 'compensation'));

  // Steps 5–6
  const ag = anionGapStep(ctx);
  const delta = deltaStep(ctx, ag);
  steps.push(ag.step, delta.step);
  flags.push(...ag.step.flags);
  let acidosisType: AcidosisType | undefined;
  if (ag.elevated) {
    if (!disorders.some((d) => d.type === 'metabolic_acidosis')) {
      add('metabolic_acidosis', 'secondary', 'ag');
      flags.push({ code: 'hidden_hagma', severity: 'warning' });
      if (ctx.HCO3 >= norms.baseline.HCO3) add('metabolic_alkalosis', 'secondary', 'delta');
    }
    acidosisType = delta.cls === 'normal_ag' || delta.cls === 'mixed_ag' ? 'mixed_ag' : 'high_ag';
    if (delta.cls === 'plus_met_alk') add('metabolic_alkalosis', 'secondary', 'delta');
  } else if (ag.agCorr !== undefined && disorders.some((d) => d.type === 'metabolic_acidosis')) {
    acidosisType = 'normal_ag';
  }

  // Step 7
  const osm = osmolarStep(ctx);
  steps.push(osm.step);
  flags.push(...osm.step.flags);

  // Step 8
  const st = stewartStep(ctx);
  steps.push(st.step);
  flags.push(...st.step.flags);

  // Step 9
  const oxy = oxygenationStep(ctx);
  steps.push(oxy.step);
  flags.push(...oxy.step.flags);

  // Step 10
  const labs = labsStep(ctx);
  steps.push(labs.step);
  flags.push(...labs.step.flags);

  // Extended assessment
  const sida =
    input.Na !== undefined && input.K !== undefined && input.Cl !== undefined
      ? input.Na + input.K + (input.iCa ?? 0) + (input.Mg ?? 0) - input.Cl - (input.lactate ?? 0)
      : undefined;
  const ext = extendedMetrics(ctx, {
    HCO3: ctx.HCO3,
    agCorr: ag.agCorr,
    PAO2: typeof oxy.step.details.PAO2 === 'number' ? oxy.step.details.PAO2 : undefined,
    Patm: input.Patm ?? settings.patm ?? norms.defaultPatm,
    SIDa: sida,
  });
  flags.push(...ext.flags);

  flags.push(...cordFlags(input, norms));

  const disorderTypes = disorders.map((d) => d.type);
  const secondary = disorders.filter((d) => d.role === 'secondary').map((d) => d.type);
  const n = categoryNorms(norms, input.ageCategory, input.sampleType, input.bpd);
  const oxygenationPoor =
    (input.sampleType === 'arterial' && input.pO2 !== undefined && input.pO2 < n.PaO2Air[0]) ||
    (input.SpO2 !== undefined && input.SpO2 < 90);
  const tr = treatment(ctx, {
    disorders: disorderTypes,
    acidosisType,
    oxygenationPoor,
    hyperoxia: flags.some((f) => f.code.startsWith('preterm_hyperoxia')),
    ventilationAdequate: !disorderTypes.includes('respiratory_acidosis'),
  });

  const result: InterpretationResult = {
    blocked: false,
    inputErrors: [],
    steps,
    phStatus: prim.phStatus,
    primary: prim.primary,
    chronicity: comp.chronicity,
    compensation: prim.mixedPair ? undefined : comp.compensation,
    acidosisType,
    disorders,
    secondary,
    flags: dedupe(flags),
    differentials: differentials(disorderTypes, acidosisType, ag.agCorr !== undefined, input.ageCategory),
    treatment: {
      ...tr,
      potassium: labs.potassium,
      calcium: labs.calcium,
      available: tr.available || Boolean(labs.potassium || labs.calcium),
    },
    summary: [],
    workings: [],
    metrics: ext.metrics,
    profile: deviationProfile(ctx, ag.agCorr),
    bilirubin: labs.bilirubin,
    deficits: computeDeficits(ctx, disorderTypes.includes('metabolic_alkalosis'), disorderTypes.includes('metabolic_acidosis')),
    computed: { HCO3: ctx.HCO3, HCO3Calculated: input.HCO3 === undefined },
  };
  result.workings = buildWorkings(input, steps, ctx.HCO3, settings, norms, result.treatment!, result.deficits);
  result.summary = buildSummary(result);
  return result;
}

function dedupe(flags: Flag[]): Flag[] {
  const seen = new Set<string>();
  return flags.filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)));
}

function cordFlags(input: AbgInput, norms: Norms): Flag[] {
  const flags: Flag[] = [];
  const c = norms.cord;
  if (input.sampleType === 'cord_artery') {
    const be = input.BE;
    if (input.pH < c.pathologicalPH || (be !== undefined && be <= c.pathologicalBE)) {
      flags.push({ code: 'cord_pathological_acidemia', severity: 'critical' });
    }
    if (input.pH <= c.hypothermiaPH || (be !== undefined && be <= c.hypothermiaBE)) {
      flags.push({ code: 'cord_hypothermia', severity: 'critical' });
    }
    else if (inRange(input.pH, c.borderlinePH) || (be !== undefined && inRange(be, c.borderlineBE))) {
      // pH 7.01–7.15 or BE −10…−15.9: hypothermia only with additional criteria (Apgar, resuscitation)
      flags.push({ code: 'cord_hypothermia_borderline', severity: 'warning' });
    }
    if (input.cordPair && input.cordPair.pH < input.pH) flags.push({ code: 'cord_swapped', severity: 'warning' });
  }
  if (input.sampleType === 'cord_vein' && input.cordPair && input.cordPair.pH > input.pH) {
    flags.push({ code: 'cord_swapped', severity: 'warning' });
  }
  return flags;
}

const inRange = (v: number, r: number[]) => v >= r[0] && v <= r[1];

function differentials(types: Disorder[], acidosisType: AcidosisType | undefined, agKnown: boolean, age: string): DifferentialItem[] {
  const groups: string[] = [];
  if (types.includes('metabolic_acidosis')) {
    if (!agKnown) groups.push('high_ag', 'normal_ag');
    else if (acidosisType === 'mixed_ag') groups.push('high_ag', 'normal_ag');
    else if (acidosisType === 'high_ag') groups.push('high_ag');
    else groups.push('normal_ag');
  }
  for (const t of ['metabolic_alkalosis', 'respiratory_acidosis', 'respiratory_alkalosis'] as const) {
    if (types.includes(t)) groups.push(t);
  }
  return groups.map((g) => {
    const d = DIFFS[g];
    const causes = [...d.causes]
      .sort((a, b) => Number(b.ages.includes(age)) - Number(a.ages.includes(age)))
      .map((c) => c.key);
    return { group: g, causes, checks: d.checks };
  });
}

function step(r: InterpretationResult, id: Step['id']): Step | undefined {
  return r.steps.find((s) => s.id === id);
}

/** Builds the conclusion as a list of i18n keys. Parameter values starting with '@' are i18n keys, '|' separates lists. */
export function buildSummary(r: InterpretationResult): SummaryPart[] {
  const parts: SummaryPart[] = [];
  parts.push({ key: 'summary.ph.' + r.phStatus });
  if (r.primary === 'none') parts.push({ key: 'summary.noDisorder' });
  else {
    parts.push({ key: 'summary.primary', params: { disorder: '@disorder.' + r.primary } });
    if (r.chronicity) parts.push({ key: 'summary.chronicity', params: { value: '@chronicity.' + r.chronicity } });
    if (r.compensation) parts.push({ key: 'summary.compensation', params: { value: '@compensation.' + r.compensation } });
  }
  if (r.secondary.length) {
    parts.push({ key: 'summary.additional', params: { list: r.secondary.map((d) => '@disorder.' + d).join('|') } });
  }
  const ag = step(r, 'anionGap');
  if (ag?.status === 'done' && ag.value !== undefined) {
    parts.push({ key: 'summary.ag', params: { value: round1(ag.value), status: '@ag.' + ag.verdict } });
  }
  const dd = step(r, 'deltaRatio');
  if (dd?.status === 'done' && dd.value !== undefined) {
    parts.push({ key: 'summary.delta', params: { value: round2(dd.value), cls: '@delta.' + dd.verdict } });
  }
  const st = step(r, 'stewart');
  if (st?.status === 'done' && st.value !== undefined) parts.push({ key: 'summary.stewart', params: { value: round1(st.value) } });
  const ox = step(r, 'oxygenation');
  if (ox?.status === 'done') {
    const d = ox.details;
    if (typeof d.PF === 'number') parts.push({ key: 'summary.pf', params: { value: Math.round(d.PF), cls: '@berlin.' + (d.berlin ?? 'na') } });
    if (typeof d.SF === 'number' && d.sfClass) parts.push({ key: 'summary.sf', params: { value: Math.round(d.SF), cls: '@berlin.' + d.sfClass } });
    if (typeof d.OI === 'number') parts.push({ key: 'summary.oi', params: { value: round1(d.OI), cls: '@oiClass.' + (d.OIClass ?? 'na') } });
    if (typeof d.OSI === 'number') parts.push({ key: 'summary.osi', params: { value: round1(d.OSI), cls: '@osiClass.' + (d.OSIClass ?? 'na') } });
  }
  if (r.flags.length) parts.push({ key: 'summary.flags', params: { list: r.flags.map((f) => '@flag.' + f.code + '.short').join('|') } });
  return parts;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
