import { odcCurve, P50_STD, shiftFactor } from '../../core/odc';
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
export function AcidBaseMap({ result, trail }: { result: InterpretationResult; trail?: [number, number][] }) {
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
        {trail && trail.length > 1 && (
          <g data-testid="map-trail">
            <polyline points={trail.map(([p, h]) => `${x(Math.min(p, pMax)).toFixed(1)},${y(Math.min(h, hMax)).toFixed(1)}`).join(' ')} className="trail" />
            {trail.map(([p, h], i) => (
              <g key={i}>
                <circle cx={x(Math.min(p, pMax))} cy={y(Math.min(h, hMax))} r={3} className="trail-dot" />
                <text x={x(Math.min(p, pMax)) + 5} y={y(Math.min(h, hMax)) - 5} className="tick">{i + 1}</text>
              </g>
            ))}
          </g>
        )}
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

/** Oxygen–haemoglobin dissociation curve: standard and shifted to the patient's pH, pCO2 and temperature, with the measured point. */
export function OdcChart({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const pred = result.metrics.find((m) => m.id === 'sO2Predicted');
  if (!pred) return null;
  const pO2 = Number(pred.params.pO2);
  const pH = Number(pred.params.pH);
  const pCO2 = Number(pred.params.pCO2);
  const temp = Number(pred.params.t);
  const p50m = result.metrics.find((m) => m.id === 'p50');
  const measured = p50m ? Number(p50m.params.sO2) : undefined;
  const factor = shiftFactor(pH, pCO2, temp);
  const pMax = Math.max(120, Math.ceil((pO2 + 20) / 20) * 20);
  const x = scale(0, pMax, PAD.l, W - PAD.r);
  const y = scale(0, 100, H - PAD.b, PAD.t);
  const path = (pts: [number, number][]) => pts.map(([p, s]) => `${x(p).toFixed(1)},${y(s).toFixed(1)}`).join(' ');
  const p50pt = P50_STD * factor;
  const xTicks = range(0, pMax, 20);
  const yTicks = range(0, 100, 20);
  const pointS = measured ?? pred.value;
  return (
    <section className="card chart-card" aria-labelledby="odc-h">
      <h3 id="odc-h">{t('chart.odc.title')}</h3>
      <p className="muted small">{t('chart.odc.caption')}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t('chart.odc.aria', { pO2, s: Math.round(pointS) })}>
        {xTicks.map((v) => <line key={'gx' + v} x1={x(v)} x2={x(v)} y1={PAD.t} y2={H - PAD.b} className="grid" />)}
        {yTicks.map((v) => <line key={'gy' + v} y1={y(v)} y2={y(v)} x1={PAD.l} x2={W - PAD.r} className="grid" />)}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(50)} y2={y(50)} className="isopleth" />
        <polyline points={path(odcCurve(pMax, 1))} className="curve-std" />
        <polyline points={path(odcCurve(pMax, factor))} className="curve-pt" />
        <line x1={x(P50_STD)} x2={x(P50_STD)} y1={y(50)} y2={H - PAD.b} className="p50-std" />
        <line x1={x(p50pt)} x2={x(p50pt)} y1={y(50)} y2={H - PAD.b} className="p50-pt" />
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis-line" />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="axis-line" />
        {xTicks.map((v) => <text key={'tx' + v} x={x(v)} y={H - PAD.b + 14} className="tick" textAnchor="middle">{v}</text>)}
        {yTicks.map((v) => <text key={'ty' + v} x={PAD.l - 6} y={y(v) + 4} className="tick" textAnchor="end">{v}</text>)}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} className="axis-title" textAnchor="middle">{t('chart.odc.x')}</text>
        <text x={12} y={(PAD.t + H - PAD.b) / 2} className="axis-title" textAnchor="middle" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>{t('chart.odc.y')}</text>
        <circle cx={x(Math.min(pO2, pMax))} cy={y(pointS)} r={7} className="point-halo" />
        <circle cx={x(Math.min(pO2, pMax))} cy={y(pointS)} r={4} className="point" />
      </svg>
      <p className="legend">
        <span className="sw sw-std" aria-hidden="true" /> {t('chart.odc.std', { p50: n(P50_STD, 1) })}
        <span className="sw sw-curve" aria-hidden="true" /> {t('chart.odc.pt', { p50: n(Math.round(p50pt * 10) / 10, 1) })}
        <span className="sw sw-point" aria-hidden="true" /> {t(measured !== undefined ? 'chart.odc.measured' : 'chart.odc.predicted', { pO2, s: Math.round(pointS) })}
      </p>
    </section>
  );
}

