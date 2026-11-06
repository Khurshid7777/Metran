import type { MetricGroup } from './extended';
import type { Flag, Settings, Step, StepId } from './types';

/**
 * Calculations the user can switch off when the inputs were not measured or are not trusted.
 * Keys are stored in the app settings and passed to the core as `settings.exclude`.
 */
export const EXCLUDABLE = {
  steps: ['anionGap', 'osmolar', 'stewart', 'oxygenation', 'labs'] as const,
  metrics: ['acidBase', 'electrolytes', 'oxygen', 'perfusion', 'ventilation', 'temperature', 'neonatal'] as const,
  blocks: ['dka', 'urine', 'hyperK', 'naCorrection', 'deficits', 'treatment', 'preanalytic', 'crisis'] as const,
};

/** Keys in the settings: steps and blocks as is, metric groups prefixed with `m.`. */
export const EXCLUDE_KEYS: string[] = [...EXCLUDABLE.steps, ...EXCLUDABLE.metrics.map((g) => 'm.' + g), ...EXCLUDABLE.blocks];

export function excludedSet(settings: Pick<Settings, 'exclude'>): Set<string> {
  return new Set((settings.exclude ?? []).filter((k) => EXCLUDE_KEYS.includes(k)));
}

/** Placeholder for a step the user switched off. */
export function excludedStep(id: StepId): Step {
  return { id, status: 'disabled', explanationKey: 'step.excluded', flags: [], details: {} };
}

/** Which metric group each flag of the extended assessment belongs to. */
const FLAG_GROUP: Record<string, MetricGroup> = {
  sbe_mismatch: 'acidBase',
  sig_high: 'acidBase',
  shunt_high: 'oxygen',
  so2_mismatch: 'oxygen',
  dead_space_high: 'oxygen',
  o2er_high: 'perfusion',
  scvo2_low: 'perfusion',
  pco2_gap_high: 'perfusion',
  driving_pressure_high: 'ventilation',
  vr_high: 'ventilation',
  ba_ratio_high: 'neonatal',
};

export function flagInExcludedGroup(f: Flag, off: Set<string>): boolean {
  const g = FLAG_GROUP[f.code];
  return g !== undefined && off.has('m.' + g);
}
