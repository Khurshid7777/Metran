import normsJson from '../../content/norms.json';
import { useT } from '../common/useT';

const STEPS = ['check', 'ph', 'primary', 'comp', 'ag', 'delta'] as const;
const ROWS = ['metAcid', 'metAlk', 'respAcid', 'respAlk'] as const;

/** Static algorithm: the six steps of a bedside acid–base analysis with the numbers the app uses. */
export function AcidBaseGuide() {
  const { t } = useT();
  const p = {
    agLo: normsJson.AG.withoutK[0], agHi: normsJson.AG.withoutK[1], base: normsJson.AG.deltaBase, alb: normsJson.AG.albuminFactor,
    d1: normsJson.deltaRatio.low, d2: normsJson.deltaRatio.mid, d3: normsJson.deltaRatio.high,
  };
  return (
    <div data-testid="guide">
      <section className="card" aria-labelledby="guide-h">
        <h3 id="guide-h">{t('guide.title')}</h3>
        <p className="muted small">{t('guide.intro')}</p>
        <ol className="guide-steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <span className="guide-n" aria-hidden="true">{i + 1}</span>
              <div>
                <strong>{t('guide.' + s + '.title')}</strong>
                <p>{t('guide.' + s + '.text', p)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="card" aria-labelledby="guide-t">
        <h3 id="guide-t">{t('guide.table')}</h3>
        <table className="values guide-table">
          <thead>
            <tr><th scope="col">{t('guide.col.disorder')}</th><th scope="col">{t('guide.col.expected')}</th><th scope="col">{t('guide.col.first')}</th></tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r}>
                <th scope="row">{t('guide.row.' + r)}</th>
                <td>{t('guide.row.' + r + '.exp')}</td>
                <td>{t('guide.row.' + r + '.first')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">{t('guide.note')}</p>
      </section>
    </div>
  );
}
