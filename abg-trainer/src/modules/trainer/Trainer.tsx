import { useMemo, useRef, useState } from 'react';
import { generateForLevel, rng, type CaseData } from '../../core/generator';
import { interpret } from '../../core/interpret';
import type { InterpretationResult } from '../../core/types';
import { addAttempt, type AnswerRecord } from '../../storage/records';
import { coreSettings, useApp } from '../../store';
import { bank } from '../common/bank';
import { CaseCard } from '../common/CaseCard';
import { answerLabel, QuestionInput } from '../common/QuestionInput';
import { ResultView, SummaryText } from '../common/ResultView';
import { useT } from '../common/useT';
import { buildAttempt, buildQuestions, isCorrect, scoreAnswer, type Question } from './questions';

type Phase = 'setup' | 'clinic' | 'steps' | 'debrief';
type Source = 'generator' | 'bank';

export function pickCase(level: number, source: Source, seed: number): CaseData | null {
  if (source === 'bank') {
    const pool = bank().accepted.filter((c) => c.level <= level);
    if (pool.length) return pool[Math.floor(rng(seed)() * pool.length)];
  }
  return generateForLevel(level, seed);
}

export function Trainer() {
  const { t, n } = useT();
  const settings = useApp((s) => s.settings);
  const [phase, setPhase] = useState<Phase>('setup');
  const [level, setLevel] = useState(1);
  const [source, setSource] = useState<Source>('generator');
  const [c, setCase] = useState<CaseData | null>(null);
  const [result, setResult] = useState<InterpretationResult | null>(null);
  const [idx, setIdx] = useState(0);
  const [value, setValue] = useState('');
  const [hint, setHint] = useState(false);
  const [checked, setChecked] = useState(false);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const start = useRef(0);

  const questions: Question[] = useMemo(() => (c && result ? buildQuestions(c, result, level) : []), [c, result, level]);
  const q = questions[idx];

  function newCase() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const next = pickCase(level, source, seed);
    if (!next) return;
    const s = { ...coreSettings(settings), advanced: level >= 3 || settings.advanced };
    setCase(next);
    setResult(interpret(next.input, s));
    setIdx(0);
    setAnswers([]);
    setValue('');
    setHint(false);
    setChecked(false);
    setPhase('clinic');
  }

  function check() {
    setAnswers((a) => [...a, scoreAnswer(q, value, hint)]);
    setChecked(true);
  }

  function next() {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      setValue('');
      setHint(false);
      setChecked(false);
      return;
    }
    const attempt = buildAttempt(
      { id: 'tr-' + Date.now().toString(36), date: new Date().toISOString(), mode: 'trainer', level, timeMs: Date.now() - start.current },
      c!,
      result!,
      answers,
    );
    addAttempt(attempt);
    setPhase('debrief');
  }

  if (phase === 'setup' || !c || !result) {
    return (
      <div>
        <h2>{t('trainer.title')}</h2>
        <p className="muted">{t('trainer.intro')}</p>
        <div className="card">
          <fieldset>
            <legend>{t('level.choose')}</legend>
            <div className="options">
              {[1, 2, 3].map((l) => (
                <label key={l} className={'option' + (level === l ? ' selected' : '')}>
                  <input type="radio" name="level" checked={level === l} onChange={() => setLevel(l)} data-testid={'level-' + l} />
                  <strong>{t('level.' + l)}</strong> — {t('level.' + l + '.desc')}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t('trainer.source')}</legend>
            <div className="options">
              {(['generator', 'bank'] as Source[]).map((s) => (
                <label key={s} className={'option' + (source === s ? ' selected' : '')}>
                  <input type="radio" name="source" checked={source === s} onChange={() => setSource(s)} /> {t('trainer.source.' + s)}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="primary" onClick={newCase} data-testid="trainer-start">{t('trainer.start')}</button>
        </div>
      </div>
    );
  }

  const score = answers.reduce((s, a) => s + a.points, 0);
  // Treatment opens only after a correct diagnosis (steps 2–6)
  const diagnosisOk = answers.filter((a) => ['ph', 'primary', 'compensation', 'anionGap', 'deltaRatio'].includes(a.stepId)).every((a) => a.correct);
  const max = questions.reduce((s, x) => s + x.points, 0);

  return (
    <div>
      <h2>{t('trainer.title')} <span className="muted">· {t('level.' + level)}</span></h2>
      <ol className="gates" aria-label={t('trainer.gates')}>
        {(['clinic', 'steps', 'debrief'] as const).map((g) => (
          <li key={g} aria-current={phase === g ? 'step' : undefined} className={phase === g ? 'current' : ''}>{t('gate.' + g)}</li>
        ))}
      </ol>
      <CaseCard c={c} showVignette />

      {phase === 'clinic' && (
        <div className="actions">
          <button className="primary" data-testid="to-steps" onClick={() => { start.current = Date.now(); setPhase('steps'); }}>{t('trainer.toAnalysis')}</button>
        </div>
      )}

      {phase === 'steps' && q && (
        <section className="card" aria-live="polite">
          <p className="muted">{t('trainer.progress', { i: idx + 1, n: questions.length, score: n(score, 1), max })}</p>
          <QuestionInput q={q} value={value} onChange={setValue} disabled={checked} name={'tq-' + q.id} />
          {hint && <p className="hint" role="note">{t(q.hintKey, q.hintParams)}</p>}
          {checked && (
            <div className={'feedback ' + (isCorrect(q, value) ? 'ok' : 'bad')} role="status" data-testid="feedback">
              <strong>{t(isCorrect(q, value) ? 'trainer.correct' : 'trainer.incorrect')}</strong>{' '}
              {t('trainer.rightAnswer')}: {answerLabel(q, q.correct, t, n)}. {t(q.explanationKey, q.explanationParams)}
            </div>
          )}
          <div className="actions">
            {!checked && (
              <>
                <button className="primary" disabled={value.trim() === ''} onClick={check} data-testid="check">{t('trainer.check')}</button>
                <button onClick={() => setHint(true)} disabled={hint} data-testid="hint">{t('trainer.hint', { cost: q.points / 2 })}</button>
              </>
            )}
            {checked && <button className="primary" onClick={next} data-testid="next">{t(idx + 1 < questions.length ? 'trainer.next' : 'trainer.finish')}</button>}
          </div>
        </section>
      )}

      {phase === 'debrief' && (
        <div data-testid="debrief">
          <section className="card">
            <h3>{t('debrief.title')}</h3>
            <p className="score">{t('debrief.score', { score: n(score, 1), max })}</p>
            <ol className="debrief">
              {questions.map((x, i) => {
                const a = answers[i];
                return (
                  <li key={x.id} className={a?.correct ? 'ok' : 'bad'}>
                    <strong>{t(x.promptKey)}</strong>
                    <div>
                      {t('debrief.yours')}: {answerLabel(x, a?.answer ?? '', t, n)} · {t('debrief.right')}: {answerLabel(x, x.correct, t, n)}
                      {a?.hint && <span className="muted"> · {t('debrief.hintUsed')}</span>}
                    </div>
                    <div className="muted">{t(x.explanationKey, x.explanationParams)}</div>
                  </li>
                );
              })}
            </ol>
          </section>
          <section className="card">
            <h3>{t('debrief.conclusion')}</h3>
            <SummaryText parts={result.summary} />
            <p className="hint">{t('debrief.treatmentPrompt')}</p>
          </section>
          {!diagnosisOk && <p className="flag flag-info" role="note">{t('treat.locked')}</p>}
          <ResultView result={result} showTreatment={diagnosisOk} />
          <div className="actions">
            <button className="primary" onClick={newCase} data-testid="next-case">{t('trainer.nextCase')}</button>
            <button onClick={() => setPhase('setup')}>{t('trainer.changeLevel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
