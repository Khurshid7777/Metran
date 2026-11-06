import registry from '../../content/approval.json';
import normsJson from '../../content/norms.json';
import { approvalSummary, pathValue, type ApprovalRecord, type RegistryItem } from '../../core/approval';
import { translate, type Lang } from '../../i18n';

const ITEMS = registry as RegistryItem[];
export const show = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Printable approval sheet: every item with its current values, status and sign-off, plus a signature line. */
export function sheetHtml(records: Record<string, ApprovalRecord>, lang: Lang): string {
  const t = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);
  const s = approvalSummary(ITEMS, records, normsJson.version);
  const rows = ITEMS.map((i) => {
    const r = records[i.id]?.version === normsJson.version ? records[i.id] : undefined;
    const vals = i.paths.map((p) => `<code>${esc(p)} = ${esc(show(pathValue(normsJson, p)))}</code>`).join('<br>');
    return `<tr><td>${esc(t('appr.area.' + i.area))}</td><td>${esc(t('appr.item.' + i.id))}</td><td>${esc(t('appr.status.' + i.status))}</td><td>${vals}</td><td>${r ? esc(`${r.by}, ${r.date}${r.note ? ' — ' + r.note : ''}`) : '—'}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t('appr.title'))}</title><style>body{font:14px system-ui,sans-serif;margin:16px;color:#15202b}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px;vertical-align:top;text-align:left}code{font-size:12px}.sig{margin-top:32px}</style></head><body><h1>${esc(t('appr.title'))}</h1><p>${esc(t('appr.sheet.version', { v: normsJson.version, a: s.approved, n: s.required }))}</p><table><thead><tr><th>${esc(t('appr.sheet.area'))}</th><th>${esc(t('appr.sheet.item'))}</th><th>${esc(t('appr.sheet.status'))}</th><th>${esc(t('appr.sheet.values'))}</th><th>${esc(t('appr.sheet.sign'))}</th></tr></thead><tbody>${rows}</tbody></table><p class="sig">${esc(t('appr.sheet.signature'))}: ______________________ &nbsp; ${esc(t('appr.sheet.date'))}: ______________</p></body></html>`;
}

