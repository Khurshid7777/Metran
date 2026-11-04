import { SCENARIOS } from '../../core/generator';
import { INTERVAL_DAYS, MAX_BOX, isSuccess, reviewState } from '../../core/spaced';
import type { AttemptRecord } from '../../storage/records';
import { scenarioLabel, scenarioPrimary } from '../common/scenarioLabel';
import { useT } from '../common/useT';

/** Spaced-repetition plan and accuracy by type of disorder, both derived from the attempt history. */
export function ReviewCard({ attempts }: { attempts: AttemptRecord[] }) {
  const { t, n, lang } = useT();
  const now = Date.now();
  const states = [...reviewState(attempts).values()]
    .filter((s) => SCENARIOS.some((x) => x.id === s.id))
    .sort((a, b) => a.dueAt - b.dueAt);
  const seen = new Set(states.map((s) => s.id));
  const unseen = SCENARIOS.filter((s) => !seen.has(s.id)).length;

  const byType = new Map<string, { ok: number; total: number }>();
  for (const a of attempts) {
    const p = a.scenarioId ? scenarioPrimary(a.scenarioId) : null;
    if (!p) continue;
    const v = byType.get(p) ?? { ok: 0, total: 0 };
    v.total++;
    if (isSuccess(a)) v.ok++;
    byType.set(p, v);
  }
  const types = [...byType.entries()].sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total);

  return (
    <>
      <section className="card" aria-labelledby="rev-h" data-testid="review-plan">
        <h3 id="rev-h">{t('review.title')}</h3>
        <p className="muted small">{t('review.intro', { days: INTERVAL_DAYS.slice(1).join(' / ') })}</p>
        {states.length === 0 ? (
          <p className="muted">{t('review.empty')}</p>
        ) : (
          <table className="values review-table">
            <caption className="sr-only">{t('review.title')}</caption>
            <thead>
              <tr><th scope="col">{t('review.topic')}</th><th scope="col">{t('review.box')}</th><th scope="col">{t('review.result')}</th><th scope="col">{t('review.next')}</th></tr>
            </thead>
            <tbody>
              {states.map((s) => {
                const label = scenarioLabel(s.id, t, lang)!;
                const due = s.dueAt <= now;
                return (
                  <tr key={s.id} className={due ? 'due' : ''}>
                    <th scope="row">
                      {label.type}
                      <span className="muted small"> — {label.story}</span>
                    </th>
                    <td>{s.box}/{MAX_BOX}</td>
                    <td>{s.correct}/{s.attempts}</td>
                    <td>{due ? <strong>{t('review.now')}</strong> : new Date(s.dueAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {unseen > 0 && states.length > 0 && <p className="muted small">{t('review.unseen', { n: unseen })}</p>}
      </section>

      {types.length > 0 && (
        <section className="card" aria-labelledby="bytype-h" data-testid="by-type">
          <h3 id="bytype-h">{t('review.byType')}</h3>
          <ul className="bars">
            {types.map(([type, v]) => {
              const p = Math.round((v.ok / v.total) * 100);
              return (
                <li key={type}>
                  <span className="bar-label">{t('disorder.' + type)}</span>
                  <span className="bar-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={t('disorder.' + type)}>
                    <span className={'bar-fill' + (p < 70 ? ' weak' : '')} style={{ width: p + '%' }} />
                  </span>
                  <span className="bar-val">{p}% <span className="muted">({n(v.ok, 0)}/{n(v.total, 0)})</span></span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
