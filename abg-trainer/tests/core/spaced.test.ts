import { describe, expect, it } from 'vitest';
import { INTERVAL_DAYS, dueTopics, isSuccess, reviewState, type ReviewAttempt } from '../../src/core/spaced';

const DAY = 86400000;
const t0 = Date.parse('2026-11-01T10:00:00Z');
const at = (d: number, ok: boolean, scenarioId = 'met_acid_simple'): ReviewAttempt => ({
  date: new Date(t0 + d * DAY).toISOString(),
  scenarioId,
  conclusionCorrect: ok,
  score: ok ? 9 : 3,
  maxScore: 10,
});

describe('интервальное повторение', () => {
  it('успех: верное заключение и ≥ 70 % баллов', () => {
    expect(isSuccess({ conclusionCorrect: true, score: 7, maxScore: 10 })).toBe(true);
    expect(isSuccess({ conclusionCorrect: true, score: 6, maxScore: 10 })).toBe(false);
    expect(isSuccess({ conclusionCorrect: false, score: 10, maxScore: 10 })).toBe(false);
  });

  it('ошибка: тема сразу к повторению (ступень 0)', () => {
    const s = reviewState([at(0, false)]).get('met_acid_simple')!;
    expect(s.box).toBe(0);
    expect(s.dueAt).toBe(t0);
    expect(dueTopics(new Map([[s.id, s]]), t0).map((x) => x.id)).toEqual(['met_acid_simple']);
  });

  it('успехи поднимают ступень и отодвигают срок по интервалам', () => {
    const s = reviewState([at(0, true), at(2, true), at(6, true)]).get('met_acid_simple')!;
    expect(s.box).toBe(3);
    expect(s.dueAt).toBe(t0 + 6 * DAY + INTERVAL_DAYS[3] * DAY);
    expect(s.correct).toBe(3);
    expect(dueTopics(new Map([[s.id, s]]), t0 + 10 * DAY)).toHaveLength(0);
    expect(dueTopics(new Map([[s.id, s]]), t0 + 14 * DAY)).toHaveLength(1);
  });

  it('ошибка после успехов сбрасывает ступень; ступень не выше максимальной', () => {
    const many = Array.from({ length: 9 }, (_, i) => at(i, true));
    expect(reviewState(many).get('met_acid_simple')!.box).toBe(INTERVAL_DAYS.length - 1);
    expect(reviewState([...many, at(10, false)]).get('met_acid_simple')!.box).toBe(0);
  });

  it('порядок попыток не важен; попытки без сценария игнорируются; самая просроченная первой', () => {
    const states = reviewState([at(5, false, 'b'), { ...at(0, false, 'a') }, { date: at(1, true).date, conclusionCorrect: true, score: 1, maxScore: 1 }]);
    expect([...states.keys()].sort()).toEqual(['a', 'b']);
    expect(dueTopics(states, t0 + 10 * DAY).map((x) => x.id)).toEqual(['a', 'b']);
    expect(dueTopics(states, t0 + 10 * DAY, (id) => id === 'b').map((x) => x.id)).toEqual(['b']);
  });
});
