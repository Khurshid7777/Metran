import normsJson from '../../content/norms.json';
import type { InterpretationResult, StepId } from '../../core/types';
import { useT } from './useT';

const PATH: StepId[] = ['ph', 'primary', 'compensation', 'anionGap', 'deltaRatio'];
const PREFIX: Partial<Record<StepId, string>> = { primary: 'disorder.', deltaRatio: 'delta.', anionGap: 'ag.' };

/** Which block of the orientation text applies to this result. */
export function orientationCase(result: InterpretationResult): string {
  switch (result.primary) {
    case 'metabolic_acidosis':
      return result.acidosisType === 'high_ag' || result.acidosisType === 'mixed_ag' ? 'met_acid_high_ag' : result.acidosisType === 'normal_ag' ? 'met_acid_normal_ag' : 'met_acid';
    case 'metabolic_alkalosis': return 'met_alk';
    case 'respiratory_acidosis': return 'resp_acid';
    case 'respiratory_alkalosis': return 'resp_alk';
    case 'mixed_acidosis': return 'mixed_acid';
    case 'mixed_alkalosis': return 'mixed_alk';
    default: return 'none';
  }
}

/** The route through the algorithm for this analysis, as chips, with short guidance for the branch reached. */
export function OrientationCard({ result }: { result: InterpretationResult }) {
  const { t } = useT();
  const key = orientationCase(result);
  const chips = PATH.map((id) => {
    const s = result.steps.find((x) => x.id === id);
    const known = s && s.status === 'done' && s.verdict;
    return { id, label: known ? t((PREFIX[id] ?? 'verdict.') + s.verdict) : '—', known: Boolean(known), s };
  });
  const lines = [1, 2, 3].filter((i) => t(`orient.${key}.${i}`, {}) !== `orient.${key}.${i}`);
  return (
    <section className="card orient" aria-labelledby="orient-h" data-testid="orientation">
      <h3 id="orient-h">{t('orient.title')}</h3>
      <ol className="path" aria-label={t('orient.path.aria')}>
        {chips.map((c) => (
          <li key={c.id} className={c.known ? 'known' : 'unknown'}>
            <span className="path-step">{t('step.' + c.id + '.title')}</span>
            <strong>{c.label}</strong>
          </li>
        ))}
      </ol>
      <ul className="orient-lines">
        {lines.map((i) => <li key={i}>{t(`orient.${key}.${i}`, { lo: normsJson.deltaRatio.mid, hi: normsJson.deltaRatio.high })}</li>)}
      </ul>
    </section>
  );
}
