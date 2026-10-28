/** Oxygen–haemoglobin dissociation curve (Severinghaus 1979) with Bohr, CO2 and temperature corrections (Kelman). */

/** Standard p50 of adult haemoglobin at pH 7.4, pCO2 40, 37 °C (Severinghaus), mmHg. */
export const P50_STD = 26.86;

/** sO2 (fraction) for a standard-conditions pO2: S = 1 / (23400 / (P³ + 150·P) + 1). */
export function severinghaus(p: number): number {
  if (p <= 0) return 0;
  return 1 / (23400 / (p ** 3 + 150 * p) + 1);
}

/** Inverse of {@link severinghaus} by bisection: the standard pO2 that gives saturation `s` (0–1). */
export function inverseSeveringhaus(s: number): number {
  let lo = 0;
  let hi = 600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (severinghaus(mid) < s) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Virtual (standard-conditions) pO2: the pO2 the same blood would have at pH 7.4, pCO2 40, 37 °C.
 * Pv = pO2 · 10^(0.024·(37 − T) + 0.40·(pH − 7.4) + 0.06·log10(40 / pCO2)).
 */
export function virtualPO2(pO2: number, pH: number, pCO2: number, temp = 37): number {
  return pO2 * 10 ** (0.024 * (37 - temp) + 0.4 * (pH - 7.4) + 0.06 * Math.log10(40 / pCO2));
}

/** The factor that converts a standard pO2 back to the patient's conditions (curve shift). */
export function shiftFactor(pH: number, pCO2: number, temp = 37): number {
  return 1 / virtualPO2(1, pH, pCO2, temp);
}

/** Predicted saturation (%) for the patient's pO2, pH, pCO2 and temperature. */
export function predictedSO2(pO2: number, pH: number, pCO2: number, temp = 37): number {
  return severinghaus(virtualPO2(pO2, pH, pCO2, temp)) * 100;
}

/** In-vivo p50 from one measured point (pO2, sO2): p50 = 26.86 · pO2 / P_std(sO2). Valid for sO2 20–97%. */
export function p50FromPoint(pO2: number, sO2pct: number): number | undefined {
  if (sO2pct < 20 || sO2pct > 97) return undefined;
  return (P50_STD * pO2) / inverseSeveringhaus(sO2pct / 100);
}

/** Points of the curve [pO2, sO2 %] from 0 to `max`; `factor` stretches pO2 (shifted curve). */
export function odcCurve(max: number, factor = 1, step = 2): [number, number][] {
  const pts: [number, number][] = [];
  for (let p = 0; p <= max; p += step) pts.push([p, severinghaus(p / factor) * 100]);
  return pts;
}
