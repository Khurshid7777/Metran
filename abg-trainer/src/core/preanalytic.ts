import type { Ctx, Flag } from './types';

/** Plausibility checks that point to a sampling or handling artefact rather than the patient. */
export function preanalyticFlags(ctx: Ctx, PAO2: number | undefined): Flag[] {
  const { input, norms, HCO3 } = ctx;
  const H = norms.hyperK;
  const flags: Flag[] = [];

  // Haemolysis: raised K+ with no acidosis to explain a shift out of cells
  if (input.K !== undefined && input.K >= H.pseudo.K && input.pH >= H.pseudo.pHMin && HCO3 >= H.pseudo.HCO3Min) {
    flags.push({ code: 'preanalytic_haemolysis', severity: 'warning', params: { K: input.K } });
  }
  // pO2 above the alveolar PO2 is physically impossible: air bubble or a wrong FiO2
  if (input.pO2 !== undefined && PAO2 !== undefined && input.pO2 > PAO2 + H.air.margin) {
    flags.push({ code: 'preanalytic_air', severity: 'warning', params: { pO2: Math.round(input.pO2), pAO2: Math.round(PAO2) } });
  }
  // In-vitro metabolism after a delay: glucose consumed, lactate and potassium released
  if (
    input.glucose !== undefined && input.lactate !== undefined && input.K !== undefined &&
    input.glucose < H.delay.glucose && input.lactate >= H.delay.lactate && input.K >= norms.labs.K.hyperMild
  ) {
    flags.push({ code: 'preanalytic_delay', severity: 'warning' });
  }
  return flags;
}
