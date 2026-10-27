import scenariosJson from '../content/scenarios.json';
import normsJson from '../content/norms.json';
import { expectedHCO3Resp, expectedPCO2MetAcid, expectedPCO2MetAlk } from './compensation';
import { interpret } from './interpret';
import { phFromHco } from './validate';
import type { AbgInput, AgeCategory, Chronicity, DeltaClass, Disorder, InterpretationResult, Norms, PrimaryKind, SampleType, Settings } from './types';

export type Lang = 'ru' | 'uz' | 'en';
export type Localized = Record<Lang, string>;

export interface Expected {
  primary: PrimaryKind;
  chronicity?: Chronicity;
  secondary: Disorder[];
  agElevated?: boolean;
  osmElevated?: boolean;
  oxyClass?: string;
  deltaClass?: DeltaClass;
}

export interface Scenario {
  id: string;
  level: number;
  ages: AgeCategory[];
  samples: SampleType[];
  primary: PrimaryKind;
  chronicity?: 'acute' | 'chronic';
  range: [number, number];
  range2?: [number, number];
  secondary?: Disorder;
  ag: 'none' | 'normal' | 'high';
  delta?: [number, number];
  albumin?: [number, number];
  cause?: string;
  osm?: 'high';
  oxygenation?: string;
  ventilation?: 'conventional' | 'hfo';
  expected: Expected;
  vignette: Localized;
}

export interface CaseData {
  id: string;
  source: 'generator' | 'bank';
  seed?: number;
  scenarioId?: string;
  level: number;
  input: AbgInput;
  expected: Expected;
  vignette: Localized;
  tags?: string[];
}

export const SCENARIOS = scenariosJson.scenarios as unknown as Scenario[];
const AGE_TEXT = scenariosJson.ageText as Record<AgeCategory, Localized>;

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Settings used for self-check and for training: advanced on so Stewart is available. */
export const GENERATOR_SETTINGS: Settings = { advanced: true, agWithK: false };

/** Compares a core interpretation with the intended diagnosis of a case. */
export function matchesExpected(r: InterpretationResult, e: Expected): boolean {
  if (r.blocked) return false;
  const cons = r.steps.find((s) => s.id === 'consistency');
  if (cons?.verdict === 'inconsistent') return false;
  if (r.primary !== e.primary) return false;
  if (e.chronicity && r.chronicity !== e.chronicity) return false;
  const a = [...r.secondary].sort().join(',');
  const b = [...e.secondary].sort().join(',');
  if (a !== b) return false;
  if (e.agElevated !== undefined) {
    const ag = r.steps.find((s) => s.id === 'anionGap');
    if (ag?.status !== 'done' || (ag.verdict === 'elevated') !== e.agElevated) return false;
  }
  if (e.deltaClass && r.steps.find((s) => s.id === 'deltaRatio')?.verdict !== e.deltaClass) return false;
  if (e.osmElevated !== undefined && (r.steps.find((s) => s.id === 'osmolar')?.verdict === 'elevated') !== e.osmElevated) return false;
  if (e.oxyClass && r.steps.find((s) => s.id === 'oxygenation')?.verdict !== e.oxyClass) return false;
  return true;
}

function fill(template: string, params: Record<string, string | number>, lang: Lang): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return typeof v === 'number' && lang !== 'en' ? String(v).replace('.', ',') : String(v ?? '');
  });
}

