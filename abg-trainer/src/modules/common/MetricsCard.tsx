import type { MetricGroup } from '../../core/extended';
import type { InterpretationResult } from '../../core/types';
import { useT } from './useT';

const GROUPS: MetricGroup[] = ['acidBase', 'electrolytes', 'oxygen', 'temperature', 'neonatal'];

/** Detailed assessment: every derived value with its formula, normal range and verdict. */
export function MetricsCard({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  if (!result.metrics.length) return null;
  return (
    <section className="card" aria-labelledby="metrics-h" data-testid="metrics">
      <h3 id="metrics-h">{t('metric.title')}</h3>
      <p className="muted small">{t('metric.caption')}</p>
      {GROUPS.map((g) => {
        const items = result.metrics.filter((m) => m.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className="metric-group">
            <h4>{t('metric.group.' + g)}</h4>
            <ul className="metrics">
              {items.map((m) => (
                <li key={m.id} className={'metric metric-' + m.verdict}>
                  <div className="metric-head">
                    <span className="metric-name">{t('metric.' + m.id)}</span>
                    <span className="metric-value">
                      {n(m.value, m.digits)}
                      {m.unit && <span className="unit"> {t('unit.' + m.unit)}</span>}
                    </span>
                  </div>
                  <div className="metric-sub">
                    {m.normal && <span className="muted small">{t('result.norm', { lo: m.normal[0], hi: m.normal[1] })}</span>}
                    {m.verdict !== 'info' && <span className={'chip-s chip-' + m.verdict}>{t('metric.verdict.' + m.verdict)}</span>}
                  </div>
                  <code className="metric-formula">{t('work.x.' + m.id, m.params)}</code>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
