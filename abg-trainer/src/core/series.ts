import normsJson from '../content/norms.json';
import { hcoFromPh } from './validate';
import type { AbgInput, Flag, Norms } from './types';

export interface SeriesEntry {
  id: string;
  /** ISO time of the sample. */
  time: string;
  input: AbgInput;
}

export const TREND_KEYS = ['pH', 'pCO2', 'HCO3', 'BE', 'lactate', 'Na', 'K', 'glucose', 'PF'] as const;
export type TrendKey = (typeof TREND_KEYS)[number];

export interface SeriesAnalysis {
  /** Hours since the first sample, per entry. */
  hours: number[];
  trends: Partial<Record<TrendKey, (number | undefined)[]>>;
  /** pCO2 and HCO3 of each entry for the path on the acid–base map. */
  path: [number, number][];
  /** Lactate clearance from the first to the last value, %. */
  lactateClearance?: number;
  flags: Flag[];
}

function value(input: AbgInput, key: TrendKey): number | undefined {
  switch (key) {
    case 'HCO3':
      return input.HCO3 ?? hcoFromPh(input.pH, input.pCO2);
    case 'PF':
      return input.sampleType === 'arterial' && input.pO2 !== undefined && input.FiO2 !== undefined ? input.pO2 / input.FiO2 : undefined;
    default:
      return input[key] as number | undefined;
  }
}

/** Trends across repeated samples of one patient: sodium correction speed and lactate clearance. */
export function analyzeSeries(entries: SeriesEntry[], norms: Norms = normsJson): SeriesAnalysis {
  const list = [...entries].sort((a, b) => a.time.localeCompare(b.time));
  const t0 = list.length ? new Date(list[0].time).getTime() : 0;
  const hours = list.map((e) => (new Date(e.time).getTime() - t0) / 3600000);
  const trends: SeriesAnalysis['trends'] = {};
  for (const k of TREND_KEYS) {
    const vals = list.map((e) => value(e.input, k));
    if (vals.filter((v) => v !== undefined).length >= 1) trends[k] = vals;
  }
  const flags: Flag[] = [];
  const S = norms.series;
  // Sodium: rate of change between consecutive samples, extrapolated to 24 h
  const na = trends.Na;
  if (na) {
    for (let i = 1; i < list.length; i++) {
      const a = na[i - 1];
      const b = na[i];
      const dt = hours[i] - hours[i - 1];
      if (a === undefined || b === undefined || dt < S.minHours) continue;
      const per24 = ((b - a) / dt) * 24;
      if (per24 > S.naRiseMax24h) flags.push({ code: 'na_rise_fast', severity: 'critical', params: { d: Math.round((b - a) * 10) / 10, h: Math.round(dt * 10) / 10, v: Math.round(per24) } });
      if (-per24 > S.naFallMax24h) flags.push({ code: 'na_fall_fast', severity: 'critical', params: { d: Math.round((b - a) * 10) / 10, h: Math.round(dt * 10) / 10, v: Math.round(-per24) } });
    }
  }
  // Lactate clearance (Nguyen 2004): (first − last) / first × 100
  let lactateClearance: number | undefined;
  const lac = (trends.lactate ?? []).map((v, i) => [v, hours[i]] as const).filter(([v]) => v !== undefined) as [number, number][];
  if (lac.length >= 2 && lac[0][0] > 0) {
    lactateClearance = ((lac[0][0] - lac[lac.length - 1][0]) / lac[0][0]) * 100;
    if (lac[0][0] >= S.lactateConcern && lactateClearance < S.lactateClearanceMin) {
      flags.push({ code: 'lactate_clearance_low', severity: 'warning', params: { v: Math.round(lactateClearance), h: Math.round(lac[lac.length - 1][1] - lac[0][1]) } });
    }
  }
  const path = list.map((e) => [e.input.pCO2, value(e.input, 'HCO3')!] as [number, number]);
  return { hours, trends, path, lactateClearance, flags };
}
