import { interpret } from '../../core/interpret';
import { GENERATOR_SETTINGS, matchesExpected, type CaseData, type Expected, type Localized } from '../../core/generator';
import type { AbgInput, AgeCategory, SampleType } from '../../core/types';

export interface BankCase {
  id: string;
  ageCategory: AgeCategory;
  weightKg?: number;
  ageYears?: number;
  gestationalWeeks?: number;
  sampleType: SampleType;
  vignette: Localized;
  values: Partial<AbgInput> & { pH: number; pCO2: number };
  expected: Expected;
  level: number;
  tags?: string[];
  reviewedBy: string;
  reviewedAt: string;
  demo?: boolean;
}

const modules = import.meta.glob('../../content/cases/*.json', { eager: true, import: 'default' }) as Record<string, BankCase>;
export const RAW_BANK: BankCase[] = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id));

export function bankToCase(b: BankCase): CaseData {
  const input: AbgInput = {
    ...b.values,
    sampleType: b.sampleType,
    ageCategory: b.ageCategory,
    weightKg: b.weightKg,
    ageYears: b.ageYears,
    gestationalWeeks: b.gestationalWeeks,
  };
  return { id: b.id, source: 'bank', level: b.level, input, expected: { ...b.expected, secondary: b.expected.secondary ?? [] }, vignette: b.vignette, tags: b.tags };
}

/** The core interprets every bank case on load; mismatches with the expert answer go to review, not to the pool. */
export function validateBank(): { accepted: CaseData[]; review: { id: string; expected: Expected; got: Expected }[] } {
  const accepted: CaseData[] = [];
  const review: { id: string; expected: Expected; got: Expected }[] = [];
  for (const b of RAW_BANK) {
    const c = bankToCase(b);
    const r = interpret(c.input, GENERATOR_SETTINGS);
    if (matchesExpected(r, c.expected)) accepted.push(c);
    else review.push({ id: b.id, expected: c.expected, got: { primary: r.primary, chronicity: r.chronicity, secondary: r.secondary } });
  }
  return { accepted, review };
}

let cache: ReturnType<typeof validateBank> | null = null;
export function bank() {
  return (cache ??= validateBank());
}
