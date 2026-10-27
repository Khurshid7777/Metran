import { useState } from 'react';
import { findCertificate, type ExamRecord } from '../../storage/records';
import { useT } from '../common/useT';

export function Verify() {
  const { t, n } = useT();
  const [code, setCode] = useState('');
  const [found, setFound] = useState<ExamRecord | null | undefined>(undefined);
  return (
    <div>
      <h2>{t('verify.title')}</h2>
      <p className="muted">{t('verify.intro')}</p>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          setFound(findCertificate(code) ?? null);
        }}
      >
        <div className="field">
          <label htmlFor="v-code">{t('cert.code')}</label>
          <input id="v-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABG-XXXX-XXXX-XXX" data-testid="verify-code" />
        </div>
        <button className="primary" type="submit" data-testid="verify-btn">{t('verify.check')}</button>
      </form>
      {found === null && <p className="flag flag-critical" role="alert">{t('verify.notFound')}</p>}
      {found && (
        <section className="card pass" role="status" data-testid="verify-ok">
          <p><strong>{t('verify.valid')}</strong></p>
          <p>{found.fullName} · {t('level.' + found.level)} · {n(found.percent, 1)}% · {found.date.slice(0, 10)}</p>
        </section>
      )}
    </div>
  );
}
