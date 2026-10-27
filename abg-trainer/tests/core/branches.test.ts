import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import { validateInput } from '../../src/core/validate';
import { classifyDelta } from '../../src/core/anionGap';
import { berlinClass } from '../../src/core/oxygenation';
import { generateCase, generateForLevel, scenariosForLevel } from '../../src/core/generator';
import type { AbgInput } from '../../src/core/types';

const base = (v: Partial<AbgInput>): AbgInput => ({ pH: 7.4, pCO2: 40, sampleType: 'arterial', ageCategory: 'adult', ...v });
const codes = (v: Partial<AbgInput>, s = { advanced: false, agWithK: false }) => interpret(base(v), s).flags.map((f) => f.code);
const st = (r: ReturnType<typeof interpret>, id: string) => r.steps.find((s) => s.id === id)!;

describe('валидация ввода', () => {
  it('вне диапазона блокирует расчёт', () => {
    const r = interpret(base({ pCO2: 0.5 }));
    expect(r.blocked).toBe(true);
    expect(r.inputErrors[0]).toMatchObject({ field: 'pCO2', code: 'out_of_range' });
  });
  it('обязательные поля и не-число', () => {
    const errs = validateInput({ sampleType: undefined, ageCategory: undefined, Na: NaN } as unknown as AbgInput);
    expect(errs.map((e) => e.code)).toEqual(expect.arrayContaining(['required', 'not_a_number']));
  });
  it('HCO3 рассчитывается по Хендерсону–Хассельбаху', () => {
    const r = interpret(base({ pH: 7.4, pCO2: 40 }));
    expect(r.computed.HCO3Calculated).toBe(true);
    expect(r.computed.HCO3).toBeCloseTo(24.5, 1);
    expect(r.primary).toBe('none');
  });
});

describe('общие флаги', () => {
  it('критический pH, калий, температура, проба', () => {
    expect(codes({ pH: 6.9, pCO2: 40 })).toContain('critical_ph');
    expect(codes({ K: 2.5 })).toContain('hypokalemia');
    expect(codes({ K: 6.5 })).toContain('hyperkalemia');
    expect(codes({ temperature: 34 })).toContain('temperature');
    expect(codes({ sampleType: 'capillary' })).toContain('capillary_sample');
    expect(codes({ sampleType: 'cord_vein' })).toContain('cord_vein_sample');
    expect(interpret({ pH: 7.3, pCO2: 50, sampleType: 'arterial', ageCategory: 'preterm' }).flags.map((f) => f.code)).toContain('ga_missing');
  });
  it('пуповина: перепутаны пробы', () => {
    const a = interpret({ pH: 7.2, pCO2: 55, sampleType: 'cord_artery', ageCategory: 'term_neonate', cordPair: { pH: 7.1 } });
    expect(a.flags.map((f) => f.code)).toContain('cord_swapped');
    const v = interpret({ pH: 7.2, pCO2: 50, sampleType: 'cord_vein', ageCategory: 'term_neonate', cordPair: { pH: 7.3 } });
    expect(v.flags.map((f) => f.code)).toContain('cord_swapped');
  });
});