/** One generation attempt for a scenario (no self-check). */
export function buildCase(sc: Scenario, rand: () => number, norms: Norms = normsJson): Omit<CaseData, 'id'> {
  const u = (lo: number, hi: number) => lo + (hi - lo) * rand();
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const tol = norms.compensationTolerance;
  const shift = () => tol + 4 + u(0, 4);

  const ageCategory = pick(sc.ages);
  const sampleType = pick(sc.samples);
  let pCO2: number;
  let HCO3: number;
  if (sc.primary === 'metabolic_acidosis' || sc.primary === 'metabolic_alkalosis') {
    HCO3 = u(sc.range[0], sc.range[1]);
    const exp = sc.primary === 'metabolic_acidosis' ? expectedPCO2MetAcid(HCO3) : expectedPCO2MetAlk(HCO3, norms.metAlkPCO2Ceiling);
    if (sc.secondary === 'respiratory_acidosis') pCO2 = exp + shift();
    else if (sc.secondary === 'respiratory_alkalosis') pCO2 = exp - shift();
    else pCO2 = exp + u(-1, 1);
  } else if (sc.primary === 'respiratory_acidosis' || sc.primary === 'respiratory_alkalosis') {
    pCO2 = u(sc.range[0], sc.range[1]);
    const kind = sc.primary === 'respiratory_acidosis' ? 'acid' : 'alk';
    const acute = expectedHCO3Resp(pCO2, kind, 'acute');
    const chronic = expectedHCO3Resp(pCO2, kind, 'chronic');
    if (sc.secondary === 'metabolic_acidosis') HCO3 = Math.min(acute, chronic) - shift();
    else if (sc.secondary === 'metabolic_alkalosis') HCO3 = Math.max(acute, chronic) + shift();
    else HCO3 = (sc.chronicity === 'chronic' ? chronic : acute) + u(-1, 1);
  } else {
    pCO2 = u(sc.range[0], sc.range[1]);
    HCO3 = u(sc.range2![0], sc.range2![1]);
  }

  // analyser noise and rounding; pH is derived from the equation, never set by hand
  pCO2 = Math.round(pCO2 + u(-1, 1));
  HCO3 = r1(HCO3 + u(-0.5, 0.5));
  const pH = r2(phFromHco(HCO3, pCO2) + u(-0.01, 0.01));
  const input: AbgInput = { pH, pCO2, HCO3, sampleType, ageCategory };

  const ageParams: Record<string, number> = {};
  if (ageCategory === 'preterm') {
    ageParams.ga = Math.round(u(25, 33));
    ageParams.weight = r1(u(0.6, 2.0));
    input.gestationalWeeks = ageParams.ga;
  } else if (ageCategory === 'term_neonate') {
    ageParams.days = Math.round(u(1, 20));
    ageParams.weight = r1(u(2.7, 4.0));
  } else if (ageCategory === 'child') {
    ageParams.years = Math.round(u(1, 14));
    ageParams.weight = Math.round(8 + ageParams.years * 3 + u(-2, 4));
    input.ageYears = ageParams.years;
  } else {
    ageParams.years = Math.round(u(20, 80));
    ageParams.weight = Math.round(u(55, 95));
    input.ageYears = ageParams.years;
  }
  input.weightKg = ageParams.weight;

  if (sc.level >= 2 || sc.ag !== 'none' || sampleType === 'cord_artery') {
    // Van Slyke SBE
    input.BE = Math.round(0.93 * (HCO3 - 24.4 + 14.83 * (pH - 7.4)));
  }

  if (sc.ag !== 'none') {
    const Na = Math.round(u(135, 145));
    const alb = Math.round(sc.albumin ? u(sc.albumin[0], sc.albumin[1]) : u(36, 44));
    let agCorr: number;
    if (sc.ag === 'normal') agCorr = u(8.5, 11.5);
    else if (sc.delta) agCorr = norms.AG.deltaBase + u(sc.delta[0], sc.delta[1]) * (norms.baseline.HCO3 - HCO3);
    else agCorr = u(18, 26);
    const agRaw = agCorr - norms.AG.albuminFactor * (norms.AG.albuminRef - alb);
    input.Na = Na;
    input.albumin = alb;
    input.Cl = Math.round(Na - HCO3 - agRaw);
    input.K = r1(u(3.6, 5.0));
    const agRise = Math.max(0, agCorr - norms.AG.deltaBase);
    input.lactate = sc.cause === 'lactic' ? r1(Math.max(4.2, 0.7 * agRise)) : r1(u(0.8, 1.8));
    input.glucose = sc.cause === 'dka' ? r1(u(18, 30)) : r1(u(4, 7));
    input.urea = r1(u(3, 7));
    if (sc.level >= 2) {
      const calc = 2 * Na + input.glucose + input.urea;
      input.measuredOsm = Math.round(calc + (sc.osm === 'high' ? u(18, 40) : u(-3, 6)));
    }
  }

  if (sc.oxygenation) applyOxygenation(input, sc.oxygenation, u);
  if (sc.ventilation === 'conventional') input.ventilation = { mode: 'conventional', rate: Math.round(ageCategory === 'adult' ? u(12, 20) : u(30, 50)) };
  if (sc.ventilation === 'hfo') input.ventilation = { mode: 'hfo' };

  const vignette = {} as Localized;
  for (const lang of ['ru', 'uz', 'en'] as Lang[]) {
    vignette[lang] = fill(AGE_TEXT[ageCategory][lang], ageParams, lang) + '. ' + sc.vignette[lang];
  }

  return { source: 'generator', scenarioId: sc.id, level: sc.level, input, expected: sc.expected, vignette, tags: [ageCategory, sampleType] };
}

