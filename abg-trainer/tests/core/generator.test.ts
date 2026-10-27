import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENERATOR_SETTINGS, SCENARIOS, generateCase, generateForLevel, matchesExpected, type GenerationLog } from '../../src/core/generator';
import { interpret } from '../../src/core/interpret';

const N = 1000;

describe('Генератор кейсов', () => {
  const report: Record<string, { cases: number; attempts: number; rejected: number; rejectedShare: number; skipped: number }> = {};

  for (const sc of SCENARIOS) {
    it(`${sc.id}: ${N} кейсов, 100% проходят самопроверку`, () => {
      const log: GenerationLog[] = [];
      let ok = 0;
      for (let seed = 1; seed <= N; seed++) {
        const c = generateCase(sc.id, seed, log);
        expect(c, `seed ${seed}`).not.toBeNull();
        expect(matchesExpected(interpret(c!.input, GENERATOR_SETTINGS), c!.expected)).toBe(true);
        ok++;
      }
      const attempts = log.reduce((s, l) => s + l.attempts, 0);
      const rejected = log.reduce((s, l) => s + l.rejected, 0);
      report[sc.id] = { cases: ok, attempts, rejected, rejectedShare: rejected / attempts, skipped: log.filter((l) => l.skipped).length };
    });
  }

  it('детерминирован по seed', () => {
    const a = generateForLevel(2, 42);
    const b = generateForLevel(2, 42);
    expect(a).toEqual(b);
    expect(generateForLevel(3, 43)).not.toEqual(a);
  });

  it('пишет лог отбраковки', () => {
    mkdirSync('logs', { recursive: true });
    writeFileSync('logs/generator-report.json', JSON.stringify(report, null, 2));
    expect(Object.keys(report).length).toBe(SCENARIOS.length);
  });
});
