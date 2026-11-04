import { useMemo, useState } from 'react';
import { GENERATOR_SETTINGS, matchesExpected, type Expected } from '../../core/generator';
import { interpret } from '../../core/interpret';
import type { AgeCategory, Chronicity, Disorder, SampleType } from '../../core/types';
import { saveFile } from '../../storage/save';
import { getCustomCases, isBankCase, mergeCases, saveCustomCases } from '../../storage/cases';
import { bankToCase, invalidateBank, type BankCase } from '../common/bank';
import { CaseCard } from '../common/CaseCard';
import { ALL_FIELDS, internalUnit } from '../common/fields';
import { useT } from '../common/useT';
import { buildInput } from '../calculator/buildInput';
import { AGES, SAMPLES, useDraft } from '../calculator/draft';
import { useApp } from '../../store';

const DISORDERS: Disorder[] = ['metabolic_acidosis', 'metabolic_alkalosis', 'respiratory_acidosis', 'respiratory_alkalosis'];
const PRIMARIES = [...DISORDERS, 'mixed_acidosis', 'mixed_alkalosis', 'none'] as const;
const CHRON: Chronicity[] = ['acute', 'chronic', 'acute_on_chronic'];
const LEVELS = [1, 2, 3];
const LANGS = ['ru', 'uz', 'en'] as const;
const PATIENT_FIELDS = new Set(['weightKg', 'ageYears', 'gestationalWeeks']);

interface Form {
  id: string;
  ageCategory: AgeCategory;
  sampleType: SampleType;
  weightKg: string;
  ageYears: string;
  gestationalWeeks: string;
  values: Record<string, string>;
  vignette: Record<(typeof LANGS)[number], string>;
  primary: Expected['primary'];
  chronicity: '' | Chronicity;
  secondary: Disorder[];
  level: number;
  tags: string;
  reviewer: string;
}

const emptyForm = (reviewer: string): Form => ({
  id: '',
  ageCategory: 'adult',
  sampleType: 'arterial',
  weightKg: '',
  ageYears: '',
  gestationalWeeks: '',
  values: {},
  vignette: { ru: '', uz: '', en: '' },
  primary: 'none',
  chronicity: '',
  secondary: [],
  level: 1,
  tags: '',
  reviewer,
});

const num = (s: string): number | undefined => {
  const v = Number(s.trim().replace(',', '.'));
  return s.trim() === '' || Number.isNaN(v) ? undefined : v;
};

function toBankCase(f: Form): BankCase | null {
  const pH = num(f.values.pH ?? '');
  const pCO2 = num(f.values.pCO2 ?? '');
  if (pH === undefined || pCO2 === undefined) return null;
  const values: Record<string, number> = {};
  for (const fld of ALL_FIELDS) {
    if (PATIENT_FIELDS.has(fld.name)) continue;
    const v = num(f.values[fld.name] ?? '');
    if (v !== undefined) values[fld.name] = v;
  }
  const vignette = {
    ru: f.vignette.ru || f.vignette.en || f.vignette.uz,
    uz: f.vignette.uz || f.vignette.ru || f.vignette.en,
    en: f.vignette.en || f.vignette.ru || f.vignette.uz,
  };
  return {
    id: f.id || 'local-draft',
    ageCategory: f.ageCategory,
    weightKg: num(f.weightKg),
    ageYears: num(f.ageYears),
    gestationalWeeks: num(f.gestationalWeeks),
    sampleType: f.sampleType,
    vignette,
    values: { ...values, pH, pCO2 },
    expected: { primary: f.primary, chronicity: f.chronicity || undefined, secondary: f.secondary },
    level: f.level,
    tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean),
    reviewedBy: f.reviewer.trim(),
    reviewedAt: new Date().toISOString().slice(0, 10),
    local: true,
  };
}

