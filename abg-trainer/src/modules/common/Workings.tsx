import type { InterpretationResult } from '../../core/types';
import type { Working } from '../../core/workings';
import { useT } from './useT';

/** Formulas with the patient's numbers substituted. */
export function Workings({ items }: { items: Working[] }) {
  const { t } = useT();
  if (!items.length) return null;
  return (
    <div className="workings">
      <span className="workings-label">{t('work.label')}</span>
      <ul>
        {items.map((w, i) => (
          <li key={w.key + i}>
            <code>{t('work.' + w.key, w.params)}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeficitsCard({ result }: { result: InterpretationResult }) {
  const { t } = useT();
  const items = result.workings.filter((w) => w.stepId === 'deficits');
  if (!items.length) return null;
  return (
    <section className="card" aria-labelledby="def-h" data-testid="deficits">
      <h3 id="def-h">{t('deficit.title')}</h3>
      <p className="disclaimer" role="note">{t('treat.disclaimer')}</p>
      {items.map((w) => (
        <div key={w.key} className="treat-item">
          <h4>{t('deficit.' + w.key + '.title')}</h4>
          <Workings items={[w]} />
          <p className="muted">{t('deficit.' + w.key + '.note', w.params)}</p>
        </div>
      ))}
    </section>
  );
}

const PROCESS = ['consistency', 'ph', 'primary', 'compensation', 'anionGap', 'deltaRatio', 'osmolar', 'stewart', 'oxygenation', 'labs'];

/** How the conclusion is reached: the order of the algorithm and what each step answers. */
export function ProcessCard({ result }: { result: InterpretationResult }) {
  const { t } = useT();
  return (
    <section className="card" aria-labelledby="proc-h">
      <details className="process">
        <summary>
          <h3 id="proc-h">{t('process.title')}</h3>
        </summary>
        <p>{t('process.intro')}</p>
        <ul className="process-list">
          {PROCESS.map((id) => {
            const s = result.steps.find((x) => x.id === id);
            const state = !s ? 'disabled' : s.status;
            return (
              <li key={id} className={'proc-' + state}>
                <strong>{t('step.' + id + '.title')}</strong>
                <span className="muted"> — {t('process.' + id)}</span>
                {state !== 'done' && <span className="badge badge-muted">{t('status.' + state)}</span>}
              </li>
            );
          })}
        </ul>
        <p className="muted small">{t('process.outro')}</p>
      </details>
    </section>
  );
}
