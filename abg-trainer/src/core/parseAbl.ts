/**
 * Parser for text copied from a Radiometer ABL800 FLEX result screen or printout.
 * Pure: text in, numbers out. Values are returned in the core units (mmHg, mmol/L, g/L, µmol/L, %).
 * Only the parameters the calculator uses are recognised; everything else (patient data, derived
 * parameters, reference ranges) is ignored.
 */

export type AblField =
  | 'pH' | 'pCO2' | 'pO2' | 'HCO3' | 'BE' | 'Hb' | 'SaO2' | 'FCOHb' | 'FMetHb'
  | 'K' | 'Na' | 'iCa' | 'Cl' | 'Mg' | 'glucose' | 'lactate' | 'bilirubin'
  | 'FiO2' | 'pO2FO2' | 'temperature';

export interface AblParse {
  /** Core units; FiO2 as a fraction. */
  values: Partial<Record<AblField, number>>;
  /** Number of non-empty lines that were not recognised. */
  ignored: number;
  /** Only the standard bicarbonate cHCO3-(P,st) was found, which the Boston rules must not use. */
  standardHco3Only: boolean;
  /** The value was taken from cBase(B) instead of the extracellular-fluid base excess cBase(Ecf). */
  beFromBlood: boolean;
}

interface Alias {
  field: AblField;
  re: RegExp;
  /** Higher wins when a field appears twice (e.g. cBase(Ecf) over cBase(B)). */
  rank?: number;
  /** Converts the printed value given its unit text. */
  conv?: (v: number, unit: string) => number;
}

const kpa = (v: number, u: string) => (/kpa/.test(u) ? v * 7.50062 : v);
const gL = (v: number, u: string) => (/g\s*\/\s*dl/.test(u) ? v * 10 : v);
const gluc = (v: number, u: string) => (/mg\s*\/\s*dl/.test(u) ? v / 18.016 : v);
const lac = (v: number, u: string) => (/mg\s*\/\s*dl/.test(u) ? v / 9.008 : v);
const bil = (v: number, u: string) => (/mg\s*\/\s*dl/.test(u) ? v * 17.1 : v);
const frac = (v: number) => (v > 1 ? v / 100 : v);

// The label is matched at the start of the (normalised) line. The lookahead skips the
// temperature-corrected variants pH(T), pCO2(T), pO2(T).
const NOT_T = String.raw`(?![a-z0-9]|\s*\(\s*t\s*[),])`;

const ALIASES: Alias[] = [
  { field: 'pO2FO2', re: /^po2\s*\(\s*a\s*\)\s*\/\s*fo2\s*\(\s*i\s*\)/, conv: kpa },
  { field: 'FiO2', re: /^fo2\s*\(\s*i\s*\)/, conv: frac },
  { field: 'FiO2', re: /^fio2/, conv: frac },
  { field: 'pH', re: new RegExp('^(ph|\u0440\u043d)' + NOT_T) },
  { field: 'pCO2', re: new RegExp('^pco2' + NOT_T), conv: kpa },
  { field: 'pO2', re: new RegExp('^po2' + NOT_T), conv: kpa },
  { field: 'BE', re: /^cbase\s*\(\s*ecf\s*\)/, rank: 3 },
  { field: 'BE', re: /^(be|base\s*excess|\u0438\u0437\u0431\u044b\u0442\u043e\u043a\s*\u043e\u0441\u043d\u043e\u0432\u0430\u043d\u0438\u0439)(?![a-z])/, rank: 2 },
  { field: 'BE', re: /^cbase\s*\(\s*b\s*\)/, rank: 1 },
  { field: 'Hb', re: /^(cthb|thb|hgb|hb|\u0433\u0435\u043c\u043e\u0433\u043b\u043e\u0431\u0438\u043d)(?![a-z])/, conv: gL },
  { field: 'SaO2', re: /^(so2|sao2)(?![a-z0-9])/ },
  { field: 'FCOHb', re: /^fcohb/ },
  { field: 'FMetHb', re: /^fmethb/ },
  { field: 'K', re: /^(ck\+?|k\+?|\u043a\u0430\u043b\u0438\u0439)(?![a-z])/ },
  { field: 'Na', re: /^(cna\+?|na\+?|\u043d\u0430\u0442\u0440\u0438\u0439)(?![a-z])/ },
  { field: 'iCa', re: /^(cca2\+|ica|ca2\+)(?!\s*\(\s*7\.4)(?![a-z0-9])/ },
  { field: 'Cl', re: /^(ccl-?|cl-?|\u0445\u043b\u043e\u0440)(?![a-z])/ },
  { field: 'Mg', re: /^(cmg2\+|mg2\+)/ },
  { field: 'glucose', re: /^(cglu|glu|glucose|\u0433\u043b\u044e\u043a\u043e\u0437\u0430)(?![a-z])/, conv: gluc },
  { field: 'lactate', re: /^(clac|lac|lactate|\u043b\u0430\u043a\u0442\u0430\u0442)(?![a-z])/, conv: lac },
  { field: 'bilirubin', re: /^(ctbil|tbil|bilirubin|\u0431\u0438\u043b\u0438\u0440\u0443\u0431\u0438\u043d)(?![a-z])/, conv: bil },
  { field: 'temperature', re: /^(temp\w*|t|\u0442\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430)(?=[\s:=]+\d)/ },
];

/** Actual bicarbonate; the standard one has "(P,st)" or "(st)" in its label. */
const HCO3_RE = /^(chco3-?|hco3-?)/;
const HCO3_STD_RE = /^c?hco3-?\s*\(\s*p?\s*,?\s*st\s*\)/;

function normalise(line: string): string {
  return line
    .replace(/[−–—]/g, '-')
    .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080))
    .replace(/⁺/g, '+')
    .replace(/⁻/g, '-')
    .replace(/²/g, '2')
    .replace(/ /g, ' ')
    .trim()
    .toLowerCase();
}

export function parseAblText(text: string): AblParse {
  const values: Partial<Record<AblField, number>> = {};
  const rank: Partial<Record<AblField, number>> = {};
  let ignored = 0;
  let standardHco3 = false;
  let beRank = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = normalise(raw);
    if (!line) continue;
    if (HCO3_STD_RE.test(line)) {
      standardHco3 = true;
      ignored++;
      continue;
    }
    let field: AblField | undefined;
    let label = '';
    let alias: Alias | undefined;
    let r = 1;
    const h = HCO3_RE.exec(line);
    if (h) {
      field = 'HCO3';
      label = h[0];
    } else {
      for (const a of ALIASES) {
        const m = a.re.exec(line);
        if (m) {
          alias = a;
          field = a.field;
          label = m[0];
          r = a.rank ?? 1;
          break;
        }
      }
    }
    if (!field) {
      ignored++;
      continue;
    }
    const rest = line.slice(label.length);
    // The first number after the label is the measurement; reference ranges "(7.35-7.45)" follow it.
    const num = /(?:^|[\s:=)(a-z])([-+]?\d+(?:[.,]\d+)?)(?!\d)/.exec(rest);
    if (!num) {
      ignored++;
      continue;
    }
    let v = Number(num[1].replace(',', '.'));
    const unit = rest.slice(num.index + num[0].length).trim();
    if (alias?.conv) v = alias.conv(v, unit);
    if (field === 'BE') beRank = Math.max(beRank, r);
    if ((rank[field] ?? 0) >= r) continue;
    values[field] = v;
    rank[field] = r;
  }

  return { values, ignored, standardHco3Only: standardHco3 && values.HCO3 === undefined, beFromBlood: beRank === 1 };
}
