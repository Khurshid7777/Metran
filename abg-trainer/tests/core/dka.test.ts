import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import type { AbgInput } from '../../src/core/types';

const base: AbgInput = { pH: 7.12, pCO2: 22, HCO3: 7, sampleType: 'venous', ageCategory: 'child', glucose: 28, Na: 132, K: 4.5, weightKg: 20 };
const codes = (i: AbgInput) => interpret(i).flags.map((f) => f.code);

describe('ДКА', () => {
  it('ребёнок: тяжесть, осмолярность, диапазон инсулина по ISPAD', () => {
    const r = interpret(base);
    expect(r.dka?.severity).toBe('moderate');
    expect(r.dka?.effOsm).toBeCloseTo(2 * 132 + 28, 5);
    expect(r.dka?.insulin).toEqual({ lo: 1, hi: 2, lowRateAllowed: false });
    expect(codes(base)).toContain('dka_met');
  });

  it('ребёнок: тяжёлая степень, доза 0,05 допустима при pH > 7,15', () => {
    expect(interpret({ ...base, pH: 7.05, HCO3: 4 }).dka?.severity).toBe('severe');
    expect(interpret({ ...base, pH: 7.2, HCO3: 12 }).dka?.insulin?.lowRateAllowed).toBe(true);
  });

  it('ребёнок: правила калия — отложить инсулин при K < 3,0, отложить калий при K > 5,5', () => {
    expect(codes({ ...base, K: 2.8 })).toContain('dka_k_hold_insulin');
    expect(codes({ ...base, K: 6.1 })).toContain('dka_k_defer');
    const ok = codes({ ...base, K: 4.5 });
    expect(ok).not.toContain('dka_k_hold_insulin');
    expect(ok).not.toContain('dka_k_defer');
  });

  it('ребёнок: напоминание о декстрозе при глюкозе 14–17', () => {
    expect(codes({ ...base, glucose: 15 })).toContain('dka_dextrose');
    expect(codes({ ...base, glucose: 28 })).not.toContain('dka_dextrose');
  });

  it('взрослый: критерии ADA 2024, BHB и эугликемический вариант', () => {
    const a: AbgInput = { ...base, ageCategory: 'adult', weightKg: undefined, bhb: 5.2 };
    expect(interpret(a).dka?.met).toBe(true);
    const eu = interpret({ ...a, glucose: 8 });
    expect(eu.dka?.euglycemic).toBe(true);
    expect(eu.flags.map((f) => f.code)).toContain('dka_euglycemic');
    expect(interpret({ ...a, bhb: undefined }).dka?.missing).toContain('bhb');
  });

  it('не срабатывает без ацидоза, у новорождённых и без глюкозы', () => {
    expect(interpret({ ...base, pH: 7.4, HCO3: 24, pCO2: 40 }).dka).toBeUndefined();
    expect(interpret({ ...base, ageCategory: 'term_neonate' }).dka).toBeUndefined();
    expect(interpret({ ...base, glucose: undefined }).dka).toBeUndefined();
    expect(interpret({ ...base, glucose: 6 }).dka).toBeUndefined();
  });
});
