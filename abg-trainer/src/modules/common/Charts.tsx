import type { InterpretationResult } from '../../core/types';
import { useT } from './useT';

const W = 360;
const H = 260;
const PAD = { l: 42, r: 14, t: 12, b: 34 };

function scale(d0: number, d1: number, r0: number, r1: number) {
  return (v: number) => r0 + ((v - d0) * (r1 - r0)) / (d1 - d0);
}

function band(points: [number, number][], tol: number, x: (v: number) => number, y: (v: number) => number, swapAxes = false): string {
  // points are [pCO2, HCO3]; tolerance applies to the dependent variable
  const upper = points.map(([p, h]) => (swapAxes ? [p + tol, h] : [p, h + tol]));
  const lower = points.map(([p, h]) => (swapAxes ? [p - tol, h] : [p, h - tol])).reverse();
  return [...upper, ...lower].map(([p, h]) => `${x(p).toFixed(1)},${y(h).toFixed(1)}`).join(' ');
}

const range = (a: number, b: number, step: number) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);

/** Acid–base map: pCO2 × HCO3 with pH isopleths, the expected-compensation corridors (Boston) and the patient's point. */
export function AcidBaseMap({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const prim = result.steps.find((s) => s.id === 'primary');
  if (!prim) return null;
  const pCO2 = prim.details.pCO2 as number;
  const HCO3 = prim.details.HCO3 as number;
  const pMax = Math.max(100, Math.ceil((pCO2 + 10) / 10) * 10);
  const hMax = Math.max(50, Math.ceil((HCO3 + 5) / 5) * 5);
  const x = scale(10, pMax, PAD.l, W - PAD.r);
  const y = scale(0, hMax, H - PAD.b, PAD.t);
  const tol = 2;
  const metAcid = range(4, 24, 1).map((h) => [1.5 * h + 8, h] as [number, number]);
  const metAlk = range(24, 45, 1).map((h) => [Math.min(0.7 * h + 21, 55), h] as [number, number]);
  const raAcute = range(40, pMax, 5).map((p) => [p, 24 + 0.1 * (p - 40)] as [number, number]);
  const raChronic = range(40, pMax, 5).map((p) => [p, 24 + 0.35 * (p - 40)] as [number, number]);
  const rlAcute = range(12, 40, 2).map((p) => [p, 24 - 0.2 * (40 - p)] as [number, number]);
  const rlChronic = range(12, 40, 2).map((p) => [p, 24 - 0.4 * (40 - p)] as [number, number]);
  const isopleths = [7.0, 7.2, 7.4, 7.6].map((ph) => ({
    ph,
    pts: range(10, pMax, 2)
      .map((p) => [p, 0.0307 * p * 10 ** (ph - 6.1)] as [number, number])
      .filter(([, h]) => h <= hMax),
  }));
  const nr = prim.details;
  const boxX0 = x(nr.pco2Lo as number);
  const boxX1 = x(nr.pco2Hi as number);
  const boxY0 = y(nr.hcoHi as number);
  const boxY1 = y(nr.hcoLo as number);
  const xTicks = range(10, pMax, 10);
  const yTicks = range(0, hMax, 10);
  return (
    <section className="card chart-card" aria-labelledby="abmap-h">
      <h3 id="abmap-h">{t('chart.map.title')}</h3>
      <p className="muted small">{t('chart.map.caption')}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t('chart.map.aria', { pCO2, HCO3: Math.round(HCO3 * 10) / 10 })}>
        {xTicks.map((v) => <line key={'gx' + v} x1={x(v)} x2={x(v)} y1={PAD.t} y2={H - PAD.b} className="grid" />)}
        {yTicks.map((v) => <line key={'gy' + v} y1={y(v)} y2={y(v)} x1={PAD.l} x2={W - PAD.r} className="grid" />)}
        <polygon points={band(metAcid, tol, x, y, true)} className="zone acid" />
        <polygon points={band(raAcute, tol, x, y)} className="zone acid light" />
        <polygon points={band(raChronic, tol, x, y)} className="zone acid" />
        <polygon points={band(metAlk, tol, x, y, true)} className="zone alk" />
        <polygon points={band(rlAcute, tol, x, y)} className="zone alk light" />
        <polygon points={band(rlChronic, tol, x, y)} className="zone alk" />
        <rect x={boxX0} y={boxY0} width={boxX1 - boxX0} height={boxY1 - boxY0} className="normal-box" />
        {isopleths.map((i) => (
          <g key={i.ph}>
            <polyline points={i.pts.map(([p, h]) => `${x(p).toFixed(1)},${y(h).toFixed(1)}`).join(' ')} className="isopleth" />
            {i.pts.length > 0 && (
              <text x={x(i.pts[i.pts.length - 1][0]) - 2} y={y(i.pts[i.pts.length - 1][1]) - 4} className="iso-label" textAnchor="end">
                pH {n(i.ph, 1)}
              </text>
            )}
          </g>
        ))}
        <text x={x(15) + 6} y={y(2.5)} className="zone-label">{t('chart.map.metAcid')}</text>
        <text x={x(Math.min(0.7 * 40 + 21, 55)) - 4} y={y(41)} className="zone-label" textAnchor="end">{t('chart.map.metAlk')}</text>
        <text x={x(pMax - 4)} y={y(24 + 0.35 * (pMax - 44)) - 6} className="zone-label" textAnchor="end">{t('chart.map.respAcid')}</text>
        <text x={x(11)} y={y(22)} className="zone-label">{t('chart.map.respAlk')}</text>
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis-line" />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="axis-line" />
        {xTicks.map((v) => <text key={'tx' + v} x={x(v)} y={H - PAD.b + 14} className="tick" textAnchor="middle">{v}</text>)}
        {yTicks.map((v) => <text key={'ty' + v} x={PAD.l - 6} y={y(v) + 4} className="tick" textAnchor="end">{v}</text>)}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} className="axis-title" textAnchor="middle">{t('chart.map.x')}</text>
        <text x={12} y={(PAD.t + H - PAD.b) / 2} className="axis-title" textAnchor="middle" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>{t('chart.map.y')}</text>
        <circle cx={x(Math.min(pCO2, pMax))} cy={y(Math.min(HCO3, hMax))} r={7} className="point-halo" />
        <circle cx={x(Math.min(pCO2, pMax))} cy={y(Math.min(HCO3, hMax))} r={4} className="point" />
      </svg>
      <p className="legend">
        <span className="sw sw-acid" aria-hidden="true" /> {t('chart.map.legendAcid')}
        <span className="sw sw-alk" aria-hidden="true" /> {t('chart.map.legendAlk')}
        <span className="sw sw-normal" aria-hidden="true" /> {t('chart.map.legendNormal')}
        <span className="sw sw-point" aria-hidden="true" /> {t('chart.map.legendPoint', { pCO2, HCO3: Math.round(HCO3 * 10) / 10 })}
      </p>
    </section>
  );
}

