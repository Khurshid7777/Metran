import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import type { AbgInput } from '../../src/core/types';

const adult: AbgInput = { pH: 7.3, pCO2: 38, HCO3: 18, K: 6.8, sampleType: 'venous', ageCategory: 'adult', weightKg: 70 };
const codes = (i: AbgInput) => interpret(i).flags.map((f) => f.code);

describe('гиперкалиемия', () => {
  it('степени тяжести по ERC/UKKA', () => {
    expect(interpret({ ...adult, K: 5.7 }).hyperK?.severity).toBe('mild');
    expect(interpret({ ...adult, K: 6.1 }).hyperK?.severity).toBe('moderate');
    expect(interpret({ ...adult, K: 6.5 }).hyperK?.severity).toBe('severe');
    expect(interpret({ ...adult, K: 5.0 }).hyperK).toBeUndefined();
  });

  it('взрослый: дозы из норм; лёгкая степень без смещающей терапии', () => {
    const p = interpret(adult).hyperK!;
    expect(p.shift).toBe(true);
    expect(p.insulinUnits).toBe(10);
    expect(p.glucoseG).toBe(25);
    expect(p.salbutamolMg).toEqual([10, 20]);
    expect(interpret({ ...adult, K: 5.6 }).hyperK!.shift).toBe(false);
  });

  it('ребёнок: дозы на кг с потолками', () => {
    const c: AbgInput = { ...adult, ageCategory: 'child', weightKg: 8 };
    const p = interpret(c).hyperK!;
    expect(p.calciumMl).toEqual([4, 4]);
    expect(p.insulinUnits).toBeCloseTo(0.8, 6);
    expect(p.glucoseG).toBeCloseTo(4, 6);
    expect(p.dextrose10Ml).toBeCloseTo(40, 6);
    expect(p.salbutamolMg).toEqual([2.5, 2.5]);
    const big = interpret({ ...c, weightKg: 60 }).hyperK!;
    expect(big.insulinUnits).toBeCloseTo(6, 6);
    expect(big.calciumMl[0]).toBe(20);
    expect(big.salbutamolMg).toEqual([5, 5]);
    expect(interpret({ ...c, weightKg: undefined }).hyperK!.needsWeight).toBe(true);
  });

  it('новорождённым план не строится', () => {
    expect(interpret({ ...adult, ageCategory: 'term_neonate', weightKg: 3 }).hyperK).toBeUndefined();
  });
});

describe('преданалитические признаки', () => {
  it('гемолиз: высокий K⁺ без ацидоза, но не при ацидозе', () => {
    expect(codes({ ...adult, pH: 7.41, HCO3: 25, pCO2: 40, K: 6.4 })).toContain('preanalytic_haemolysis');
    expect(codes(adult)).not.toContain('preanalytic_haemolysis');
  });

  it('воздух: pO₂ выше альвеолярного', () => {
    const a: AbgInput = { pH: 7.4, pCO2: 40, HCO3: 24, sampleType: 'arterial', ageCategory: 'adult', FiO2: 0.21 };
    expect(codes({ ...a, pO2: 190 })).toContain('preanalytic_air');
    expect(codes({ ...a, pO2: 95 })).not.toContain('preanalytic_air');
  });

  it('задержка анализа: низкая глюкоза, высокий лактат и K⁺', () => {
    expect(codes({ ...adult, glucose: 1.5, lactate: 8, K: 6 })).toContain('preanalytic_delay');
    expect(codes({ ...adult, glucose: 5, lactate: 8, K: 6 })).not.toContain('preanalytic_delay');
  });
});
