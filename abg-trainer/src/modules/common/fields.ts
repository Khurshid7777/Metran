import type { AbgInput } from '../../core/types';

/** Numeric fields of the input form, grouped. Labels come from i18n `field.<name>`, units from `unit.<id>`. */
export interface FieldDef {
  name: keyof AbgInput;
  unit?: string;
  unitGroup?: 'gas' | 'albumin' | 'glucose' | 'urea' | 'fio2';
  digits: number;
}

export const FIELD_GROUPS: { id: string; fields: FieldDef[] }[] = [
  {
    id: 'gas',
    fields: [
      { name: 'pH', digits: 2 },
      { name: 'pCO2', unitGroup: 'gas', digits: 0 },
      { name: 'HCO3', unit: 'mmol', digits: 1 },
      { name: 'BE', unit: 'mmol', digits: 0 },
    ],
  },
  {
    id: 'patient',
    fields: [
      { name: 'gestationalWeeks', unit: 'weeks', digits: 0 },
      { name: 'weightKg', unit: 'kg', digits: 1 },
      { name: 'ageYears', unit: 'years', digits: 0 },
      { name: 'temperature', unit: 'celsius', digits: 1 },
    ],
  },
  {
    id: 'electrolytes',
    fields: [
      { name: 'Na', unit: 'mmol', digits: 0 },
      { name: 'K', unit: 'mmol', digits: 1 },
      { name: 'Cl', unit: 'mmol', digits: 0 },
      { name: 'albumin', unitGroup: 'albumin', digits: 0 },
      { name: 'lactate', unit: 'mmol', digits: 1 },
      { name: 'glucose', unitGroup: 'glucose', digits: 1 },
      { name: 'urea', unitGroup: 'urea', digits: 1 },
      { name: 'measuredOsm', unit: 'mosm', digits: 0 },
      { name: 'iCa', unit: 'mmol', digits: 2 },
      { name: 'Mg', unit: 'mmol', digits: 2 },
    ],
  },
  {
    id: 'oxygenation',
    fields: [
      { name: 'pO2', unitGroup: 'gas', digits: 0 },
      { name: 'SpO2', unit: 'percent', digits: 0 },
      { name: 'SaO2', unit: 'percent', digits: 0 },
      { name: 'FiO2', unitGroup: 'fio2', digits: 2 },
      { name: 'MAP', unit: 'cmH2O', digits: 0 },
      { name: 'PEEP', unit: 'cmH2O', digits: 0 },
      { name: 'Patm', unit: 'mmHg', digits: 0 },
    ],
  },
];

export const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);

/** Unit keys displayed for a field with internal units (case values tables, results). */
export function internalUnit(f: FieldDef): string | undefined {
  switch (f.unitGroup) {
    case 'gas':
      return 'mmHg';
    case 'albumin':
      return 'gL';
    case 'glucose':
    case 'urea':
      return 'mmol';
    case 'fio2':
      return undefined;
    default:
      return f.unit;
  }
}
