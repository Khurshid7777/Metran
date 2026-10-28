import formulas from '../../content/formulas.json';
import { useT } from '../common/useT';

/** Formula sheet: every formula the app uses, grouped, with its source. */
export function Reference() {
  const { t, lang } = useT();
  // decimal separator of the language inside formulas (0.0307 → 0,0307)
  const local = (f: string) => (lang === 'en' ? f : f.replace(/(\d)\.(\d)/g, '$1,$2'));
  return (
    <div data-testid="reference">
      <h2>{t('ref.title')}</h2>
      <p className="muted">{t('ref.intro')}</p>
      {formulas.map((g) => (
        <section key={g.group} className="card" aria-labelledby={'ref-' + g.group}>
          <h3 id={'ref-' + g.group}>{t('ref.group.' + g.group)}</h3>
          <dl className="ref-list">
            {g.items.map((it) => (
              <div key={it.nameKey} className="ref-item">
                <dt>{t(it.nameKey)}</dt>
                <dd>
                  <code>{local(it.formula)}</code>
                  {it.source !== '—' && <span className="muted small"> · {it.source}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
