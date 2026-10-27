import { normalizeFiO2, parseLocaleNumber, toInternal, type UnitId } from '../../core/units';
import type { AbgInput, AgeCategory, SampleType } from '../../core/types';
import { ALL_FIELDS, type FieldDef } from '../common/fields';
import type { Units, VentMode } from './draft';

export interface DraftInput {
  values: Record<string, string>;
  sampleType: SampleType | null;
  ageCategory: AgeCategory;
  bpd: boolean;
  ventMode: VentMode;
  units: Units;
}

export function unitOf(f: FieldDef, units: Units): UnitId | undefined {
  if (!f.unitGroup || f.unitGroup === 'fio2') return undefined;
  return units[f.unitGroup];
}

/** Turns the typed strings into a core input. Returns the fields that are missing or not numbers. */
export function buildInput(d: DraftInput): { input?: AbgInput; bad: string[] } {
  const input: Record<string, unknown> = { ageCategory: d.ageCategory };
  const bad: string[] = [];
  if (!d.sampleType) bad.push('sampleType');
  else input.sampleType = d.sampleType;
  for (const f of ALL_FIELDS) {
    const raw = d.values[f.name];
    if (raw === undefined || raw.trim() === '') continue;
    const v = parseLocaleNumber(raw);
    if (Number.isNaN(v)) {
      bad.push(f.name);
      continue;
    }
    if (f.unitGroup === 'fio2') input[f.name] = normalizeFiO2(v);
    else {
      const u = unitOf(f, d.units);
      input[f.name] = u ? toInternal(v, u, f.unitGroup === 'urea' ? 'urea' : 'glucose') : v;
    }
  }
  // ABL reports pO2(a)/FO2(I) instead of FiO2: FiO2 = pO2 / ratio
  if (input.FiO2 === undefined && typeof input.pO2FO2 === 'number' && typeof input.pO2 === 'number' && input.pO2FO2 > 0) {
    input.FiO2 = Math.min(1, Math.max(0.21, Math.round(((input.pO2 as number) / (input.pO2FO2 as number)) * 100) / 100));
  }
  if (d.values.cordPair?.trim()) {
    const v = parseLocaleNumber(d.values.cordPair);
    if (Number.isNaN(v)) bad.push('cordPair');
    else input.cordPair = { pH: v };
  }
  if (d.bpd && d.ageCategory === 'preterm') input.bpd = true;
  if (d.values.biliRisk === '1') input.biliRisk = true;
  if (d.ventMode !== 'none') {
    const rate = parseLocaleNumber(d.values.ventRate ?? '');
    input.ventilation = { mode: d.ventMode, rate: Number.isNaN(rate) ? undefined : rate };
  }
  if (input.pH === undefined) bad.push('pH');
  if (input.pCO2 === undefined) bad.push('pCO2');
  if (bad.length) return { bad };
  return { input: input as unknown as AbgInput, bad };
}
