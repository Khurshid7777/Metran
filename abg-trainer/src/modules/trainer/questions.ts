import type { CaseData } from '../../core/generator';
import type { InterpretationResult, Step, StepId } from '../../core/types';
import type { AnswerRecord, AttemptRecord } from '../../storage/records';

export interface Option {
  value: string;
  labelKey: string;
}

export interface Question {
  id: string;
  stepId: StepId | 'differential' | 'treatment';
  kind: 'choice' | 'number';
  promptKey: string;
  options?: Option[];
  correct: string | number;
  tolerance?: number;
  points: number;
  hintKey: string;
  hintParams?: Record<string, string | number>;
  explanationKey: string;
  explanationParams?: Record<string, string | number>;
}

const opt = (prefix: string, values: string[]): Option[] => values.map((v) => ({ value: v, labelKey: prefix + v }));
const step = (r: InterpretationResult, id: StepId): Step | undefined => r.steps.find((s) => s.id === id);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Builds the step questions for a case from the core result. Level 1: steps 1–4; 2: + AG, Δ/Δ, osm, differential; 3: + Stewart, oxygenation, treatment. */
export function buildQuestions(c: CaseData, r: InterpretationResult, level: number): Question[] {
  const qs: Question[] = [];
  const input = c.input;

  if (input.HCO3 !== undefined) {
    qs.push({
      id: 'consistency', stepId: 'consistency', kind: 'choice', promptKey: 'q.consistency',
      options: opt('verdict.', ['consistent', 'inconsistent']),
      correct: step(r, 'consistency')!.verdict!, points: 1,
      hintKey: 'hint.consistency', explanationKey: 'expl.consistency',
      explanationParams: { h1: Math.round(step(r, 'consistency')!.details.hMeasured as number), h2: Math.round(step(r, 'consistency')!.details.hCalc as number) },
    });
  }
  const ph = step(r, 'ph')!;
  qs.push({
    id: 'ph', stepId: 'ph', kind: 'choice', promptKey: 'q.ph',
    options: opt('verdict.', ['acidemia', 'normal', 'alkalemia']),
    correct: r.phStatus!, points: 1,
    hintKey: 'hint.ph', hintParams: { lo: ph.normalRange![0], hi: ph.normalRange![1] },
    explanationKey: 'expl.ph', explanationParams: { pH: input.pH, lo: ph.normalRange![0], hi: ph.normalRange![1] },
  });
  qs.push({
    id: 'primary', stepId: 'primary', kind: 'choice', promptKey: 'q.primary',
    options: opt('disorder.', ['metabolic_acidosis', 'metabolic_alkalosis', 'respiratory_acidosis', 'respiratory_alkalosis', 'mixed_acidosis', 'mixed_alkalosis', 'none']),
    correct: r.primary, points: 2, hintKey: 'hint.primary', explanationKey: 'step.primary.' + r.primary,
  });

  const comp = step(r, 'compensation')!;
  const isMixed = r.primary === 'mixed_acidosis' || r.primary === 'mixed_alkalosis';
  if (comp.status === 'done' && !isMixed) {
    if (r.primary === 'metabolic_acidosis' || r.primary === 'metabolic_alkalosis') {
      const acid = r.primary === 'metabolic_acidosis';
      qs.push({
        id: 'expectedPCO2', stepId: 'compensation', kind: 'number', promptKey: 'q.expectedPCO2',
        correct: r1(comp.details.expectedPCO2 as number), tolerance: 1, points: 2,
        hintKey: acid ? 'hint.winters' : 'hint.metAlk', hintParams: { HCO3: r1(r.computed.HCO3) },
        explanationKey: acid ? 'expl.winters' : 'expl.metAlk',
        explanationParams: { HCO3: r1(r.computed.HCO3), exp: r1(comp.details.expectedPCO2 as number) },
      });
      qs.push({
        id: 'compensation', stepId: 'compensation', kind: 'choice', promptKey: 'q.compensationMet',
        options: opt('verdict.', ['adequate', 'plus_respiratory_acidosis', 'plus_respiratory_alkalosis']),
        correct: comp.verdict!, points: 2, hintKey: 'hint.compensationMet',
        explanationKey: 'expl.compensationMet', explanationParams: { pCO2: input.pCO2, exp: r1(comp.details.expectedPCO2 as number) },
      });
    } else if (r.primary === 'respiratory_acidosis' || r.primary === 'respiratory_alkalosis') {
      qs.push({
        id: 'chronicity', stepId: 'compensation', kind: 'choice', promptKey: 'q.chronicity',
        options: opt('verdict.', ['acute', 'chronic', 'acute_on_chronic', 'plus_metabolic_acidosis', 'plus_metabolic_alkalosis']),
        correct: comp.verdict!, points: 3,
        hintKey: r.primary === 'respiratory_acidosis' ? 'hint.respAcid' : 'hint.respAlk',
        explanationKey: 'expl.resp',
        explanationParams: { acute: r1(comp.details.expectedAcute as number), chronic: r1(comp.details.expectedChronic as number), HCO3: r1(r.computed.HCO3) },
      });
    }
  }

  if (level >= 2) {
    const ag = step(r, 'anionGap')!;
    if (ag.status === 'done') {
      qs.push({
        id: 'agCorr', stepId: 'anionGap', kind: 'number', promptKey: input.albumin !== undefined ? 'q.agCorr' : 'q.ag',
        correct: r1(ag.value!), tolerance: 1, points: 2, hintKey: 'hint.ag',
        explanationKey: 'expl.ag', explanationParams: { ag: r1(ag.details.ag as number), agCorr: r1(ag.value!) },
      });
      qs.push({
        id: 'agStatus', stepId: 'anionGap', kind: 'choice', promptKey: 'q.agStatus',
        options: opt('ag.', ['low', 'normal', 'elevated']), correct: ag.verdict!, points: 1,
        hintKey: 'hint.agStatus', hintParams: { lo: ag.normalRange![0], hi: ag.normalRange![1] },
        explanationKey: 'expl.agStatus', explanationParams: { lo: ag.normalRange![0], hi: ag.normalRange![1] },
      });
    }
    const dd = step(r, 'deltaRatio')!;
    if (dd.status === 'done') {
      qs.push({
        id: 'delta', stepId: 'deltaRatio', kind: 'choice', promptKey: 'q.delta',
        options: opt('delta.', ['normal_ag', 'mixed_ag', 'pure_high_ag', 'plus_met_alk']), correct: dd.verdict!, points: 2,
        hintKey: 'hint.delta', explanationKey: 'expl.delta', explanationParams: { value: Math.round(dd.value! * 100) / 100 },
      });
    }
    const osm = step(r, 'osmolar')!;
    if (osm.status === 'done') {
      qs.push({
        id: 'osmolar', stepId: 'osmolar', kind: 'choice', promptKey: 'q.osmolar',
        options: opt('osm.', ['normal', 'elevated']), correct: osm.verdict!, points: 1,
        hintKey: 'hint.osmolar', explanationKey: 'expl.osmolar', explanationParams: { calc: r1(osm.details.calc as number), gap: r1(osm.value!) },
      });
    }
    if (r.differentials.length) {
      const correct = r.differentials[0].checks[0];
      const pool = ['urineAG', 'urineCl', 'lactate', 'ventilator', 'spo2', 'ammonia', 'bloodPressure', 'xray'].filter(
        (x) => !r.differentials.some((d) => d.checks.includes(x)),
      );
      const seed = c.id.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
      const distractors = [0, 1, 2].map((i) => pool[(seed + i * 3) % pool.length]).filter((v, i, a) => a.indexOf(v) === i);
      const options = [correct, ...distractors].sort((a, b) => ((seed % 7) + a.length) % 5 - ((seed % 7) + b.length) % 5 || a.localeCompare(b));
      qs.push({
        id: 'differential', stepId: 'differential', kind: 'choice', promptKey: 'q.differential',
        options: opt('diff.check.', options), correct, points: 1,
        hintKey: 'hint.differential', explanationKey: 'expl.differential', explanationParams: { group: '@diff.group.' + r.differentials[0].group },
      });
    }
  }

  if (level >= 3) {
    const st = step(r, 'stewart')!;
    if (st.status === 'done') {
      qs.push({
        id: 'stewartUma', stepId: 'stewart', kind: 'number', promptKey: 'q.stewart',
        correct: r1(st.value!), tolerance: 1, points: 2, hintKey: 'hint.stewart',
        explanationKey: 'expl.stewart',
        explanationParams: { naCl: r1(st.details.naCl as number), alb: r1(st.details.albumin as number), lac: r1(st.details.lactate as number), uma: r1(st.value!) },
      });
    }
    const ox = step(r, 'oxygenation')!;
    const oxClasses: Record<string, string[]> = {
      berlin: ['none', 'mild', 'moderate', 'severe'],
      neo: ['below_ino', 'ino', 'ecmo'],
      child: ['mild_moderate', 'severe'],
    };
    const v = ox.verdict;
    if (ox.status === 'done' && v && v !== 'calculated') {
      const adult = ox.details.berlin !== undefined || ox.details.sfClass !== undefined;
      const family = adult ? 'berlin' : oxClasses.neo.includes(v) ? 'neo' : 'child';
      qs.push({
        id: 'oxygenation', stepId: 'oxygenation', kind: 'choice', promptKey: 'q.oxygenation.' + family,
        options: opt('oxy.', oxClasses[family]), correct: v, points: 2, hintKey: 'hint.oxygenation.' + family,
        explanationKey: 'expl.oxygenation',
        explanationParams: { PF: ox.details.PF !== undefined ? Math.round(ox.details.PF as number) : '—', OI: ox.details.OI !== undefined ? r1(ox.details.OI as number) : '—' },
      });
    }
    const b = r.treatment?.bicarbonate;
    if (b) {
      qs.push({
        id: 'bicarb', stepId: 'treatment', kind: 'choice', promptKey: 'q.bicarb',
        options: opt('bicarbAnswer.', ['indicated', 'contraindicated']), correct: b.blocked ? 'contraindicated' : 'indicated', points: 2,
        hintKey: 'hint.bicarb', explanationKey: b.blocked ? 'expl.bicarbBlocked' : 'expl.bicarbOk',
        explanationParams: { list: b.blockers.map((f) => '@flag.' + f.code + '.short').join('|') || '—' },
      });
    }
  }
  return qs;
}

