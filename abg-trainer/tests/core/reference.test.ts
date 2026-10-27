import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import type { AbgInput, Settings } from '../../src/core/types';

const adult = (v: Partial<AbgInput>): AbgInput => ({
  pH: 7.4,
  pCO2: 40,
  sampleType: 'arterial',
  ageCategory: 'adult',
  ...v,
});
const stepOf = (r: ReturnType<typeof interpret>, id: string) => r.steps.find((s) => s.id === id)!;
const flagCodes = (r: ReturnType<typeof interpret>) => r.flags.map((f) => f.code);
const ADV: Settings = { advanced: true, agWithK: false };

describe('Эталонные кейсы ТЗ', () => {
  it('1: метаболический ацидоз, компенсация адекватна', () => {
    const r = interpret(adult({ pH: 7.28, pCO2: 26, HCO3: 12 }));
    expect(r.phStatus).toBe('acidemia');
    expect(r.primary).toBe('metabolic_acidosis');
    expect(r.compensation).toBe('adequate');
    expect(r.secondary).toEqual([]);
    expect(stepOf(r, 'compensation').value).toBeCloseTo(26);
  });

  it('2: метаболический ацидоз + респираторный ацидоз', () => {
    const r = interpret(adult({ pH: 7.09, pCO2: 40, HCO3: 12 }));
    expect(r.primary).toBe('metabolic_acidosis');
    expect(r.secondary).toEqual(['respiratory_acidosis']);
    expect(r.compensation).toBe('insufficient');
  });

  it('3: острый респираторный ацидоз', () => {
    const r = interpret(adult({ pH: 7.25, pCO2: 60, HCO3: 26 }));
    expect(r.primary).toBe('respiratory_acidosis');
    expect(r.chronicity).toBe('acute');
    expect(stepOf(r, 'compensation').details.expectedAcute).toBeCloseTo(26);
    expect(r.secondary).toEqual([]);
  });

  it('4: хронический респираторный ацидоз', () => {
    const r = interpret(adult({ pH: 7.33, pCO2: 60, HCO3: 31 }));
    expect(r.primary).toBe('respiratory_acidosis');
    expect(r.chronicity).toBe('chronic');
    expect(stepOf(r, 'compensation').details.expectedChronic).toBeCloseTo(31);
  });

  it('5: метаболический алкалоз, компенсация адекватна', () => {
    const r = interpret(adult({ pH: 7.51, pCO2: 46, HCO3: 36 }));
    expect(r.primary).toBe('metabolic_alkalosis');
    expect(r.compensation).toBe('adequate');
    expect(stepOf(r, 'compensation').value).toBeCloseTo(46.2);
  });

  it('6: AG 12 формально норма, AG_корр 17 → повышен, Δ/Δ 0,83', () => {
    const r = interpret(adult({ pH: 7.33, pCO2: 35, HCO3: 18, Na: 140, Cl: 110, albumin: 20 }));
    const ag = stepOf(r, 'anionGap');
    expect(ag.details.ag).toBeCloseTo(12);
    expect(ag.value).toBeCloseTo(17);
    expect(ag.verdict).toBe('elevated');
    expect(flagCodes(r)).toContain('ag_masked_by_albumin');
    const dd = stepOf(r, 'deltaRatio');
    expect(dd.value).toBeCloseTo(0.833, 2);
    expect(dd.verdict).toBe('pure_high_ag');
  });

  it('7: AG 32, Δ/Δ 3,3 → + метаболический алкалоз', () => {
    const r = interpret(adult({ pH: 7.33, pCO2: 35, HCO3: 18, Na: 140, Cl: 90, albumin: 40 }));
    expect(stepOf(r, 'anionGap').value).toBeCloseTo(32);
    const dd = stepOf(r, 'deltaRatio');
    expect(dd.value).toBeCloseTo(3.33, 2);
    expect(dd.verdict).toBe('plus_met_alk');
    expect(r.secondary).toContain('metabolic_alkalosis');
  });

  it('8: несогласованная проба', () => {
    const r = interpret(adult({ pH: 7.4, pCO2: 40, HCO3: 15 }));
    const c = stepOf(r, 'consistency');
    expect(c.verdict).toBe('inconsistent');
    expect(Math.round(c.details.hMeasured as number)).toBe(40);
    expect(Math.round(c.details.hCalc as number)).toBe(64);
    expect(flagCodes(r)).toContain('inconsistent_sample');
  });

  it('9: PAO2 285, A-a 185, P/F 200 → ОРДС средней тяжести', () => {
    const r = interpret(adult({ pH: 7.4, pCO2: 40, FiO2: 0.5, pO2: 100, PEEP: 8 }));
    const o = stepOf(r, 'oxygenation');
    expect(o.details.PAO2).toBeCloseTo(285);
    expect(o.details.Aa).toBeCloseTo(185);
    expect(o.details.PF).toBeCloseTo(200);
    expect(o.details.berlin).toBe('moderate');
  });

  it('10: OI 30 у новорождённого → обсудить iNO, не ЭКМО', () => {
    const r = interpret({ pH: 7.3, pCO2: 45, sampleType: 'arterial', ageCategory: 'term_neonate', MAP: 15, FiO2: 0.8, pO2: 40 });
    const o = stepOf(r, 'oxygenation');
    expect(o.details.OI).toBeCloseTo(30);
    expect(flagCodes(r)).toContain('oi_ino');
    expect(flagCodes(r)).not.toContain('oi_ecmo');
  });

  it('11: Стюарт', () => {
    const r = interpret(adult({ pH: 7.2, pCO2: 30, Na: 140, Cl: 115, albumin: 20, lactate: 4, BE: -15 }), ADV);
    const s = stepOf(r, 'stewart');
    expect(s.details.naCl).toBeCloseTo(-13);
    expect(s.details.albumin).toBeCloseTo(5.5);
    expect(s.details.lactate).toBeCloseTo(-4);
    expect(s.details.uma).toBeCloseTo(-3.5);
    expect(flagCodes(r)).toContain('unmeasured_anions');
  });

  it('12: бикарбонат — дефицит 12,6; первая доза 6,3 ммоль = 12,6 мл 4,2%', () => {
    const r = interpret({
      pH: 7.28, pCO2: 26, HCO3: 12, BE: -14, Na: 140, Cl: 118, albumin: 40,
      sampleType: 'arterial', ageCategory: 'term_neonate', weightKg: 3,
    });
    expect(r.acidosisType).toBe('normal_ag');
    const b = r.treatment!.bicarbonate!;
    expect(b.deficit).toBeCloseTo(12.6);
    expect(b.firstDose).toBeCloseTo(6.3);
    expect(b.concentration).toBe('4.2');
    expect(b.volumeMl).toBeCloseTo(12.6);
    expect(b.blocked).toBe(false);
  });

  it('13: пуповина-артерия pH 6,95; BE −17', () => {
    const r = interpret({ pH: 6.95, pCO2: 60, BE: -17, sampleType: 'cord_artery', ageCategory: 'term_neonate' });
    expect(flagCodes(r)).toContain('cord_pathological_acidemia');
    expect(flagCodes(r)).toContain('cord_hypothermia');
  });

  it('14: осмолярный разрыв 20', () => {
    const r = interpret(adult({ Na: 140, glucose: 5, urea: 5, measuredOsm: 310 }));
    const o = stepOf(r, 'osmolar');
    expect(o.details.calc).toBe(290);
    expect(o.value).toBe(20);
    expect(flagCodes(r)).toContain('osmolar_gap');
  });

  it('15: венозная проба с PaO2 — шаг 9 по PaO2 отключён', () => {
    const r = interpret(adult({ sampleType: 'venous', pO2: 40, FiO2: 0.21 }));
    const o = stepOf(r, 'oxygenation');
    expect(o.status).toBe('disabled');
    expect(o.details.PF).toBeUndefined();
    expect(flagCodes(r)).toContain('pao2_not_interpretable');
    expect(flagCodes(r)).toContain('venous_sample');
  });
});
