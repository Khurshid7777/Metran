import { useState } from 'react';
import { parseAblText, type AblField } from '../../core/parseAbl';
import { fromInternal } from '../../core/units';
import { useT } from '../common/useT';
import { useDraft } from './draft';

/** Field name in the draft for each parsed parameter, with the unit group used for display. */
const GAS: AblField[] = ['pCO2', 'pO2', 'pO2FO2'];

function fmt(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/** Paste box: fills the shared draft from text copied off the ABL800 screen or printout. */
export function PasteAbl() {
  const { t } = useT();
  const d = useDraft();
  const [text, setText] = useState('');
  const [info, setInfo] = useState<{ names: string[]; ignored: number; std: boolean; beB: boolean } | null>(null);

  function apply() {
    const r = parseAblText(text);
    const next = { ...d.values };
    for (const [k, v] of Object.entries(r.values) as [AblField, number][]) {
      const shown = GAS.includes(k) ? fromInternal(v, d.units.gas) : k === 'glucose' ? fromInternal(v, d.units.glucose, 'glucose') : v;
      next[k] = fmt(shown);
    }
    d.setValues(next);
    setInfo({ names: Object.keys(r.values), ignored: r.ignored, std: r.standardHco3Only, beB: r.beFromBlood });
  }

  return (
    <details className="card paste-abl">
      <summary>{t('paste.title')}</summary>
      <p className="muted small">{t('paste.hint')}</p>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={t('paste.title')}
        data-testid="paste-text"
        spellCheck={false}
      />
      <div className="actions">
        <button type="button" className="primary" onClick={apply} disabled={!text.trim()} data-testid="paste-apply">
          {t('paste.apply')}
        </button>
        <button type="button" onClick={() => { setText(''); setInfo(null); }}>{t('paste.clear')}</button>
      </div>
      {info && (
        <div role="status" data-testid="paste-result">
          {info.names.length === 0 ? (
            <p className="flag flag-warning">{t('paste.none')}</p>
          ) : (
            <p>{t('paste.found', { n: info.names.length, list: info.names.join(', ') })}</p>
          )}
          {info.std && <p className="flag flag-warning">{t('paste.stdOnly')}</p>}
          {info.beB && <p className="flag flag-warning">{t('paste.beBlood')}</p>}
          {info.names.length > 0 && <p className="muted small">{t('paste.sampleReminder')}</p>}
        </div>
      )}
    </details>
  );
}
