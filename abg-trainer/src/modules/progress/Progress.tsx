import { useMemo } from 'react';
import { computeKpi, download, exportCsv, exportJson, getAttempts, getExams, stepAccuracy } from '../../storage/records';
import { useApp } from '../../store';
import { useT } from '../common/useT';

const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10);

export function Progress() {
  const { t, n } = useT();
  const profile = useApp((s) => s.profile);
  const attempts = useMemo(getAttempts, []);
  const exams = useMemo(getExams, []);
  const acc = stepAccuracy(attempts);
  const kpi = computeKpi(attempts, exams);
  const stamp = new Date().toISOString().slice(0, 10);
  const recent = attempts.slice(-30);

  return (
    <div>
      <h2>{t('progress.title')}</h2>
      {attempts.length === 0 && <p className="muted">{t('progress.empty')}</p>}

      <section className="card" aria-labelledby="acc-h">
        <h3 id="acc-h">{t('progress.byStep')}</h3>
        <ul className="bars">
          {Object.entries(acc)
            .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
            .map(([step, v]) => {
              const p = Math.round((v.correct / v.total) * 100);
              return (
                <li key={step}>
                  <span className="bar-label">{t('step.' + step + '.title')}</span>
                  <span className="bar-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={t('step.' + step + '.title')}>
                    <span className={'bar-fill' + (p < 70 ? ' weak' : '')} style={{ width: p + '%' }} />
                  </span>
                  <span className="bar-val">{p}% <span className="muted">({v.correct}/{v.total})</span></span>
                </li>
              );
            })}
        </ul>
      </section>

      <section className="card" aria-labelledby="dyn-h">
        <h3 id="dyn-h">{t('progress.dynamics')}</h3>
        <div className="spark" role="img" aria-label={t('progress.dynamicsAria', { n: recent.length })}>
          {recent.map((a) => {
            const p = a.maxScore ? Math.round((a.score / a.maxScore) * 100) : 0;
            return <span key={a.id} className={'spark-bar ' + a.mode} style={{ height: Math.max(4, p) + '%' }} title={`${p}%`} />;
          })}
        </div>
        <p className="legend">
          <span className="sw sw-trainer" aria-hidden="true" /> {t('mode.trainer')} <span className="sw sw-exam" aria-hidden="true" /> {t('mode.exam')}
        </p>
      </section>

      <section className="card" aria-labelledby="exams-h">
        <h3 id="exams-h">{t('progress.exams')}</h3>
        {exams.length === 0 ? (
          <p className="muted">{t('progress.noExams')}</p>
        ) : (
          <table className="values">
            <thead>
              <tr><th>{t('progress.date')}</th><th>{t('progress.level')}</th><th>%</th><th>{t('progress.status')}</th><th>{t('cert.code')}</th></tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.examId}>
                  <td>{e.date.slice(0, 10)}</td>
                  <td>{e.level}</td>
                  <td>{n(e.percent, 1)}</td>
                  <td>{t(e.passed ? 'exam.passedShort' : 'exam.failedShort')}</td>
                  <td><code>{e.certCode ?? '—'}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" aria-labelledby="kpi-h">
        <h3 id="kpi-h">{t('kpi.title')}</h3>
        <dl className="details">
          <div><dt>{t('kpi.firstExam')}</dt><dd>{pct(kpi.firstExamAccuracy) ?? '—'}{kpi.firstExamAccuracy !== null && '%'}</dd></div>
          <div><dt>{t('kpi.lastExam')}</dt><dd>{pct(kpi.lastExamAccuracy) ?? '—'}{kpi.lastExamAccuracy !== null && '%'}</dd></div>
          <div><dt>{t('kpi.missedMixed')}</dt><dd>{pct(kpi.missedMixedRate) ?? '—'}{kpi.missedMixedRate !== null && '%'}</dd></div>
          <div><dt>{t('kpi.missedAlbumin')}</dt><dd>{pct(kpi.missedAlbuminRate) ?? '—'}{kpi.missedAlbuminRate !== null && '%'}</dd></div>
          {[1, 2, 3].map((l) => (
            <div key={l}><dt>{t('kpi.medianTime', { level: l })}</dt><dd>{kpi.medianTimeByLevel[l] === null ? '—' : n(kpi.medianTimeByLevel[l]!, 0) + ' ' + t('unit.sec')}</dd></div>
          ))}
          <div>
            <dt>{t('kpi.retention')}</dt>
            <dd>{kpi.retention ? t('kpi.retentionValue', { a: kpi.retention.earlier, b: kpi.retention.later, d: kpi.retention.days }) : '—'}</dd>
          </div>
        </dl>
        <div className="actions">
          <button data-testid="export-csv" onClick={() => download(`abg-results-${stamp}.csv`, exportCsv(profile, attempts), 'text/csv;charset=utf-8')}>{t('progress.exportCsv')}</button>
          <button data-testid="export-json" onClick={() => download(`abg-results-${stamp}.json`, exportJson(profile, attempts, exams), 'application/json')}>{t('progress.exportJson')}</button>
        </div>
      </section>
    </div>
  );
}
