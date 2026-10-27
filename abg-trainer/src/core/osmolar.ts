import type { Ctx, Flag, Step } from './types';

/** Step 7: osmolar gap = measured − (2·Na + glucose + urea). */
export function osmolarStep(ctx: Ctx): { step: Step; gap?: number } {
  const { input, norms } = ctx;
  if (input.measuredOsm === undefined || input.Na === undefined || input.glucose === undefined || input.urea === undefined) {
    return { step: { id: 'osmolar', status: 'insufficient', explanationKey: 'step.osmolar.insufficient', flags: [], details: {} } };
  }
  const calc = 2 * input.Na + input.glucose + input.urea;
  const gap = input.measuredOsm - calc;
  const flags: Flag[] = [];
  const elevated = gap > norms.osmolarGap;
  if (elevated) flags.push({ code: 'osmolar_gap', severity: 'warning', params: { gap: Math.round(gap) } });
  return {
    gap,
    step: {
      id: 'osmolar',
      status: 'done',
      value: gap,
      normalRange: [-norms.osmolarGap, norms.osmolarGap],
      verdict: elevated ? 'elevated' : 'normal',
      explanationKey: 'step.osmolar.result',
      flags,
      details: { calc, measured: input.measuredOsm },
    },
  };
}
