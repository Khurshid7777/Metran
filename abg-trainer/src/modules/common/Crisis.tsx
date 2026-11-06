import { useState } from 'react';
import type { Crisis } from '../../core/crisis';
import { dailyFluid, sodiumCorridor } from '../../core/dailyPlan';
import type { InterpretationResult } from '../../core/types';
import { useT } from './useT';

const BAR_W = 320;
const BAR_H = 44;
const PAD_X = 8;

/** Horizontal scale of one analyte: normal in green, deviations by severity, the patient's value as a marker. */
function ZoneBar({ c }: { c: Crisis }) {
  const { t, n } = useT();
  const [min, max] = c.scale;
  const x = (v: number) => PAD_X + ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (BAR_W - 2 * PAD_X);
  const digits = c.id === 'pH' ? 2 : c.id === 'iCa' ? 2 : c.id === 'K' ? 1 : 0;
  // Tick labels: keep the normal range and the cut-offs, dropping any that would touch the previous label
  const cuts: number[] = [];
  for (const v of [...new Set(c.zones.slice(1).map((z) => z.from))].sort((a, b) => a - b)) {
    if (!cuts.length || x(v) - x(cuts[cuts.length - 1]) >= 30) cuts.push(v);
  }
  return (
    <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="zonebar" role="img" aria-label={t('crisis.bar.aria', { name: t('crisis.name.' + c.id), v: n(c.value, digits), lo: n(c.normal[0], digits), hi: n(c.normal[1], digits) })}>
      {c.zones.map((z) => (
        <rect key={z.from} x={x(z.from)} y={10} width={Math.max(1, x(z.to) - x(z.from))} height={14} className={'z-' + z.kind} />
      ))}
      {cuts.map((v) => <text key={v} x={x(v)} y={BAR_H - 4} className="tick" textAnchor="middle">{n(v, digits)}</text>)}
      <path d={`M${x(c.value) - 6},2 L${x(c.value) + 6},2 L${x(c.value)},12 Z`} className="zone-marker" />
    </svg>
  );
}

