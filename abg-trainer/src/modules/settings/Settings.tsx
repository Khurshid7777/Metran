import { useState } from 'react';
import { parseLocaleNumber } from '../../core/units';
import i18nUz from '../../content/i18n/uz.json';
import normsJson from '../../content/norms.json';
import { LANGS, type Lang } from '../../i18n';
import type { Specialty } from '../../storage/records';
import { DEFAULT_APP_SETTINGS, useApp, type AppSettings } from '../../store';
import { bank } from '../common/bank';
import { useT } from '../common/useT';

const SPECIALTIES: Specialty[] = ['neonatologist', 'pediatrician', 'anesthesiologist', 'nurse', 'student', 'resident'];

function NumberSetting({ k, label, step }: { k: keyof AppSettings; label: string; step?: string }) {
  const { settings, updateSettings } = useApp();
  const [raw, setRaw] = useState(settings[k] === null ? '' : String(settings[k]));
  const id = 'set-' + k;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={raw}
        data-step={step}
        onChange={(e) => {
          setRaw(e.target.value);
          const v = parseLocaleNumber(e.target.value);
          if (e.target.value.trim() === '' && (k === 'agNormLow' || k === 'agNormHigh')) updateSettings({ [k]: null });
          else if (!Number.isNaN(v)) updateSettings({ [k]: v });
        }}
        data-testid={id}
      />
    </div>
  );
}

export function Settings() {
  const { t } = useT();
  const { settings, updateSettings, profile, updateProfile, lang, setLang, go } = useApp();
  const review = bank().review;

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateSettings({ logoDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <h2>{t('settings.title')}</h2>

      <section className="card">
        <h3>{t('profile.title')}</h3>
        <p className="muted">{t('profile.intro')}</p>
        <div className="grid">
          <div className="field">
            <label htmlFor="p-name">{t('profile.fullName')}</label>
            <input id="p-name" data-testid="profile-name" value={profile.fullName} onChange={(e) => updateProfile({ fullName: e.target.value })} autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="p-spec">{t('profile.specialty')}</label>
            <select id="p-spec" value={profile.specialty} onChange={(e) => updateProfile({ specialty: e.target.value as Specialty })}>
              <option value="">—</option>
              {SPECIALTIES.map((s) => <option key={s} value={s}>{t('specialty.' + s)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-inst">{t('profile.institution')}</label>
            <input id="p-inst" value={profile.institution} onChange={(e) => updateProfile({ institution: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p-lang">{t('app.language')}</label>
            <select id="p-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              {LANGS.map((l) => <option key={l} value={l}>{t('lang.' + l)}</option>)}
            </select>
          </div>
        </div>
        {lang === 'uz' && (i18nUz as { reviewed?: boolean }).reviewed === false && <p className="muted small">{t('settings.uzNotReviewed')}</p>}
      </section>

      <section className="card">
        <h3>{t('settings.interpretation')}</h3>
        <label className="check">
          <input type="checkbox" checked={settings.advanced} onChange={(e) => updateSettings({ advanced: e.target.checked })} data-testid="set-advanced" /> {t('settings.advanced')}
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.agWithK} onChange={(e) => updateSettings({ agWithK: e.target.checked })} /> {t('settings.agWithK')}
        </label>
        <div className="grid">
          <NumberSetting k="agNormLow" label={t('settings.agNormLow')} />
          <NumberSetting k="agNormHigh" label={t('settings.agNormHigh')} />
          <NumberSetting k="bicarbFactor" label={t('settings.bicarbFactor')} />
          <NumberSetting k="patm" label={t('settings.patm')} />
        </div>
        <p className="muted small">{t('settings.normsVersion', { v: normsJson.version, by: normsJson.approvedBy || t('settings.notApproved') })}</p>
      </section>

      <section className="card">
        <h3>{t('settings.exam')}</h3>
        <div className="grid">
          <NumberSetting k="examCases" label={t('settings.examCases')} />
          <NumberSetting k="examMinutes" label={t('settings.examMinutes')} />
          <NumberSetting k="passPercent" label={t('settings.passPercent')} />
        </div>
      </section>

      <section className="card">
        <h3>{t('settings.certificate')}</h3>
        <div className="grid">
          <div className="field">
            <label htmlFor="s-center">{t('settings.centerName')}</label>
            <input id="s-center" value={settings.centerName} onChange={(e) => updateSettings({ centerName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s-sign">{t('settings.signatory')}</label>
            <input id="s-sign" value={settings.signatory} onChange={(e) => updateSettings({ signatory: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s-logo">{t('settings.logo')}</label>
            <input id="s-logo" type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onLogo} />
            {settings.logoDataUrl && <img src={settings.logoDataUrl} alt={t('settings.logoPreview')} className="logo-preview" />}
          </div>
        </div>
        <div className="actions">
          <button onClick={() => go('verify')}>{t('nav.verify')}</button>
          <button onClick={() => updateSettings(DEFAULT_APP_SETTINGS)}>{t('settings.reset')}</button>
        </div>
      </section>

      <section className="card">
        <h3>{t('bank.title')}</h3>
        <p>{t('bank.summary', { ok: bank().accepted.length, bad: review.length })}</p>
        {review.length > 0 && (
          <ul className="flags">
            {review.map((r) => (
              <li key={r.id} className="flag flag-warning">
                <code>{r.id}</code>: {t('bank.expected')} {t('disorder.' + r.expected.primary)} {r.expected.secondary.map((d) => '+ ' + t('disorder.' + d)).join(' ')} · {t('bank.got')}{' '}
                {t('disorder.' + r.got.primary)} {r.got.secondary.map((d) => '+ ' + t('disorder.' + d)).join(' ')}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
