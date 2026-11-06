import { useState } from 'react';
import normsJson from '../../content/norms.json';
import { gir, glucoseOsm, mix, naclMmolPerL, naclOsm, rateForGir } from '../../core/solutions';
import { parseLocaleNumber } from '../../core/units';
import { useT } from '../common/useT';

type Substance = 'nacl' | 'glucose';

const STOCKS: Record<Substance, { concentrated: number[]; diluents: number[]; targets: number[] }> = {
  nacl: { concentrated: [23.4, 10, 5.85, 3, 0.9], diluents: [0, 0.9], targets: [0.45, 0.9, 1, 3, 5] },
  glucose: { concentrated: [50, 40, 20, 12.5, 10, 5], diluents: [0, 5, 10], targets: [5, 10, 12.5, 15, 20] },
};

const num = (s: string) => {
  const v = parseLocaleNumber(s);
  return Number.isNaN(v) ? undefined : v;
};

/** Preparing a solution of the wanted concentration from a stock and a diluent, plus the glucose infusion rate. */
export function SolutionsTool() {
  const { t, n } = useT();
  const peripheral = normsJson.pn.peripheral.osm;
  const [sub, setSub] = useState<Substance>('nacl');
  const [target, setTarget] = useState('3');
  const [vol, setVol] = useState('100');
  const [stock, setStock] = useState(23.4);
  const [diluent, setDiluent] = useState(0.9);
  const [w, setW] = useState('3');
  const [pct, setPct] = useState('10');
  const [rate, setRate] = useState('6');
  const [tg, setTg] = useState('6');
  const [mmol, setMmol] = useState('');
  const [mmolPct, setMmolPct] = useState('3');

  const choose = (s: Substance) => {
    setSub(s);
    setStock(STOCKS[s].concentrated[0]);
    setDiluent(STOCKS[s].diluents[0]);
    setTarget(s === 'nacl' ? '3' : '10');
  };

  const T = num(target);
  const V = num(vol);
  const m = T !== undefined && V !== undefined ? mix(T, V, stock, diluent) : undefined;
  const osm = T === undefined ? undefined : sub === 'nacl' ? naclOsm(T) : glucoseOsm(T);

  const W = num(w);
  const P = num(pct);
  const R = num(rate);
  const TG = num(tg);
  const girNow = W && P && R !== undefined ? gir(P, R, W) : undefined;
  const rateNeed = W && P && TG !== undefined ? rateForGir(P, TG, W) : undefined;

  const MM = num(mmol);
  const MP = num(mmolPct);
  const mlForMmol = MM !== undefined && MP ? MM / (naclMmolPerL(MP) / 1000) : undefined;

  return (
    <div data-testid="solutions-tool">
      <section className="card" aria-labelledby="mix-h">
        <h3 id="mix-h">{t('sol.mix.title')}</h3>
        <p className="muted small">{t('sol.mix.intro')}</p>
        <div className="chip-row" role="radiogroup" aria-label={t('sol.substance')}>
          {(['nacl', 'glucose'] as Substance[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sub === s} className={'chip' + (sub === s ? ' on' : '')} onClick={() => choose(s)} data-testid={'sol-' + s}>
              {t('sol.sub.' + s)}
            </button>
          ))}
        </div>
        <div className="chip-row" aria-label={t('sol.quick')}>
          {STOCKS[sub].targets.map((x) => (
            <button key={x} type="button" className={'chip' + (T === x ? ' on' : '')} onClick={() => setTarget(String(x))}>{n(x, 2)} %</button>
          ))}
        </div>
        <div className="grid">
          <div className="field">
            <label htmlFor="sol-target">{t('sol.target')}</label>
            <input id="sol-target" data-testid="sol-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sol-vol">{t('sol.volume')}</label>
            <input id="sol-vol" data-testid="sol-vol" inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sol-stock">{t('sol.stock')}</label>
            <select id="sol-stock" data-testid="sol-stock" value={stock} onChange={(e) => setStock(Number(e.target.value))}>
              {STOCKS[sub].concentrated.map((c) => <option key={c} value={c}>{n(c, 2)} %</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sol-dil">{t('sol.diluent')}</label>
            <select id="sol-dil" data-testid="sol-dil" value={diluent} onChange={(e) => setDiluent(Number(e.target.value))}>
              {STOCKS[sub].diluents.map((c) => <option key={c} value={c}>{c === 0 ? t('sol.water') : n(c, 2) + ' %'}</option>)}
            </select>
          </div>
        </div>
        {m && !m.ok && <p className="flag flag-warning" role="alert">{t(m.reason === 'range' ? 'sol.err.range' : 'sol.err.volume', { lo: n(diluent, 2), hi: n(stock, 2) })}</p>}
        {m?.ok && T !== undefined && V !== undefined && (
          <div data-testid="sol-result">
            <div className="mix-result">
              <div className="mix-part"><span>{t('sol.takeStock', { c: n(stock, 2) })}</span><strong data-testid="sol-stock-ml">{n(m.stockMl, 1)} {t('unit.ml')}</strong></div>
              <span aria-hidden="true">+</span>
              <div className="mix-part"><span>{t('sol.takeDiluent', { c: diluent === 0 ? t('sol.water') : n(diluent, 2) + ' %' })}</span><strong data-testid="sol-dil-ml">{n(m.diluentMl, 1)} {t('unit.ml')}</strong></div>
              <span aria-hidden="true">=</span>
              <div className="mix-part"><span>{n(T, 2)} %</span><strong>{n(V, 0)} {t('unit.ml')}</strong></div>
            </div>
            <svg viewBox="0 0 320 34" className="chart mixbar" role="img" aria-label={t('sol.bar.aria', { a: Math.round((m.stockMl / V) * 100) })}>
              <rect x={8} y={6} width={((m.stockMl / V) * 304) || 0} height={20} className="fp-deficit" />
              <rect x={8 + (m.stockMl / V) * 304} y={6} width={(m.diluentMl / V) * 304} height={20} className="fp-maintenance" />
            </svg>
            <p className="formula">{t('sol.formula', { v: n(V, 0), t: n(T, 2), d: n(diluent, 2), s: n(stock, 2), r: n(m.stockMl, 1) })}</p>
            <p>
              {sub === 'nacl' && <>{t('sol.nacl.result', { mmol: n(naclMmolPerL(T), 0), total: n((naclMmolPerL(T) * V) / 1000, 1) })} </>}
              {osm !== undefined && t('sol.osm', { osm: n(osm, 0) })}
            </p>
            {osm !== undefined && peripheral < osm && <p className="flag flag-warning" role="note">{t('sol.osm.high', { lim: peripheral })}</p>}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="gir-h">
        <h3 id="gir-h">{t('sol.gir.title')}</h3>
        <p className="formula">{t('sol.gir.formula')}</p>
        <div className="grid">
          <div className="field"><label htmlFor="g-w">{t('sol.weight')}</label><input id="g-w" data-testid="gir-w" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></div>
          <div className="field"><label htmlFor="g-p">{t('sol.gir.conc')}</label><input id="g-p" data-testid="gir-p" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></div>
          <div className="field"><label htmlFor="g-r">{t('sol.gir.rate')}</label><input id="g-r" data-testid="gir-r" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <div className="field"><label htmlFor="g-t">{t('sol.gir.target')}</label><input id="g-t" data-testid="gir-t" inputMode="decimal" value={tg} onChange={(e) => setTg(e.target.value)} /></div>
        </div>
        <dl className="details">
          <div><dt>{t('sol.gir.now')}</dt><dd data-testid="gir-now">{girNow === undefined ? '—' : n(girNow, 2)} {t('unit.mgKgMin')}</dd></div>
          <div><dt>{t('sol.gir.need')}</dt><dd data-testid="gir-need">{rateNeed === undefined ? '—' : n(rateNeed, 1)} {t('unit.mlh')}</dd></div>
        </dl>
      </section>

      <section className="card" aria-labelledby="na-h">
        <h3 id="na-h">{t('sol.na.title')}</h3>
        <p className="formula">{t('sol.na.formula')}</p>
        <div className="grid">
          <div className="field"><label htmlFor="n-m">{t('sol.na.mmol')}</label><input id="n-m" data-testid="na-mmol" inputMode="decimal" value={mmol} onChange={(e) => setMmol(e.target.value)} /></div>
          <div className="field">
            <label htmlFor="n-p">{t('sol.na.conc')}</label>
            <select id="n-p" data-testid="na-pct" value={mmolPct} onChange={(e) => setMmolPct(e.target.value)}>
              {[0.9, 3, 5.85, 10, 23.4].map((c) => <option key={c} value={String(c)}>{n(c, 2)} %</option>)}
            </select>
          </div>
        </div>
        <p data-testid="na-ml">{mlForMmol === undefined ? '—' : t('sol.na.result', { ml: n(mlForMmol, 1), per: n(naclMmolPerL(MP!) / 1000, 3) })}</p>
      </section>
      <p className="muted small">{t('sol.note')}</p>
    </div>
  );
}
