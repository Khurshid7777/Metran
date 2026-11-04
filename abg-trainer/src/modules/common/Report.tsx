import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fmt, translate } from '../../i18n';
import type { AbgInput, InterpretationResult } from '../../core/types';
import { saveFile } from '../../storage/save';
import { useApp } from '../../store';
import { ALL_FIELDS, internalUnit } from './fields';
import { ResultView } from './ResultView';
import { useT } from './useT';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pageCss(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) css += rule.cssText + '\n';
    } catch {
      /* cross-origin sheet: skipped */
    }
  }
  return css;
}

const REPORT_CSS = `
html[data-theme='light'] body { background: #fff; max-width: 900px; margin: 0 auto; padding: 16px; }
.report-head { border-bottom: 2px solid #0b5c73; margin-bottom: 12px; }
.report-head h1 { margin: 0 0 4px; font-size: 1.4rem; }
.report-meta { color: #4d5b66; font-size: 0.9rem; margin: 0 0 8px; }
.report-inputs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px 16px; margin: 0; }
.report-inputs div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted #d3dbe0; }
.report-inputs dt { color: #4d5b66; } .report-inputs dd { margin: 0; font-weight: 600; }
.report-foot { margin-top: 16px; color: #4d5b66; font-size: 0.85rem; }
.actions, button, .tabs { display: none !important; }
.card { break-inside: avoid; }
@media print { body { padding: 0; } }
`;

/** Self-contained one-document report: the entered values, the conclusion, all charts, calculations and sources. */
export function buildReportHtml(result: InterpretationResult, input: AbgInput, when = new Date()): string {
  const { lang } = useApp.getState();
  const t = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);
  const n = (v: number, d = 1) => fmt(lang, v, d);
  const rows = ALL_FIELDS.flatMap((f) => {
    const v = input[f.name];
    if (typeof v !== 'number') return [];
    const u = internalUnit(f);
    const digits = f.name === 'pH' ? 3 : f.digits;
    return [`<div><dt>${esc(t('field.' + f.name))}</dt><dd>${esc(n(f.unitGroup === 'fio2' ? v * 100 : v, digits))}${f.unitGroup === 'fio2' ? ' %' : u ? ' ' + esc(t('unit.' + u)) : ''}</dd></div>`];
  });
  rows.unshift(
    `<div><dt>${esc(t('field.sampleType'))}</dt><dd>${esc(t('sample.' + input.sampleType))}</dd></div>`,
    `<div><dt>${esc(t('field.ageCategory'))}</dt><dd>${esc(t('age.' + input.ageCategory))}</dd></div>`,
  );
  const markup = renderToStaticMarkup(<ResultView result={result} />);
  const body = markup.replace(/<details/g, '<details open');
  const stamp = when.toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU');
  return `<!doctype html><html lang="${lang}" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t('report.title'))} ${esc(stamp)}</title><style>${pageCss()}${REPORT_CSS}</style></head><body>
<header class="report-head"><h1>${esc(t('report.title'))}</h1><p class="report-meta">${esc(t('report.generated', { when: stamp }))}</p></header>
<section class="card"><h3>${esc(t('report.inputs'))}</h3><dl class="report-inputs">${rows.join('')}</dl></section>
${body}
<p class="report-foot">${esc(t('app.disclaimer'))}</p>
</body></html>`;
}

function printHtml(html: string): boolean {
  try {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.srcdoc = html;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        setTimeout(() => frame.remove(), 60000);
      }
    };
    document.body.appendChild(frame);
    return true;
  } catch {
    return false;
  }
}

export function ReportButtons({ result, input }: { result: InterpretationResult; input: AbgInput | undefined }) {
  const { t } = useT();
  const [msg, setMsg] = useState('');
  if (!input) return null;
  return (
    <>
      <button type="button" onClick={() => setMsg(printHtml(buildReportHtml(result, input)) ? '' : t('report.printFail'))} data-testid="report-print">
        {t('report.print')}
      </button>
      <button
        type="button"
        data-testid="report-download"
        onClick={async () => {
          const d = new Date();
          const p = (x: number) => String(x).padStart(2, '0');
          const name = `abg-report-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.html`;
          const r = await saveFile(name, buildReportHtml(result, input, d), 'text/html');
          setMsg(r === 'saved' ? t('report.saved') : t('report.printFail'));
        }}
      >
        {t('report.download')}
      </button>
      {msg && <span role="status" className="muted small">{msg}</span>}
    </>
  );
}