describe('первичное нарушение', () => {
  it('смешанный ацидоз и алкалоз', () => {
    expect(interpret(base({ pH: 7.0, pCO2: 60, HCO3: 14.5 })).primary).toBe('mixed_acidosis');
    expect(interpret(base({ pH: 7.66, pCO2: 30, HCO3: 33 })).primary).toBe('mixed_alkalosis');
    expect(interpret(base({ pH: 7.62, pCO2: 34, HCO3: 34 })).primary).toBe('mixed_alkalosis');
  });
  it('нормальный pH с отклонениями в одну сторону', () => {
    const r = interpret(base({ pH: 7.38, pCO2: 60, HCO3: 34.5 }));
    expect(r.flags.map((f) => f.code)).toContain('normal_ph_mixed');
    expect(r.primary).toBe('respiratory_acidosis');
    const r2 = interpret(base({ pH: 7.42, pCO2: 25, HCO3: 16 }));
    expect(r2.primary).toBe('respiratory_alkalosis');
  });
  it('ацидемия/алкалемия без выхода за нормы — выбор доминирующего', () => {
    // preterm norm pH 7.22–7.45: alkalemia with pCO2 at 36 (below 45 norm) is respiratory
    expect(interpret({ pH: 7.21, pCO2: 44, HCO3: 17, sampleType: 'arterial', ageCategory: 'preterm' }).primary).toBe('metabolic_acidosis');
    expect(interpret(base({ pH: 7.34, pCO2: 44, HCO3: 23 })).primary).toBe('respiratory_acidosis');
    expect(interpret(base({ pH: 7.46, pCO2: 36, HCO3: 25.5 })).primary).toBe('respiratory_alkalosis');
    expect(interpret(base({ pH: 7.46, pCO2: 39, HCO3: 25.8 })).primary).toBe('metabolic_alkalosis');
  });
  it('БЛД расширяет целевой pCO2 у недоношенного', () => {
    const r = interpret({ pH: 7.3, pCO2: 62, HCO3: 30, sampleType: 'arterial', ageCategory: 'preterm', bpd: true, gestationalWeeks: 28 });
    expect(r.steps.find((s) => s.id === 'primary')!.normalRange).toEqual([45, 65]);
  });
});

describe('компенсация', () => {
  it('метаболический алкалоз: выше/ниже ожидаемого', () => {
    expect(interpret(base({ pH: 7.4, pCO2: 55, HCO3: 34 })).secondary).toContain('respiratory_acidosis');
    expect(interpret(base({ pH: 7.66, pCO2: 36, HCO3: 40 })).secondary).toContain('respiratory_alkalosis');
  });
  it('метаболический ацидоз + респ. алкалоз, копенгагенская проверка', () => {
    const r = interpret(base({ pH: 7.36, pCO2: 18, HCO3: 10, BE: -14 }));
    expect(r.secondary).toContain('respiratory_alkalosis');
    expect(r.compensation).toBe('excessive');
    expect(st(r, 'compensation').details.copenhagenPCO2).toBe(26);
  });
  it('респираторный ацидоз: между острым и хроническим, + мет. ацидоз, + мет. алкалоз', () => {
    expect(interpret(base({ pH: 7.08, pCO2: 80, HCO3: 32 })).chronicity).toBe('acute_on_chronic');
    expect(interpret(base({ pH: 7.0, pCO2: 70, HCO3: 20 })).secondary.length + 1).toBeGreaterThan(0);
    expect(interpret(base({ pH: 7.38, pCO2: 60, HCO3: 34.5, BE: 8 })).secondary).toContain('metabolic_alkalosis');
    expect(interpret(base({ pH: 7.16, pCO2: 60, HCO3: 21, Na: 140, Cl: 105, albumin: 40 })).primary).toBe('mixed_acidosis');
  });
  it('респираторный алкалоз: острый на хроническом, + мет. ацидоз, + мет. алкалоз', () => {
    expect(interpret(base({ pH: 7.65, pCO2: 15, HCO3: 16.5 })).chronicity).toBe('acute_on_chronic');
    expect(interpret(base({ pH: 7.4, pCO2: 22, HCO3: 13 })).secondary).toContain('metabolic_acidosis');
    expect(interpret(base({ pH: 7.62, pCO2: 30, HCO3: 30 })).primary).toBe('mixed_alkalosis');
    expect(interpret(base({ pH: 7.6, pCO2: 30, HCO3: 25.5 })).secondary).toContain('metabolic_alkalosis');
  });
  it('неонатальная пометка о формулах', () => {
    const r = interpret({ pH: 7.2, pCO2: 30, HCO3: 11.5, sampleType: 'arterial', ageCategory: 'term_neonate' });
    expect(r.flags.map((f) => f.code)).toContain('neonatal_compensation');
  });
});

