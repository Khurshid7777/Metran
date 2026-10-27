import { useMemo, useState } from 'react';
import { interpret } from '../../core/interpret';
import type { UnitId } from '../../core/units';
import type { AgeCategory, InterpretationResult, SampleType } from '../../core/types';
import { coreSettings, useApp } from '../../store';
import { load, save } from '../../storage';
import { FIELD_GROUPS } from '../common/fields';
import { ResultView } from '../common/ResultView';
import { useT } from '../common/useT';
import { buildInput, unitOf } from './buildInput';
import { AGES, SAMPLES, useDraft, type Units } from './draft';
import { QuickEntry } from './QuickEntry';


const UNIT_CHOICES: Record<keyof Units, UnitId[]> = {
  gas: ['mmHg', 'kPa'],
  albumin: ['g/L', 'g/dL'],
  glucose: ['mmol/L', 'mg/dL'],
  urea: ['mmol/L', 'mg/dL_BUN'],
};

const EXAMPLE: Record<string, string> = { pH: '7.33', pCO2: '35', HCO3: '18', Na: '140', Cl: '110', albumin: '20', lactate: '3.1', BE: '-7' };

function unitKey(u: UnitId): string {
  return 'unit.' + u.replace(/[^a-zA-Z0-9]/g, '_');
}

type Mode = 'quick' | 'full';

export function Calculator() {
  const { t } = useT();
  const [mode, setModeState] = useState<Mode>(() => load<Mode>('calcMode', 'quick'));
  const setMode = (m: Mode) => {
    save('calcMode', m);
    setModeState(m);
  };
  return (
    <div className="calculator">
      <div className="calc-head">
        <h2>{t('calc.title')}</h2>
        <div className="segmented" role="tablist" aria-label={t('calc.mode')}>
          {(['quick', 'full'] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)} data-testid={'calc-mode-' + m}>
              {t('calc.mode.' + m)}
            </button>
          ))}
        </div>
      </div>
      {mode === 'quick' ? <QuickEntry onDetails={() => setMode('full')} /> : <FullForm />}
    </div>
  );
}

