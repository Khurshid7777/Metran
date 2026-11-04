import { create } from 'zustand';
import type { AgeCategory, SampleType } from '../../core/types';
import type { UnitId } from '../../core/units';
import { load, save } from '../../storage';

export const SAMPLES: SampleType[] = ['arterial', 'venous', 'capillary', 'cord_artery', 'cord_vein'];
export const AGES: AgeCategory[] = ['preterm', 'term_neonate', 'child', 'adult'];

/** Example for the quick form: only the fields shown there, a metabolic acidosis with a raised anion gap. */
export const QUICK_EXAMPLE: Record<string, string> = { pH: '7.33', pCO2: '35', pO2: '85', BE: '-7', HCO3: '18', K: '4.2', Na: '140', Cl: '110', glucose: '6', lactate: '3.1' };

/** Example for the detailed form: an adult in intensive care with a raised-anion-gap acidosis, ketosis, ventilation and a paired venous sample. */
export const ADVANCED_EXAMPLE: Record<string, string> = {
  pH: '7.28', pCO2: '30', HCO3: '14', BE: '-10', Na: '138', K: '5.4', Cl: '106', albumin: '22', lactate: '4.2', glucose: '14', urea: '12',
  iCa: '1.05', Mg: '0.8', phosphate: '1.4', weightKg: '70', ageYears: '55', temperature: '37.5', pO2: '92', SpO2: '96', SaO2: '96',
  FiO2: '0.4', MAP: '12', PEEP: '6', PIP: '24', VE: '8', heightCm: '175', Hb: '105', ScvO2: '68', pvO2: '38', pvCO2: '44',
  cardiacOutput: '5.2', bhb: '5',
};

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
