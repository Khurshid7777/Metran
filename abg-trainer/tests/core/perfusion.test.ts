import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import { analyzeSeries, type SeriesEntry } from '../../src/core/series';
import type { AbgInput } from '../../src/core/types';

const adult = (v: Partial<AbgInput>): AbgInput => ({ pH: 7.4, pCO2: 40, sampleType: 'arterial', ageCategory: 'adult', ...v });
const metric = (v: Partial<AbgInput>, id: string) => interpret(adult(v)).metrics.find((m) => m.id === id);
const codes = (v: Partial<AbgInput>) => interpret(adult(v)).flags.map((f) => f.code);

const pair = { pO2: 90, SaO2: 97, Hb: 120, ScvO2: 65, pvO2: 35, FiO2: 0.4, cardiacOutput: 5, weightKg: 70 };

describe('перфузия: парная артерия + центральная вена', () => {
  it('CvO₂, a-vDO₂, экстракция O₂, DO₂, VO₂', () => {
    const ca = 1.39 * 12 * 0.97 + 0.003 * 90;
    const cv = 1.39 * 12 * 0.65 + 0.003 * 35;
    expect(metric(pair, 'CvO2')!.value).toBeCloseTo(cv, 5);
    expect(metric(pair, 'avDO2')!.value).toBeCloseTo(ca - cv, 5);
    expect(metric(pair, 'O2ER')!.value).toBeCloseTo((ca - cv) / ca, 5);
    expect(metric(pair, 'DO2')!.value).toBeCloseTo(5 * ca * 10, 5);
    expect(metric(pair, 'VO2')!.value).toBeCloseTo(5 * (ca - cv) * 10, 5);
    expect(metric(pair, 'DO2kg')!.value).toBeCloseTo((5 * ca * 10) / 70, 5);
    expect(codes(pair)).toEqual(expect.arrayContaining(['o2er_high', 'scvo2_low']));
  });
  it('точный шунт по Берггрену с венозным содержанием', () => {
    const r = interpret(adult(pair));
    const pao2 = r.steps.find((s) => s.id === 'oxygenation')!.details.PAO2 as number;
    const cc = 1.39 * 12 + 0.003 * pao2;
    const ca = 1.39 * 12 * 0.97 + 0.003 * 90;
    const cv = 1.39 * 12 * 0.65 + 0.003 * 35;
    expect(r.metrics.find((m) => m.id === 'shuntExact')!.value).toBeCloseTo(((cc - ca) / (cc - cv)) * 100, 5);
    expect(metric({ ...pair, pvO2: undefined }, 'CvO2')!.params.pv).toBe(40);
  });
  it('вено-артериальный градиент pCO₂', () => {
    expect(metric({ pvCO2: 49 }, 'pCO2gap')!.value).toBe(9);
    expect(codes({ pvCO2: 49 })).toContain('pco2_gap_high');
    expect(codes({ pvCO2: 44 })).not.toContain('pco2_gap_high');
  });
});

describe('вентиляция', () => {
  it('индекс вентиляции, движущее давление, PBW и вентиляционное отношение', () => {
    expect(metric({ PIP: 25, ventilation: { mode: 'conventional', rate: 40 }, pCO2: 50, pH: 7.3 }, 'VI')!.value).toBe(50);
    expect(metric({ PIP: 28, PEEP: 10 }, 'drivingPressure')!.value).toBe(18);
    expect(codes({ PIP: 28, PEEP: 10 })).toContain('driving_pressure_high');
    const v = { VE: 12, heightCm: 175, pCO2: 50, pH: 7.3 };
    const pbw = 50 + 0.91 * (175 - 152.4);
    expect(metric(v, 'PBW')!.value).toBeCloseTo(pbw, 5);
    expect(metric(v, 'VR')!.value).toBeCloseTo((12000 * 50) / (pbw * 3750), 5);
    expect(codes({ ...v, VE: 16 })).toContain('vr_high');
  });
});

describe('динамика', () => {
  const e = (id: string, time: string, v: Partial<AbgInput>): SeriesEntry => ({ id, time, input: adult(v) });
  it('скорость роста Na⁺ > 8 ммоль/л за 24 ч и снижения > 10', () => {
    const s = analyzeSeries([e('1', '2026-10-28T00:00:00Z', { Na: 118 }), e('2', '2026-10-28T06:00:00Z', { Na: 123 })]);
    expect(s.flags[0]).toMatchObject({ code: 'na_rise_fast', params: { d: 5, h: 6, v: 20 } });
    expect(analyzeSeries([e('1', '2026-10-28T00:00:00Z', { Na: 160 }), e('2', '2026-10-28T04:00:00Z', { Na: 155 })]).flags[0].code).toBe('na_fall_fast');
    expect(analyzeSeries([e('1', '2026-10-28T00:00:00Z', { Na: 120 }), e('2', '2026-10-29T00:00:00Z', { Na: 126 })]).flags).toEqual([]);
    expect(analyzeSeries([e('1', '2026-10-28T00:00:00Z', { Na: 120 }), e('2', '2026-10-28T00:30:00Z', { Na: 125 })]).flags).toEqual([]);
  });
  it('клиренс лактата, тренды и путь на карте', () => {
    const s = analyzeSeries([
      e('2', '2026-10-28T02:00:00Z', { lactate: 5.6, pH: 7.3, pCO2: 30, HCO3: 14.5 }),
      e('1', '2026-10-28T00:00:00Z', { lactate: 6, pH: 7.2, pCO2: 28, HCO3: 10.6, pO2: 80, FiO2: 0.5 }),
    ]);
    expect(s.hours).toEqual([0, 2]);
    expect(s.lactateClearance).toBeCloseTo(6.67, 1);
    expect(s.flags.map((f) => f.code)).toContain('lactate_clearance_low');
    expect(s.trends.PF).toEqual([160, undefined]);
    expect(s.path).toEqual([[28, 10.6], [30, 14.5]]);
    expect(analyzeSeries([]).hours).toEqual([]);
  });
});
