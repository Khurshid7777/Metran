import { describe, expect, it } from 'vitest';
import { buildInput } from '../../src/modules/calculator/buildInput';

const units = { gas: 'mmHg', albumin: 'g/L', glucose: 'mmol/L', urea: 'mmol/L' } as const;
const draft = (values: Record<string, string>, extra = {}) => ({
  values, sampleType: 'arterial' as const, ageCategory: 'adult' as const, bpd: false, ventMode: 'none' as const, units: { ...units }, ...extra,
});

describe('ввод анализа', () => {
  it('без типа пробы — ошибка (анализатор по умолчанию считает пробу артериальной)', () => {
    const r = buildInput(draft({ pH: '7,465', pCO2: '44,1' }, { sampleType: null }));
    expect(r.input).toBeUndefined();
    expect(r.bad).toContain('sampleType');
  });
  it('FiO2 из pO2(a)/FO2(I) анализатора ABL', () => {
    const r = buildInput(draft({ pH: '7.465', pCO2: '44.1', pO2: '44,3', pO2FO2: '177' }));
    expect(r.input!.FiO2).toBe(0.25);
  });
  it('введённый FiO2 важнее расчётного; проценты переводятся в долю', () => {
    expect(buildInput(draft({ pH: '7.4', pCO2: '40', pO2: '80', pO2FO2: '177', FiO2: '40' })).input!.FiO2).toBe(0.4);
  });
  it('пример анализа клиники (ABL800): метаболический алкалоз, гипокалиемия, флаг типа пробы', async () => {
    const { interpret } = await import('../../src/core/interpret');
    const r = buildInput(draft({ pH: '7,465', pCO2: '44,1', pO2: '44,3', BE: '7,3', HCO3: '31,3', Hb: '118', SaO2: '81', K: '2,7', Na: '139', iCa: '0,86', Cl: '101', glucose: '5,7', lactate: '1,4', pO2FO2: '177' }));
    const res = interpret(r.input!);
    expect(res.primary).toBe('metabolic_alkalosis');
    expect(res.compensation).toBe('adequate');
    const codes = res.flags.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['hypokalemia', 'possibly_venous']));
  });
});