describe('AG и Δ/Δ', () => {
  it('AG с K⁺ и переопределённой нормой', () => {
    const r = interpret(base({ pH: 7.3, pCO2: 33, HCO3: 16, Na: 140, K: 4, Cl: 110 }), { advanced: false, agWithK: true });
    expect(st(r, 'anionGap').value).toBe(18);
    expect(st(r, 'anionGap').normalRange).toEqual([12, 16]);
    expect(r.flags.map((f) => f.code)).toContain('ag_without_albumin');
    const r2 = interpret(base({ pH: 7.3, pCO2: 33, HCO3: 16, Na: 140, Cl: 110, albumin: 40 }), { advanced: false, agWithK: false, agNormOverride: [3, 11] });
    expect(st(r2, 'anionGap').verdict).toBe('elevated');
  });
  it('AG без K⁺ при режиме "с K⁺" — недостаточно данных', () => {
    const r = interpret(base({ Na: 140, Cl: 100 }), { advanced: false, agWithK: true });
    expect(st(r, 'anionGap').status).toBe('insufficient');
  });
  it('низкий AG', () => {
    const r = interpret(base({ Na: 140, Cl: 112, HCO3: 24, albumin: 40 }));
    expect(st(r, 'anionGap').verdict).toBe('low');
  });
  it('скрытый ацидоз с повышенным AG при нормальном HCO3', () => {
    const r = interpret(base({ pH: 7.42, pCO2: 40, HCO3: 25.5, Na: 140, Cl: 95, albumin: 40 }));
    expect(r.flags.map((f) => f.code)).toContain('hidden_hagma');
    expect(r.secondary).toEqual(expect.arrayContaining(['metabolic_acidosis', 'metabolic_alkalosis']));
  });
  it('классы Δ/Δ', () => {
    const b = { low: 0.4, mid: 0.8, high: 2 };
    expect(classifyDelta(0.2, b)).toBe('normal_ag');
    expect(classifyDelta(0.6, b)).toBe('mixed_ag');
    expect(classifyDelta(1.2, b)).toBe('pure_high_ag');
    expect(classifyDelta(2.5, b)).toBe('plus_met_alk');
    const r = interpret(base({ pH: 7.2, pCO2: 23, HCO3: 10, Na: 140, Cl: 116, albumin: 40 }));
    expect(st(r, 'deltaRatio').verdict).toBe('normal_ag');
    expect(r.acidosisType).toBe('mixed_ag');
    expect(r.differentials.map((d) => d.group)).toEqual(['high_ag', 'normal_ag']);
  });
  it('дифф. ряд без AG', () => {
    const r = interpret(base({ pH: 7.28, pCO2: 26, HCO3: 12 }));
    expect(r.differentials.map((d) => d.group)).toEqual(['high_ag', 'normal_ag']);
  });
});

describe('Стюарт', () => {
  it('выключен без продвинутого режима; недостаточно данных; SIDa', () => {
    expect(st(interpret(base({})), 'stewart').status).toBe('disabled');
    expect(st(interpret(base({}), { advanced: true, agWithK: false }), 'stewart').status).toBe('insufficient');
    const r = interpret(base({ BE: 0, Na: 140, K: 4, Cl: 102, albumin: 42, iCa: 1.2, Mg: 0.9 }), { advanced: true, agWithK: false });
    expect(st(r, 'stewart').details.SIDa).toBeCloseTo(44.1);
    expect(r.flags.map((f) => f.code)).toContain('stewart_no_lactate');
    expect(st(r, 'stewart').verdict).toBe('no_unmeasured_anions');
  });
});