export function isCorrect(q: Question, answer: string): boolean {
  if (q.kind === 'number') {
    const v = Number(answer.replace(',', '.'));
    return Number.isFinite(v) && Math.abs(v - (q.correct as number)) <= (q.tolerance ?? 0);
  }
  return answer === q.correct;
}

/** Hint halves the step's points. */
export function scoreAnswer(q: Question, answer: string, hint: boolean): AnswerRecord {
  const correct = isCorrect(q, answer);
  return { qid: q.id, stepId: q.stepId, answer, correct, points: correct ? (hint ? q.points / 2 : q.points) : 0, max: q.points, hint };
}

/** Builds an attempt record with KPI markers from the answers. */
export function buildAttempt(
  base: Pick<AttemptRecord, 'id' | 'date' | 'mode' | 'level' | 'examId' | 'timeMs'>,
  c: CaseData,
  r: InterpretationResult,
  answers: AnswerRecord[],
): AttemptRecord {
  const by = (id: string) => answers.find((a) => a.qid === id);
  const secondaryQs = ['compensation', 'chronicity', 'delta'].map(by).filter(Boolean) as AnswerRecord[];
  const hasSecondary = r.secondary.length > 0;
  const missedSecondary = hasSecondary && (secondaryQs.length === 0 || secondaryQs.some((a) => !a.correct));
  const albuminMasked = r.flags.some((f) => f.code === 'ag_masked_by_albumin');
  const missedAlbumin = albuminMasked && [by('agCorr'), by('agStatus')].some((a) => a && !a.correct);
  const conclusionCorrect = ['primary', 'compensation', 'chronicity', 'delta'].map(by).every((a) => !a || a.correct);
  return {
    ...base,
    caseId: c.id,
    seed: c.seed,
    answers,
    hintsUsed: answers.filter((a) => a.hint).length,
    score: answers.reduce((s, a) => s + a.points, 0),
    maxScore: answers.reduce((s, a) => s + a.max, 0),
    conclusionCorrect,
    hasSecondary,
    missedSecondary,
    albuminMasked,
    missedAlbumin,
  };
}
