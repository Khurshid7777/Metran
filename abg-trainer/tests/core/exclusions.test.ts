import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, interpret } from '../../src/core/interpret';
import type { AbgInput } from '../../src/core/types';

const icu: AbgInput = {
  pH: 7.28, pCO2: 30, HCO3: 14, BE: -10, Na: 138, K: 6.8, Cl: 106, albumin: 22, lactate: 4.2, glucose: 14, urea: 12,
  sampleType: 'arterial', ageCategory: 'adult', weightKg: 70, ageYears: 55, pO2: 92, FiO2: 0.4, Hb: 105, bhb: 5, SaO2: 96,
  ScvO2: 68, pvO2: 38, pvCO2: 44, cardiacOutput: 5.2, temperature: 37.5, MAP: 12, PEEP: 6, PIP: 24, VE: 8, heightCm: 175, phosphate: 1.4,
};
const run = (exclude?: string[], input = icu) => interpret(input, { ...DEFAULT_SETTINGS, advanced: true, exclude });
const stepOf = (r: ReturnType<typeof run>, id: string) => r.steps.find((s) => s.id === id)!;

describe('исключение расчётов', () => {
  it('без исключений всё считается', () => {
    const r = run();
    expect(r.excluded).toBeUndefined();
    expect(stepOf(r, 'anionGap').status).toBe('done');
    expect(r.dka?.met).toBe(true);
    expect(r.hyperK).toBeDefined();
    expect(r.metrics.some((m) => m.group === 'perfusion')).toBe(true);
  });

  it('анионный интервал: шаги отключены, скрытые зависимости не строятся', () => {
    const r = run(['anionGap']);
    expect(stepOf(r, 'anionGap').status).toBe('disabled');
    expect(stepOf(r, 'deltaRatio').status).toBe('disabled');
    expect(stepOf(r, 'anionGap').explanationKey).toBe('step.excluded');
    expect(r.metrics.some((m) => m.id === 'hco3Corrected')).toBe(false);
    expect(r.acidosisType).toBeUndefined();
    expect(r.excluded).toEqual(['anionGap']);
  });

  it('шаги: осмолярность, Стюарт, оксигенация и лаборатория отключаются вместе с предупреждениями', () => {
    const base = run();
    expect(base.flags.some((f) => f.code.startsWith('hyperkalemia'))).toBe(true);
    const r = run(['osmolar', 'stewart', 'oxygenation', 'labs']);
    for (const id of ['osmolar', 'stewart', 'oxygenation', 'labs']) expect(stepOf(r, id).status).toBe('disabled');
    expect(r.flags.some((f) => f.code.startsWith('hyperkalemia'))).toBe(false);
    expect(r.treatment?.potassium).toBeUndefined();
  });

  it('группы показателей: метрики и их предупреждения убираются', () => {
    const r = run(['m.perfusion', 'm.oxygen']);
    expect(r.metrics.some((m) => m.group === 'perfusion' || m.group === 'oxygen')).toBe(false);
    expect(r.metrics.some((m) => m.group === 'acidBase')).toBe(true);
    expect(r.flags.some((f) => ['o2er_high', 'scvo2_low', 'pco2_gap_high', 'shunt_high'].includes(f.code))).toBe(false);
  });

  it('блоки: ДКА, гиперкалиемия, дефициты, лечение, моча', () => {
    const r = run(['dka', 'hyperK', 'deficits', 'treatment', 'urine', 'naCorrection', 'preanalytic']);
    expect(r.dka).toBeUndefined();
    expect(r.hyperK).toBeUndefined();
    expect(r.deficits).toEqual([]);
    expect(r.treatment?.available).toBe(false);
    expect(r.flags.some((f) => f.code.startsWith('dka_'))).toBe(false);
  });

  it('неизвестные ключи игнорируются, обычные настройки без exclude работают как раньше', () => {
    const r = run(['no_such_thing']);
    expect(r.excluded).toBeUndefined();
    expect(interpret(icu, DEFAULT_SETTINGS).primary).toBe(r.primary);
  });
});