/** Critical-shift board: each abnormal analyte on its scale with the shortest useful actions. */
export function CrisisBoard({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  if (!result.crises.length) return null;
  return (
    <section className="card crisis-board" aria-labelledby="crisis-h" data-testid="crisis-board">
      <h3 id="crisis-h">{t('crisis.title')}</h3>
      <div className="crisis-grid">
        {result.crises.map((c) => (
          <article key={c.id} className={'crisis crisis-' + c.level} data-testid={'crisis-' + c.id}>
            <header>
              <span className="arrow" aria-hidden="true">{c.dir === 'low' ? '▼' : '▲'}</span>
              <strong>{t('crisis.name.' + c.id)}</strong>
              <span className="crisis-value">
                {n(c.value, c.id === 'pH' || c.id === 'iCa' ? 2 : 1)} {c.id !== 'pH' && <span className="unit">{t('unit.mmol')}</span>}
              </span>
              <span className={'lvl lvl-' + c.level}>{t('crisis.' + c.dir)} · {t('crisis.level.' + c.level)}</span>
            </header>
            <ZoneBar c={c} />
            <ul>
              {c.actions.map((a) => <li key={a.key}>{t(a.key, a.params)}</li>)}
            </ul>
          </article>
        ))}
      </div>
      <p className="muted small">{t('crisis.note')}</p>
    </section>
  );
}

const PARTS = ['maintenance', 'deficit', 'losses'] as const;

/** Plan for 24 h: maintenance plus the share of the deficit and the losses, as a stacked bar with hourly rate. */
export function FluidPlanCard({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const [pct, setPct] = useState(0);
  const [hours, setHours] = useState<24 | 48>(24);
  const [losses, setLosses] = useState('');
  const m = result.deficits.find((d) => d.id === 'maintenance');
  if (!m) return null;
  const w = m.params.w;
  const lossesMl = Math.max(0, Number(losses.replace(',', '.')) || 0);
  const f = dailyFluid(m.amount, w, pct, hours, lossesMl);
  const vals = { maintenance: f.maintenanceMl, deficit: f.deficitMl, losses: f.lossesMl };
  const total = f.totalMl;
  const W = 320;
  let acc = 0;
  const water = result.deficits.find((d) => d.id === 'freeWater');
  return (
    <section className="card" aria-labelledby="fluid-h" data-testid="fluid-plan">
      <h3 id="fluid-h">{t('fluid.title')}</h3>
      <div className="fluid-controls">
        <label>
          {t('fluid.dehydration', { p: pct })}
          <input type="range" min={0} max={15} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} data-testid="fluid-pct" />
        </label>
        <fieldset className="chip-row" role="radiogroup" aria-label={t('fluid.period')}>
          {[24, 48].map((h) => (
            <button key={h} type="button" role="radio" aria-checked={hours === h} className={'chip' + (hours === h ? ' on' : '')} onClick={() => setHours(h as 24 | 48)}>
              {t('fluid.over', { h })}
            </button>
          ))}
        </fieldset>
        <label>
          {t('fluid.lossesInput')}
          <input inputMode="decimal" value={losses} onChange={(e) => setLosses(e.target.value)} placeholder="0" data-testid="fluid-losses" />
        </label>
      </div>
      <svg viewBox={`0 0 ${W} 54`} className="chart fluid-bar" role="img" aria-label={t('fluid.aria', { total: Math.round(total), h: n(f.mlPerHour, 0) })}>
        {PARTS.map((k) => {
          const w2 = total > 0 ? (vals[k] / total) * (W - 16) : 0;
          const x0 = 8 + acc;
          acc += w2;
          return w2 > 0 ? <rect key={k} x={x0} y={8} width={w2} height={22} className={'fp-' + k} /> : null;
        })}
        <text x={8} y={48} className="tick">0</text>
        <text x={W - 8} y={48} className="tick" textAnchor="end">{Math.round(total)} {t('unit.ml')}</text>
      </svg>
      <table className="values fluid-table">
        <thead>
          <tr><th scope="col">{t('fluid.part')}</th><th scope="col">{t('fluid.perDay')}</th><th scope="col">{t('unit.mlh')}</th></tr>
        </thead>
        <tbody>
          {PARTS.map((k) => (
            <tr key={k} className={vals[k] === 0 ? 'muted' : ''}>
              <th scope="row"><span className={'sw fp-sw-' + k} aria-hidden="true" /> {t('fluid.' + k)}</th>
              <td>{Math.round(vals[k])}</td>
              <td>{n(vals[k] / 24, 0)}</td>
            </tr>
          ))}
          <tr className="total">
            <th scope="row">{t('fluid.total')}</th>
            <td data-testid="fluid-total">{Math.round(total)}</td>
            <td data-testid="fluid-rate">{n(f.mlPerHour, 0)}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">{t('fluid.perKg', { v: Math.round(f.mlPerKgDay) })} {t('fluid.formula')}</p>
      {water?.first24h !== undefined && <p className="flag flag-info">{t('fluid.freeWater', { l: Math.round(water.first24h * 100) / 100 })}</p>}
      <p className="muted small">{t('fluid.note')}</p>
    </section>
  );
}

/** Sodium over the next days at the largest safe rate, against the normal range. */
export function SodiumCorridor({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const c = result.naCorrection;
  if (!c) return null;
  const normal: [number, number] = c.direction === 'raise' ? [c.target, 145] : [135, c.target];
  const { hours } = sodiumCorridor(c.na, c.limit, normal);
  const W = 340;
  const H = 190;
  const P = { l: 40, r: 12, t: 12, b: 30 };
  const hMax = Math.max(48, Math.ceil((hours + 12) / 24) * 24);
  const yLo = Math.min(c.na, normal[0]) - 5;
  const yHi = Math.max(c.na, normal[1]) + 5;
  const x = (v: number) => P.l + (v / hMax) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - yLo) / (yHi - yLo)) * (H - P.t - P.b);
  const sign = c.direction === 'raise' ? 1 : -1;
  const end = c.na + sign * Math.min(c.limit * (hMax / 24), Math.abs(c.target - c.na));
  // Too-fast area: beyond the largest safe rate, only until the normal range is reached
  const edge = c.direction === 'raise' ? yHi : yLo;
  const forbidden = `${x(0)},${y(c.na)} ${x(Math.min(hours, hMax))},${y(end)} ${x(Math.min(hours, hMax))},${y(edge)} ${x(0)},${y(edge)}`;
  const days = range(0, hMax, 24);
  return (
    <section className="card chart-card" aria-labelledby="corr-h" data-testid="na-corridor">
      <h3 id="corr-h">{t('corridor.title')}</h3>
      <p className="muted small">{t('corridor.caption', { max: c.limit, h: Math.round(hours) })}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t('corridor.aria', { na: c.na, h: Math.round(hours) })}>
        <rect x={P.l} y={y(normal[1])} width={W - P.l - P.r} height={y(normal[0]) - y(normal[1])} className="z-normal" />
        <polygon points={forbidden} className="corridor-forbidden" />
        {days.map((h) => <line key={h} x1={x(h)} x2={x(h)} y1={P.t} y2={H - P.b} className="grid" />)}
        <line x1={x(0)} y1={y(c.na)} x2={x(Math.min(hours, hMax))} y2={y(end)} className="corridor-line" />
        <circle cx={x(0)} cy={y(c.na)} r={5} className="zone-marker" />
        <text x={x(0) + 8} y={y(c.na) + (sign > 0 ? 14 : -8)} className="tick">{n(c.na, 0)}</text>
        <text x={x(Math.min(hours, hMax))} y={y(end) + (sign > 0 ? -8 : 14)} className="tick" textAnchor="middle">{Math.round(hours)} {t('unit.hours')}</text>
        <line x1={P.l} x2={P.l} y1={P.t} y2={H - P.b} className="axis-line" />
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} className="axis-line" />
        {days.map((h) => <text key={'t' + h} x={x(h)} y={H - P.b + 14} className="tick" textAnchor="middle">{h}</text>)}
        {[normal[0], normal[1]].map((v) => <text key={v} x={P.l - 6} y={y(v) + 3} className="tick" textAnchor="end">{v}</text>)}
        <text x={(P.l + W - P.r) / 2} y={H - 4} className="axis-title" textAnchor="middle">{t('corridor.x')}</text>
      </svg>
    </section>
  );
}

const range = (a: number, b: number, step: number) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