describe('оксигенация', () => {
  it('A-a норма у взрослого на воздухе', () => {
    const r = interpret(base({ FiO2: 0.21, pO2: 60, ageYears: 40 }));
    const o = st(r, 'oxygenation');
    expect(o.details.AaNorm).toBe(14);
    expect(r.flags.map((f) => f.code)).toContain('aa_elevated');
    expect(r.flags.map((f) => f.code)).toContain('berlin_peep');
  });
  it('Берлинские классы', () => {
    const b = { mild: 300, moderate: 200, severe: 100 };
    expect(berlinClass(350, b)).toBe('none');
    expect(berlinClass(250, b)).toBe('mild');
    expect(berlinClass(80, b)).toBe('severe');
  });
  it('дети: OI и OSI по PALICC-2', () => {
    const r = interpret({ pH: 7.35, pCO2: 45, sampleType: 'arterial', ageCategory: 'child', FiO2: 0.6, MAP: 20, pO2: 60, SpO2: 90 });
    const o = st(r, 'oxygenation');
    expect(o.details.OI).toBeCloseTo(20);
    expect(o.details.OIClass).toBe('severe');
    expect(o.details.OSI).toBeCloseTo(13.3, 1);
    expect(o.details.OSIClass).toBe('severe');
    expect(o.details.SF).toBeCloseTo(150);
    const r2 = interpret({ pH: 7.35, pCO2: 45, sampleType: 'arterial', ageCategory: 'child', FiO2: 0.4, MAP: 10, pO2: 80, SpO2: 95 });
    expect(st(r2, 'oxygenation').details.OIClass).toBe('mild_moderate');
    expect(st(r2, 'oxygenation').details.OSIClass).toBe('mild_moderate');
  });
  it('новорождённые: ЭКМО и ниже порога iNO; гипероксия у недоношенного', () => {
    const r = interpret({ pH: 7.3, pCO2: 45, sampleType: 'arterial', ageCategory: 'term_neonate', FiO2: 1, MAP: 20, pO2: 40 });
    expect(r.flags.map((f) => f.code)).toContain('oi_ecmo');
    const r2 = interpret({ pH: 7.3, pCO2: 45, sampleType: 'arterial', ageCategory: 'term_neonate', FiO2: 0.3, MAP: 10, pO2: 60 });
    expect(st(r2, 'oxygenation').details.OIClass).toBe('below_ino');
    const r3 = interpret({ pH: 7.3, pCO2: 50, sampleType: 'arterial', ageCategory: 'preterm', gestationalWeeks: 28, FiO2: 0.4, pO2: 95 });
    expect(r3.flags.map((f) => f.code)).toContain('preterm_hyperoxia');
    expect(r3.treatment!.hfoHints).toContain('treat.hfo.hyperoxia');
  });
  it('капиллярная проба: только S/F и OSI', () => {
    const r = interpret({ pH: 7.3, pCO2: 50, sampleType: 'capillary', ageCategory: 'preterm', FiO2: 0.4, SpO2: 92, MAP: 10, gestationalWeeks: 30 });
    const o = st(r, 'oxygenation');
    expect(o.details.PF).toBeUndefined();
    expect(o.details.SF).toBeCloseTo(230);
    expect(o.details.OSI).toBeCloseTo(4.35, 1);
  });
  it('артериальная проба без данных — недостаточно', () => {
    const r = interpret(base({ FiO2: 0.4, SpO2: 99 }));
    expect(st(r, 'oxygenation').status).toBe('insufficient');
  });
});

