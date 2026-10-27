import { useEffect, useMemo, useRef, useState } from 'react';
import { generateForLevel, rng, type CaseData } from '../../core/generator';
import { interpret } from '../../core/interpret';
import type { InterpretationResult } from '../../core/types';
import { downloadCertificate } from '../../certificate/certificate';
import { addAttempt, addExam, certificateCode, updateExam, type AttemptRecord, type ExamRecord } from '../../storage/records';
import { coreSettings, useApp } from '../../store';
import { bank } from '../common/bank';
import { CaseCard } from '../common/CaseCard';
import { answerLabel, QuestionInput } from '../common/QuestionInput';
import { useT } from '../common/useT';
import { buildAttempt, buildQuestions, scoreAnswer, type Question } from '../trainer/questions';

interface ExamCase {
  c: CaseData;
  r: InterpretationResult;
  qs: Question[];
}

/** 70% generator, 30% real bank, no repeats within one attempt. */
export function buildExam(level: number, count: number, seed: number): CaseData[] {
  const rand = rng(seed);
  const pool = [...bank().accepted.filter((c) => c.level <= level)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const fromBank = pool.slice(0, Math.min(pool.length, Math.round(count * 0.3)));
  const out: CaseData[] = [...fromBank];
  const ids = new Set(out.map((c) => c.id));
  let k = 0;
  while (out.length < count && k < count * 20) {
    const c = generateForLevel(level, seed + (k + 1) * 7919);
    k++;
    if (c && !ids.has(c.id)) {
      ids.add(c.id);
      out.push(c);
    }
  }
  // interleave bank and generated cases deterministically
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Phase = 'setup' | 'running' | 'result';

export function Exam() {
  const { t, n, lang } = useT();
  const { settings, profile, go } = useApp();
  const [phase, setPhase] = useState<Phase>('setup');
  const [level, setLevel] = useState(1);
  const [cases, setCases] = useState<ExamCase[]>([]);
  const [idx, setIdx] = useState(0);
  const [values, setValues] = useState<Record<string, string>[]>([]);
  const [exam, setExam] = useState<ExamRecord | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [now, setNow] = useState(Date.now());
  const startedAt = useRef(0);
  const caseStart = useRef(0);
  const caseTimes = useRef<number[]>([]);
  const meta = useRef({ examId: '', seed: 0 });

  const deadline = startedAt.current + settings.examMinutes * 60000;
  const remaining = Math.max(0, deadline - now);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'running' && remaining <= 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase]);

  function start() {
    const seed = (Date.now() % 1_000_000_007) >>> 0;
    const s = { ...coreSettings(settings), advanced: level >= 3 || settings.advanced };
    const list = buildExam(level, settings.examCases, seed).map((c) => {
      const r = interpret(c.input, s);
      return { c, r, qs: buildQuestions(c, r, level) };
    });
    meta.current = { examId: 'ex-' + Date.now().toString(36), seed };
    setCases(list);
    setValues(list.map(() => ({})));
    setIdx(0);
    startedAt.current = Date.now();
    caseStart.current = Date.now();
    caseTimes.current = list.map(() => 0);
    setNow(Date.now());
    setPhase('running');
  }

  function leaveCase(to: number) {
    caseTimes.current[idx] += Date.now() - caseStart.current;
    caseStart.current = Date.now();
    setIdx(to);
    window.scrollTo?.(0, 0);
  }

  function finish() {
    if (phase !== 'running') return;
    caseTimes.current[idx] += Date.now() - caseStart.current;
    const date = new Date().toISOString();
    const recs = cases.map((ec, i) => {
      const answers = ec.qs.map((q) => scoreAnswer(q, values[i]?.[q.id] ?? '', false));
      return buildAttempt(
        { id: `${meta.current.examId}-${i}`, date, mode: 'exam', level, examId: meta.current.examId, timeMs: caseTimes.current[i] },
        ec.c,
        ec.r,
        answers,
      );
    });
    const score = recs.reduce((s, a) => s + a.score, 0);
    const max = recs.reduce((s, a) => s + a.maxScore, 0);
    const percent = max ? Math.round((score / max) * 1000) / 10 : 0;
    const passed = percent >= settings.passPercent;
    const record: ExamRecord = {
      examId: meta.current.examId,
      date,
      level,
      seed: meta.current.seed,
      cases: cases.length,
      percent,
      passed,
      durationMs: Date.now() - startedAt.current,
      fullName: profile.fullName,
    };
    if (passed) record.certCode = certificateCode(profile, record);
    recs.forEach(addAttempt);
    addExam(record);
    setAttempts(recs);
    setExam(record);
    setPhase('result');
  }

  async function certificate() {
    if (!exam?.certCode) return;
    const date = new Date(exam.date).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'uz' ? 'uz-Latn' : 'ru-RU');
    await downloadCertificate(
      {
        heading: t('cert.heading'),
        subtitle: t('cert.subtitle'),
        name: profile.fullName || t('cert.noName'),
        body: t('cert.body', { level: '@level.' + exam.level }),
        details: [t('cert.score', { p: exam.percent }), t('cert.date', { d: date })],
        code: exam.certCode,
        codeLabel: t('cert.code'),
        center: settings.centerName,
        signatory: settings.signatory,
        signatureLabel: t('cert.signature'),
        disclaimer: t('app.disclaimerShort'),
        logoDataUrl: settings.logoDataUrl || undefined,
      },
      `certificate-${exam.certCode}.pdf`,
    );
    updateExam(exam);
  }

  const current = cases[idx];
  const answeredCount = useMemo(
    () => cases.filter((ec, i) => ec.qs.every((q) => (values[i]?.[q.id] ?? '').trim() !== '')).length,
    [cases, values],
  );

  if (phase === 'setup') {
    return (
      <div>
        <h2>{t('exam.title')}</h2>
        <p className="muted">{t('exam.intro', { n: settings.examCases, m: settings.examMinutes, p: settings.passPercent })}</p>
        {!profile.fullName && (
          <p className="flag flag-warning" role="note">
            {t('exam.noProfile')} <button className="link" onClick={() => go('settings')}>{t('nav.settings')}</button>
          </p>
        )}
        <div className="card">
          <fieldset>
            <legend>{t('level.choose')}</legend>
            <div className="options">
              {[1, 2, 3].map((l) => (
                <label key={l} className={'option' + (level === l ? ' selected' : '')}>
                  <input type="radio" name="exam-level" checked={level === l} onChange={() => setLevel(l)} data-testid={'exam-level-' + l} />
                  <strong>{t('level.' + l)}</strong> — {t('level.' + l + '.desc')}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="primary" onClick={start} data-testid="exam-start">{t('exam.start')}</button>
        </div>
      </div>
    );
  }

  if (phase === 'running' && current) {
    const mm = Math.floor(remaining / 60000);
    const ss = Math.floor((remaining % 60000) / 1000);
    return (
      <div>
        <div className="exam-bar" role="status">
          <span>{t('exam.caseOf', { i: idx + 1, n: cases.length })}</span>
          <span className={remaining < 5 * 60000 ? 'timer low' : 'timer'} aria-label={t('exam.timeLeft')}>
            ⏱ {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </span>
          <span className="muted">{t('exam.answered', { a: answeredCount, n: cases.length })}</span>
        </div>
        <CaseCard c={current.c} />
        <section className="card">
          {current.qs.map((q) => (
            <QuestionInput
              key={q.id}
              q={q}
              name={`ex-${idx}-${q.id}`}
              value={values[idx]?.[q.id] ?? ''}
              onChange={(v) => setValues((all) => all.map((x, i) => (i === idx ? { ...x, [q.id]: v } : x)))}
            />
          ))}
        </section>
        <div className="actions">
          <button disabled={idx === 0} onClick={() => leaveCase(idx - 1)}>{t('exam.prev')}</button>
          {idx + 1 < cases.length ? (
            <button className="primary" onClick={() => leaveCase(idx + 1)} data-testid="exam-next">{t('exam.next')}</button>
          ) : (
            <button className="primary" onClick={finish} data-testid="exam-finish">{t('exam.finish')}</button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'result' && exam) {
    return (
      <div data-testid="exam-result">
        <h2>{t('exam.resultTitle')}</h2>
        <section className={'card ' + (exam.passed ? 'pass' : 'fail')}>
          <p className="score">{t('exam.percent', { p: exam.percent })}</p>
          <p>{t(exam.passed ? 'exam.passed' : 'exam.failed', { p: settings.passPercent })}</p>
          {exam.passed && (
            <>
              <p>{t('cert.code')}: <code data-testid="cert-code">{exam.certCode}</code></p>
              <button className="primary" onClick={certificate} data-testid="cert-download">{t('cert.download')}</button>
            </>
          )}
        </section>
        <section className="card">
          <h3>{t('exam.review')}</h3>
          <ol className="debrief">
            {cases.map((ec, i) => (
              <li key={ec.c.id} className={attempts[i]?.score === attempts[i]?.maxScore ? 'ok' : 'bad'}>
                <strong>{t('exam.caseOf', { i: i + 1, n: cases.length })}</strong> — {n(attempts[i]?.score, 1)} / {attempts[i]?.maxScore}
                <ul>
                  {ec.qs.map((q) => {
                    const a = attempts[i]?.answers.find((x) => x.qid === q.id);
                    if (a?.correct) return null;
                    return (
                      <li key={q.id}>
                        {t(q.promptKey)}: {t('debrief.yours')} {answerLabel(q, a?.answer ?? '', t, n)} · {t('debrief.right')} {answerLabel(q, q.correct, t, n)}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </section>
        <div className="actions">
          <button onClick={() => setPhase('setup')}>{t('exam.again')}</button>
          <button onClick={() => go('progress')}>{t('nav.progress')}</button>
        </div>
      </div>
    );
  }
  return null;
}
