import type { Flag, InterpretationResult, Step, SummaryPart } from '../../core/types';
import { useT } from './useT';
import { StewartChart } from './StewartChart';
import { AcidBaseMap, BilirubinChart, Davenport, DeviationProfile, Gamblegram, O2Cascade, OdcChart } from './Charts';
import { DeficitsCard, ProcessCard, Workings } from './Workings';
import { MetricsCard } from './MetricsCard';
import type { Working } from '../../core/workings';

const VERDICT_PREFIX: Partial<Record<Step['id'], string>> = {
  primary: 'disorder.',
  deltaRatio: 'delta.',
  anionGap: 'ag.',
  osmolar: 'osm.',
  oxygenation: 'oxy.',
};

const HIDDEN_DETAILS = new Set(['pCO2', 'HCO3', 'discrepancy', 'pco2Lo', 'pco2Hi', 'hcoLo', 'hcoHi']);

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

function StepCard({ step, workings }: { step: Step; workings: Working[] }) {
  const { t, n } = useT();
  const digits = step.id === 'ph' || step.id === 'deltaRatio' || step.id === 'consistency' ? 2 : 1;
  const details = Object.entries(step.details).filter(
    ([k, v]) => typeof v === 'number' && Number.isFinite(v) && !HIDDEN_DETAILS.has(k),
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
      <Workings items={workings} />
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

export function DkaCard({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const d = result.dka;
  if (!d) return null;
  const adult = d.population === 'adult';
  return (
    <section className="card dka" aria-labelledby="dka-h" data-testid="dka-card">
      <h3 id="dka-h">{t('dka.title')}</h3>
      <p className="disclaimer" role="note">{t('treat.disclaimer')}</p>
      <dl className="details">
        <div><dt>{t('dka.severity')}</dt><dd>{t('dka.sev.' + d.severity)}{d.euglycemic ? ' · ' + t('dka.euglycemic') : ''}</dd></div>
        {d.effOsm !== undefined && <div><dt>{t('dka.effOsm')}</dt><dd>{n(d.effOsm, 0)} {t('unit.mosm')}</dd></div>}
        {d.insulin && (
          <div><dt>{t('dka.insulin')}</dt><dd>{n(d.insulin.lo, 2)}–{n(d.insulin.hi, 2)} {t('unit.unitsH')}</dd></div>
        )}
      </dl>
      {d.effOsm !== undefined && <p className="formula">{t('dka.effOsm.formula')}</p>}
      {d.insulin && <p className="muted">{t('dka.insulin.note', { low: d.insulin.lowRateAllowed ? t('dka.insulin.lowOk') : '' })}</p>}
      {adult && <p className="muted">{t('dka.adult.note')}</p>}
      {d.missing.includes('bhb') && <p className="flag flag-info">{t('dka.bhbMissing')}</p>}
      <p className="muted small">{t('dka.monitoring')}</p>
      <p className="flag flag-warning" role="note">{t('dka.unverified')}</p>
    </section>
  );
}

export function UrineCard({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const u = result.urine;
  if (!u) return null;
  const row = (label: string, value: string, formula: string) => (
    <div className="treat-item">
      <h4>{label}</h4>
      <p className="formula">{formula}</p>
      <p>{value}</p>
    </div>
  );
  return (
    <section className="card" aria-labelledby="urine-h" data-testid="urine-card">
      <h3 id="urine-h">{t('urine.title')}</h3>
      {u.uag !== undefined && u.uagClass && row(t('urine.uag'), `${n(u.uag, 0)} ${t('unit.mmol')} — ${t('urine.uag.' + u.uagClass)}`, t('urine.uag.formula'))}
      {u.clClass && row(t('urine.cl'), t('urine.cl.' + u.clClass), t('urine.cl.formula'))}
      {u.fena !== undefined && u.fenaClass && row(t('urine.fena'), `${n(u.fena, 2)} % — ${t('urine.fena.' + u.fenaClass)}`, t('urine.fena.formula'))}
      {u.feurea !== undefined && u.feureaClass && row(t('urine.feurea'), `${n(u.feurea, 1)} % — ${t('urine.feurea.' + u.feureaClass)}`, t('urine.feurea.formula'))}
      <p className="muted small">{t('urine.note')}</p>
    </section>
  );
}

export function NaCorrectionCard({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const c = result.naCorrection;
  if (!c) return null;
  return (
    <section className="card" aria-labelledby="nac-h" data-testid="na-correction">
      <h3 id="nac-h">{t('nac.title')}</h3>
      <p className="disclaimer" role="note">{t('treat.disclaimer')}</p>
      <p className="formula">{t('nac.formula', { tbw: c.tbw, max: c.limit })}</p>
      <table className="nac-table">
        <thead>
          <tr><th scope="col">{t('nac.solution')}</th><th scope="col">{t('nac.delta')}</th><th scope="col">{t('nac.volume', { max: c.limit })}</th></tr>
        </thead>
        <tbody>
          {c.items.map((i) => (
            <tr key={i.id} className={i.wrongDirection ? 'muted' : ''}>
              <th scope="row">{t('nac.sol.' + i.id)}</th>
              <td>{i.deltaPerL > 0 ? '+' : ''}{n(i.deltaPerL, 1)}</td>
              <td>{i.litres24h === undefined ? t('nac.wrong.' + c.direction) : `${n(i.litres24h, 2)} ${t('unit.l')} (${n(i.mlPerHour, 0)} ${t('unit.mlh')})`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t('nac.note')}</p>
    </section>
  );
}

export function TreatmentBlock({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const tr = result.treatment;
  if (!tr || !tr.available) return null;
  const b = tr.bicarbonate;
  const v = tr.ventilation;
  const w = (keys: string[]) => result.workings.filter((x) => x.stepId === 'treatment' && keys.includes(x.key));
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
          <Workings items={w(['bicarb'])} />
          {b.blocked && <p className="blocked-note">{t('treat.bicarb.blocked')}</p>}
          <FlagList flags={[...b.blockers, ...b.warnings]} />
        </div>
      )}
      {v && (
        <div className="treat-item">
          <h4>{t('treat.vent.title')}</h4>
          <p className="formula">{t('treat.vent.formula')}</p>
          <p>{t('treat.vent.result', { cur: v.currentRate, target: v.targetPCO2, next: v.newRate })}</p>
          <Workings items={w(['vent'])} />
          {v.outOfLimits && <p className="flag flag-warning">{t('treat.vent.limits', { lo: v.limits[0], hi: v.limits[1] })}</p>}
        </div>
      )}
      {tr.potassium && (
        <div className="treat-item" data-testid="treat-k">
          <h4>{t('treat.k.title')}</h4>
          <ul>
            <li>{t('treat.k.dose', { dose: Math.round(tr.potassium.doseMmol * 10) / 10 })}</li>
            <li>
              {tr.potassium.perKg
                ? t('treat.k.ratePed', {
                    rate: Math.round(tr.potassium.maxRateMmolH * 10) / 10,
                    icu: Math.round((tr.potassium.maxRateIcuMmolH ?? 0) * 10) / 10,
                    h: Math.round(tr.potassium.minHours * 10) / 10,
                  })
                : t('treat.k.rateAdult', { rate: tr.potassium.maxRateMmolH, icu: tr.potassium.maxRateIcuMmolH ?? 0 })}
            </li>
            <li>{t('treat.k.conc', { p: tr.potassium.concPeripheral, c: tr.potassium.concCentral })}</li>
          </ul>
          <Workings items={w(['kPed', 'kAdult'])} />
          <p className="muted">{t('treat.k.notes')}</p>
        </div>
      )}
      {tr.calcium && (
        <div className="treat-item" data-testid="treat-ca">
          <h4>{t('treat.ca.title')}</h4>
          <p>
            {tr.calcium.perKg
              ? t('treat.ca.dosePed', { ml: Math.round(tr.calcium.gluconateMl * 10) / 10 })
              : t('treat.ca.doseAdult', { ml: tr.calcium.gluconateMl, max: tr.calcium.gluconateMlMax ?? tr.calcium.gluconateMl })}
          </p>
          <Workings items={w(['caPed'])} />
          <p className="muted">{t('treat.ca.notes')}</p>
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
      <ProcessCard result={result} />
      <DeviationProfile result={result} />
      <AcidBaseMap result={result} />
      <Davenport result={result} />
      <section className="card" aria-labelledby="steps-h">
        <h3 id="steps-h">{t('result.steps')}</h3>
        <ol className="steps">
          {result.steps.map((s) => (
            <StepCard key={s.id} step={s} workings={result.workings.filter((w) => w.stepId === s.id)} />
          ))}
        </ol>
      </section>
      <MetricsCard result={result} />
      <Gamblegram result={result} />
      <OdcChart result={result} />
      <O2Cascade result={result} />
      {stewart?.status === 'done' && <StewartChart step={stewart} />}
      <BilirubinChart result={result} />
      <Differentials result={result} />
      {showTreatment && <DkaCard result={result} />}
      <UrineCard result={result} />
      {showTreatment && <NaCorrectionCard result={result} />}
      {showTreatment && <TreatmentBlock result={result} />}
      {showTreatment && <DeficitsCard result={result} />}
    </div>
  );
}
