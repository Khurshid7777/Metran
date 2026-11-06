import { describe, expect, it } from 'vitest';
import { dailyFluid, sodiumCorridor } from '../../src/core/dailyPlan';
import { interpret } from '../../src/core/interpret';
import type { AbgInput } from '../../src/core/types';

const base: AbgInput = { pH: 7.4, pCO2: 40, HCO3: 24, sampleType: 'venous', ageCategory: 'adult', weightKg: 70 };
const crisis = (i: Partial<AbgInput>) => interpret({ ...base, ...i }).crises;

describe('доска критических сдвигов', () => {
  it('норма — пусто', () => {
    expect(crisis({ K: 4.2, Na: 140, glucose: 5, iCa: 1.2, lactate: 1 })).toEqual([]);
  });

  it('калий: степени, зоны шкалы и дозы из планов', () => {
    const [c] = crisis({ K: 2.7 });
    expect(c).toMatchObject({ id: 'K', dir: 'low', level: 'moderate' });
    expect(c.actions.map((a) => a.key)).toContain('crisis.K.low.dose');
    expect(c.zones.find((z) => z.kind === 'normal')).toEqual({ from: 3.5, to: 5.5, kind: 'normal' });
    const [h] = crisis({ K: 6.8, ageCategory: 'child', weightKg: 8 });
    expect(h).toMatchObject({ id: 'K', dir: 'high', level: 'severe' });
    expect(h.actions.find((a) => a.key === 'crisis.K.high.shift')?.params).toMatchObject({ ca: 4, u: 0.8 });
  });

  it('натрий: гипо- и гипернатриемия с пределом скорости', () => {
    const lo = crisis({ Na: 122 })[0];
    expect(lo).toMatchObject({ id: 'Na', dir: 'low', level: 'severe' });
    expect(lo.actions.find((a) => a.key === 'crisis.Na.low.limit')?.params).toEqual({ max: 8 });
    const hi = crisis({ Na: 163 })[0];
    expect(hi).toMatchObject({ id: 'Na', dir: 'high', level: 'severe' });
    expect(hi.actions.map((a) => a.key)).toContain('crisis.Na.high.water');
    expect(crisis({ Na: 133 })[0].level).toBe('mild');
  });

  it('глюкоза, кальций, лактат, pH', () => {
    expect(crisis({ glucose: 2.4 })[0]).toMatchObject({ id: 'glucose', dir: 'low', level: 'severe' });
    expect(crisis({ glucose: 1.8, ageCategory: 'term_neonate', weightKg: 3 })[0]).toMatchObject({ id: 'glucose', dir: 'low', level: 'moderate' });
    expect(crisis({ iCa: 0.9 })[0]).toMatchObject({ id: 'iCa', level: 'moderate' });
    expect(crisis({ lactate: 5 })[0]).toMatchObject({ id: 'lactate', dir: 'high', level: 'severe' });
    const ph = crisis({ pH: 7.1, pCO2: 30, HCO3: 9 }).find((c) => c.id === 'pH')!;
    expect(ph).toMatchObject({ dir: 'low', level: 'moderate' });
  });

  it('сортировка по тяжести и отключение блока', () => {
    const list = crisis({ K: 5.6, Na: 122, lactate: 2.5 });
    expect(list[0].level).toBe('severe');
    expect(list.map((c) => c.level)).toEqual([...list.map((c) => c.level)].sort((a, b) => ['severe', 'moderate', 'mild'].indexOf(a) - ['severe', 'moderate', 'mild'].indexOf(b)));
    const off = interpret({ ...base, K: 2.5 }, { advanced: false, agWithK: false, exclude: ['crisis'] });
    expect(off.crises).toEqual([]);
  });
});

describe('суточный план жидкости и коридор Na', () => {
  it('поддерживающая + дефицит + потери', () => {
    const f = dailyFluid(100, 10, 5, 24, 200);
    expect(f.maintenanceMl).toBe(2400);
    expect(f.deficitMl).toBe(500);
    expect(f.totalMl).toBe(3100);
    expect(f.mlPerHour).toBeCloseTo(3100 / 24, 6);
    expect(f.mlPerKgDay).toBe(310);
    expect(dailyFluid(100, 10, 5, 48, 0).deficitMl).toBe(250);
  });

  it('время до нормы при максимальной безопасной скорости', () => {
    expect(sodiumCorridor(119, 8, [135, 145])).toEqual({ hours: 48, target: 135 });
    expect(sodiumCorridor(165, 10, [135, 145])).toEqual({ hours: 48, target: 145 });
    expect(sodiumCorridor(140, 8, [135, 145]).hours).toBe(0);
  });
});
