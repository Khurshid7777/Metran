import type { Ctx, Flag, Step } from './types';

export type BerlinClass = 'none' | 'mild' | 'moderate' | 'severe';

export interface OxygenationValues {
  PAO2?: number;
  Aa?: number;
  AaNorm?: number;
  PF?: number;
  berlin?: BerlinClass;
  OI?: number;
  OIClass?: string;
  OSI?: number;
  OSIClass?: string;
  SF?: number;
  /** Adult ARDS severity by S/F, global definition 2023 (when SpO2 ≤ 97%). */
  sfClass?: BerlinClass;
}

export function alveolarPO2(FiO2: number, Patm: number, PaCO2: number, water = 47, rq = 0.8): number {
  return FiO2 * (Patm - water) - PaCO2 / rq;
}

export function sfClass(sf: number, g: { SFmild: number; SFmoderate: number; SFsevere: number }): BerlinClass {
  if (sf <= g.SFsevere) return 'severe';
  if (sf <= g.SFmoderate) return 'moderate';
  if (sf <= g.SFmild) return 'mild';
  return 'none';
}

export function berlinClass(pf: number, b: { mild: number; moderate: number; severe: number }): BerlinClass {
  if (pf <= b.severe) return 'severe';
  if (pf <= b.moderate) return 'moderate';
  if (pf <= b.mild) return 'mild';
  return 'none';
}

/** Step 9: oxygenation indices. PaO2-based indices only for an arterial sample. */
export function oxygenationStep(ctx: Ctx): { step: Step; values: OxygenationValues } {
  const { input, norms, settings } = ctx;
  const o = norms.oxygenation;
  const flags: Flag[] = [];
  const values: OxygenationValues = {};
  const arterial = input.sampleType === 'arterial';
  const age = input.ageCategory;
  const neonate = age === 'preterm' || age === 'term_neonate';

  if (input.pO2 !== undefined && !arterial) flags.push({ code: 'pao2_not_interpretable', severity: 'warning' });

  if (input.FiO2 === undefined || (input.pO2 === undefined && input.SpO2 === undefined)) {
    return { values, step: { id: 'oxygenation', status: 'insufficient', explanationKey: 'step.oxygenation.insufficient', flags, details: {} } };
  }
  const FiO2 = input.FiO2;
  const Patm = input.Patm ?? settings.patm ?? norms.defaultPatm;

  if (arterial && input.pO2 !== undefined) {
    const PaO2 = input.pO2;
    values.PAO2 = alveolarPO2(FiO2, Patm, input.pCO2, o.waterVapour, o.RQ);
    values.Aa = values.PAO2 - PaO2;
    if (age === 'adult' && FiO2 <= o.airFiO2Max && input.ageYears !== undefined) {
      values.AaNorm = input.ageYears / 4 + 4;
      if (values.Aa > values.AaNorm) flags.push({ code: 'aa_elevated', severity: 'warning' });
    }
    values.PF = PaO2 / FiO2;
    if (age === 'adult') {
      if (input.PEEP !== undefined && input.PEEP >= o.berlin.minPEEP) {
        values.berlin = berlinClass(values.PF, o.berlin);
        if (values.berlin !== 'none') flags.push({ code: 'ards_' + values.berlin, severity: 'warning' });
      } else {
        flags.push({ code: 'berlin_peep', severity: 'info' });
      }
    }
    if (input.MAP !== undefined) {
      values.OI = (input.MAP * FiO2 * 100) / PaO2;
      if (neonate) {
        if (values.OI > o.neonatalOI.considerECMO) {
          values.OIClass = 'ecmo';
          flags.push({ code: 'oi_ecmo', severity: 'critical' });
        } else if (values.OI > o.neonatalOI.considerINO) {
          values.OIClass = 'ino';
          flags.push({ code: 'oi_ino', severity: 'warning' });
        } else values.OIClass = 'below_ino';
      } else if (age === 'child') {
        values.OIClass = values.OI >= o.PALICC2.OI ? 'severe' : 'mild_moderate';
      }
    }
    if (age === 'preterm') {
      const thr = (norms.categories.preterm as { hyperoxiaFlagPaO2: number }).hyperoxiaFlagPaO2;
      if (PaO2 > thr) flags.push({ code: 'preterm_hyperoxia', severity: 'warning', params: { PaO2 } });
    }
  }

  if (age === 'preterm' && input.SpO2 !== undefined && FiO2 > o.airFiO2Max) {
    const p = norms.categories.preterm;
    if (input.SpO2 > p.hyperoxiaFlagSpO2) {
      flags.push({ code: 'preterm_hyperoxia_spo2', severity: 'warning', params: { SpO2: input.SpO2, lo: p.SpO2Target[0], hi: p.SpO2Target[1] } });
    }
  }

  if (input.SpO2 !== undefined && input.SpO2 <= o.SpO2Max) {
    values.SF = input.SpO2 / FiO2;
    if (age === 'adult' && values.berlin === undefined) {
      values.sfClass = sfClass(values.SF, o.globalARDS);
      if (values.sfClass !== 'none') flags.push({ code: 'ards_sf_' + values.sfClass, severity: 'warning' });
    }
    if (input.MAP !== undefined) {
      values.OSI = (input.MAP * FiO2 * 100) / input.SpO2;
      if (age === 'child') values.OSIClass = values.OSI >= o.PALICC2.OSI ? 'severe' : 'mild_moderate';
    }
  }

  const hasAny = Object.keys(values).length > 0;
  return {
    values,
    step: {
      id: 'oxygenation',
      status: hasAny ? 'done' : arterial ? 'insufficient' : 'disabled',
      value: values.PF ?? values.OSI ?? values.SF,
      verdict: values.berlin ?? values.sfClass ?? values.OIClass ?? values.OSIClass ?? (hasAny ? 'calculated' : 'not_applicable'),
      explanationKey: arterial ? 'step.oxygenation.arterial' : 'step.oxygenation.nonArterial',
      flags,
      details: { ...values, FiO2, Patm },
    },
  };
}
