import { create } from 'zustand';
import type { SeriesEntry } from '../../core/series';
import type { AbgInput } from '../../core/types';
import { getSeries, updateSeries } from '../../storage/series';

interface SeriesState {
  entries: SeriesEntry[];
  add: (input: AbgInput) => void;
  setTime: (id: string, iso: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/** Repeated samples of one patient (kept in this browser only). */
export const useSeries = create<SeriesState>((set, get) => ({
  entries: getSeries(),
  add: (input) => set({ entries: updateSeries([...get().entries, { id: Date.now().toString(36), time: new Date().toISOString(), input }].slice(-24)) }),
  setTime: (id, iso) => set({ entries: updateSeries(get().entries.map((e) => (e.id === id ? { ...e, time: iso } : e))) }),
  remove: (id) => set({ entries: updateSeries(get().entries.filter((e) => e.id !== id)) }),
  clear: () => set({ entries: updateSeries([]) }),
}));
