import { describe, expect, it } from 'vitest';
import { planPN, type PnInput } from '../../src/core/parenteral';
import { gir, glucoseOsm, mix, naclMmolPerL, naclOsm, rateForGir } from '../../src/core/solutions';

describe('растворы', () => {
  it('смешивание по правилу креста: 3 % NaCl из 23,4 % и 0,9 %', () => {
    const m = mix(3, 100, 23.4, 0.9);
    expect(m.ok).toBe(true);
    expect(m.stockMl).toBeCloseTo((100 * 2.1) / 22.5, 9);
    expect(m.stockMl + m.diluentMl).toBeCloseTo(100, 9);
    // проверка баланса вещества: C1·V1 + C2·V2 = C3·V3
    expect(23.4 * m.stockMl + 0.9 * m.diluentMl).toBeCloseTo(3 * 100, 9);
  });

  it('глюкоза 10 % из 40 % и воды', () => {
    const m = mix(10, 500, 40, 0);
    expect(m.stockMl).toBeCloseTo(125, 9);
    expect(m.diluentMl).toBeCloseTo(375, 9);
  });

  it('нельзя получить концентрацию вне диапазона исходных', () => {
    expect(mix(5, 100, 3, 0)).toMatchObject({ ok: false, reason: 'range' });
    expect(mix(3, 100, 10, 5)).toMatchObject({ ok: false, reason: 'range' });
    expect(mix(3, 0, 10, 0)).toMatchObject({ ok: false, reason: 'volume' });
  });

  it('ммоль/л и осмолярность', () => {
    expect(naclMmolPerL(0.9)).toBeCloseTo(154, 0);
    expect(naclMmolPerL(3)).toBeCloseTo(513, 0);
    expect(naclOsm(3)).toBeCloseTo(1027, 0);
    expect(glucoseOsm(5)).toBeCloseTo(252.5, 1);
  });

  it('скорость утилизации глюкозы и обратный расчёт', () => {
    expect(gir(10, 6, 3)).toBeCloseTo(3.333, 3);
    expect(rateForGir(10, gir(10, 6, 3), 3)).toBeCloseTo(6, 9);
  });
});

const neo: PnInput = {
  group: 'term_neonate', weightKg: 3, aa: 2, lipid: 2, gir: 6, fluid: 120, na: 3, k: 2,
  aaPct: 10, lipidPct: 20, glucosePct: 50, naMmolMl: 1, kMmolMl: 1,
};

describe('парентеральное питание', () => {
  it('объёмы, энергия и доли', () => {
    const r = planPN(neo);
    expect(r.aa).toMatchObject({ g: 6, ml: 60 });
    expect(r.lipid).toMatchObject({ g: 6, ml: 30 });
    expect(r.glucose.g).toBeCloseTo(25.92, 6);
    expect(r.glucose.ml).toBeCloseTo(51.84, 6);
    expect(r.kcalPerDay).toBeCloseTo(6 * 4 + 25.92 * 3.4 + 30 * 2, 6);
    expect(r.shares.aa + r.shares.glucose + r.shares.lipid).toBeCloseTo(100, 6);
    expect(r.totalMl).toBe(360);
    expect(r.waterMl).toBeCloseTo(360 - 60 - 30 - 51.84 - 9 - 6, 6);
    expect(r.mlPerHour).toBe(15);
  });

  it('осмолярность водной части и концентрация глюкозы', () => {
    const r = planPN(neo);
    const aqueous = 360 - 30;
    expect(r.glucosePct).toBeCloseTo((25.92 / aqueous) * 100, 6);
    expect(r.osm).toBeCloseTo((25.92 * 5.05 + 6 * 10 + 15 * 2) / (aqueous / 1000), 6);
  });

  it('предупреждения: пределы ESPGHAN/ESPEN, объём, периферический предел', () => {
    expect(planPN({ ...neo, group: 'preterm', aa: 4 }).warnings).toContain('aa_high');
    expect(planPN({ ...neo, lipid: 3.5 }).warnings).toContain('lipid_high');
    expect(planPN({ ...neo, gir: 13 }).warnings).toContain('gir_high');
    expect(planPN({ ...neo, fluid: 40 }).warnings).toContain('volume_exceeded');
    const ad = planPN({ ...neo, group: 'adult', weightKg: 70, aa: 1.3, lipid: 1.6, gir: 5.5, fluid: 30 });
    expect(ad.warnings).toEqual(expect.arrayContaining(['lipid_high', 'gir_high']));
    expect(planPN({ ...neo, gir: 12, fluid: 80 }).warnings).toContain('glucose_peripheral');
  });

  it('энергия 90–120 ккал/кг для детей', () => {
    const child: PnInput = { ...neo, group: 'child', weightKg: 20, aa: 1, lipid: 0.5, gir: 2, fluid: 60 };
    expect(planPN(child).warnings).toContain('energy_low');
  });
});
