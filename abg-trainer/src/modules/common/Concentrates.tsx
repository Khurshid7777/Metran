import type { InterpretationResult } from '../../core/types';
import { useT } from './useT';

/** Stacked bar: share of the concentrate in the final volume. */
function Share({ stockMl, totalMl, label }: { stockMl: number; totalMl: number; label: string }) {
  const w = totalMl > 0 ? Math.min(1, stockMl / totalMl) * 304 : 0;
  return (
    <svg viewBox="0 0 320 22" className="chart mixbar" role="img" aria-label={label}>
      <rect x={8} y={4} width={304} height={14} className="fp-maintenance" />
      <rect x={8} y={4} width={Math.max(w, 1)} height={14} className="fp-deficit" />
    </svg>
  );
}

/** Concentrated solutions for the hypo-states present: what to draw, what to dilute with, and at which rate. */
export function ConcentratesCard({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  if (!result.concentrates.length) return null;
  const ml = (v: number, d = 1) => `${n(v, d)} ${t('unit.ml')}`;
  return (
    <section className="card concentrates" aria-labelledby="conc-h" data-testid="concentrates">
      <h3 id="conc-h">{t('conc.title')}</h3>
      <p className="disclaimer" role="note">{t('conc.disclaimer')}</p>
      {result.concentrates.map((c) => {
        if (c.id === 'K') {
          return (
            <article key="K" className="treat-item" data-testid="conc-K">
              <h4>{t('conc.K.title', { dose: n(c.doseMmol, 1) })}</h4>
              <p>{t('conc.K.draw', { ml: n(c.stockMl, 1) })}</p>
              {(['peripheral', 'central'] as const).map((line) => {
                const x = c[line];
                return (
                  <div key={line}>
                    <p>
                      <strong>{t('conc.K.' + line)}</strong>: {t('conc.K.final', { conc: n(x.conc, 0), vol: n(x.volumeMl, 0), dil: n(x.diluentMl, 0) })}
                    </p>
                    <Share stockMl={c.stockMl} totalMl={x.volumeMl} label={t('conc.share.aria', { a: Math.round((c.stockMl / x.volumeMl) * 100) })} />
                    <p className="muted small">{t('conc.K.rate', { mmol: n(x.maxRateMmolH, 2), ml: n(x.maxRateMlH, 0) })}</p>
                  </div>
                );
              })}
              <p className="muted small">{t('conc.K.note')}</p>
            </article>
          );
        }
        if (c.id === 'Na') {
          return (
            <article key="Na" className="treat-item" data-testid="conc-Na">
              <h4>{t('conc.Na.title')}</h4>
              <p>{t('conc.Na.amount', { mmol: n(c.mmol24h, 0), ml: n(c.ml3pct, 0), max: c.limit })}</p>
              <p><strong>{t('conc.Na.recipe')}</strong>: {t('conc.Na.recipeText', { s: n(c.recipe100.stockMl, 1), d: n(c.recipe100.diluentMl, 1) })}</p>
              <Share stockMl={c.recipe100.stockMl} totalMl={100} label={t('conc.share.aria', { a: Math.round(c.recipe100.stockMl) })} />
              <p className="muted small">{t('conc.Na.note')}</p>
            </article>
          );
        }
        if (c.id === 'Ca') {
          return (
            <article key="Ca" className="treat-item" data-testid="conc-Ca">
              <h4>{t('conc.Ca.title')}</h4>
              <p>
                {c.gluconateMlMax && c.gluconateMlMax !== c.gluconateMl
                  ? t('conc.Ca.doseRange', { ml: n(c.gluconateMl, 1), max: n(c.gluconateMlMax, 1) })
                  : t('conc.Ca.dose', { ml: ml(c.gluconateMl) })}{' '}
                {t('conc.Ca.mmol', { mmol: n(c.mmol, 2) })}
              </p>
              <p className="muted small">{t('conc.Ca.note')}</p>
            </article>
          );
        }
        return (
          <article key="glucose" className="treat-item" data-testid="conc-glucose">
            <h4>{t('conc.glucose.title', { c: c.target })}</h4>
            {c.recipes.map((r) => (
              <div key={r.stockPct}>
                <p>{t('conc.glucose.recipe', { stock: r.stockPct, s: n(r.stockMl, 1), d: n(r.diluentMl, 1) })}</p>
                <Share stockMl={r.stockMl} totalMl={100} label={t('conc.share.aria', { a: Math.round(r.stockMl) })} />
              </div>
            ))}
            <p className="muted small">{t('conc.glucose.note')}</p>
          </article>
        );
      })}
    </section>
  );
}
