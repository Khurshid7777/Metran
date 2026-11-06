import { useState } from 'react';
import normsJson from '../../content/norms.json';
import { planPN, type PnGroup, type PnInput } from '../../core/parenteral';
import { kclMmolMl } from '../../core/solutions';
import { parseLocaleNumber } from '../../core/units';
import { useApp } from '../../store';
import { useT } from '../common/useT';

const GROUPS: PnGroup[] = ['preterm', 'term_neonate', 'child', 'adult'];
const PN = normsJson.pn;

type Fields = { weight: string; aa: string; lipid: string; gir: string; fluid: string; na: string; k: string; aaPct: string; lipidPct: string; glucosePct: string; naStock: string; kStock: string };

/** Maintenance, mL/kg/day, by Holliday–Segar (4-2-1) for the body weight. */
function maintenancePerKg(w: number): number {
  let rest = w;
  let mlh = 0;
  for (const [kg, rate] of normsJson.deficits.hollidaySegar) {
    const part = Math.min(rest, kg);
    mlh += part * rate;
    rest -= part;
    if (rest <= 0) break;
  }
  return Math.round(((mlh * 24) / w) * 10) / 10;
}

function defaults(group: PnGroup, weight: number, kclPct: number): Fields {
  const d = PN.defaults[group] as { aa: number; lipid: number; gir: number; fluid?: number; na: number; k: number };
  return {
    weight: String(weight),
    aa: String(d.aa),
    lipid: String(d.lipid),
    gir: String(d.gir),
    fluid: String(d.fluid ?? maintenancePerKg(weight)),
    na: String(d.na),
    k: String(d.k),
    aaPct: String(PN.products.aaPct),
    lipidPct: String(PN.products.lipidPct),
    glucosePct: String(PN.products.glucoseStocks[0]),
    naStock: PN.stocks.na[0].id,
    kStock: String(kclPct),
  };
}

const START_WEIGHT: Record<PnGroup, number> = { preterm: 1.5, term_neonate: 3.2, child: 20, adult: 70 };
const num = (s: string) => {
  const v = parseLocaleNumber(s);
  return Number.isNaN(v) ? undefined : v;
};
const WARN_SEVERITY: Record<string, 'flag-warning' | 'flag-info'> = { energy_low: 'flag-info', energy_high: 'flag-info' };

