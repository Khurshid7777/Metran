import { describe, expect, it } from 'vitest';
import { isBankCase, mergeCases } from '../../src/storage/cases';
import type { BankCase } from '../../src/modules/common/bank';

const sample: BankCase = {
  id: 'local-1',
  ageCategory: 'adult',
  sampleType: 'arterial',
  vignette: { ru: 'а', uz: 'б', en: 'c' },
  values: { pH: 7.25, pCO2: 28 },
  expected: { primary: 'metabolic_acidosis', secondary: [] },
  level: 1,
  reviewedBy: 'Dr',
  reviewedAt: '2026-11-05',
};

describe('редактор случаев: хранилище', () => {
  it('isBankCase отбрасывает неполные объекты', () => {
    expect(isBankCase(sample)).toBe(true);
    expect(isBankCase({ ...sample, values: { pH: 7.2 } })).toBe(false);
    expect(isBankCase({ ...sample, expected: { primary: 'none' } })).toBe(false);
    expect(isBankCase(null)).toBe(false);
    expect(isBankCase('x')).toBe(false);
  });

  it('mergeCases заменяет по id и считает новые', () => {
    const upd = { ...sample, level: 3 };
    const m = mergeCases([sample], [upd, { ...sample, id: 'local-2' }]);
    expect(m.added).toBe(1);
    expect(m.list).toHaveLength(2);
    expect(m.list.find((c) => c.id === 'local-1')!.level).toBe(3);
  });
});
