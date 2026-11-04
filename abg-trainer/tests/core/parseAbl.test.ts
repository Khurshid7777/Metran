import { describe, expect, it } from 'vitest';
import { parseAblText } from '../../src/core/parseAbl';

const PRINTOUT = `ABL800 FLEX
Patient Report
Sample type: Arterial
T\t36.8 °C
FO2(I)\t25.0 %
Blood gas values
pH\t7.465\t(7.350 - 7.450)
pCO2\t44.1 mmHg
pO2\t44.3 mmHg
pH(T)\t7.468
pCO2(T)\t43.7 mmHg
Oximetry values
ctHb 118 g/L
sO2 81.0 %
FO2Hb 78.9 %
FCOHb 1.0 %
FMetHb 0.5 %
Electrolyte values
cK+ 2.7 mmol/L
cNa+ 139 mmol/L
cCa2+ 0.86 mmol/L
cCa2+(7.4) 0.89 mmol/L
cCl- 101 mmol/L
Metabolite values
cGlu 5.7 mmol/L
cLac 1.4 mmol/L
Acid-base status
cBase(Ecf)c 7.3 mmol/L
cBase(B)c 6.9 mmol/L
cHCO3-(P,st)c 29.4 mmol/L
cHCO3-(P)c 31.3 mmol/L
Oxygen status
pO2(a)/FO2(I) 177 mmHg
`;

describe('parseAblText', () => {
  const r = parseAblText(PRINTOUT);

  it('reads the key parameters of an ABL800 printout', () => {
    expect(r.values).toMatchObject({
      pH: 7.465, pCO2: 44.1, pO2: 44.3, Hb: 118, SaO2: 81, FCOHb: 1, FMetHb: 0.5,
      K: 2.7, Na: 139, iCa: 0.86, Cl: 101, glucose: 5.7, lactate: 1.4, BE: 7.3,
      HCO3: 31.3, pO2FO2: 177, FiO2: 0.25, temperature: 36.8,
    });
  });

  it('does not take temperature-corrected, standard or pH-corrected values', () => {
    expect(r.values.HCO3).toBe(31.3);
    expect(r.values.iCa).toBe(0.86);
    expect(r.values.pH).toBe(7.465);
    expect(r.values.pCO2).toBe(44.1);
    expect(r.standardHco3Only).toBe(false);
    expect(r.beFromBlood).toBe(false);
  });

  it('works with unicode labels, decimal commas and kPa', () => {
    const p = parseAblText('pH 7,32\npCO₂ 5,2 kPa\ncHCO₃⁻(P) 18,5\ncK⁺ 4,1\ncBase(Ecf) −7,5');
    expect(p.values.pH).toBe(7.32);
    expect(p.values.pCO2).toBeCloseTo(39, 0);
    expect(p.values.HCO3).toBe(18.5);
    expect(p.values.K).toBe(4.1);
    expect(p.values.BE).toBe(-7.5);
  });

  it('converts mg/dL and g/dL', () => {
    const p = parseAblText('ctHb 11.8 g/dL\ncGlu 100 mg/dL\nctBil 10 mg/dL');
    expect(p.values.Hb).toBeCloseTo(118, 5);
    expect(p.values.glucose).toBeCloseTo(5.55, 1);
    expect(p.values.bilirubin).toBeCloseTo(171, 0);
  });

  it('warns when only the standard bicarbonate is present and falls back to cBase(B)', () => {
    const p = parseAblText('pH 7.3\npCO2 40\ncHCO3-(P,st)c 22\ncBase(B)c -3');
    expect(p.values.HCO3).toBeUndefined();
    expect(p.standardHco3Only).toBe(true);
    expect(p.values.BE).toBe(-3);
    expect(p.beFromBlood).toBe(true);
  });

  it('ignores patient data and empty input', () => {
    expect(parseAblText('').values).toEqual({});
    const p = parseAblText('Patient ID 12345678\nName: Test\nDate 04.11.2026');
    expect(p.values).toEqual({});
  });
});
