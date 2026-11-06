import { useMemo, useState } from 'react';
import registry from '../../content/approval.json';
import normsJson from '../../content/norms.json';
import { approvalSummary, pathValue, type ApprovalRecord, type RegistryItem } from '../../core/approval';
import { fmt } from '../../i18n';
import { sheetHtml, show } from './approvalSheet';
import { getApprovals, getApprover, saveApprovals, saveApprover } from '../../storage/approval';
import { saveFile } from '../../storage/save';
import { useApp } from '../../store';
import { useT } from '../common/useT';

const ITEMS = registry as RegistryItem[];
const AREAS = [...new Set(ITEMS.map((i) => i.area))];
const today = () => new Date().toISOString().slice(0, 10);


export function useApprovalSummary() {
  return approvalSummary(ITEMS, getApprovals(), normsJson.version);
}

/** Sheet of the norms that need a clinical sign-off: status, current values, source, approval by name and date. */
export function Approval() {
  const { t, lang } = useT();
  const go = useApp((s) => s.go);
  const profileName = useApp((s) => s.profile.fullName);
  const [records, setRecords] = useState(getApprovals);
  const [reviewer, setReviewerState] = useState(() => getApprover() || profileName);
  const [onlyReview, setOnlyReview] = useState(true);
  const [msg, setMsg] = useState('');
  const version = normsJson.version;
  const sum = useMemo(() => approvalSummary(ITEMS, records, version), [records, version]);

  const setReviewer = (v: string) => {
    setReviewerState(v);
    saveApprover(v);
  };
  const commit = (next: Record<string, ApprovalRecord>) => {
    setRecords(next);
    saveApprovals(next);
  };
  const approve = (id: string, on: boolean, note?: string) => {
    if (!on) {
      const { [id]: _drop, ...rest } = records;
      return commit(rest);
    }
    if (!reviewer.trim()) return setMsg(t('appr.reviewer.need'));
    setMsg('');
    commit({ ...records, [id]: { by: reviewer.trim(), date: today(), version, note: note ?? records[id]?.note } });
  };
  const setNote = (id: string, note: string) => {
    if (records[id]) commit({ ...records, [id]: { ...records[id], note } });
  };
  const approveArea = (area: string) => {
    if (!reviewer.trim()) return setMsg(t('appr.reviewer.need'));
    setMsg('');
    const next = { ...records };
    for (const i of ITEMS.filter((x) => x.area === area && x.status !== 'missing')) {
      if (next[i.id]?.version !== version) next[i.id] = { by: reviewer.trim(), date: today(), version };
    }
    commit(next);
  };

  return (
    <div data-testid="approval">
      <h2>{t('appr.title')}</h2>
      <p className="muted">{t('appr.intro')}</p>
      <div className="actions">
        <button type="button" onClick={() => go('settings')}>{t('appr.back')}</button>
        <button
          type="button"
          onClick={async () => setMsg((await saveFile('norms-approval-sheet.html', sheetHtml(records, lang), 'text/html')) === 'saved' ? t('appr.exported') : t('appr.exportFail'))}
          data-testid="appr-export"
        >
          {t('appr.export')}
        </button>
      </div>

      <section className="card" aria-labelledby="appr-sum">
        <h3 id="appr-sum">{t('appr.progress', { a: sum.approved, n: sum.required })}</h3>
        <progress max={sum.required} value={sum.approved} aria-label={t('appr.progress', { a: sum.approved, n: sum.required })} />
        <p data-testid="appr-state" className={'flag ' + (sum.complete ? 'flag-info' : 'flag-warning')} role="status">
          {sum.complete && sum.last ? t('appr.complete', { by: sum.last.by, date: sum.last.date }) : t('appr.pending', { n: sum.pendingIds.length })}
        </p>
        {sum.stale > 0 && <p className="flag flag-warning" role="note">{t('appr.stale', { n: sum.stale })}</p>}
        <div className="field">
          <label htmlFor="appr-name">{t('appr.reviewer')}</label>
          <input id="appr-name" data-testid="appr-name" value={reviewer} onChange={(e) => setReviewer(e.target.value)} autoComplete="name" />
        </div>
        <p className="muted small">{t('appr.version', { v: version })}</p>
        <label className="check">
          <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} data-testid="appr-filter" /> {t('appr.filter')}
        </label>
        {msg && <p className="flag flag-warning" role="alert" data-testid="appr-msg">{msg}</p>}
      </section>

      {AREAS.map((area) => {
        const list = ITEMS.filter((i) => i.area === area && (!onlyReview || i.status !== 'checked'));
        if (!list.length) return null;
        return (
          <section key={area} className="card" aria-labelledby={'appr-' + area}>
            <div className="calc-head">
              <h3 id={'appr-' + area}>{t('appr.area.' + area)}</h3>
              <button type="button" onClick={() => approveArea(area)} data-testid={'appr-area-' + area}>{t('appr.markArea')}</button>
            </div>
            <ul className="appr-list">
              {list.map((i) => {
                const rec = records[i.id]?.version === version ? records[i.id] : undefined;
                return (
                  <li key={i.id} className={'appr-item appr-' + i.status} data-testid={'appr-item-' + i.id}>
                    <div className="appr-head">
                      <span className={'badge appr-badge-' + i.status}>{t('appr.status.' + i.status)}</span>
                      {i.status !== 'missing' && (
                        <label className="check">
                          <input type="checkbox" checked={Boolean(rec)} onChange={(e) => approve(i.id, e.target.checked)} data-testid={'appr-check-' + i.id} /> {t('appr.checked')}
                        </label>
                      )}
                    </div>
                    <p>{t('appr.item.' + i.id)}</p>
                    <ul className="appr-values">
                      {i.paths.map((p) => <li key={p}><code>{p} = {show(pathValue(normsJson, p))}</code></li>)}
                    </ul>
                    {i.source && (
                      <details>
                        <summary>{t('appr.source')}</summary>
                        <p className="small">{(normsJson.sources as Record<string, string>)[i.source]}</p>
                      </details>
                    )}
                    {rec && (
                      <div className="appr-sign">
                        <span className="muted small">{t('appr.by', { by: rec.by, date: rec.date })}</span>
                        <input aria-label={t('appr.note')} placeholder={t('appr.note')} value={rec.note ?? ''} onChange={(e) => setNote(i.id, e.target.value)} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="muted small">{fmt(lang, ITEMS.length, 0)} · {t('appr.footnote')}</p>
    </div>
  );
}
