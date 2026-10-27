import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import type { AbgInput } from '../../src/core/types';

const r = (v: Partial<AbgInput>) => interpret({ pH: 7.4, pCO2: 40, sampleType: 'arterial', ageCategory: 'adult', ...v });
const codes = (v: Partial<AbgInput>) => r(v).flags.map((f) => f.code);
const labs = (v: Partial<AbgInput>) => r(v).steps.find((s) => s.id === 'labs')!;

describe('шаг 10: гемоглобин по возрасту и трансфузионные пороги', () => {
  it('нижняя граница Hb по ВОЗ 2024', () => {
    expect(labs({ Hb: 125, ageYears: 30 }).details.HbLower).toBe(120);
    expect(labs({ Hb: 100, ageCategory: 'child', ageYears: 1 }).details.HbLower).toBe(105);
    expect(labs({ Hb: 100, ageCategory: 'child', ageYears: 3 }).details.HbLower).toBe(110);
    expect(labs({ Hb: 100, ageCategory: 'child', ageYears: 8 }).details.HbLower).toBe(115);
    expect(labs({ Hb: 100, ageCategory: 'child', ageYears: 13 }).details.HbLower).toBe(120);
    expect(labs({ Hb: 100, ageCategory: 'child', ageYears: 0.3 }).details.HbLower).toBe(90);
    expect(labs({ Hb: 100, ageCategory: 'child', ageYears: 16 }).details.HbLower).toBe(120);
    expect(labs({ Hb: 150, ageCategory: 'child' }).details.HbLower).toBe(110);
    expect(labs({ Hb: 150, ageCategory: 'term_neonate', pCO2: 40, ageHours: 400 }).details.HbLower).toBe(100);
    expect(codes({ Hb: 118 })).toContain('anemia');
  });
  it('AABB 2023 у взрослых, 70 г/л у детей', () => {
    expect(codes({ Hb: 65 })).toContain('hb_transfusion');
    expect(labs({ Hb: 90, ageCategory: 'child', ageYears: 6 }).details.transfusionThreshold).toBe(70);
  });
  it('недоношенный: TOP по неделе жизни и респираторной поддержке', () => {
    const base = { ageCategory: 'preterm' as const, pCO2: 50, gestationalWeeks: 27 };
    expect(labs({ ...base, Hb: 100, ageHours: 48, FiO2: 0.3 }).details.transfusionThreshold).toBe(110);
    expect(labs({ ...base, Hb: 100, ageHours: 48 }).details.transfusionThreshold).toBe(100);
    expect(labs({ ...base, Hb: 100, ageHours: 200, MAP: 8 }).details.transfusionThreshold).toBe(100);
    expect(labs({ ...base, Hb: 80, ageHours: 500 }).details.transfusionThreshold).toBe(70);
    expect(codes({ ...base, Hb: 95, ageHours: 48, FiO2: 0.3 })).toContain('hb_transfusion_preterm');
    expect(labs({ ...base, Hb: 100 }).details.transfusionThreshold).toBeUndefined();
  });
  it('содержание O2 и расхождение sO2/SpO2', () => {
    expect(labs({ Hb: 150, SaO2: 98, pO2: 100 }).details.ctO2).toBeCloseTo(20.73, 1);
    expect(codes({ SaO2: 80, SpO2: 95 })).toContain('spo2_sao2_gap');
  });
});

describe('гипоксемия', () => {
  it('ниже нормы для возраста; < 60 у детей и взрослых — критично', () => {
    expect(codes({ pO2: 44, FiO2: 0.25 })).toContain('hypoxemia_severe');
    expect(codes({ pO2: 70, FiO2: 0.21 })).toContain('hypoxemia');
    expect(codes({ ageCategory: 'term_neonate', pO2: 45, FiO2: 0.4 })).toContain('hypoxemia');
    expect(codes({ pO2: 90, FiO2: 0.21 }).some((c) => c.startsWith('hypoxemia'))).toBe(false);
  });
});

describe('оксиметрия', () => {
  it('COHb', () => {
    expect(codes({ FCOHb: 1.4 })).not.toEqual(expect.arrayContaining(['cohb_elevated']));
    expect(codes({ FCOHb: 5 })).toContain('cohb_elevated');
    expect(codes({ FCOHb: 4, ageCategory: 'term_neonate' })).toContain('cohb_neonate');
    expect(codes({ FCOHb: 15 })).toContain('cohb_poisoning');
    expect(codes({ FCOHb: 30 })).toContain('cohb_hbo');
  });
  it('MetHb', () => {
    expect(codes({ FMetHb: 1.2 }).some((c) => c.startsWith('methb'))).toBe(false);
    expect(codes({ FMetHb: 3 })).toContain('methb_elevated');
    expect(codes({ FMetHb: 12 })).toContain('methb_cyanosis');
    expect(codes({ FMetHb: 25 })).toContain('methb_symptomatic');
    expect(codes({ FMetHb: 35 })).toContain('methb_treat');
  });
});