/** Oxygen cascade: inspired → alveolar → arterial pO2; the drop from PAO2 to PaO2 is the A-a gradient. */
export function O2Cascade({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const pio2 = result.metrics.find((m) => m.id === 'PIO2');
  const aa = result.workings.find((w) => w.key === 'Aa');
  if (!pio2 || !aa) return null;
  const bars = [
    { k: 'PIO2', v: pio2.value, cls: 'bar-pio2' },
    { k: 'PAO2', v: Number(aa.params.PAO2), cls: 'bar-pao2' },
    { k: 'PaO2', v: Number(aa.params.pO2), cls: 'bar-pao2a' },
  ];
  const max = Math.max(...bars.map((b) => b.v)) * 1.1;
  const h = 180;
  const top = 20;
  const bw = 70;
  const gap = 30;
  const y = (v: number) => (v / max) * h;
  return (
    <section className="card chart-card" aria-labelledby="casc-h">
      <h3 id="casc-h">{t('chart.cascade.title')}</h3>
      <p className="muted small">{t('chart.cascade.caption')}</p>
      <svg viewBox={`0 0 ${40 + 3 * bw + 2 * gap + 20} ${h + top + 34}`} className="chart chart-narrow" role="img"
        aria-label={t('chart.cascade.aria', { pio2: Math.round(pio2.value), pao2: Math.round(bars[1].v), pa: bars[2].v })}>
        {bars.map((b, i) => {
          const bx = 40 + i * (bw + gap);
          return (
            <g key={b.k}>
              <rect x={bx} y={top + h - y(b.v)} width={bw} height={y(b.v)} rx={4} className={b.cls} />
              <text x={bx + bw / 2} y={top + h - y(b.v) - 5} className="seg-label" textAnchor="middle">{n(Math.round(b.v), 0)}</text>
              <text x={bx + bw / 2} y={top + h + 16} className="axis-title" textAnchor="middle">{t('chart.cascade.' + b.k)}</text>
            </g>
          );
        })}
        <line x1={40 + bw + gap + bw} x2={40 + 2 * (bw + gap)} y1={top + h - y(bars[1].v)} y2={top + h - y(bars[1].v)} className="isopleth" />
        <text x={40 + 2 * (bw + gap) + bw / 2} y={top + h - y(bars[1].v) + 14} className="tick" textAnchor="middle">
          {t('chart.cascade.gap', { v: n(Number(aa.params.v), 0) })}
        </text>
      </svg>
    </section>
  );
}

/** Deviation profile: every analyte on one scale, the band is the normal range. */
export function DeviationProfile({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const items = result.profile;
  if (items.length < 3) return null;
  const rowH = 24;
  const labelW = 64;
  const valW = 64;
  const plotL = labelW;
  const plotR = W - valW;
  const zMax = 3;
  const x = scale(-zMax, zMax, plotL, plotR);
  const h = items.length * rowH + 24;
  return (
    <section className="card chart-card" aria-labelledby="prof-h">
      <h3 id="prof-h">{t('chart.profile.title')}</h3>
      <p className="muted small">{t('chart.profile.caption')}</p>
      <svg viewBox={`0 0 ${W} ${h}`} className="chart" role="img" aria-label={t('chart.profile.aria')}>
        <rect x={x(-1)} y={4} width={x(1) - x(-1)} height={items.length * rowH} className="normal-box" />
        <line x1={x(0)} x2={x(0)} y1={4} y2={4 + items.length * rowH} className="isopleth" />
        {items.map((it, i) => {
          const z = Math.max(-zMax, Math.min(zMax, it.z));
          const cy = 4 + i * rowH + rowH / 2;
          const cls = Math.abs(it.z) <= 1 ? 'dot-ok' : Math.abs(it.z) <= 2 ? 'dot-warn' : 'dot-bad';
          return (
            <g key={it.id}>
              <text x={labelW - 6} y={cy + 4} className="seg-label" textAnchor="end">{t('chart.profile.' + it.id)}</text>
              <line x1={x(0)} x2={x(z)} y1={cy} y2={cy} className={'stem ' + cls} />
              <circle cx={x(z)} cy={cy} r={5} className={cls} />
              <text x={W - 4} y={cy + 4} className="tick" textAnchor="end">{n(it.value, Math.abs(it.value) < 10 ? 2 : 1)}</text>
            </g>
          );
        })}
        <text x={x(-1)} y={h - 4} className="tick" textAnchor="middle">{t('chart.profile.low')}</text>
        <text x={x(1)} y={h - 4} className="tick" textAnchor="middle">{t('chart.profile.high')}</text>
      </svg>
    </section>
  );
}

/** Davenport diagram: pH × HCO3 with pCO2 isobars and the blood buffer line through the normal point. */
export function Davenport({ result }: { result: InterpretationResult }) {
  const { t, n } = useT();
  const ph = result.steps.find((s) => s.id === 'ph');
  const prim = result.steps.find((s) => s.id === 'primary');
  if (!ph || !prim) return null;
  const pH = ph.value as number;
  const HCO3 = prim.details.HCO3 as number;
  const pCO2 = prim.details.pCO2 as number;
  const hb = (result.profile.find((p) => p.id === 'Hb')?.value ?? 150) / 10;
  // Van Slyke: buffer value of whole blood β ≈ 1.43 × Hb (g/dL) + 7.7 mmol/L per pH unit
  const beta = 1.43 * hb + 7.7;
  const x0 = 6.9;
  const x1 = 7.8;
  const hMax = Math.max(50, Math.ceil((HCO3 + 5) / 10) * 10);
  const x = scale(x0, x1, PAD.l, W - PAD.r);
  const y = scale(0, hMax, H - PAD.b, PAD.t);
  const iso = [20, 30, 40, 60, 80].map((p) => ({
    p,
    pts: range(0, 90, 1)
      .map((i) => x0 + i * 0.01)
      .map((v) => [v, 0.0307 * p * 10 ** (v - 6.1)] as [number, number])
      .filter(([, h]) => h <= hMax),
  }));
  const buf = [x0, x1].map((v) => [v, 24.4 - beta * (v - 7.4)] as [number, number]);
  const clip = (v: number) => Math.max(0, Math.min(hMax, v));
  const xTicks = range(0, 9, 1).map((i) => Math.round((x0 + i * 0.1) * 10) / 10);
  const yTicks = range(0, hMax, 10);
  return (
    <section className="card chart-card" aria-labelledby="dav-h">
      <h3 id="dav-h">{t('chart.davenport.title')}</h3>
      <p className="muted small">{t('chart.davenport.caption', { beta: Math.round(beta * 10) / 10 })}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t('chart.davenport.aria', { pH, HCO3: Math.round(HCO3 * 10) / 10 })}>
        {xTicks.map((v) => <line key={'gx' + v} x1={x(v)} x2={x(v)} y1={PAD.t} y2={H - PAD.b} className="grid" />)}
        {yTicks.map((v) => <line key={'gy' + v} y1={y(v)} y2={y(v)} x1={PAD.l} x2={W - PAD.r} className="grid" />)}
        <rect x={x(7.35)} y={y(26)} width={x(7.45) - x(7.35)} height={y(22) - y(26)} className="normal-box" />
        {iso.map((i) => (
          <g key={i.p}>
            <polyline points={i.pts.map(([v, h]) => `${x(v).toFixed(1)},${y(h).toFixed(1)}`).join(' ')} className={i.p === 40 ? 'isobar-40' : 'isopleth'} />
            {i.pts.length > 0 && (
              <text x={x(i.pts[i.pts.length - 1][0]) - 2} y={y(i.pts[i.pts.length - 1][1]) - 4} className="iso-label" textAnchor="end">
                {t('chart.davenport.isobar', { p: i.p })}
              </text>
            )}
          </g>
        ))}
        <line x1={x(buf[0][0])} y1={y(clip(buf[0][1]))} x2={x(buf[1][0])} y2={y(clip(buf[1][1]))} className="buffer-line" />
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis-line" />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="axis-line" />
        {xTicks.map((v) => <text key={'tx' + v} x={x(v)} y={H - PAD.b + 14} className="tick" textAnchor="middle">{n(v, 1)}</text>)}
        {yTicks.map((v) => <text key={'ty' + v} x={PAD.l - 6} y={y(v) + 4} className="tick" textAnchor="end">{v}</text>)}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} className="axis-title" textAnchor="middle">{t('chart.davenport.x')}</text>
        <text x={12} y={(PAD.t + H - PAD.b) / 2} className="axis-title" textAnchor="middle" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>{t('chart.map.y')}</text>
        <circle cx={x(Math.max(x0, Math.min(x1, pH)))} cy={y(Math.min(HCO3, hMax))} r={7} className="point-halo" />
        <circle cx={x(Math.max(x0, Math.min(x1, pH)))} cy={y(Math.min(HCO3, hMax))} r={4} className="point" />
      </svg>
      <p className="legend">
        <span className="sw sw-std" aria-hidden="true" /> {t('chart.davenport.legendIso')}
        <span className="sw sw-buffer" aria-hidden="true" /> {t('chart.davenport.legendBuffer')}
        <span className="sw sw-point" aria-hidden="true" /> {t('chart.davenport.legendPoint', { pH, pCO2, HCO3: Math.round(HCO3 * 10) / 10 })}
      </p>
    </section>
  );
}

