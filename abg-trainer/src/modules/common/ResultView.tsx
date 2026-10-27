import type { Flag, InterpretationResult, Step, SummaryPart } from '../../core/types';
import { useT } from './useT';
import { StewartChart } from './StewartChart';

const VERDICT_PREFIX: Partial<Record<Step['id'], string>> = {
  primary: 'disorder.',
  deltaRatio: 'delta.',
  anionGap: 'ag.',
  osmolar: 'osm.',
  oxygenation: 'oxy.',
};

const SEVERITY_ORDER = { block: 0, critical: 1, warning: 2, info: 3 } as const;

export function SummaryText({ parts }: { parts: SummaryPart[] }) {
  const { t } = useT();
  return <p className="summary">{parts.map((p) => t(p.key, p.params)).join(' ')}</p>;
}

export function FlagList({ flags }: { flags: Flag[] }) {
  const { t } = useT();
  if (!flags.length) return null;
  const sorted = [...flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return (
    <ul className="flags" aria-label={t('result.flags')}>
      {sorted.map((f) => (
        <li key={f.code} className={'flag flag-' + f.severity}>
          <span className="flag-sev">{t('severity.' + f.severity)}</span> {t('flag.' + f.code + '.text', f.params)}
        </li>
      ))}
    </ul>
  );
}

function StepCard({ step }: { step: Step }) {
  const { t, n } = useT();
  const digits = step.id === 'ph' || step.id === 'deltaRatio' || step.id === 'consistency' ? 2 : 1;
  const details = Object.entries(step.details).filter(
    ([k, v]) => typeof v === 'number' && Number.isFinite(v) && k !== 'pCO2' && k !== 'HCO3',
  ) as [string, number][];
  const prefix = VERDICT_PREFIX[step.id] ?? 'verdict.';
  return (
    <li className={'step step-' + step.status}>
      <div className="step-head">
        <h4>{t('step.' + step.id + '.title')}</h4>
        {step.status === 'done' && step.verdict ? (
          <span className="badge">{t(prefix + step.verdict)}</span>
        ) : (
          <span className="badge badge-muted">{t('status.' + step.status)}</span>
        )}
      </div>
      {step.status === 'done' && step.value !== undefined && step.id !== 'primary' && (
        <p className="step-value">
          {step.id === 'consistency'
            ? step.verdict === 'calculated'
              ? `${t('detail.HCO3')} ${n(step.value, 1)}`
              : t('detail.discrepancyPct', { v: Math.round(step.value * 100) })
            : n(step.value, digits)}
          {step.normalRange && step.id !== 'consistency' && (
            <span className="muted"> · {t('result.norm', { lo: step.normalRange[0], hi: step.normalRange[1] })}</span>
          )}
        </p>
      )}
      <p className="step-expl">{t(step.explanationKey)}</p>
      {details.length > 0 && (
        <dl className="details">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt>{t('detail.' + k)}</dt>
              <dd>{n(v, Math.abs(v) < 10 ? 2 : 1)}</dd>
            </div>
          ))}
        </dl>
      )}
      {step.flags.length > 0 && <FlagList flags={step.flags} />}
    </li>
  );
}

export function TreatmentBlock({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const tr = result.treatment;
  if (!tr || !tr.available) return null;
  const b = tr.bicarbonate;
  const v = tr.ventilation;
  return (
    <section className="card treatment" aria-labelledby="treat-h">
      <h3 id="treat-h">{t('treat.title')}</h3>
      <p className="disclaimer" role="note">{t('treat.disclaimer')}</p>
      {b && (
        <div className={'treat-item' + (b.blocked ? ' blocked' : '')} aria-disabled={b.blocked}>
          <h4>{t('treat.bicarb.title')}</h4>
          <p className="formula">{t('treat.bicarb.formula', { f: b.factor })}</p>
          <dl className="details">
            <div><dt>{t('treat.bicarb.deficit')}</dt><dd>{n(b.deficit, 1)} {t('unit.mmolAbs')}</dd></div>
            <div><dt>{t('treat.bicarb.firstDose')}</dt><dd>{n(b.firstDose, 1)} {t('unit.mmolAbs')}</dd></div>
            <div><dt>{t('treat.bicarb.volume', { c: b.concentration === '4.2' ? '4,2' : '8,4' })}</dt><dd>{n(b.volumeMl, 1)} {t('unit.ml')}</dd></div>
          </dl>
          {b.blocked && <p className="blocked-note">{t('treat.bicarb.blocked')}</p>}
          <FlagList flags={[...b.blockers, ...b.warnings]} />
        </div>
      )}
      {v && (
        <div className="treat-item">
          <h4>{t('treat.vent.title')}</h4>
          <p className="formula">{t('treat.vent.formula')}</p>
          <p>{t('treat.vent.result', { cur: v.currentRate, target: v.targetPCO2, next: v.newRate })}</p>
          {v.outOfLimits && <p className="flag flag-warning">{t('treat.vent.limits', { lo: v.limits[0], hi: v.limits[1] })}</p>}
        </div>
      )}
      {tr.hfoHints.length > 0 && (
        <div className="treat-item">
          <h4>{t('treat.hfo.title')}</h4>
          <ul>{tr.hfoHints.map((h) => <li key={h}>{t(h)}</li>)}</ul>
        </div>
      )}
      {tr.causeHints.length > 0 && (
        <div className="treat-item">
          <h4>{t('treat.cause.title')}</h4>
          <ul>{tr.causeHints.map((h) => <li key={h}>{t(h)}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

export function Differentials({ result }: { result: InterpretationResult }) {
  const { t } = useT();
  if (!result.differentials.length) return null;
  return (
    <section className="card" aria-labelledby="diff-h">
      <h3 id="diff-h">{t('result.differentials')}</h3>
      {result.differentials.map((d) => (
        <div key={d.group} className="diff">
          <h4>{t('diff.group.' + d.group)}</h4>
          <ol>{d.causes.map((c) => <li key={c}>{t('diff.cause.' + c)}</li>)}</ol>
          <p className="muted">
            {t('result.check')}: {d.checks.map((c) => t('diff.check.' + c)).join('; ')}
          </p>
        </div>
      ))}
    </section>
  );
}

export function ResultView({ result, showTreatment = true }: { result: InterpretationResult; showTreatment?: boolean }) {
  const { t } = useT();
  const stewart = result.steps.find((s) => s.id === 'stewart');
  return (
    <div className="result" data-testid="result">
      <section className="card conclusion" aria-labelledby="concl-h">
        <h3 id="concl-h">{t('result.conclusion')}</h3>
        <SummaryText parts={result.summary} />
        <FlagList flags={result.flags} />
      </section>
      <section className="card" aria-labelledby="steps-h">
        <h3 id="steps-h">{t('result.steps')}</h3>
        <ol className="steps">
          {result.steps.map((s) => (
            <StepCard key={s.id} step={s} />
          ))}
        </ol>
      </section>
      {stewart?.status === 'done' && <StewartChart step={stewart} />}
      <Differentials result={result} />
      {showTreatment && <TreatmentBlock result={result} />}
    </div>
  );
}
