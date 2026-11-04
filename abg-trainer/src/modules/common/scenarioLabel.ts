import { SCENARIOS } from '../../core/generator';
import type { Lang } from '../../i18n';

type T = (key: string) => string;

/** Readable name of a generator scenario: its disorder type plus the start of its clinical story. */
export function scenarioLabel(id: string, t: T, lang: Lang): { type: string; story: string } | null {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) return null;
  const e = sc.expected;
  const type = [t('disorder.' + e.primary), e.chronicity ? t('chronicity.' + e.chronicity) : '', ...e.secondary.map((d) => '+ ' + t('disorder.' + d))]
    .filter(Boolean)
    .join(' ');
  const text = sc.vignette[lang];
  const story = text.length > 72 ? text.slice(0, 72).replace(/\s+\S*$/, '') + '…' : text;
  return { type, story };
}

/** Primary disorder of a scenario, for statistics by type. */
export function scenarioPrimary(id: string): string | null {
  return SCENARIOS.find((s) => s.id === id)?.expected.primary ?? null;
}