/** Parenteral-nutrition calculator: targets per kg → volumes of the products, energy, glucose load and limit checks. */
export function PnTool() {
  const { t, n } = useT();
  const kclPct = useApp((s) => s.settings.kclPct);
  const [group, setGroup] = useState<PnGroup>('term_neonate');
  const [f, setF] = useState<Fields>(() => defaults('term_neonate', START_WEIGHT.term_neonate, kclPct));
  const kclOptions = [...new Set([4, 3, 7.5, kclPct])].sort((a, b) => a - b);
  const set = (k: keyof Fields, v: string) => setF((x) => ({ ...x, [k]: v }));
  const pick = (g: PnGroup) => {
    setGroup(g);
    setF(defaults(g, START_WEIGHT[g], kclPct));
  };

  const v = {
    weight: num(f.weight), aa: num(f.aa), lipid: num(f.lipid), gir: num(f.gir), fluid: num(f.fluid), na: num(f.na), k: num(f.k),
    aaPct: num(f.aaPct), lipidPct: num(f.lipidPct), glucosePct: num(f.glucosePct),
  };
  const valid = Object.values(v).every((x) => x !== undefined && x >= 0) && (v.weight ?? 0) > 0 && (v.aaPct ?? 0) > 0 && (v.lipidPct ?? 0) > 0 && (v.glucosePct ?? 0) > 0;
  const input: PnInput | null = valid
    ? {
        group, weightKg: v.weight!, aa: v.aa!, lipid: v.lipid!, gir: v.gir!, fluid: v.fluid!, na: v.na!, k: v.k!,
        aaPct: v.aaPct!, lipidPct: v.lipidPct!, glucosePct: v.glucosePct!,
        naMmolMl: PN.stocks.na.find((s) => s.id === f.naStock)!.mmolMl,
        kMmolMl: kclMmolMl(Number(f.kStock)),
      }
    : null;
  const r = input ? planPN(input) : null;

  const fieldRow = (key: keyof Fields, label: string, unit: string) => (
    <div className="field" key={key}>
      <label htmlFor={'pn-' + key}>{label} <span className="unit">{unit}</span></label>
      <input id={'pn-' + key} data-testid={'pn-' + key} inputMode="decimal" value={f[key]} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  const rows = r && input
    ? [
        { id: 'aa', g: r.aa.g, ml: r.aa.ml, kcal: r.aa.kcal },
        { id: 'glucose', g: r.glucose.g, ml: r.glucose.ml, kcal: r.glucose.kcal },
        { id: 'lipid', g: r.lipid.g, ml: r.lipid.ml, kcal: r.lipid.kcal },
      ]
    : [];

  return (
    <div data-testid="pn-tool">
      <section className="card" aria-labelledby="pn-h">
        <h3 id="pn-h">{t('pn.title')}</h3>
        <p className="disclaimer" role="note">{t('pn.disclaimer')}</p>
        <div className="chip-row" role="radiogroup" aria-label={t('field.ageCategory')}>
          {GROUPS.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={group === g} className={'chip' + (group === g ? ' on' : '')} onClick={() => pick(g)} data-testid={'pn-g-' + g}>
              {t('age.' + g)}
            </button>
          ))}
        </div>
        <div className="grid">
          {fieldRow('weight', t('pn.weight'), t('unit.kg'))}
          {fieldRow('aa', t('pn.aa'), t('unit.gKgDay'))}
          {fieldRow('lipid', t('pn.lipid'), t('unit.gKgDay'))}
          {fieldRow('gir', t('pn.gir'), t('unit.mgKgMin'))}
          {fieldRow('fluid', t('pn.fluid'), t('unit.mlKgDay'))}
          {fieldRow('na', t('pn.na'), t('unit.mmolKgDay'))}
          {fieldRow('k', t('pn.k'), t('unit.mmolKgDay'))}
        </div>
        <details>
          <summary>{t('pn.products')}</summary>
          <div className="grid">
            {fieldRow('aaPct', t('pn.aaPct'), '%')}
            {fieldRow('lipidPct', t('pn.lipidPct'), '%')}
            <div className="field">
              <label htmlFor="pn-glucosePct">{t('pn.glucosePct')} <span className="unit">%</span></label>
              <select id="pn-glucosePct" data-testid="pn-glucosePct" value={f.glucosePct} onChange={(e) => set('glucosePct', e.target.value)}>
                {PN.products.glucoseStocks.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pn-naStock">{t('pn.naStock')}</label>
              <select id="pn-naStock" value={f.naStock} onChange={(e) => set('naStock', e.target.value)}>
                {PN.stocks.na.map((s) => <option key={s.id} value={s.id}>{t('pn.stock.' + s.id)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pn-kStock">{t('pn.kStock')}</label>
              <select id="pn-kStock" value={f.kStock} onChange={(e) => set('kStock', e.target.value)}>
                {kclOptions.map((c) => <option key={c} value={String(c)}>{t('pn.stock.kcl', { c: n(c, 2), mm: n(kclMmolMl(c), 2) })}</option>)}
              </select>
            </div>
          </div>
        </details>
      </section>

      {!r && <p className="flag flag-warning" role="alert">{t('pn.err')}</p>}
      {r && input && (
        <section className="card" aria-labelledby="pn-res" data-testid="pn-result">
          <h3 id="pn-res">{t('pn.result')}</h3>
          <table className="values pn-table">
            <thead>
              <tr><th scope="col">{t('pn.component')}</th><th scope="col">{t('unit.g')}</th><th scope="col">{t('unit.ml')}</th><th scope="col">{t('unit.kcal')}</th></tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <th scope="row"><span className={'sw pn-sw-' + x.id} aria-hidden="true" /> {t('pn.row.' + x.id)}</th>
                  <td>{n(x.g, 1)}</td><td data-testid={'pn-ml-' + x.id}>{n(x.ml, 1)}</td><td>{n(x.kcal, 0)}</td>
                </tr>
              ))}
              <tr><th scope="row">{t('pn.row.na')}</th><td>{n(r.na.mmol, 1)} {t('unit.mmolAbs')}</td><td>{n(r.na.ml, 1)}</td><td>—</td></tr>
              <tr><th scope="row">{t('pn.row.k')}</th><td>{n(r.k.mmol, 1)} {t('unit.mmolAbs')}</td><td>{n(r.k.ml, 1)}</td><td>—</td></tr>
              <tr className={r.waterMl < 0 ? 'bad-row' : ''}><th scope="row">{t('pn.row.water')}</th><td>—</td><td data-testid="pn-water">{n(r.waterMl, 1)}</td><td>—</td></tr>
              <tr className="total"><th scope="row">{t('pn.row.total')}</th><td>—</td><td data-testid="pn-total">{n(r.totalMl, 0)}</td><td data-testid="pn-kcal">{n(r.kcalPerDay, 0)}</td></tr>
            </tbody>
          </table>

          <svg viewBox="0 0 320 54" className="chart" role="img" aria-label={t('pn.bar.aria', { a: Math.round(r.shares.aa), g: Math.round(r.shares.glucose), l: Math.round(r.shares.lipid) })}>
            <rect x={8} y={8} width={(r.shares.aa / 100) * 304} height={22} className="pn-aa" />
            <rect x={8 + (r.shares.aa / 100) * 304} y={8} width={(r.shares.glucose / 100) * 304} height={22} className="pn-glucose" />
            <rect x={8 + ((r.shares.aa + r.shares.glucose) / 100) * 304} y={8} width={(r.shares.lipid / 100) * 304} height={22} className="pn-lipid" />
            <text x={8} y={48} className="tick">{t('pn.shares')}</text>
          </svg>

          <dl className="details">
            <div><dt>{t('pn.kcalKg')}</dt><dd data-testid="pn-kcalkg">{n(r.kcalPerKg, 0)} {t('unit.kcalKgDay')}</dd></div>
            <div><dt>{t('pn.rate')}</dt><dd>{n(r.mlPerHour, 1)} {t('unit.mlh')}</dd></div>
            <div><dt>{t('pn.glucoseConc')}</dt><dd>{n(r.glucosePct, 1)} %</dd></div>
            <div><dt>{t('pn.osm')}</dt><dd>{n(r.osm, 0)} {t('unit.mosmL')}</dd></div>
          </dl>
          {r.warnings.length > 0 && (
            <ul className="flags">
              {r.warnings.map((w) => <li key={w} className={'flag ' + (WARN_SEVERITY[w] ?? 'flag-warning')}>{t('pn.warn.' + w)}</li>)}
            </ul>
          )}
          <details>
            <summary>{t('pn.calc')}</summary>
            <ul className="calc-lines">
              <li>{t('pn.calc.aa', { a: n(input.aa, 2), w: n(input.weightKg, 1), g: n(r.aa.g, 1), c: n(input.aaPct, 0), ml: n(r.aa.ml, 1) })}</li>
              <li>{t('pn.calc.glucose', { gir: n(input.gir, 1), w: n(input.weightKg, 1), g: n(r.glucose.g, 1), c: n(input.glucosePct, 0), ml: n(r.glucose.ml, 1) })}</li>
              <li>{t('pn.calc.lipid', { l: n(input.lipid, 2), w: n(input.weightKg, 1), g: n(r.lipid.g, 1), c: n(input.lipidPct, 0), ml: n(r.lipid.ml, 1) })}</li>
              <li>{t('pn.calc.energy', { aa: n(r.aa.kcal, 0), gl: n(r.glucose.kcal, 0), li: n(r.lipid.kcal, 0), tot: n(r.kcalPerDay, 0) })}</li>
              <li>{t('pn.calc.water', { tot: n(r.totalMl, 0), w: n(r.waterMl, 1) })}</li>
            </ul>
          </details>
        </section>
      )}
      <p className="muted small">{t('pn.sources')}</p>
    </div>
  );
}
