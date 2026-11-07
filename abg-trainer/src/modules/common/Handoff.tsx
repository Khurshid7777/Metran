import { useState } from 'react';
import type { AbgInput, InterpretationResult } from '../../core/types';
import { useT } from './useT';

/** Short plain text for a handover or the medical record: values, conclusion, critical shifts, warnings. */
export function useHandoffText() {
  const { t, n } = useT();
  return (result: InterpretationResult, input: AbgInput): string => {
    const v = (k: keyof AbgInput, d = 1) => (typeof input[k] === 'number' ? `${t('field.' + k)} ${n(input[k] as number, d)}` : null);
    const values = [v('pH', 3), v('pCO2'), v('pO2'), v('HCO3'), v('BE'), v('Na', 0), v('K'), v('Cl', 0), v('iCa', 2), v('glucose'), v('lactate'), v('Hb', 0)].filter(Boolean).join('; ');
    const lines = [
      `${t('handoff.head')} — ${new Date().toLocaleString()}`,
      `${t('sample.' + input.sampleType)}, ${t('age.' + input.ageCategory)}${input.weightKg ? `, ${n(input.weightKg, 1)} ${t('unit.kg')}` : ''}`,
      values,
      `${t('handoff.conclusion')}: ${result.summary.map((p) => t(p.key, p.params)).join(' ')}`,
    ];
    if (result.crises.length) lines.push(`${t('handoff.crises')}: ${result.crises.map((c) => `${t('crisis.name.' + c.id)} ${n(c.value, ['pH', 'iCa', 'Mg', 'phosphate'].includes(c.id) ? 2 : 1)} (${t('crisis.' + c.dir)}, ${t('crisis.level.' + c.level)})`).join('; ')}`);
    const warn = result.flags.filter((f) => f.severity === 'critical' || f.severity === 'warning').map((f) => t('flag.' + f.code + '.short'));
    if (warn.length) lines.push(`${t('handoff.flags')}: ${[...new Set(warn)].join('; ')}`);
    if (result.excluded) lines.push(t('exclude.note', { list: result.excluded.map((k) => t('exclude.' + k)).join('; ') }));
    return lines.join('\n');
  };
}

export function HandoffButton({ result, input }: { result: InterpretationResult; input: AbgInput | undefined }) {
  const { t } = useT();
  const build = useHandoffText();
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!input) return null;
  async function copy() {
    const s = build(result, input!);
    setText(s);
    try {
      await navigator.clipboard.writeText(s);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <button type="button" onClick={copy} data-testid="handoff">{t('handoff.button')}</button>
      {text !== null && (
        <div className="handoff-box" data-testid="handoff-box">
          <p className="muted small" role="status">{t(copied ? 'handoff.copied' : 'handoff.manual')}</p>
          <textarea readOnly rows={6} value={text} aria-label={t('handoff.button')} onFocus={(e) => e.target.select()} data-testid="handoff-text" />
        </div>
      )}
    </>
  );
}
