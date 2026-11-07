import { useState } from 'react';
import normsJson from '../../content/norms.json';
import { infusionPlan } from '../../core/infusion';
import { parseLocaleNumber } from '../../core/units';
import { useT } from '../common/useT';

const INF = normsJson.infusion;
const PARTS = ['maint', 'fever', 'deficit', 'losses'] as const;
const STEPS = ['assess', 'bolus', 'maint', 'restrict', 'deficit', 'losses', 'monitor'] as const;

const num = (s: string) => {
  const v = parseLocaleNumber(s);
  return Number.isNaN(v) ? undefined : v;
};

/** Daily IV fluid calculator with every step shown: Holliday–Segar, restriction, fever, deficit, losses, bolus. */
export function InfusionTool() {
  const { t, n } = useT();
  const [group, setGroup] = useState<'child' | 'adult'>('child');
  const [w, setW] = useState('23');
  const [adultMl, setAdultMl] = useState(String(INF.adultMlKgDay[0]));
  const [restrict, setRestrict] = useState(100);
  const [temp, setTemp] = useState('');
  const [feverPct, setFeverPct] = useState(String(INF.feverPctPerDeg));
  const [pct, setPct] = useState(0);
  const [hours, setHours] = useState<24 | 48>(48);
  const [losses, setLosses] = useState('');

  const W = num(w);
  const p =
    W && W > 0
      ? infusionPlan({
          group, weightKg: W, adultMlKgDay: num(adultMl), restrictionPct: restrict,
          temperature: num(temp), feverPctPerDeg: num(feverPct) ?? 0, dehydrationPct: pct, replaceHours: hours, lossesMl: Math.max(0, num(losses) ?? 0),
        })
      : null;
  const vals = p ? { maint: p.restrictedMl, fever: p.feverMl, deficit: p.deficitMl, losses: p.lossesMl } : null;
  let acc = 0;

  return (
    <div data-testid="infusion-tool">
      <section className="card" aria-labelledby="inf-h">
        <h3 id="inf-h">{t('inf.title')}</h3>
        <p className="disclaimer" role="note">{t('inf.disclaimer')}</p>
        <div className="chip-row" role="radiogroup" aria-label={t('field.ageCategory')}>
          {(['child', 'adult'] as const).map((g) => (
            <button key={g} type="button" role="radio" aria-checked={group === g} className={'chip' + (group === g ? ' on' : '')} onClick={() => { setGroup(g); setW(g === 'child' ? '23' : '70'); }} data-testid={'inf-g-' + g}>
              {t('inf.group.' + g)}
            </button>
          ))}
        </div>
        <p className="muted small">{t('inf.neonateNote')}</p>
        <div className="grid">
          <div className="field"><label htmlFor="inf-w">{t('pn.weight')} <span className="unit">{t('unit.kg')}</span></label><input id="inf-w" data-testid="inf-w" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></div>
          {group === 'adult' && (
            <div className="field"><label htmlFor="inf-a">{t('inf.adultMl')} <span className="unit">{t('unit.mlKgDay')}</span></label><input id="inf-a" data-testid="inf-adult" inputMode="decimal" value={adultMl} onChange={(e) => setAdultMl(e.target.value)} /></div>
          )}
          <div className="field"><label htmlFor="inf-t">{t('inf.temp')} <span className="unit">°C</span></label><input id="inf-t" data-testid="inf-temp" inputMode="decimal" value={temp} placeholder="37" onChange={(e) => setTemp(e.target.value)} /></div>
          <div className="field"><label htmlFor="inf-f">{t('inf.feverPct')}</label><input id="inf-f" inputMode="decimal" value={feverPct} onChange={(e) => setFeverPct(e.target.value)} /></div>
          <div className="field"><label htmlFor="inf-l">{t('fluid.lossesInput')}</label><input id="inf-l" data-testid="inf-losses" inputMode="decimal" value={losses} placeholder="0" onChange={(e) => setLosses(e.target.value)} /></div>
        </div>
        <label className="block-label">
          {t('inf.restrict', { p: restrict })}
          <input type="range" min={40} max={100} step={5} value={restrict} onChange={(e) => setRestrict(Number(e.target.value))} data-testid="inf-restrict" />
        </label>
        <label className="block-label">
          {t('fluid.dehydration', { p: pct })}
          <input type="range" min={0} max={15} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} data-testid="inf-pct" />
        </label>
        <div className="chip-row" role="radiogroup" aria-label={t('fluid.period')}>
          {[24, 48].map((h) => (
            <button key={h} type="button" role="radio" aria-checked={hours === h} className={'chip' + (hours === h ? ' on' : '')} onClick={() => setHours(h as 24 | 48)}>{t('fluid.over', { h })}</button>
          ))}
        </div>
      </section>

      {!p && <p className="flag flag-warning" role="alert">{t('inf.err')}</p>}
      {p && vals && W && (
        <section className="card" aria-labelledby="inf-res" data-testid="inf-result">
          <h3 id="inf-res">{t('inf.result')}</h3>
          <div className="big-numbers">
            <div><span>{t('fluid.total')}</span><strong data-testid="inf-total">{Math.round(p.totalMl)}</strong> {t('fluid.perDay')}</div>
            <div><span>{t('pn.rate')}</span><strong data-testid="inf-rate">{n(p.mlPerHour, 0)}</strong> {t('unit.mlh')}</div>
            <div><span>{t('inf.perKg')}</span><strong>{Math.round(p.mlPerKgDay)}</strong> {t('unit.mlKgDay')}</div>
          </div>
          <svg viewBox="0 0 320 34" className="chart fluid-bar" role="img" aria-label={t('fluid.aria', { total: Math.round(p.totalMl), h: n(p.mlPerHour, 0) })}>
            {PARTS.map((k) => {
              const ww = p.totalMl > 0 ? (vals[k] / p.totalMl) * 304 : 0;
              const x0 = 8 + acc;
              acc += ww;
              return ww > 0 ? <rect key={k} x={x0} y={6} width={ww} height={22} className={'inf-' + k} /> : null;
            })}
          </svg>
          <ol className="calc-lines inf-calc" data-testid="inf-calc">
            {group === 'child' ? (
              <li>
                {t('inf.calc.hs')}{' '}
                {p.bands.map((b, i) => <span key={i}>{i ? ' + ' : ''}{n(b.kg, 1)} {t('unit.kg')} × {b.mlKgDay}</span>)} = <strong>{Math.round(p.maintenanceMl)} {t('unit.ml')}</strong>
                <span className="muted"> {t('inf.calc.hourly', { h: n(p.maintenanceMl / 24, 0) })}</span>
              </li>
            ) : (
              <li>{t('inf.calc.adult', { m: num(adultMl) ?? INF.adultMlKgDay[0], w: n(W, 1), v: Math.round(p.maintenanceMl) })}</li>
            )}
            {restrict !== 100 && <li>{t('inf.calc.restrict', { v: Math.round(p.maintenanceMl), p: restrict, r: Math.round(p.restrictedMl) })}</li>}
            {p.feverMl > 0 && <li>{t('inf.calc.fever', { r: Math.round(p.restrictedMl), p: num(feverPct) ?? 0, d: n((num(temp) ?? 37) - INF.feverFrom, 1), f: Math.round(p.feverMl) })}</li>}
            {p.deficitMl > 0 && <li>{t('fluid.calc.deficit', { p: pct, w: n(W, 1), d: Math.round(p.deficitTotalMl), h: hours, d24: Math.round(p.deficitMl) })}</li>}
            {p.lossesMl > 0 && <li>{t('inf.calc.losses', { l: Math.round(p.lossesMl) })}</li>}
            <li><strong>{t('inf.calc.total', { tot: Math.round(p.totalMl), r: n(p.mlPerHour, 0) })}</strong></li>
          </ol>
          <table className="values fluid-table">
            <tbody>
              {PARTS.map((k) => (
                <tr key={k} className={vals[k] === 0 ? 'muted' : ''}>
                  <th scope="row"><span className={'sw inf-sw-' + k} aria-hidden="true" /> {t('inf.part.' + k)}</th>
                  <td>{Math.round(vals[k])} {t('unit.ml')}</td>
                  <td>{n(vals[k] / 24, 0)} {t('unit.mlh')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="treat-item">
            <h4>{t('inf.bolus.title')}</h4>
            <p data-testid="inf-bolus">{t(group === 'child' ? 'inf.bolus.child' : 'inf.bolus.adult', { ml: Math.round(p.bolusMl), min: p.bolusMinutes, k: INF.bolusMlKg })}</p>
            <p className="muted small">{t('inf.bolus.note')}</p>
          </div>
          {group === 'adult' && p.electrolytesMmol !== undefined && p.glucoseG && (
            <p className="muted">{t('inf.adultEl', { mmol: Math.round(p.electrolytesMmol), g1: p.glucoseG[0], g2: p.glucoseG[1] })}</p>
          )}
          <p className="muted small">{t('inf.fluidChoice', { lo: INF.isotonicNa[0], hi: INF.isotonicNa[1] })}</p>
        </section>
      )}

      <section className="card" aria-labelledby="inf-how">
        <h3 id="inf-how">{t('inf.how.title')}</h3>
        <ol className="guide-steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <span className="guide-n" aria-hidden="true">{i + 1}</span>
              <div><strong>{t('inf.how.' + s + '.t')}</strong><p>{t('inf.how.' + s, { k: INF.bolusMlKg, min: INF.bolusMinutes, lo: INF.isotonicNa[0], hi: INF.isotonicNa[1] })}</p></div>
            </li>
          ))}
        </ol>
        <p className="muted small">{t('inf.sources')}</p>
      </section>
    </div>
  );
}
