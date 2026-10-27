import type { CaseData } from '../../core/generator';
import { ALL_FIELDS, internalUnit } from './fields';
import { useT } from './useT';

export function CaseCard({ c, showVignette = true }: { c: CaseData; showVignette?: boolean }) {
  const { t, n, lang } = useT();
  const input = c.input as unknown as Record<string, number | undefined>;
  const rows = ALL_FIELDS.filter((f) => typeof input[f.name] === 'number' && f.name !== 'weightKg' && f.name !== 'ageYears' && f.name !== 'gestationalWeeks');
  return (
    <section className="card case" aria-labelledby={'case-' + c.id}>
      <h3 id={'case-' + c.id}>
        {t('case.title')} <span className="muted">· {t('sample.' + c.input.sampleType)} · {t('age.' + c.input.ageCategory)}</span>
      </h3>
      {showVignette && <p className="vignette">{c.vignette[lang]}</p>}
      <table className="values">
        <caption className="sr-only">{t('case.values')}</caption>
        <tbody>
          {rows.map((f) => {
            const u = internalUnit(f);
            return (
              <tr key={f.name}>
                <th scope="row">{t('field.' + f.name)}</th>
                <td data-testid={'val-' + f.name}>
                  {n(input[f.name], f.digits)} {u && <span className="unit">{t('unit.' + u)}</span>}
                </td>
              </tr>
            );
          })}
          {c.input.ventilation && (
            <tr>
              <th scope="row">{t('field.ventMode')}</th>
              <td>
                {t('vent.' + c.input.ventilation.mode)}
                {c.input.ventilation.rate !== undefined && ` · ${t('field.ventRate')} ${c.input.ventilation.rate}`}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {c.source === 'bank' && <p className="muted small">{t('case.fromBank')}</p>}
    </section>
  );
}
