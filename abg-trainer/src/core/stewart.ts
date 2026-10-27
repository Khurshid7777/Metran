import type { Ctx, Flag, Step } from './types';

export interface StewartComponents {
  naCl: number;
  albumin: number;
  lactate: number;
  uma: number;
  SIDa?: number;
}

/** Step 8: simplified Fencl–Story partitioning of SBE (advanced mode). */
export function stewartStep(ctx: Ctx): { step: Step; components?: StewartComponents } {
  const { input, norms, settings } = ctx;
  if (!settings.advanced) {
    return { step: { id: 'stewart', status: 'disabled', explanationKey: 'step.stewart.disabled', flags: [], details: {} } };
  }
  if (input.BE === undefined || input.Na === undefined || input.Cl === undefined || input.albumin === undefined) {
    return { step: { id: 'stewart', status: 'insufficient', explanationKey: 'step.stewart.insufficient', flags: [], details: {} } };
  }
  const s = norms.stewart;
  const flags: Flag[] = [];
  const naCl = input.Na - input.Cl - s.naClRef;
  const albumin = s.albuminFactor * (s.albuminRef - input.albumin);
  const lactate = input.lactate === undefined ? 0 : -input.lactate;
  if (input.lactate === undefined) flags.push({ code: 'stewart_no_lactate', severity: 'info' });
  const uma = input.BE - (naCl + albumin + lactate);
  if (uma < s.umaThreshold) flags.push({ code: 'unmeasured_anions', severity: 'warning', params: { uma: Math.round(uma * 10) / 10 } });
  let SIDa: number | undefined;
  if (input.K !== undefined) {
    SIDa = input.Na + input.K + (input.iCa ?? 0) + (input.Mg ?? 0) - input.Cl - (input.lactate ?? 0);
  }
  const components: StewartComponents = { naCl, albumin, lactate, uma, SIDa };
  return {
    components,
    step: {
      id: 'stewart',
      status: 'done',
      value: uma,
      normalRange: [s.umaThreshold, -s.umaThreshold],
      verdict: uma < s.umaThreshold ? 'unmeasured_anions' : 'no_unmeasured_anions',
      explanationKey: 'step.stewart.result',
      flags,
      details: { naCl, albumin, lactate, uma, SIDa, SBE: input.BE },
    },
  };
}
