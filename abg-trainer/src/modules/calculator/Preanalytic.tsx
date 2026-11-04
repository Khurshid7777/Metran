import { useT } from '../common/useT';

const ITEMS = ['heparin', 'air', 'mix', 'time', 'syringe', 'label', 'capillary', 'steady'];

/** Collapsible sample-handling checklist shown above the entry form. */
export function Preanalytic() {
  const { t } = useT();
  return (
    <details className="card preanalytic" data-testid="preanalytic">
      <summary>{t('pre.title')}</summary>
      <ul>
        {ITEMS.map((i) => <li key={i}>{t('pre.' + i)}</li>)}
      </ul>
      <p className="muted small">{t('pre.source')}</p>
    </details>
  );
}
