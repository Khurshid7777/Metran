import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { interpret } from '../../src/core/interpret';
import { GENERATOR_SETTINGS, matchesExpected } from '../../src/core/generator';

describe('банк кейсов', () => {
  const dir = 'src/content/cases';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    it(f, () => {
      const b = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
      const input = { ...b.values, sampleType: b.sampleType, ageCategory: b.ageCategory, weightKg: b.weightKg, ageYears: b.ageYears, gestationalWeeks: b.gestationalWeeks };
      const r = interpret(input, GENERATOR_SETTINGS);
      expect({ primary: r.primary, chronicity: r.chronicity, secondary: r.secondary }).toMatchObject({ primary: b.expected.primary });
      expect(matchesExpected(r, { secondary: [], ...b.expected })).toBe(true);
    });
  }
});
