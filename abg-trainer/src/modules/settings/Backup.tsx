import { useState } from 'react';
import { exportAll, importAll } from '../../storage';
import { saveFile } from '../../storage/save';
import { useT } from '../common/useT';

const FORMAT = 'abg-trainer-backup';

/** One file with all data kept in this browser: progress, exams, cases, dynamics, approvals, settings. */
export function Backup() {
  const { t } = useT();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Parsed backup waiting for confirmation (no window.confirm: blocked inside sandboxed pages)
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);

  async function download() {
    const data = exportAll();
    const d = new Date().toISOString().slice(0, 10);
    const r = await saveFile(`abg-trainer-backup-${d}.json`, JSON.stringify({ format: FORMAT, created: new Date().toISOString(), data }, null, 2), 'application/json');
    setMsg({ ok: r === 'saved', text: r === 'saved' ? t('backup.saved', { n: Object.keys(data).length }) : t('backup.fail') });
  }

  function restore(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed?.format !== FORMAT || typeof parsed.data !== 'object') throw new Error('format');
        setMsg(null);
        setPending(parsed.data);
      } catch {
        setMsg({ ok: false, text: t('backup.bad') });
      }
    };
    reader.readAsText(file);
  }

  return (
    <section className="card" aria-labelledby="backup-h" data-testid="backup">
      <h3 id="backup-h">{t('backup.title')}</h3>
      <p className="muted">{t('backup.intro')}</p>
      <div className="actions">
        <button type="button" className="primary" onClick={download} data-testid="backup-save">{t('backup.save')}</button>
        <label className="button-like">
          {t('backup.load')}
          <input type="file" accept="application/json,.json" className="sr-only" data-testid="backup-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
        </label>
      </div>
      {pending && (
        <div className="flag flag-warning" role="alertdialog" aria-label={t('backup.load')} data-testid="backup-confirm">
          <p>{t('backup.confirm')} ({t('backup.count', { n: Object.keys(pending).length })})</p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              data-testid="backup-apply"
              onClick={() => {
                const n = importAll(pending);
                setPending(null);
                setMsg({ ok: true, text: t('backup.restored', { n }) });
                setTimeout(() => window.location.reload(), 800);
              }}
            >
              {t('backup.apply')}
            </button>
            <button type="button" onClick={() => setPending(null)}>{t('backup.cancel')}</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className={'flag ' + (msg.ok ? 'flag-info' : 'flag-warning')} data-testid="backup-msg">{msg.text}</p>}
    </section>
  );
}
