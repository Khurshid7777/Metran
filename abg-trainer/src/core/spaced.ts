/**
 * Spaced repetition over scenario types (Leitner boxes). The schedule is derived from the
 * attempt history, so nothing extra is stored and imported or exported attempts stay consistent.
 */

/** Days until the next review for boxes 0..5. A failed case sends the topic back to box 0 (due at once). */
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;
export const MAX_BOX = INTERVAL_DAYS.length - 1;

/** The part of an attempt record the schedule needs. */
export interface ReviewAttempt {
  date: string;
  scenarioId?: string;
  conclusionCorrect: boolean;
  score: number;
  maxScore: number;
}

export interface TopicState {
  id: string;
  box: number;
  attempts: number;
  correct: number;
  lastDate: string;
  lastOk: boolean;
  /** Timestamp (ms) from which the topic is due for review. */
  dueAt: number;
}

const DAY = 86400000;

/** A case counts as passed when the conclusion is right and at least 70 % of the points were earned. */
export function isSuccess(a: Pick<ReviewAttempt, 'conclusionCorrect' | 'score' | 'maxScore'>): boolean {
  return a.conclusionCorrect && (a.maxScore === 0 || a.score / a.maxScore >= 0.7);
}

export function reviewState(attempts: ReviewAttempt[]): Map<string, TopicState> {
  const out = new Map<string, TopicState>();
  const ordered = attempts.filter((a) => a.scenarioId).sort((a, b) => a.date.localeCompare(b.date));
  for (const a of ordered) {
    const prev = out.get(a.scenarioId!);
    const ok = isSuccess(a);
    const box = ok ? Math.min((prev?.box ?? 0) + 1, MAX_BOX) : 0;
    out.set(a.scenarioId!, {
      id: a.scenarioId!,
      box,
      attempts: (prev?.attempts ?? 0) + 1,
      correct: (prev?.correct ?? 0) + (ok ? 1 : 0),
      lastDate: a.date,
      lastOk: ok,
      dueAt: Date.parse(a.date) + INTERVAL_DAYS[box] * DAY,
    });
  }
  return out;
}

/** Topics that are due now, the most overdue first; `allowed` restricts them to the chosen level. */
export function dueTopics(states: Map<string, TopicState>, now: number, allowed?: (id: string) => boolean): TopicState[] {
  return [...states.values()].filter((s) => s.dueAt <= now && (!allowed || allowed(s.id))).sort((a, b) => a.dueAt - b.dueAt);
}
