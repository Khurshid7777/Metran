import type { Step } from '../../core/types';
import { useT } from './useT';

/** Contribution of each mechanism to SBE — horizontal diverging bars around zero. */
export function StewartChart({ step }: { step: Step }) {
  const { t, n } = useT();
  const d = step.details;
  const rows = [
    { key: 'naCl', v: d.naCl as number },
    { key: 'albumin', v: d.albumin as number },
    { key: 'lactate', v: d.lactate as number },
    { key: 'uma', v: d.uma as number },
    { key: 'SBE', v: d.SBE as number },
  ];
  const max = Math.max(5, ...rows.map((r) => Math.abs(r.v)));
  const W = 320;
  const labelW = 0;
  const mid = labelW + (W - labelW) / 2;
  const scale = (W - labelW) / 2 / max;
  const rowH = 30;
  const desc = rows.map((r) => `${t('stewart.' + r.key)} ${n(r.v, 1)}`).join('; ');
  return (
    <section className="card" aria-labelledby="stewart-h">
      <h3 id="stewart-h">{t('stewart.title')}</h3>
      <p className="muted">{t('stewart.caption')}</p>
      <div className="stewart">
        {rows.map((r, i) => (
          <div className="stewart-row" key={r.key}>
            <span className={'stewart-label' + (r.key === 'SBE' ? ' strong' : '')}>{t('stewart.' + r.key)}</span>
            <svg viewBox={`0 0 ${W} ${rowH}`} width="100%" height={rowH} role="img" aria-label={`${t('stewart.' + r.key)}: ${n(r.v, 1)}`}>
              <line x1={mid} x2={mid} y1={0} y2={rowH} className="axis" />
              <rect
                x={r.v < 0 ? mid + r.v * scale : mid}
                y={7}
                width={Math.max(1, Math.abs(r.v) * scale)}
                height={16}
                rx={3}
                className={r.key === 'SBE' ? 'bar-total' : r.v < 0 ? 'bar-acid' : 'bar-alk'}
                data-i={i}
              />
            </svg>
            <span className="stewart-val">{n(r.v, 1)}</span>
          </div>
        ))}
      </div>
      <p className="legend">
        <span className="sw sw-acid" aria-hidden="true" /> {t('stewart.acidifying')} <span className="sw sw-alk" aria-hidden="true" /> {t('stewart.alkalinizing')}
      </p>
      <p className="sr-only">{desc}</p>
    </section>
  );
}