describe('K⁺ и Ca²⁺', () => {
  it('гиперкалиемия и коррекция гипокалиемии у ребёнка', () => {
    expect(codes({ K: 5.7 })).toContain('hyperkalemia_mild');
    const p = r({ ageCategory: 'child', ageYears: 4, K: 2.6, weightKg: 16 }).treatment!.potassium!;
    expect(p.doseMmol).toBeCloseTo(8);
    expect(p.maxRateMmolH).toBeCloseTo(3.2);
    expect(p.minHours).toBeCloseTo(2.5);
    expect(p.perKg).toBe(true);
    expect(r({ K: 2.6 }).treatment!.potassium).toBeUndefined();
  });
  it('ионизированный кальций по возрасту', () => {
    expect(codes({ iCa: 1.1 })).toContain('hypocalcemia_mild');
    expect(codes({ iCa: 0.7 })).toContain('hypocalcemia_severe');
    const pre = { ageCategory: 'preterm' as const, pCO2: 50, gestationalWeeks: 30 };
    expect(codes({ ...pre, iCa: 0.95 })).toContain('hypocalcemia_preterm');
    expect(codes({ ...pre, iCa: 0.75 })).toContain('hypocalcemia_severe');
    expect(r({ ...pre, iCa: 0.75, weightKg: 1.2 }).treatment!.calcium!.gluconateMl).toBeCloseTo(0.6);
    expect(codes({ ageCategory: 'term_neonate', iCa: 1.0 })).toContain('hypocalcemia');
    expect(r({ ageCategory: 'child', ageYears: 10, iCa: 0.9, weightKg: 60 }).treatment!.calcium!.gluconateMl).toBe(20);
  });
});

describe('глюкоза и лактат по возрасту', () => {
  const neo = { ageCategory: 'term_neonate' as const };
  it('новорождённые (BAPM 2017, PES 2015)', () => {
    expect(codes({ ...neo, glucose: 0.8 })).toContain('glucose_neo_iv');
    expect(codes({ ...neo, glucose: 1.8 })).toContain('glucose_neo_low');
    expect(codes({ ...neo, glucose: 2.5, ageHours: 10 })).toContain('glucose_neo_target');
    expect(codes({ ...neo, glucose: 3.0, ageHours: 72 })).toContain('glucose_neo_target');
    expect(codes({ ...neo, glucose: 3.0, ageHours: 10 }).some((c) => c.startsWith('glucose'))).toBe(false);
    expect(codes({ ...neo, glucose: 9 })).toContain('glucose_neo_high');
    expect(codes({ ...neo, glucose: 15 })).toContain('glucose_neo_insulin');
  });
  it('дети и взрослые, ДКА', () => {
    expect(codes({ ageCategory: 'child', glucose: 2.8 })).toContain('hypoglycemia_severe');
    expect(codes({ ageCategory: 'child', glucose: 3.5 })).toContain('hypoglycemia');
    expect(codes({ glucose: 2.5 })).toContain('hypoglycemia_severe');
    expect(codes({ pH: 7.1, pCO2: 20, HCO3: 6, glucose: 25 })).toContain('dka_criteria');
    expect(codes({ glucose: 12 })).toContain('glucose_icu_high');
  });
  it('лактат', () => {
    expect(codes({ lactate: 2.5 })).toContain('lactate_high');
    expect(codes({ lactate: 5 })).toContain('lactate_severe');
    expect(codes({ ...neo, lactate: 3.5, ageHours: 3 })).not.toContain('lactate_neo');
    expect(codes({ ...neo, lactate: 3.5, ageHours: 24 })).toContain('lactate_neo');
    expect(codes({ ...neo, sampleType: 'cord_artery', lactate: 7 })).toContain('lactate_cord');
  });
});

describe('билирубин', () => {
  it('< 35 нед — Maisels 2012; ≥ 35 — номограмма AAP 2022', () => {
    const pre = { ageCategory: 'preterm' as const, pCO2: 50, ageHours: 72 };
    expect(codes({ ...pre, gestationalWeeks: 29, bilirubin: 120 })).toContain('bili_photo');
    expect(codes({ ...pre, gestationalWeeks: 29, bilirubin: 210 })).toContain('bili_exchange');
    expect(codes({ ...pre, gestationalWeeks: 33, bilirubin: 100 })).toContain('bili_below_preterm');
    expect(codes({ ...pre, gestationalWeeks: 34, bilirubin: 210 })).toContain('bili_photo');
    expect(codes({ ageCategory: 'term_neonate', bilirubin: 250, ageHours: 48 })).toContain('bili_aap');
    expect(codes({ bilirubin: 250 }).some((c) => c.startsWith('bili'))).toBe(false);
  });
  it('без лабораторных данных шаг 10 — недостаточно данных', () => {
    expect(labs({}).status).toBe('insufficient');
    expect(labs({ K: 4.2 }).verdict).toBe('labs_normal');
  });
});
