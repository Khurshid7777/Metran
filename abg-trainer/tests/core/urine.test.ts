import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import type { AbgInput } from '../../src/core/types';

const acidosis: AbgInput = { pH: 7.25, pCO2: 28, HCO3: 12, Na: 138, Cl: 112, K: 3.4, sampleType: 'venous', ageCategory: 'adult', weightKg: 70 };
const codes = (i: AbgInput) => interpret(i).flags.map((f) => f.code);

describe('показатели мочи', () => {
  it('UAG отрицательный и положительный при ацидозе с нормальным АИ', () => {
    const neg = interpret({ ...acidosis, urineNa: 20, urineK: 30, urineCl: 80 });
    expect(neg.urine?.uag).toBe(-30);
    expect(neg.flags.map((f) => f.code)).toContain('urine_ag_negative');
    expect(codes({ ...acidosis, urineNa: 60, urineK: 40, urineCl: 50 })).toContain('urine_ag_positive');
  });

  it('хлор мочи при метаболическом алкалозе', () => {
    const alk: AbgInput = { pH: 7.5, pCO2: 48, HCO3: 36, Na: 138, Cl: 88, K: 3, sampleType: 'arterial', ageCategory: 'adult', weightKg: 70 };
    expect(interpret({ ...alk, urineCl: 10 }).urine?.clClass).toBe('responsive');
    expect(interpret({ ...alk, urineCl: 60 }).urine?.clClass).toBe('resistant');
    expect(interpret({ ...alk, urineCl: 30 }).urine?.clClass).toBe('intermediate');
  });

  it('FENa и FEUrea по формулам', () => {
    const r = interpret({ ...acidosis, urineNa: 10, creatinine: 200, urineCreatinine: 10000, urea: 20, urineUrea: 200 });
    expect(r.urine?.fena).toBeCloseTo((10 * 200) / (138 * 10000) * 100, 6);
    expect(r.urine?.fenaClass).toBe('prerenal');
    expect(r.urine?.feurea).toBeCloseTo((200 * 200) / (20 * 10000) * 100, 6);
    expect(r.urine?.feureaClass).toBe('prerenal');
    expect(interpret({ ...acidosis, urineNa: 10, creatinine: 200, urineCreatinine: 10000, urea: 20, urineUrea: 400 }).urine?.feureaClass).toBe('other');
  });

  it('нет блока без введённых данных мочи и FENa у новорождённых не считается', () => {
    expect(interpret(acidosis).urine).toBeUndefined();
    const neo = interpret({ ...acidosis, ageCategory: 'term_neonate', weightKg: 3, urineNa: 10, creatinine: 60, urineCreatinine: 3000 });
    expect(neo.urine?.fena).toBeUndefined();
  });
});

describe('коррекция Na раствором (Adrogué–Madias)', () => {
  const hypo: AbgInput = { pH: 7.4, pCO2: 40, HCO3: 24, Na: 120, sampleType: 'venous', ageCategory: 'adult', weightKg: 70 };

  it('гипонатриемия: Δ на 1 л и объём до предела 8 ммоль/л', () => {
    const c = interpret(hypo).naCorrection!;
    const tbw = 0.6 * 70;
    expect(c.direction).toBe('raise');
    const s3 = c.items.find((i) => i.id === 'nacl3')!;
    expect(s3.deltaPerL).toBeCloseTo((513 - 120) / (tbw + 1), 6);
    expect(s3.litres24h).toBeCloseTo(8 / s3.deltaPerL, 6);
    expect(c.items.find((i) => i.id === 'd5w')!.wrongDirection).toBe(true);
  });

  it('гипернатриемия: 5 % глюкоза снижает Na, 3 % NaCl нет', () => {
    const c = interpret({ ...hypo, Na: 160 }).naCorrection!;
    expect(c.direction).toBe('lower');
    expect(c.items.find((i) => i.id === 'd5w')!.deltaPerL).toBeCloseTo(-160 / 43, 6);
    expect(c.items.find((i) => i.id === 'nacl3')!.wrongDirection).toBe(true);
  });

  it('нет блока при нормальном Na или без веса', () => {
    expect(interpret({ ...hypo, Na: 140 }).naCorrection).toBeUndefined();
    expect(interpret({ ...hypo, weightKg: undefined }).naCorrection).toBeUndefined();
  });
});