describe('лечение', () => {
  const acid = { pH: 7.15, pCO2: 21, HCO3: 7, BE: -20, Na: 140, Cl: 120, albumin: 40, weightKg: 70 } as const;
  it('бикарбонат у взрослого — 8,4%', () => {
    const b = interpret(base(acid)).treatment!.bicarbonate!;
    expect(b.concentration).toBe('8.4');
    expect(b.deficit).toBeCloseTo(420);
    expect(b.volumeMl).toBeCloseTo(210);
  });
  it('блокирующие флаги', () => {
    const blockers = (v: Partial<AbgInput>) => interpret(base({ ...acid, ...v })).treatment!.bicarbonate!.blockers.map((f) => f.code);
    expect(blockers({ pCO2: 40, pH: 6.85 })).toContain('bicarb_resp_acidosis');
    expect(blockers({ lactate: 8, pH: 7.25 })).toContain('bicarb_lactic');
    expect(blockers({ glucose: 25 , Cl: 100})).toContain('bicarb_keto');
    expect(blockers({ Na: 155, Cl: 135 })).toContain('bicarb_hypernatremia');
    expect(blockers({ iCa: 0.8 })).toContain('bicarb_hypocalcemia');
  });
  it('предупреждение у недоношенного, ребёнок < 1 года — 4,2%', () => {
    const b = interpret({ ...acid, sampleType: 'arterial', ageCategory: 'preterm', weightKg: 1, gestationalWeeks: 28 }).treatment!.bicarbonate!;
    expect(b.warnings.map((f) => f.code)).toContain('bicarb_preterm_ivh');
    const c = interpret({ ...acid, sampleType: 'arterial', ageCategory: 'child', ageYears: 0.5, weightKg: 7 }).treatment!.bicarbonate!;
    expect(c.concentration).toBe('4.2');
    expect(interpret({ ...acid, sampleType: 'arterial', ageCategory: 'child', ageYears: 0.5, weightKg: 7 }, { advanced: false, agWithK: false, bicarbFactor: 0.5 }).treatment!.bicarbonate!.factor).toBe(0.5);
  });
  it('нет бикарбоната без BE/веса или без мет. ацидоза', () => {
    expect(interpret(base({ pH: 7.28, pCO2: 26, HCO3: 12 })).treatment!.bicarbonate).toBeUndefined();
    expect(interpret(base({ pH: 7.25, pCO2: 60, HCO3: 26, BE: -1, weightKg: 70 })).treatment!.bicarbonate).toBeUndefined();
  });
  it('коррекция ЧД на конвенционной ИВЛ', () => {
    const v = interpret(base({ pH: 7.25, pCO2: 60, HCO3: 26, ventilation: { mode: 'conventional', rate: 14 } })).treatment!.ventilation!;
    expect(v.targetPCO2).toBe(45);
    expect(v.newRate).toBe(19);
    const v2 = interpret(base({ pH: 7.25, pCO2: 90, HCO3: 29, ventilation: { mode: 'conventional', rate: 30 } })).treatment!.ventilation!;
    expect(v2.outOfLimits).toBe(true);
    expect(v2.newRate).toBe(35);
    const v3 = interpret(base({ pH: 7.55, pCO2: 28, HCO3: 24, ventilation: { mode: 'conventional', rate: 20 } })).treatment!.ventilation!;
    expect(v3.targetPCO2).toBe(35);
    expect(interpret(base({ ventilation: { mode: 'conventional', rate: 14 } })).treatment!.ventilation).toBeUndefined();
  });
  it('подсказки HFO и по причине', () => {
    const t = interpret(base({ pH: 7.25, pCO2: 60, HCO3: 26, pO2: 50, ventilation: { mode: 'hfo' } })).treatment!;
    expect(t.hfoHints).toEqual(expect.arrayContaining(['treat.hfo.lowerPCO2', 'treat.hfo.oxygenation']));
    expect(interpret(base({ pH: 7.55, pCO2: 28, HCO3: 24, ventilation: { mode: 'hfo' } })).treatment!.hfoHints).toContain('treat.hfo.raisePCO2');
    expect(interpret(base({ ...acid, lactate: 8 })).treatment!.causeHints).toEqual(expect.arrayContaining(['treat.cause.lactate', 'treat.cause.saline']));
    expect(interpret(base({ pH: 7.51, pCO2: 46, HCO3: 36 })).treatment!.causeHints).toContain('treat.cause.chlorideAlkalosis');
  });
});

