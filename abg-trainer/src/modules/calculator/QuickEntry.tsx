import { useRef, useState } from 'react';
import { interpret } from '../../core/interpret';
import type { AbgInput, InterpretationResult, SampleType } from '../../core/types';
import { coreSettings, useApp } from '../../store';
import { FlagList, SummaryText } from '../common/ResultView';
import { useT } from '../common/useT';
import { buildInput } from './buildInput';
import { AGES, useDraft } from './draft';
import { AddToSeriesButton } from './SeriesCard';
import { useSeries } from './seriesStore';

const QUICK_SAMPLES: SampleType[] = ['arterial', 'capillary', 'venous', 'cord_artery'];

/** Fields in the order and with the names of the Radiometer ABL result screen. */
interface QuickField {
  name: keyof AbgInput;
  unit?: string;
  neonatalOnly?: boolean;
  required?: boolean;
}
const QUICK_FIELDS: QuickField[] = [
  { name: 'pH', required: true },
  { name: 'pCO2', unit: 'mmHg', required: true },
  { name: 'pO2', unit: 'mmHg' },
  { name: 'BE', unit: 'mmol' },
  { name: 'HCO3', unit: 'mmol' },
  { name: 'Hb', unit: 'gL' },
  { name: 'SaO2', unit: 'percent' },
  { name: 'K', unit: 'mmol' },
  { name: 'Na', unit: 'mmol' },
  { name: 'iCa', unit: 'mmol' },
  { name: 'Cl', unit: 'mmol' },
  { name: 'glucose', unit: 'mmol' },
  { name: 'lactate', unit: 'mmol' },
  { name: 'bilirubin', unit: 'umol', neonatalOnly: true },
  { name: 'FiO2', unit: 'fio2' },
  { name: 'weightKg', unit: 'kg' },
  { name: 'ageHours', unit: 'hours', neonatalOnly: true },
];

export function QuickEntry({ onDetails }: { onDetails: () => void }) {
  const { t } = useT();
  const settings = useApp((s) => s.settings);
  const d = useDraft();
  const [result, setResult] = useState<InterpretationResult | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const addSeries = useSeries((s) => s.add);
  const neonate = d.ageCategory === 'preterm' || d.ageCategory === 'term_neonate';
  const fields = QUICK_FIELDS.filter((f) => !f.neonatalOnly || neonate);

  function run(e?: React.FormEvent) {
    e?.preventDefault();
    const r = buildInput(d);
    setBad(r.bad);
    setResult(r.input ? interpret(r.input, coreSettings(settings)) : null);
  }

  // Enter moves to the next field; on the last field it runs the interpretation.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = formRef.current?.querySelector<HTMLInputElement>(`[data-qi="${i + 1}"]`);
    if (next) next.focus();
    else run();
  }

  const errorFor = (name: string) => {
    if (bad.includes(name)) return t(name === 'pH' || name === 'pCO2' ? 'err.required' : 'err.not_a_number');
    const e = result?.inputErrors.find((x) => x.field === name);
    return e?.code === 'out_of_range' ? t('err.out_of_range', { lo: e.range![0], hi: e.range![1] }) : undefined;
  };

  return (
    <div className="quick">
      <p className="muted">{t('quick.intro')}</p>
      <form ref={formRef} onSubmit={run} noValidate aria-label={t('calc.mode.quick')}>
        <div className="card quick-context">
          <div className="chip-row" role="radiogroup" aria-label={t('field.ageCategory')}>
            {AGES.map((a) => (
              <button
                type="button"
                key={a}
                role="radio"
                aria-checked={d.ageCategory === a}
                className={'chip' + (d.ageCategory === a ? ' on' : '')}
                onClick={() => d.setAge(a)}
                data-testid={'q-age-' + a}
              >
                {t('age.' + a)}
              </button>
            ))}
          </div>
          <div
            className={'chip-row' + (bad.includes('sampleType') ? ' need' : '')}
            role="radiogroup"
            aria-label={t('field.sampleType')}
            aria-describedby={bad.includes('sampleType') ? 'q-sample-err' : undefined}
          >
            {QUICK_SAMPLES.map((s) => (
              <button
                type="button"
                key={s}
                role="radio"
                aria-checked={d.sampleType === s}
                className={'chip' + (d.sampleType === s ? ' on' : '')}
                onClick={() => d.setSample(s)}
                data-testid={'q-sample-' + s}
              >
                {t('sample.' + s)}
              </button>
            ))}
          </div>
          {bad.includes('sampleType') && <p className="error" id="q-sample-err" role="alert">{t('err.sampleType')}</p>}
        </div>

        <div className="card quick-grid">
          {fields.map((f, i) => {
            const id = 'q-' + f.name;
            const err = errorFor(f.name);
            return (
              <div key={f.name} className={'qfield' + (err ? ' has-error' : '')}>
                <label htmlFor={id}>
                  <span className="abl">{t('abl.' + f.name)}</span>
                  {f.unit && <span className="unit">{t('unit.' + f.unit)}</span>}
                </label>
                <input
                  id={id}
                  data-qi={i}
                  data-testid={'q-in-' + f.name}
                  inputMode="decimal"
                  enterKeyHint={i === fields.length - 1 ? 'done' : 'next'}
                  autoComplete="off"
                  value={d.values[f.name] ?? ''}
                  onChange={(e) => d.set(f.name, e.target.value)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  aria-invalid={Boolean(err)}
                  aria-describedby={err ? id + '-err' : undefined}
                  aria-required={f.required}
                />
                {err && <span className="error" id={id + '-err'}>{err}</span>}
              </div>
            );
          })}
        </div>
        <p className="muted small">{t('quick.hco3Hint')}</p>
        <div className="actions">
          <button type="submit" className="primary" data-testid="q-run">{t('calc.calculate')}</button>
          <button type="button" onClick={() => { d.reset(); setResult(null); setBad([]); }} data-testid="q-new">{t('quick.new')}</button>
        </div>
      </form>

      {result?.blocked && <p className="flag flag-critical" role="alert">{t('calc.blocked')}</p>}
      {result && !result.blocked && (
        <section className="card conclusion" aria-labelledby="q-res" data-testid="q-result">
          <h3 id="q-res">{t('result.conclusion')}</h3>
          <SummaryText parts={result.summary} />
          <FlagList flags={result.flags} />
          <div className="actions">
            <button className="primary" onClick={onDetails} data-testid="q-details">{t('quick.details')}</button>
            <AddToSeriesButton onAdd={() => { const r = buildInput(d); if (r.input) addSeries(r.input); }} />
          </div>
        </section>
      )}
    </div>
  );
}
