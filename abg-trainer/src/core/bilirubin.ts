import type { Ctx, Flag } from './types';

export type Curve = [number, number][];

export interface BiliAssessment {
  source: 'maisels' | 'aap2022' | 'aap2022_missing';
  ga: number;
  value: number;
  hours?: number;
  /** Threshold curves in µmol/L over hours of life (flat for Maisels operational thresholds). */
  photo?: Curve;
  exchange?: Curve;
  photoNow?: number;
  exchangeNow?: number;
  flags: Flag[];
}

/** Linear interpolation on a curve of [hour, value] points; clamps outside the range. */
export function interpolate(curve: Curve, h: number): number {
  if (h <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [h1, v1] = curve[i];
    if (h <= h1) {
      const [h0, v0] = curve[i - 1];
      return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Bilirubin thresholds: < 35 weeks — Maisels 2012 bands; ≥ 35 weeks — AAP 2022 tables from norms.json when present. */
export function assessBilirubin(ctx: Ctx): BiliAssessment | undefined {
  const { input, norms } = ctx;
  if (input.bilirubin === undefined || (input.ageCategory !== 'preterm' && input.ageCategory !== 'term_neonate')) return undefined;
  const ga = input.gestationalWeeks ?? (input.ageCategory === 'term_neonate' ? 39 : 34);
  const b = input.bilirubin;
  const flags: Flag[] = [];
  const hours = input.ageHours;
  const riskFactors = Boolean(input.biliRisk);

  if (ga < 35) {
    const bands = norms.labs.bilirubinPreterm;
    const band = bands.find((x) => ga < x.gaMax) ?? bands[bands.length - 1];
    // Maisels gives ranges; the lower end is used (and is mandatory with risk factors)
    const photoV = band.photo[0];
    const exV = band.exchange[0];
    const p = { b, photo: `${band.photo[0]}–${band.photo[1]}`, ex: `${band.exchange[0]}–${band.exchange[1]}` };
    if (b >= exV) flags.push({ code: 'bili_exchange', severity: 'critical', params: p });
    else if (b >= photoV) flags.push({ code: 'bili_photo', severity: 'warning', params: p });
    else flags.push({ code: 'bili_below_preterm', severity: 'info', params: p });
    return {
      source: 'maisels',
      ga,
      value: b,
      hours,
      photo: [[0, photoV], [168, photoV]],
      exchange: [[0, exV], [168, exV]],
      photoNow: photoV,
      exchangeNow: exV,
      flags,
    };
  }

  const aap = norms.labs.bilirubinAAP2022 as unknown as {
    verified: boolean;
    photo: Record<'noRisk' | 'risk', Record<string, Curve>>;
    exchange: Record<'noRisk' | 'risk', Record<string, Curve>>;
    escalationMargin: number;
  };
  const key = String(Math.min(40, Math.max(35, Math.floor(ga))));
  const set = riskFactors ? 'risk' : 'noRisk';
  const riskKey = riskFactors ? String(Math.min(38, Number(key))) : key;
  const photo = aap.photo[set][riskKey];
  const exchange = aap.exchange[set][riskKey];
  if (!aap.verified || !photo?.length || !exchange?.length || hours === undefined) {
    flags.push({ code: 'bili_aap', severity: 'info', params: { b, h: hours ?? '—' } });
    return { source: 'aap2022_missing', ga, value: b, hours, flags };
  }
  const photoNow = interpolate(photo, hours);
  const exchangeNow = interpolate(exchange, hours);
  const p = { b, photo: Math.round(photoNow), ex: Math.round(exchangeNow), h: hours };
  if (b >= exchangeNow) flags.push({ code: 'bili_aap_exchange', severity: 'critical', params: p });
  else if (b >= exchangeNow - aap.escalationMargin) flags.push({ code: 'bili_aap_escalation', severity: 'critical', params: p });
  else if (b >= photoNow) flags.push({ code: 'bili_aap_photo', severity: 'warning', params: p });
  else flags.push({ code: 'bili_aap_below', severity: 'info', params: p });
  return { source: 'aap2022', ga, value: b, hours, photo, exchange, photoNow, exchangeNow, flags };
}
