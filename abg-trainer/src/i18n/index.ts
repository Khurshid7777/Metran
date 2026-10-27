import ru from '../content/i18n/ru.json';
import uz from '../content/i18n/uz.json';
import en from '../content/i18n/en.json';
import { formatNumber } from '../core/units';

export type Lang = 'ru' | 'uz' | 'en';
export const LANGS: Lang[] = ['ru', 'uz', 'en'];
type Dict = Record<string, string | boolean>;
const DICTS: Record<Lang, Dict> = { ru: ru as Dict, uz: uz as Dict, en: en as Dict };

export type Params = Record<string, string | number | undefined>;

function lookup(lang: Lang, key: string): string | undefined {
  const v = DICTS[lang][key] ?? DICTS.ru[key];
  return typeof v === 'string' ? v : undefined;
}

export function hasKey(key: string): boolean {
  return typeof DICTS.ru[key] === 'string';
}

/** Shows a number with as many decimals as it carries, up to 3 (7.465 stays 7,465; 12.3 stays 12,3). */
function digitsFor(v: number): number {
  if (Number.isInteger(v)) return 0;
  for (let d = 1; d <= 3; d++) if (Math.abs(Math.round(v * 10 ** d) - v * 10 ** d) < 1e-6) return d;
  return Math.abs(v) < 10 ? 2 : 1;
}

/** Translates a key. Param values starting with '@' are keys; '|' separates a list of values. */
export function translate(lang: Lang, key: string, params?: Params): string {
  const template = lookup(lang, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined) return '';
    if (typeof v === 'number') return formatNumber(v, lang, digitsFor(v));
    if (v.includes('|') || v.startsWith('@')) {
      return v
        .split('|')
        .map((x) => (x.startsWith('@') ? translate(lang, x.slice(1)) : x))
        .join('; ');
    }
    return v;
  });
}

export function fmt(lang: Lang, v: number | undefined, digits = 1): string {
  return v === undefined ? '—' : formatNumber(v, lang, digits);
}