/** Small line chart of one value over hours for the series. */
export function TrendChart({ label, hours, values, normal }: { label: string; hours: number[]; values: (number | undefined)[]; normal?: [number, number] }) {
  const { n } = useT();
  const pts = hours.map((h, i) => [h, values[i]] as [number, number | undefined]).filter((p): p is [number, number] => p[1] !== undefined);
  if (!pts.length) return null;
  const w = 220;
  const h = 110;
  const pad = { l: 34, r: 8, t: 14, b: 18 };
  const vs = pts.map((p) => p[1]).concat(normal ?? []);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const m = (hi - lo) * 0.1;
  lo -= m; hi += m;
  const hMax = Math.max(1, ...hours);
  const x = scale(0, hMax, pad.l, w - pad.r);
  const y = scale(lo, hi, h - pad.b, pad.t);
  const digits = Math.abs(pts[0][1]) < 10 ? 2 : 0;
  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label={`${label}: ${pts.map((p) => n(p[1], digits)).join(' → ')}`}>
        {normal && <rect x={pad.l} y={y(normal[1])} width={w - pad.l - pad.r} height={y(normal[0]) - y(normal[1])} className="normal-box" />}
        <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} className="axis-line" />
        <polyline points={pts.map(([hh, v]) => `${x(hh).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} className="curve-pt" />
        {pts.map(([hh, v], i) => (
          <g key={i}>
            <circle cx={x(hh)} cy={y(v)} r={3} className="point" />
            <text x={x(hh)} y={y(v) - 6} className="tick" textAnchor="middle">{n(v, digits)}</text>
          </g>
        ))}
        <text x={pad.l} y={h - 4} className="tick">0</text>
        <text x={w - pad.r} y={h - 4} className="tick" textAnchor="end">{n(Math.round(hMax * 10) / 10, 1)}</text>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
