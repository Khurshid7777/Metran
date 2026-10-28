import type { SeriesEntry } from '../core/series';
import { load, save } from './index';

const KEY = 'series';
const MAX = 24;

export const getSeries = (): SeriesEntry[] => load<SeriesEntry[]>(KEY, []);

export function addToSeries(e: SeriesEntry): SeriesEntry[] {
  const next = [...getSeries(), e].slice(-MAX);
  save(KEY, next);
  return next;
}

export function updateSeries(list: SeriesEntry[]): SeriesEntry[] {
  save(KEY, list);
  return list;
}
