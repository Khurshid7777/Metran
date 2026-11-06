import { useState } from 'react';
import formulas from '../../content/formulas.json';
import { load, save } from '../../storage';
import { useT } from '../common/useT';
import { AcidBaseGuide } from './AcidBaseGuide';
import { PnTool } from './PnTool';
import { SolutionsTool } from './SolutionsTool';

type Tab = 'formulas' | 'guide' | 'solutions' | 'pn';
const TABS: Tab[] = ['formulas', 'guide', 'solutions', 'pn'];

/** Reference: formula sheet, acid–base algorithm, solution preparation and parenteral-nutrition calculators. */
export function Reference() {
  const { t, lang } = useT();
  const [tab, setTabState] = useState<Tab>(() => {
    const v = load<Tab>('refTab', 'formulas');
    return TABS.includes(v) ? v : 'formulas';
  });
  const setTab = (x: Tab) => {
    save('refTab', x);
    setTabState(x);
  };
  // decimal separator of the language inside formulas (0.0307 → 0,0307)
  const local = (f: string) => (lang === 'en' ? f : f.replace(/(\d)\.(\d)/g, '$1,$2'));
  return (
    <div data-testid="reference">
      <div className="calc-head">
        <h2>{t('ref.title')}</h2>
        <div className="segmented segmented-wrap" role="tablist" aria-label={t('ref.title')}>
          {TABS.map((x) => (
            <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)} data-testid={'ref-tab-' + x}>
              {t('ref.tab.' + x)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'guide' && <AcidBaseGuide />}
      {tab === 'solutions' && <SolutionsTool />}
      {tab === 'pn' && <PnTool />}
      {tab === 'formulas' && (
        <>
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
        </>
      )}
    </div>
  );
}