function toForm(c: BankCase): Form {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.values)) if (typeof v === 'number') values[k] = String(v);
  return {
    id: c.id,
    ageCategory: c.ageCategory,
    sampleType: c.sampleType,
    weightKg: c.weightKg === undefined ? '' : String(c.weightKg),
    ageYears: c.ageYears === undefined ? '' : String(c.ageYears),
    gestationalWeeks: c.gestationalWeeks === undefined ? '' : String(c.gestationalWeeks),
    values,
    vignette: { ru: c.vignette.ru ?? '', uz: c.vignette.uz ?? '', en: c.vignette.en ?? '' },
    primary: c.expected.primary,
    chronicity: c.expected.chronicity ?? '',
    secondary: c.expected.secondary ?? [],
    level: c.level,
    tags: (c.tags ?? []).join(', '),
    reviewer: c.reviewedBy,
  };
}

export function Editor() {
  const { t, lang } = useT();
  const go = useApp((s) => s.go);
  const profileName = useApp((s) => s.profile.fullName);
  const draft = useDraft();
  const [form, setForm] = useState<Form>(() => emptyForm(profileName));
  const [list, setList] = useState<BankCase[]>(() => getCustomCases());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importText, setImportText] = useState('');

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setVal = (name: string, v: string) => setForm((f) => ({ ...f, values: { ...f.values, [name]: v } }));

  const built = useMemo(() => toBankCase(form), [form]);
  const detected = useMemo(() => {
    if (!built) return null;
    const c = bankToCase(built);
    const r = interpret(c.input, GENERATOR_SETTINGS);
    return { c, r, match: matchesExpected(r, c.expected) };
  }, [built]);

  const fields = ALL_FIELDS.filter((f) => !PATIENT_FIELDS.has(f.name) && (!f.ages || f.ages.includes(form.ageCategory)));

  function fromCalculator() {
    const r = buildInput(draft);
    const input = (r.input ?? {}) as unknown as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const f of ALL_FIELDS) if (!PATIENT_FIELDS.has(f.name) && typeof input[f.name] === 'number') values[f.name] = String(input[f.name]);
    setForm((f) => ({
      ...f,
      ageCategory: draft.ageCategory,
      sampleType: (r.input?.sampleType as SampleType | undefined) ?? f.sampleType,
      weightKg: typeof input.weightKg === 'number' ? String(input.weightKg) : '',
      ageYears: typeof input.ageYears === 'number' ? String(input.ageYears) : '',
      gestationalWeeks: typeof input.gestationalWeeks === 'number' ? String(input.gestationalWeeks) : '',
      values,
    }));
    setMsg(r.input ? { ok: true, text: t('editor.fromCalc.ok') } : { ok: false, text: t('editor.fromCalc.need') });
  }

  function useDetected() {
    if (!detected) return;
    const r = detected.r;
    setForm((f) => ({
      ...f,
      primary: r.primary,
      chronicity: r.chronicity ?? '',
      secondary: r.secondary,
    }));
  }

  function save() {
    if (!built) return setMsg({ ok: false, text: t('editor.err.values') });
    if (!form.vignette.ru && !form.vignette.uz && !form.vignette.en) return setMsg({ ok: false, text: t('editor.err.vignette') });
    if (!form.reviewer.trim()) return setMsg({ ok: false, text: t('editor.err.reviewer') });
    if (!detected || detected.r.blocked) return setMsg({ ok: false, text: t('editor.err.blocked') });
    if (!detected.match) return setMsg({ ok: false, text: t('editor.err.mismatch') });
    const id = form.id || 'local-' + Date.now().toString(36);
    const next = list.some((c) => c.id === id) ? list.map((c) => (c.id === id ? { ...built, id } : c)) : [...list, { ...built, id }];
    if (!saveCustomCases(next)) return setMsg({ ok: false, text: t('editor.err.storage') });
    invalidateBank();
    setList(next);
    setForm(emptyForm(form.reviewer));
    setMsg({ ok: true, text: t('editor.saved', { id }) });
  }

  function remove(id: string) {
    const next = list.filter((c) => c.id !== id);
    saveCustomCases(next);
    invalidateBank();
    setList(next);
    if (form.id === id) setForm(emptyForm(form.reviewer));
  }

  async function exportAll() {
    const r = await saveFile('abg-cases.json', JSON.stringify(list, null, 2), 'application/json');
    setMsg({ ok: r === 'saved', text: r === 'saved' ? t('editor.exported') : t('editor.err.export') });
  }

  function importCases() {
    try {
      const parsed = JSON.parse(importText);
      const arr: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      const good = arr.filter(isBankCase).map((c) => ({ ...c, local: true, demo: false }));
      if (!good.length) return setMsg({ ok: false, text: t('editor.err.import') });
      const merged = mergeCases(list, good);
      saveCustomCases(merged.list);
      invalidateBank();
      setList(merged.list);
      setImportText('');
      setMsg({ ok: true, text: t('editor.imported', { n: good.length, added: merged.added, skipped: arr.length - good.length }) });
    } catch {
      setMsg({ ok: false, text: t('editor.err.import') });
    }
  }

  return (
    <div className="editor">
      <h2>{t('editor.title')}</h2>
      <p className="disclaimer" role="note">{t('editor.privacy')}</p>
      <div className="actions">
        <button type="button" onClick={() => go('settings')}>{t('editor.back')}</button>
        <button type="button" onClick={fromCalculator} data-testid="ed-from-calc">{t('editor.fromCalc')}</button>
        <button type="button" onClick={() => setForm(emptyForm(form.reviewer))}>{t('editor.new')}</button>
      </div>

      <section className="card">
        <h3>{t('editor.patient')}</h3>
        <div className="grid">
          <div className="field">
            <label htmlFor="ed-age">{t('field.ageCategory')}</label>
            <select id="ed-age" value={form.ageCategory} onChange={(e) => set('ageCategory', e.target.value as AgeCategory)} data-testid="ed-age">
              {AGES.map((a) => <option key={a} value={a}>{t('age.' + a)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ed-sample">{t('field.sampleType')}</label>
            <select id="ed-sample" value={form.sampleType} onChange={(e) => set('sampleType', e.target.value as SampleType)} data-testid="ed-sample">
              {SAMPLES.map((s) => <option key={s} value={s}>{t('sample.' + s)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ed-w">{t('field.weightKg')}</label>
            <input id="ed-w" inputMode="decimal" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
          </div>
          {(form.ageCategory === 'child' || form.ageCategory === 'adult') && (
            <div className="field">
              <label htmlFor="ed-y">{t('field.ageYears')}</label>
              <input id="ed-y" inputMode="decimal" value={form.ageYears} onChange={(e) => set('ageYears', e.target.value)} />
            </div>
          )}
          {form.ageCategory === 'preterm' && (
            <div className="field">
              <label htmlFor="ed-ga">{t('field.gestationalWeeks')}</label>
              <input id="ed-ga" inputMode="decimal" value={form.gestationalWeeks} onChange={(e) => set('gestationalWeeks', e.target.value)} />
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h3>{t('editor.values')}</h3>
        <p className="muted small">{t('editor.values.hint')}</p>
        <div className="quick-grid">
          {fields.map((f) => {
            const u = internalUnit(f);
            return (
              <div key={f.name} className="qfield">
                <label htmlFor={'ed-' + f.name}>
                  <span className="abl">{t('field.' + f.name)}</span>
                  {u && <span className="unit">{t('unit.' + u)}</span>}
                </label>
                <input
                  id={'ed-' + f.name}
                  data-testid={'ed-in-' + f.name}
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.values[f.name] ?? ''}
                  onChange={(e) => setVal(f.name, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3>{t('editor.vignette')}</h3>
        <p className="muted small">{t('editor.vignette.hint')}</p>
        {LANGS.map((l) => (
          <div className="field" key={l}>
            <label htmlFor={'ed-v-' + l}>{t('editor.vignette.' + l)}</label>
            <textarea
              id={'ed-v-' + l}
              data-testid={'ed-vignette-' + l}
              rows={2}
              value={form.vignette[l]}
              onChange={(e) => setForm((f) => ({ ...f, vignette: { ...f.vignette, [l]: e.target.value } }))}
            />
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="ed-exp-h">
        <h3 id="ed-exp-h">{t('editor.expected')}</h3>
        <p className="muted small">{t('editor.expected.hint')}</p>
        <div className="grid">
          <div className="field">
            <label htmlFor="ed-primary">{t('editor.primary')}</label>
            <select id="ed-primary" value={form.primary} onChange={(e) => set('primary', e.target.value as Expected['primary'])} data-testid="ed-primary">
              {PRIMARIES.map((p) => <option key={p} value={p}>{t('disorder.' + p)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ed-chron">{t('editor.chronicity')}</label>
            <select id="ed-chron" value={form.chronicity} onChange={(e) => set('chronicity', e.target.value as '' | Chronicity)}>
              <option value="">{t('editor.chronicity.none')}</option>
              {CHRON.map((c) => <option key={c} value={c}>{t('chronicity.' + c)}</option>)}
            </select>
          </div>
        </div>
        <fieldset>
          <legend>{t('editor.secondary')}</legend>
          {DISORDERS.map((d) => (
            <label key={d} className="check">
              <input
                type="checkbox"
                checked={form.secondary.includes(d)}
                onChange={(e) => set('secondary', e.target.checked ? [...form.secondary, d] : form.secondary.filter((x) => x !== d))}
              />
              {t('disorder.' + d)}
            </label>
          ))}
        </fieldset>
        <div className="actions">
          <button type="button" onClick={useDetected} disabled={!detected} data-testid="ed-use-detected">{t('editor.useDetected')}</button>
        </div>
        {detected && (
          <p className={'flag ' + (detected.match ? 'flag-info' : 'flag-warning')} role="status" data-testid="ed-match">
            {detected.r.blocked
              ? t('editor.err.blocked')
              : detected.match
                ? t('editor.match')
                : t('editor.noMatch', {
                    got: [t('disorder.' + detected.r.primary), ...detected.r.secondary.map((d) => '+ ' + t('disorder.' + d))].join(' '),
                  })}
          </p>
        )}
      </section>

      <section className="card">
        <h3>{t('editor.meta')}</h3>
        <div className="grid">
          <div className="field">
            <label htmlFor="ed-level">{t('level.choose')}</label>
            <select id="ed-level" value={form.level} onChange={(e) => set('level', Number(e.target.value))}>
              {LEVELS.map((l) => <option key={l} value={l}>{t('level.' + l)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ed-tags">{t('editor.tags')}</label>
            <input id="ed-tags" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ed-reviewer">{t('editor.reviewer')}</label>
            <input id="ed-reviewer" data-testid="ed-reviewer" value={form.reviewer} onChange={(e) => set('reviewer', e.target.value)} autoComplete="name" />
          </div>
        </div>
      </section>

      {detected && !detected.r.blocked && <CaseCard c={detected.c} />}

      <div className="actions">
        <button type="button" className="primary" onClick={save} data-testid="ed-save">{t('editor.save')}</button>
      </div>
      {msg && <p role="status" className={'flag ' + (msg.ok ? 'flag-info' : 'flag-warning')} data-testid="ed-msg">{msg.text}</p>}

      <section className="card" data-testid="ed-list">
        <h3>{t('editor.list', { n: list.length })}</h3>
        {list.length === 0 && <p className="muted">{t('editor.list.empty')}</p>}
        <ul className="ed-list">
          {list.map((c) => (
            <li key={c.id}>
              <code>{c.id}</code> · {t('age.' + c.ageCategory)} · {t('disorder.' + c.expected.primary)} · {t('level.' + c.level)} · {c.vignette[lang].slice(0, 60)}
              <span className="actions">
                <button type="button" onClick={() => setForm(toForm(c))}>{t('editor.edit')}</button>
                <button type="button" onClick={() => remove(c.id)}>{t('editor.delete')}</button>
              </span>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" onClick={exportAll} disabled={!list.length} data-testid="ed-export">{t('editor.export')}</button>
        </div>
        <p className="muted small">{t('editor.export.hint')}</p>
        <div className="field">
          <label htmlFor="ed-import">{t('editor.import')}</label>
          <textarea id="ed-import" rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} data-testid="ed-import" spellCheck={false} />
        </div>
        <div className="actions">
          <button type="button" onClick={importCases} disabled={!importText.trim()} data-testid="ed-import-run">{t('editor.import.run')}</button>
        </div>
      </section>
    </div>
  );
}
