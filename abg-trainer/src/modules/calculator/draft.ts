import { create } from 'zustand';
import type { AgeCategory, SampleType } from '../../core/types';
import type { UnitId } from '../../core/units';
import { load, save } from '../../storage';

export const SAMPLES: SampleType[] = ['arterial', 'venous', 'capillary', 'cord_artery', 'cord_vein'];
export const AGES: AgeCategory[] = ['preterm', 'term_neonate', 'child', 'adult'];

export type Units = { gas: UnitId; albumin: UnitId; glucose: UnitId; urea: UnitId };
export type VentMode = 'none' | 'conventional' | 'hfo';

/** The analysis being entered — shared by the quick and the detailed form so switching keeps the values. */
interface Draft {
  values: Record<string, string>;
  /** No default: the analyzer assumes arterial, so the user must choose explicitly. */
  sampleType: SampleType | null;
  ageCategory: AgeCategory;
  bpd: boolean;
  ventMode: VentMode;
  units: Units;
  set: (name: string, v: string) => void;
  setValues: (v: Record<string, string>) => void;
  setSample: (s: SampleType) => void;
  setAge: (a: AgeCategory) => void;
  setBpd: (b: boolean) => void;
  setVentMode: (m: VentMode) => void;
  setUnits: (u: Units) => void;
  reset: () => void;
}

export const useDraft = create<Draft>((set) => ({
  values: {},
  sampleType: null,
  ageCategory: load<AgeCategory>('lastAge', 'adult'),
  bpd: false,
  ventMode: 'none',
  units: { gas: 'mmHg', albumin: 'g/L', glucose: 'mmol/L', urea: 'mmol/L' },
  set: (name, v) => set((s) => ({ values: { ...s.values, [name]: v } })),
  setValues: (values) => set({ values }),
  setSample: (sampleType) => set({ sampleType }),
  setAge: (ageCategory) => {
    save('lastAge', ageCategory);
    set({ ageCategory });
  },
  setBpd: (bpd) => set({ bpd }),
  setVentMode: (ventMode) => set({ ventMode }),
  setUnits: (units) => set({ units }),
  reset: () => set({ values: {}, sampleType: null, bpd: false, ventMode: 'none' }),
}));
