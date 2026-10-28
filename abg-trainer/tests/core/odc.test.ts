import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import { inverseSeveringhaus, odcCurve, p50FromPoint, P50_STD, predictedSO2, severinghaus, shiftFactor, virtualPO2 } from '../../src/core/odc';
import type { AbgInput } from '../../src/core/types';

const adult = (v: Partial<AbgInput>): AbgInput => ({ pH: 7.4, pCO2: 40, sampleType: 'arterial', ageCategory: 'adult', ...v });
const metric = (v: Partial<AbgInput>, id: string) => interpret(adult(v)).metrics.find((m) => m.id === id);

describe('кривая диссоциации (Северингхаус)', () => {
  it('опорные точки стандартной кривой', () => {
    expect(severinghaus(P50_STD)).toBeCloseTo(0.5, 3);
    expect(severinghaus(100)).toBeCloseTo(0.977, 3);
    expect(severinghaus(40)).toBeCloseTo(0.75, 2);
    expect(severinghaus(0)).toBe(0);
    expect(inverseSeveringhaus(0.5)).toBeCloseTo(P50_STD, 2);
  });
  it('эффект Бора и температуры', () => {
    expect(virtualPO2(50, 7.4, 40, 37)).toBeCloseTo(50, 6);
    expect(virtualPO2(50, 7.2, 40)).toBeLessThan(50);
    expect(shiftFactor(7.2, 40)).toBeGreaterThan(1);
    expect(predictedSO2(40, 7.2, 60)).toBeLessThan(predictedSO2(40, 7.4, 40));
    expect(predictedSO2(40, 7.4, 40, 34)).toBeGreaterThan(predictedSO2(40, 7.4, 40, 37));
    const c = odcCurve(100, 1, 10);
    expect(c).toHaveLength(11);
    expect(c[10][1]).toBeCloseTo(97.7, 1);
  });
  it('p50 из одной точки — анализ ABL800: 26,3 (ABL p50 26,10)', () => {
    expect(p50FromPoint(44.3, 81)).toBeCloseTo(26.3, 1);
    expect(p50FromPoint(80, 99)).toBeUndefined();
    expect(metric({ pH: 7.465, pCO2: 44.1, pO2: 44.3, SaO2: 81, temperature: 36.8 }, 'p50')!.value).toBeCloseTo(26.3, 1);
    expect(metric({ pH: 7.465, pCO2: 44.1, pO2: 44.3, temperature: 36.8 }, 'sO2Predicted')!.value).toBeCloseTo(82.8, 1);
  });
  it('расхождение sO₂ и pO₂, FO₂Hb, PIO₂', () => {
    const codes = (v: Partial<AbgInput>) => interpret(adult(v)).flags.map((f) => f.code);
    expect(codes({ pO2: 90, SaO2: 80 })).toContain('so2_mismatch');
    expect(codes({ pO2: 90, SaO2: 97 })).not.toContain('so2_mismatch');
    expect(metric({ SaO2: 81, FCOHb: 1.4, FMetHb: 1.2 }, 'FO2Hb')!.value).toBeCloseTo(78.9, 1);
    expect(metric({ FiO2: 0.25, pO2: 44.3 }, 'PIO2')!.value).toBeCloseTo(167.5, 1);
  });
});

describe('профиль отклонений и новые дефициты', () => {
  it('профиль: z = 0 в середине нормы, ±1 на границах', () => {
    const p = interpret(adult({ pH: 7.45, pCO2: 40, HCO3: 24.4, Na: 135, K: 2.7, Hb: 147.5 })).profile;
    expect(p.find((x) => x.id === 'pH')!.z).toBeCloseTo(1, 5);
    expect(p.find((x) => x.id === 'pCO2')!.z).toBeCloseTo(0, 5);
    expect(p.find((x) => x.id === 'Na')!.z).toBeCloseTo(-1, 5);
    expect(p.find((x) => x.id === 'K')!.z).toBeLessThan(-2);
    expect(p.find((x) => x.id === 'Hb')!.z).toBeCloseTo(0, 5);
    expect(interpret({ pH: 7.3, pCO2: 45, sampleType: 'capillary', ageCategory: 'term_neonate', glucose: 2.8 }).profile.find((x) => x.id === 'glucose')!.lo).toBe(2.8);
  });
  it('дефицит HCO₃⁻ по Kassirer и Holliday–Segar', () => {
    const r = interpret(adult({ pH: 7.28, pCO2: 26, HCO3: 12, weightKg: 70 }));
    expect(r.deficits.find((d) => d.id === 'bicarbHCO3')!.amount).toBeCloseTo(0.5 * 70 * 12);
    expect(r.deficits.find((d) => d.id === 'maintenance')!.amount).toBe(110);
    expect(interpret({ pH: 7.4, pCO2: 40, sampleType: 'arterial', ageCategory: 'child', weightKg: 15 }).deficits.find((d) => d.id === 'maintenance')!.amount).toBe(50);
    expect(interpret({ pH: 7.4, pCO2: 40, sampleType: 'arterial', ageCategory: 'child', weightKg: 8 }).deficits.find((d) => d.id === 'maintenance')!.amount).toBe(32);
    expect(interpret({ pH: 7.4, pCO2: 40, sampleType: 'arterial', ageCategory: 'term_neonate', weightKg: 3 }).deficits.find((d) => d.id === 'maintenance')).toBeUndefined();
  });
});
