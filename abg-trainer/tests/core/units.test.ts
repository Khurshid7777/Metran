import { describe, expect, it } from 'vitest';
import { formatNumber, fromInternal, normalizeFiO2, parseLocaleNumber, round, toInternal } from '../../src/core/units';

describe('units', () => {
  it('конвертирует кПа ↔ мм рт.ст.', () => {
    expect(toInternal(5.33, 'kPa')).toBeCloseTo(40, 0);
    expect(fromInternal(40, 'kPa')).toBeCloseTo(5.33, 2);
  });
  it('альбумин г/дл ↔ г/л', () => {
    expect(toInternal(3.5, 'g/dL')).toBe(35);
    expect(fromInternal(35, 'g/dL')).toBe(3.5);
  });
  it('глюкоза и мочевина мг/дл', () => {
    expect(toInternal(90, 'mg/dL', 'glucose')).toBeCloseTo(5, 1);
    expect(fromInternal(5, 'mg/dL', 'glucose')).toBeCloseTo(90, 0);
    expect(toInternal(30, 'mg/dL', 'urea')).toBeCloseTo(5, 1);
    expect(fromInternal(5, 'mg/dL', 'urea')).toBeCloseTo(30, 0);
    expect(toInternal(14, 'mg/dL_BUN')).toBeCloseTo(5, 1);
    expect(fromInternal(5, 'mg/dL_BUN')).toBeCloseTo(14, 0);
  });
  it('FiO2 доля или %', () => {
    expect(normalizeFiO2(50)).toBe(0.5);
    expect(normalizeFiO2(0.4)).toBe(0.4);
    expect(toInternal(40, 'percent')).toBe(0.4);
    expect(fromInternal(0.4, 'percent')).toBe(40);
    expect(toInternal(7, 'mmol/L')).toBe(7);
    expect(fromInternal(7, 'mmHg')).toBe(7);
  });
  it('ввод принимает оба разделителя', () => {
    expect(parseLocaleNumber('7,35')).toBe(7.35);
    expect(parseLocaleNumber('7.35')).toBe(7.35);
    expect(parseLocaleNumber('−4')).toBe(-4);
    expect(parseLocaleNumber('abc')).toBeNaN();
    expect(parseLocaleNumber('')).toBeNaN();
  });
  it('вывод с разделителем языка', () => {
    expect(formatNumber(7.25, 'ru', 2)).toBe('7,25');
    expect(formatNumber(7.25, 'en', 2)).toBe('7.25');
    expect(formatNumber(12, 'uz', 1)).toBe('12');
    expect(formatNumber(NaN, 'ru')).toBe('—');
    expect(formatNumber(-0.01, 'en', 1)).toBe('0');
    expect(formatNumber(13, 'en', 0)).toBe('13');
    expect(round(1.256, 2)).toBe(1.26);
    expect(round(1.6)).toBe(2);
  });
});