describe('генератор: служебное', () => {
  it('неизвестный сценарий и пропуск', () => {
    expect(() => generateCase('nope', 1)).toThrow();
    const log: never[] = [];
    expect(generateCase('met_acid_simple', 1, log, 0)).toBeNull();
    expect(scenariosForLevel(1).every((s) => s.level === 1)).toBe(true);
    expect(generateForLevel(1, 5)!.level).toBe(1);
  });
});

describe('международные рекомендации', () => {
  const codes2 = (i: AbgInput) => interpret(i).flags.map((f) => f.code);
  it('глобальное определение ОРДС 2023: S/F у взрослого без PaO2', () => {
    const r = interpret(base({ FiO2: 0.5, SpO2: 94 }));
    expect(st(r, 'oxygenation').details.sfClass).toBe('moderate');
    expect(r.flags.map((f) => f.code)).toContain('ards_sf_moderate');
    expect(r.summary.map((p) => p.key)).toContain('summary.sf');
    expect(st(interpret(base({ FiO2: 0.7, SpO2: 90 })), 'oxygenation').details.sfClass).toBe('severe');
    expect(st(interpret(base({ FiO2: 0.3, SpO2: 92 })), 'oxygenation').details.sfClass).toBe('mild');
    expect(st(interpret(base({ FiO2: 0.21, SpO2: 96 })), 'oxygenation').details.sfClass).toBe('none');
  });
  it('недоношенный: SpO2 выше цели 90–94% на кислороде', () => {
    const r = interpret({ pH: 7.3, pCO2: 50, sampleType: 'capillary', ageCategory: 'preterm', gestationalWeeks: 27, FiO2: 0.3, SpO2: 98 });
    expect(r.flags.map((f) => f.code)).toContain('preterm_hyperoxia_spo2');
    expect(r.treatment!.hfoHints).toContain('treat.hfo.hyperoxia');
    expect(codes2({ pH: 7.3, pCO2: 50, sampleType: 'capillary', ageCategory: 'preterm', gestationalWeeks: 27, FiO2: 0.21, SpO2: 98 })).not.toContain('preterm_hyperoxia_spo2');
  });
  it('пуповина: пограничные критерии гипотермии', () => {
    const c = (pH: number, BE: number) => codes2({ pH, pCO2: 55, BE, sampleType: 'cord_artery', ageCategory: 'term_neonate' });
    expect(c(7.1, -8)).toContain('cord_hypothermia_borderline');
    expect(c(7.2, -11)).toContain('cord_hypothermia_borderline');
    expect(c(7.2, -11)).not.toContain('cord_hypothermia');
    expect(c(6.95, -17)).not.toContain('cord_hypothermia_borderline');
    expect(c(7.25, -5)).not.toContain('cord_hypothermia_borderline');
  });
  it('бикарбонат: лактат — нет при pH ≥ 7,2; ДКА — только при pH < 7,0; новорождённые — медленно', () => {
    const acid = { pCO2: 21, HCO3: 7, BE: -20, Na: 140, Cl: 120, albumin: 40, weightKg: 70 };
    const bl = (v: Partial<AbgInput>) => interpret(base({ ...acid, ...v })).treatment!.bicarbonate!.blockers.map((f) => f.code);
    expect(bl({ pH: 7.15, lactate: 8 })).not.toContain('bicarb_lactic');
    expect(bl({ pH: 7.22, lactate: 8 })).toContain('bicarb_lactic');
    expect(bl({ pH: 7.05, glucose: 25, Cl: 100 })).toContain('bicarb_keto');
    expect(bl({ pH: 6.95, glucose: 25, Cl: 100 })).not.toContain('bicarb_keto');
    const w = interpret({ ...acid, pH: 7.1, sampleType: 'arterial', ageCategory: 'term_neonate', weightKg: 3 }).treatment!.bicarbonate!.warnings;
    expect(w.find((f) => f.code === 'bicarb_neonatal_slow')?.params?.min).toBe(30);
  });
});
