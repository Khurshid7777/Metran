import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import type { AbgInput } from '../../src/core/types';

const adult = (v: Partial<AbgInput>): AbgInput => ({ pH: 7.4, pCO2: 40, sampleType: 'arterial', ageCategory: 'adult', ...v });
const metric = (v: Partial<AbgInput>, id: string) => interpret(adult(v)).metrics.find((m) => m.id === id);
const codes = (v: Partial<AbgInput>) => interpret(adult(v)).flags.map((f) => f.code);

// Values of the clinic's Radiometer ABL800 FLEX sample (patient data removed)
const ABL: Partial<AbgInput> = {
  pH: 7.465, pCO2: 44.1, pO2: 44.3, HCO3: 31.3, BE: 7.3, Hb: 118, SaO2: 81, K: 2.7, Na: 139, iCa: 0.86, Cl: 101, glucose: 5.7, lactate: 1.4, FiO2: 0.25, temperature: 36.8,
};

describe('расширенная оценка — сверка с ABL800', () => {
  it('SBE по Ван Слайку = cBase(Ecf) анализатора (7,3)', () => {
    expect(metric(ABL, 'sbeVanSlyke')!.value).toBeCloseTo(7.3, 1);
    expect(codes(ABL)).not.toContain('sbe_mismatch');
    expect(codes({ ...ABL, BE: 0 })).toContain('sbe_mismatch');
  });
  it('cCa²⁺(7,4) = 0,89 как на ABL', () => {
    expect(metric(ABL, 'ca74')!.value).toBeCloseTo(0.89, 2);
  });
  it('температурная поправка: pH(T) 7,468 и pCO₂(T) 43,7 как на ABL', () => {
    expect(metric(ABL, 'pHT')!.value).toBeCloseTo(7.468, 3);
    expect(metric(ABL, 'pCO2T')!.value).toBeCloseTo(43.7, 1);
    expect(metric({ ...ABL, temperature: 37 }, 'pHT')).toBeUndefined();
  });
  it('шунт, a/A, RI близки к ABL (FShunt 36,4%, a/A 39,9%, RI 150%)', () => {
    const shunt = metric(ABL, 'shunt')!;
    expect(shunt.value).toBeGreaterThan(33);
    expect(shunt.value).toBeLessThan(42);
    expect(codes(ABL)).toContain('shunt_high');
    expect(metric(ABL, 'aARatio')!.value).toBeCloseTo(0.39, 1);
    expect(metric(ABL, 'RI')!.value).toBeCloseTo(1.5, 1);
    expect(metric(ABL, 'aARatio')!.verdict).toBe('low');
  });
  it('электролиты: Na−Cl, Cl:Na, корр. Cl⁻, эффективная осмоляльность', () => {
    expect(metric(ABL, 'naClDiff')!.value).toBe(38);
    expect(metric(ABL, 'clNaRatio')!.value).toBeCloseTo(0.727, 3);
    expect(metric(ABL, 'clNaRatio')!.verdict).toBe('low');
    expect(metric(ABL, 'clCorrected')!.value).toBeCloseTo(101.7, 1);
    expect(metric(ABL, 'osmEffective')!.value).toBeCloseTo(283.7, 1);
    expect(metric(ABL, 'glucoseMg')!.value).toBeCloseTo(102.7, 0);
    expect(metric(ABL, 'hct')!.value).toBeCloseTo(35.4, 1);
  });
});

describe('расширенная оценка — формулы', () => {
  it('[H⁺], ожидаемый pH при остром и хроническом респираторном сдвиге', () => {
    expect(metric({ pH: 7.4 }, 'hPlus')!.value).toBeCloseTo(39.8, 1);
    expect(metric({ pH: 7.25, pCO2: 60, HCO3: 26 }, 'pHacute')!.value).toBeCloseTo(7.24, 2);
    expect(metric({ pH: 7.25, pCO2: 60, HCO3: 26 }, 'pHchronic')!.value).toBeCloseTo(7.34, 2);
  });
  it('корригированный HCO₃⁻, ожидаемый AG по альбумину, доля лактата', () => {
    const v = { pH: 7.33, pCO2: 35, HCO3: 18, Na: 140, Cl: 90, albumin: 40, lactate: 10 };
    expect(metric(v, 'hco3Corrected')!.value).toBe(38);
    expect(metric(v, 'hco3Corrected')!.verdict).toBe('high');
    expect(metric(v, 'agExpected')!.value).toBe(10);
    expect(metric(v, 'lactateShare')!.value).toBe(50);
  });
  it('SIG по Фиглю', () => {
    const v = { pH: 7.2, pCO2: 30, HCO3: 11.4, Na: 140, K: 4, Cl: 110, albumin: 40, lactate: 2, phosphate: 1.2 };
    const side = metric(v, 'SIDe')!.value;
    expect(side).toBeCloseTo(11.4 + 40 * (0.123 * 7.2 - 0.631) + 1.2 * (0.309 * 7.2 - 0.469), 5);
    expect(metric(v, 'SIG')!.value).toBeCloseTo(32 - side, 5);
    expect(codes(v)).toContain('sig_high');
  });
  it('Na⁺ с поправкой на гипергликемию (Hillier)', () => {
    expect(metric({ Na: 130, glucose: 33.3 }, 'naCorrected')!.value).toBeCloseTo(130 + 2.4 * 5, 0);
    expect(metric({ Na: 130, glucose: 4, urea: 5 }, 'osmCalculated')!.value).toBe(269);
  });
  it('мёртвое пространство и ожидаемый PaO₂ по возрасту', () => {
    expect(metric({ pCO2: 50, etCO2: 25 }, 'deadSpace')!.value).toBe(0.5);
    expect(codes({ pCO2: 50, etCO2: 15 })).toContain('dead_space_high');
    expect(metric({ pO2: 80, FiO2: 0.21, ageYears: 60 }, 'pO2Expected')!.value).toBeCloseTo(88, 0);
  });
  it('билирубин в мг/дл и отношение билирубин/альбумин', () => {
    const neo = { ageCategory: 'term_neonate' as const, bilirubin: 342, albumin: 30, gestationalWeeks: 39 };
    expect(metric(neo, 'biliMg')!.value).toBeCloseTo(20, 1);
    expect(metric(neo, 'baRatio')!.value).toBeCloseTo(6.67, 1);
    expect(codes({ ...neo, bilirubin: 450 })).toContain('ba_ratio_high');
    expect(metric({ ...neo, biliRisk: true }, 'baRatio')!.params.thr).toBe(7.2);
    expect(metric({ ...neo, gestationalWeeks: 36 }, 'baRatio')!.params.thr).toBe(7.2);
    expect(metric({ ...neo, gestationalWeeks: 36, biliRisk: true }, 'baRatio')!.params.thr).toBe(6.8);
  });
});
