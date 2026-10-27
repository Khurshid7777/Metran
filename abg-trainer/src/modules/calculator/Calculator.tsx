import { useMemo, useState } from 'react';
import { interpret } from '../../core/interpret';
import { normalizeFiO2, parseLocaleNumber, toInternal, type UnitId } from '../../core/units';
import type { AbgInput, AgeCategory, InterpretationResult, SampleType } from '../../core/types';
import { coreSettings, useApp } from '../../store';
import { FIELD_GROUPS, type FieldDef } from '../common/fields';
import { ResultView } from '../common/ResultView';
import { useT } from '../common/useT';

const SAMPLES: SampleType[] = ['arterial', 'venous', 'capillary', 'cord_artery', 'cord_vein'];
const AGES: AgeCategory[] = ['preterm', 'term_neonate', 'child', 'adult'];

type Units = { gas: UnitId; albumin: UnitId; glucose: UnitId; urea: UnitId };
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

export function Calculator() {
  const { t } = useT();
  const settings = useApp((s) => s.settings);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sampleType, setSample] = useState<SampleType>('arterial');
  const [ageCategory, setAge] = useState<AgeCategory>('adult');
  const [bpd, setBpd] = useState(false);
  const [ventMode, setVentMode] = useState<'none' | 'conventional' | 'hfo'>('none');
  const [units, setUnits] = useState<Units>({ gas: 'mmHg', albumin: 'g/L', glucose: 'mmol/L', urea: 'mmol/L' });
  const [result, setResult] = useState<InterpretationResult | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const set = (name: string, v: string) => setValues((s) => ({ ...s, [name]: v }));

  const visibleGroups = useMemo(
    () =>
      FIELD_GROUPS.map((g) => ({
        ...g,
        fields: g.fields.filter((f) => {
          if (f.name === 'gestationalWeeks') return ageCategory === 'preterm';
          if (f.name === 'ageYears') return ageCategory === 'child' || ageCategory === 'adult';
          return true;
        }),
      })),
    [ageCategory],
  );

  function unitOf(f: FieldDef): UnitId | undefined {
    if (!f.unitGroup || f.unitGroup === 'fio2') return undefined;
    return units[f.unitGroup];
  }

  function calculate(e?: React.FormEvent) {
    e?.preventDefault();
    const input: Record<string, unknown> = { sampleType, ageCategory };
    const bad: string[] = [];
    for (const f of FIELD_GROUPS.flatMap((g) => g.fields)) {
      const raw = values[f.name];
      if (raw === undefined || raw.trim() === '') continue;
      const v = parseLocaleNumber(raw);
      if (Number.isNaN(v)) {
        bad.push(f.name);
        continue;
      }
      if (f.unitGroup === 'fio2') input[f.name] = normalizeFiO2(v);
      else {
        const u = unitOf(f);
        input[f.name] = u ? toInternal(v, u, f.unitGroup === 'urea' ? 'urea' : 'glucose') : v;
      }
    }
    if (values.cordPair?.trim()) {
      const v = parseLocaleNumber(values.cordPair);
      if (Number.isNaN(v)) bad.push('cordPair');
      else input.cordPair = { pH: v };
    }
    if (bpd && ageCategory === 'preterm') input.bpd = true;
    if (ventMode !== 'none') {
      const rate = parseLocaleNumber(values.ventRate ?? '');
      input.ventilation = { mode: ventMode, rate: Number.isNaN(rate) ? undefined : rate };
    }
    setParseErrors(bad);
    if (bad.length || input.pH === undefined || input.pCO2 === undefined) {
      setResult(null);
      if (input.pH === undefined) bad.push('pH');
      if (input.pCO2 === undefined) bad.push('pCO2');
      setParseErrors([...bad]);
      return;
    }
    setResult(interpret(input as unknown as AbgInput, coreSettings(settings)));
  }

  const rangeErrors = result?.inputErrors ?? [];
  const errorFor = (name: string) => {
    if (parseErrors.includes(name)) return t('err.not_a_number');
    const e = rangeErrors.find((x) => x.field === name);
    if (!e) return undefined;
    return e.code === 'out_of_range' ? t('err.out_of_range', { lo: e.range![0], hi: e.range![1] }) : t('err.' + e.code);
  };

  return (
    <div className="calculator">
      <h2>{t('calc.title')}</h2>
      <p className="muted">{t('calc.intro')}</p>
      <form onSubmit={calculate} noValidate aria-label={t('calc.title')}>
        <fieldset className="card">
          <legend>{t('calc.context')}</legend>
          <div className="grid">
            <label>
              {t('field.sampleType')} *
              <select value={sampleType} onChange={(e) => setSample(e.target.value as SampleType)} data-testid="sampleType">
                {SAMPLES.map((s) => <option key={s} value={s}>{t('sample.' + s)}</option>)}
              </select>
            </label>
            <label>
              {t('field.ageCategory')} *
              <select value={ageCategory} onChange={(e) => setAge(e.target.value as AgeCategory)} data-testid="ageCategory">
                {AGES.map((a) => <option key={a} value={a}>{t('age.' + a)}</option>)}
              </select>
            </label>
            {ageCategory === 'preterm' && (
              <label className="check">
                <input type="checkbox" checked={bpd} onChange={(e) => setBpd(e.target.checked)} /> {t('field.bpd')}
              </label>
            )}
            {(sampleType === 'cord_artery' || sampleType === 'cord_vein') && (
              <label>
                {t(sampleType === 'cord_artery' ? 'field.cordPairVein' : 'field.cordPairArtery')}
                <input inputMode="decimal" value={values.cordPair ?? ''} onChange={(e) => set('cordPair', e.target.value)} aria-invalid={parseErrors.includes('cordPair')} />
              </label>
            )}
          </div>
          <div className="grid units">
            {(Object.keys(UNIT_CHOICES) as (keyof Units)[]).map((g) => (
              <label key={g}>
                {t('units.' + g)}
                <select value={units[g]} onChange={(e) => setUnits((u) => ({ ...u, [g]: e.target.value as UnitId }))}>
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
                const u = unitOf(f);
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
                      onChange={(e) => set(f.name, e.target.value)}
                      aria-invalid={Boolean(err)}
                      aria-describedby={err ? id + '-err' : undefined}
                    />
                    {err && <span className="error" id={id + '-err'} role="alert">{err}</span>}
                  </div>
                );
              })}
              {g.id === 'oxygenation' && (
                <>
                  <label>
                    {t('field.ventMode')}
                    <select value={ventMode} onChange={(e) => setVentMode(e.target.value as typeof ventMode)}>
                      {(['none', 'conventional', 'hfo'] as const).map((m) => <option key={m} value={m}>{t('vent.' + m)}</option>)}
                    </select>
                  </label>
                  {ventMode === 'conventional' && (
                    <label>
                      {t('field.ventRate')}
                      <input inputMode="decimal" value={values.ventRate ?? ''} onChange={(e) => set('ventRate', e.target.value)} />
                    </label>
                  )}
                </>
              )}
            </div>
          </fieldset>
        ))}
        <div className="actions">
          <button type="submit" className="primary" data-testid="calculate">{t('calc.calculate')}</button>
          <button type="button" onClick={() => { setValues(EXAMPLE); setSample('arterial'); setAge('adult'); }}>{t('calc.example')}</button>
          <button type="button" onClick={() => { setValues({}); setResult(null); setParseErrors([]); }}>{t('calc.reset')}</button>
        </div>
      </form>
      {result?.blocked && (
        <p className="flag flag-critical" role="alert">{t('calc.blocked')}</p>
      )}
      {parseErrors.length > 0 && <p className="flag flag-critical" role="alert">{t('calc.fixErrors')}</p>}
      {result && !result.blocked && <ResultView result={result} />}
    </div>
  );
}
