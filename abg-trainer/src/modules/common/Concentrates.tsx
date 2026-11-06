import { useState } from 'react';
import type { InterpretationResult } from '../../core/types';
import { parseLocaleNumber } from '../../core/units';
import { useApp } from '../../store';
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

/** The KCl solution the unit uses: quick choice plus any other %, saved in the settings. */
function KclChoice({ pct }: { pct: number }) {
  const { t } = useT();
  const update = useApp((s) => s.updateSettings);
  const [raw, setRaw] = useState('');
  return (
    <div className="kcl-choice">
      <span id="kcl-l">{t('conc.K.which')}</span>
      <div className="chip-row" role="radiogroup" aria-labelledby="kcl-l">
        {[3, 4, 7.5].map((c) => (
          <button key={c} type="button" role="radio" aria-checked={pct === c} className={'chip' + (pct === c ? ' on' : '')} onClick={() => { setRaw(''); update({ kclPct: c }); }} data-testid={'kcl-' + c}>
            {String(c).replace('.', ',')} %
          </button>
        ))}
        <input
          aria-label={t('conc.K.other')}
          placeholder={t('conc.K.other')}
          inputMode="decimal"
          className="kcl-other"
          data-testid="kcl-other"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            const v = parseLocaleNumber(e.target.value);
            if (!Number.isNaN(v) && v > 0 && v <= 15) update({ kclPct: v });
          }}
        />
      </div>
    </div>
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
              <KclChoice pct={c.kclPct} />
              <p>{t('conc.K.draw', { c: n(c.kclPct, 2), mm: n(c.mmolMl, 2), ml: n(c.stockMl, 1) })}</p>
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