/** Gamblegram: cations vs measured anions; the gap is the unmeasured anions (AG). */
export function Gamblegram({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const w = result.workings.find((x) => x.key === 'ag' || x.key === 'agK');
  if (!w) return null;
  const Na = Number(w.params.Na);
  const K = w.key === 'agK' ? Number(w.params.K) : 0;
  const Cl = Number(w.params.Cl);
  const HCO3 = Number(w.params.HCO3);
  const ag = Number(w.params.ag);
  const total = Na + K;
  const top = 14;
  const h = 210;
  const y = (v: number) => (v / total) * h;
  const colW = 92;
  const anions = [
    { k: 'Cl', v: Cl, cls: 'seg-cl' },
    { k: 'HCO3', v: HCO3, cls: 'seg-hco3' },
    { k: 'AG', v: Math.max(ag, 0), cls: 'seg-ag' },
  ];
  let acc = 0;
  return (
    <section className="card chart-card" aria-labelledby="gamble-h">
      <h3 id="gamble-h">{t('chart.gamble.title')}</h3>
      <p className="muted small">{t('chart.gamble.caption')}</p>
      <svg viewBox={`0 0 300 ${h + top + 26}`} className="chart chart-narrow" role="img" aria-label={t('chart.gamble.aria', { Na, Cl, HCO3, ag })}>
        <rect x={40} y={top} width={colW} height={y(Na)} className="seg-na" />
        <text x={40 + colW / 2} y={top + y(Na) / 2} className="seg-label" textAnchor="middle">Na⁺ {n(Na, 0)}</text>
        {K > 0 && (
          <>
            <rect x={40} y={top + y(Na)} width={colW} height={y(K)} className="seg-k" />
            <text x={40 + colW / 2} y={top + y(Na) + y(K) / 2 + 4} className="seg-label" textAnchor="middle">K⁺ {n(K, 1)}</text>
          </>
        )}
        {anions.map((a) => {
          const y0 = top + y(acc);
          acc += a.v;
          return (
            <g key={a.k}>
              <rect x={168} y={y0} width={colW} height={y(a.v)} className={a.cls} />
              <text x={168 + colW / 2} y={y0 + y(a.v) / 2 + 4} className="seg-label" textAnchor="middle">
                {t('chart.gamble.' + a.k)} {n(a.v, 1)}
              </text>
            </g>
          );
        })}
        <text x={40 + colW / 2} y={h + top + 18} className="axis-title" textAnchor="middle">{t('chart.gamble.cations')}</text>
        <text x={168 + colW / 2} y={h + top + 18} className="axis-title" textAnchor="middle">{t('chart.gamble.anions')}</text>
      </svg>
    </section>
  );
}

/** Bilirubin over hours of life with the phototherapy and exchange thresholds. */
export function BilirubinChart({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const b = result.bilirubin;
  if (!b || !b.photo || !b.exchange) return null;
  const value = b.value;
  const hours = b.hours;
  const hMax = Math.max(168, Math.ceil(((hours ?? 0) + 24) / 24) * 24);
  const vMax = Math.ceil((Math.max(...b.exchange.map((p) => p[1]), value) + 40) / 50) * 50;
  const x = scale(0, hMax, PAD.l, W - PAD.r);
  const y = scale(0, vMax, H - PAD.b, PAD.t);
  const line = (c: [number, number][]) => {
    const pts = c[c.length - 1][0] < hMax ? [...c, [hMax, c[c.length - 1][1]] as [number, number]] : c;
    return pts.map(([h, v]) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  };
  const xTicks = range(0, hMax, 24);
  const yTicks = range(0, vMax, 50);
  return (
    <section className="card chart-card" aria-labelledby="bili-h">
      <h3 id="bili-h">{t('chart.bili.title')}</h3>
      <p className="muted small">{t(b.source === 'maisels' ? 'chart.bili.captionMaisels' : 'chart.bili.captionAAP', { ga: b.ga })}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t('chart.bili.aria', { b: value, h: hours ?? '—' })}>
        {xTicks.map((v) => <line key={'gx' + v} x1={x(v)} x2={x(v)} y1={PAD.t} y2={H - PAD.b} className="grid" />)}
        {yTicks.map((v) => <line key={'gy' + v} y1={y(v)} y2={y(v)} x1={PAD.l} x2={W - PAD.r} className="grid" />)}
        <polyline points={line(b.exchange)} className="th-exchange" />
        <polyline points={line(b.photo)} className="th-photo" />
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis-line" />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="axis-line" />
        {xTicks.map((v) => <text key={'tx' + v} x={x(v)} y={H - PAD.b + 14} className="tick" textAnchor="middle">{v}</text>)}
        {yTicks.map((v) => <text key={'ty' + v} x={PAD.l - 6} y={y(v) + 4} className="tick" textAnchor="end">{v}</text>)}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} className="axis-title" textAnchor="middle">{t('chart.bili.x')}</text>
        <text x={12} y={(PAD.t + H - PAD.b) / 2} className="axis-title" textAnchor="middle" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>{t('chart.bili.y')}</text>
        {hours !== undefined ? (
          <>
            <circle cx={x(hours)} cy={y(value)} r={7} className="point-halo" />
            <circle cx={x(hours)} cy={y(value)} r={4} className="point" />
          </>
        ) : (
          <line x1={PAD.l} x2={W - PAD.r} y1={y(value)} y2={y(value)} className="point-line" />
        )}
      </svg>
      <p className="legend">
        <span className="sw sw-photo" aria-hidden="true" /> {t('chart.bili.photo')}
        <span className="sw sw-exchange" aria-hidden="true" /> {t('chart.bili.exchange')}
        <span className="sw sw-point" aria-hidden="true" /> {t('chart.bili.point', { b: n(value, 0) })}
      </p>
    </section>
  );
}