function FullForm() {
  const { t } = useT();
  const settings = useApp((s) => s.settings);
  const d = useDraft();
  const { values, sampleType, ageCategory, bpd, ventMode, units } = d;
  // Opened from the quick form: show the full analysis of the same values right away
  const [result, setResult] = useState<InterpretationResult | null>(() => {
    const r = buildInput(d);
    return r.input ? interpret(r.input, coreSettings(settings)) : null;
  });
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const visibleGroups = useMemo(
    () =>
      FIELD_GROUPS.map((g) => ({
        ...g,
        fields: g.fields.filter((f) => {
          if (f.ages && !f.ages.includes(ageCategory)) return false;
          if (f.name === 'gestationalWeeks') return ageCategory === 'preterm';
          if (f.name === 'ageYears') return ageCategory === 'child' || ageCategory === 'adult';
          return true;
        }),
      })).filter((g) => g.fields.length > 0),
    [ageCategory],
  );

  function calculate(e?: React.FormEvent) {
    e?.preventDefault();
    const { input, bad } = buildInput(d);
    setParseErrors(bad);
    setResult(input ? interpret(input, coreSettings(settings)) : null);
  }

  const rangeErrors = result?.inputErrors ?? [];
  const errorFor = (name: string) => {
    if (parseErrors.includes(name)) return t(name === 'pH' || name === 'pCO2' ? 'err.required' : 'err.not_a_number');
    const e = rangeErrors.find((x) => x.field === name);
    if (!e) return undefined;
    return e.code === 'out_of_range' ? t('err.out_of_range', { lo: e.range![0], hi: e.range![1] }) : t('err.' + e.code);
  };

  return (
    <>
      <p className="muted">{t('calc.intro')}</p>
      <form onSubmit={calculate} noValidate aria-label={t('calc.title')}>
        <fieldset className="card">
          <legend>{t('calc.context')}</legend>
          <div className="grid">
            <label>
              {t('field.sampleType')} *
              <select
                value={sampleType ?? ''}
                onChange={(e) => d.setSample(e.target.value as SampleType)}
                data-testid="sampleType"
                aria-invalid={parseErrors.includes('sampleType')}
              >
                <option value="" disabled>{t('calc.choose')}</option>
                {SAMPLES.map((s) => <option key={s} value={s}>{t('sample.' + s)}</option>)}
              </select>
              {parseErrors.includes('sampleType') && <span className="error" role="alert">{t('err.sampleType')}</span>}
            </label>
            <label>
              {t('field.ageCategory')} *
              <select value={ageCategory} onChange={(e) => d.setAge(e.target.value as AgeCategory)} data-testid="ageCategory">
                {AGES.map((a) => <option key={a} value={a}>{t('age.' + a)}</option>)}
              </select>
            </label>
            {ageCategory === 'preterm' && (
              <label className="check">
                <input type="checkbox" checked={bpd} onChange={(e) => d.setBpd(e.target.checked)} /> {t('field.bpd')}
              </label>
            )}
            {(sampleType === 'cord_artery' || sampleType === 'cord_vein') && (
              <label>
                {t(sampleType === 'cord_artery' ? 'field.cordPairVein' : 'field.cordPairArtery')}
                <input inputMode="decimal" value={values.cordPair ?? ''} onChange={(e) => d.set('cordPair', e.target.value)} aria-invalid={parseErrors.includes('cordPair')} />
              </label>
            )}
          </div>
          <div className="grid units">
            {(Object.keys(UNIT_CHOICES) as (keyof Units)[]).map((g) => (
              <label key={g}>
                {t('units.' + g)}
                <select value={units[g]} onChange={(e) => d.setUnits({ ...units, [g]: e.target.value as UnitId })}>
                  {UNIT_CHOICES[g].map((u) => <option key={u} value={u}>{t(unitKey(u))}</option>)}
                </select>
              </label>
            ))}
          </div>
        </fieldset>

        {visibleGroups.map((g) => (
          <fieldset key={g.id} className="card">
            <legend>{t('group.' + g.id)}</legend>
            <div className="grid">
              {g.fields.map((f) => {
                const err = errorFor(f.name);
                const u = unitOf(f, units);
                const unitLabel = f.unitGroup === 'fio2' ? t('unit.fio2') : u ? t(unitKey(u)) : f.unit ? t('unit.' + f.unit) : '';
                const id = 'f-' + f.name;
                return (
                  <div key={f.name} className={'field' + (err ? ' has-error' : '')}>
                    <label htmlFor={id}>
                      {t('field.' + f.name)}
                      {(f.name === 'pH' || f.name === 'pCO2') && ' *'}
                      {unitLabel && <span className="unit">, {unitLabel}</span>}
                    </label>
                    <input
                      id={id}
                      data-testid={'in-' + f.name}
                      inputMode="decimal"
                      autoComplete="off"
                      value={values[f.name] ?? ''}
                      onChange={(e) => d.set(f.name, e.target.value)}
                      aria-invalid={Boolean(err)}
                      aria-describedby={err ? id + '-err' : undefined}
                    />
                    {err && <span className="error" id={id + '-err'} role="alert">{err}</span>}
                  </div>
                );
              })}
              {g.id === 'neonatal' && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={values.biliRisk === '1'}
                    onChange={(e) => d.set('biliRisk', e.target.checked ? '1' : '')}
                    data-testid="in-biliRisk"
                  />{' '}
                  {t('field.biliRisk')}
                </label>
              )}
              {g.id === 'oxygenation' && (
                <>
                  <label>
                    {t('field.ventMode')}
                    <select value={ventMode} onChange={(e) => d.setVentMode(e.target.value as typeof ventMode)}>
                      {(['none', 'conventional', 'hfo'] as const).map((m) => <option key={m} value={m}>{t('vent.' + m)}</option>)}
                    </select>
                  </label>
                  {ventMode === 'conventional' && (
                    <label>
                      {t('field.ventRate')}
                      <input inputMode="decimal" value={values.ventRate ?? ''} onChange={(e) => d.set('ventRate', e.target.value)} />
                    </label>
                  )}
                </>
              )}
            </div>
          </fieldset>
        ))}
        <div className="actions">
          <button type="submit" className="primary" data-testid="calculate">{t('calc.calculate')}</button>
          <button type="button" onClick={() => { d.setValues(EXAMPLE); d.setSample('arterial'); d.setAge('adult'); }}>{t('calc.example')}</button>
          <button type="button" onClick={() => { d.reset(); setResult(null); setParseErrors([]); }}>{t('calc.reset')}</button>
        </div>
      </form>
      {result?.blocked && <p className="flag flag-critical" role="alert">{t('calc.blocked')}</p>}
      {parseErrors.length > 0 && <p className="flag flag-critical" role="alert">{t('calc.fixErrors')}</p>}
      {result && !result.blocked && <ResultView result={result} />}
    </>
  );
}
