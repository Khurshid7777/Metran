import { useMemo } from 'react';
import { interpret } from '../../core/interpret';
import { analyzeSeries, TREND_KEYS } from '../../core/series';
import { coreSettings, useApp } from '../../store';
import { AcidBaseMap, TrendChart } from '../common/Charts';
import { FlagList } from '../common/ResultView';
import { useT } from '../common/useT';
import { useSeries } from './seriesStore';

const toLocal = (iso: string) => {
  const d = new Date(iso);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Repeated samples: list with editable times, path on the acid–base map, trends, Na speed and lactate clearance. */
export function SeriesCard() {
  const { t, n } = useT();
  const settings = useApp((s) => s.settings);
  const { entries, setTime, remove, clear } = useSeries();
  const sorted = useMemo(() => [...entries].sort((a, b) => a.time.localeCompare(b.time)), [entries]);
  const analysis = useMemo(() => analyzeSeries(sorted), [sorted]);
  const last = useMemo(() => (sorted.length ? interpret(sorted[sorted.length - 1].input, coreSettings(settings)) : null), [sorted, settings]);
  if (!sorted.length || !last || last.blocked) return null;
  return (
    <section className="card" aria-labelledby="series-h" data-testid="series">
      <h3 id="series-h">{t('series.title', { n: sorted.length })}</h3>
      <p className="muted small">{t('series.caption')}</p>
      <ul className="series-list">
        {/* rows keep their place while the time is edited; the number is the chronological order */}
        {entries.map((e) => (
          <li key={e.id}>
            <strong>{sorted.indexOf(e) + 1}</strong>
            <label className="sr-only" htmlFor={'st-' + e.id}>{t('series.time')}</label>
            <input id={'st-' + e.id} type="datetime-local" value={toLocal(e.time)} onChange={(ev) => ev.target.value && setTime(e.id, new Date(ev.target.value).toISOString())} />
            <span className="summary-line">
              pH {n(e.input.pH, 2)} · pCO₂ {n(e.input.pCO2, 0)}
              {e.input.HCO3 !== undefined && <> · HCO₃⁻ {n(e.input.HCO3, 1)}</>}
              {e.input.lactate !== undefined && <> · {t('chart.profile.lactate')} {n(e.input.lactate, 1)}</>}
              {e.input.Na !== undefined && <> · Na⁺ {n(e.input.Na, 0)}</>}
            </span>
            <button className="link" onClick={() => remove(e.id)}>{t('series.remove')}</button>
          </li>
        ))}
      </ul>
      {analysis.lactateClearance !== undefined && (
        <p data-testid="lactate-clearance">{t('series.lactateClearance', { v: Math.round(analysis.lactateClearance) })}</p>
      )}
      <FlagList flags={analysis.flags} />
      {sorted.length > 1 && (
        <>
          <AcidBaseMap result={last} trail={analysis.path} />
          <div className="trends">
            {TREND_KEYS.map((k) => {
              const vals = analysis.trends[k];
              if (!vals || vals.filter((v) => v !== undefined).length < 2) return null;
              const norm = last.profile.find((p) => p.id === k);
              return <TrendChart key={k} label={t('series.trend.' + k)} hours={analysis.hours} values={vals} normal={norm ? [norm.lo, norm.hi] : undefined} />;
            })}
          </div>
          <p className="muted small">{t('series.hoursAxis')}</p>
        </>
      )}
      <div className="actions">
        <button onClick={clear} data-testid="series-clear">{t('series.clear')}</button>
      </div>
    </section>
  );
}

export function AddToSeriesButton({ onAdd }: { onAdd: () => void }) {
  const { t } = useT();
  const count = useSeries((s) => s.entries.length);
  return (
    <button onClick={onAdd} data-testid="series-add">
      {t('series.add')} {count > 0 && <span className="muted">({count})</span>}
    </button>
  );
}
