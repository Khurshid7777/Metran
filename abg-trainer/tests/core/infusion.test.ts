import { describe, expect, it } from 'vitest';
import { hollidaySegar, infusionPlan, type InfusionInput } from '../../src/core/infusion';

const child: InfusionInput = { group: 'child', weightKg: 23, restrictionPct: 100, feverPctPerDeg: 0, dehydrationPct: 0, replaceHours: 24, lossesMl: 0 };

describe('инфузионная терапия', () => {
  it('Холлидей–Сегар 100/50/20 мл/кг/сут по полосам веса', () => {
    expect(hollidaySegar(23)).toEqual([
      { kg: 10, mlKgDay: 100, ml: 1000 },
      { kg: 10, mlKgDay: 50, ml: 500 },
      { kg: 3, mlKgDay: 20, ml: 60 },
    ]);
    expect(hollidaySegar(7)).toEqual([{ kg: 7, mlKgDay: 100, ml: 700 }]);
    const p = infusionPlan(child);
    expect(p.maintenanceMl).toBe(1560);
    expect(p.mlPerHour).toBe(65);
    expect(p.bolusMl).toBe(230);
  });

  it('ограничение, лихорадка, дефицит и потери складываются', () => {
    const p = infusionPlan({ ...child, weightKg: 10, restrictionPct: 70, temperature: 39, feverPctPerDeg: 10, dehydrationPct: 5, replaceHours: 48, lossesMl: 100 });
    expect(p.restrictedMl).toBe(700);
    expect(p.feverMl).toBeCloseTo(140, 9);
    expect(p.deficitTotalMl).toBe(500);
    expect(p.deficitMl).toBe(250);
    expect(p.totalMl).toBeCloseTo(700 + 140 + 250 + 100, 9);
  });

  it('взрослые: мл/кг/сут, электролиты и глюкоза', () => {
    const p = infusionPlan({ ...child, group: 'adult', weightKg: 70, adultMlKgDay: 30 });
    expect(p.maintenanceMl).toBe(2100);
    expect(p.bands).toEqual([]);
    expect(p.electrolytesMmol).toBe(70);
    expect(p.bolusMl).toBe(500);
  });
});
