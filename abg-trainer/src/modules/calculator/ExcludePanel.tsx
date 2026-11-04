import { EXCLUDABLE, excludedSet } from '../../core/exclusions';
import { useApp } from '../../store';
import { useT } from '../common/useT';

const GROUPS: { id: string; keys: string[] }[] = [
  { id: 'steps', keys: [...EXCLUDABLE.steps] },
  { id: 'metrics', keys: EXCLUDABLE.metrics.map((g) => 'm.' + g) },
  { id: 'blocks', keys: [...EXCLUDABLE.blocks] },
];

/** Switches off calculations whose inputs were not measured or are not trusted; they are then neither computed nor shown. */
export function ExcludePanel() {
  const { t } = useT();
  const exclude = useApp((s) => s.settings.exclude);
  const update = useApp((s) => s.updateSettings);
  const off = excludedSet({ exclude });
  const toggle = (key: string, on: boolean) => update({ exclude: on ? [...exclude.filter((k) => k !== key), key] : exclude.filter((k) => k !== key) });

  return (
    <details className="card exclude-panel" data-testid="exclude-panel">
      <summary>
        {t('exclude.title')}
        {off.size > 0 && <span className="badge" data-testid="exclude-count"> {off.size}</span>}
      </summary>
      <p className="muted small">{t('exclude.hint')}</p>
      {GROUPS.map((g) => (
        <fieldset key={g.id}>
          <legend>{t('exclude.group.' + g.id)}</legend>
          {g.keys.map((k) => (
            <label key={k} className="check">
              <input type="checkbox" checked={off.has(k)} onChange={(e) => toggle(k, e.target.checked)} data-testid={'exclude-' + k} />
              {t('exclude.' + k)}
            </label>
          ))}
        </fieldset>
      ))}
      <div className="actions">
        <button type="button" onClick={() => update({ exclude: [] })} disabled={off.size === 0} data-testid="exclude-reset">{t('exclude.reset')}</button>
      </div>
    </details>
  );
}
