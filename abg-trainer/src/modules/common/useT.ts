import { useCallback } from 'react';
import { fmt, translate, type Params } from '../../i18n';
import { useApp } from '../../store';

export function useT() {
  const lang = useApp((s) => s.lang);
  const t = useCallback((key: string, params?: Params) => translate(lang, key, params), [lang]);
  const n = useCallback((v: number | undefined, digits = 1) => fmt(lang, v, digits), [lang]);
  return { t, n, lang };
}