function applyOxygenation(input: AbgInput, cls: string, u: (lo: number, hi: number) => number): void {
  const FiO2 = r2(u(0.5, 0.9));
  input.FiO2 = FiO2;
  if (cls === 'mild' || cls === 'moderate' || cls === 'severe') {
    // Berlin (adult, PEEP ≥ 5)
    const pf = cls === 'mild' ? u(215, 285) : cls === 'moderate' ? u(115, 185) : u(60, 92);
    input.PEEP = Math.round(u(6, 14));
    input.pO2 = Math.round(pf * FiO2);
    if (input.ageCategory === 'child') {
      // PALICC-2 OI instead of Berlin
      const oi = cls === 'severe' ? u(18, 30) : u(6, 14);
      input.MAP = Math.round(u(14, 24));
      input.pO2 = Math.round((input.MAP * FiO2 * 100) / oi);
      delete input.PEEP;
    }
  } else {
    const oi = cls === 'ecmo' ? u(44, 60) : cls === 'ino' ? u(27, 38) : u(8, 22);
    input.MAP = Math.round(u(10, 18));
    input.pO2 = Math.round((input.MAP * FiO2 * 100) / oi);
  }
  if (input.pO2 < 25) input.pO2 = 25;
}

export interface GenerationLog {
  scenarioId: string;
  attempts: number;
  rejected: number;
  skipped: boolean;
}

/** Generates a self-checked case: up to `maxAttempts` attempts, otherwise null (scenario skipped, logged). */
export function generateCase(
  scenarioId: string,
  seed: number,
  log?: GenerationLog[],
  maxAttempts = 20,
): CaseData | null {
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  if (!sc) throw new Error('unknown scenario ' + scenarioId);
  const rand = rng(seed);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const c = buildCase(sc, rand);
    const r = interpret(c.input, GENERATOR_SETTINGS);
    if (matchesExpected(r, c.expected)) {
      log?.push({ scenarioId, attempts: attempt, rejected: attempt - 1, skipped: false });
      return { ...c, id: `gen-${sc.id}-${seed}`, seed };
    }
  }
  log?.push({ scenarioId, attempts: maxAttempts, rejected: maxAttempts, skipped: true });
  return null;
}

/** Scenarios available for a level: the level itself plus lower levels (higher level contains lower). */
export function scenariosForLevel(level: number): Scenario[] {
  return SCENARIOS.filter((s) => s.level <= level);
}

/** Deterministic case for a level and seed. */
export function generateForLevel(level: number, seed: number, log?: GenerationLog[]): CaseData | null {
  const list = scenariosForLevel(level);
  const weighted = list.flatMap((s) => (s.level === level ? [s, s, s] : [s]));
  const r = rng(seed ^ 0x9e3779b9);
  for (let i = 0; i < weighted.length; i++) {
    const sc = weighted[Math.floor(r() * weighted.length)];
    const c = generateCase(sc.id, seed + i * 104729, log);
    if (c) return c;
  }
  return null;
}
