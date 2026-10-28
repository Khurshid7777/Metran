import { describe, expect, it } from 'vitest';
import normsJson from '../../src/content/norms.json';
import { interpret } from '../../src/core/interpret';
import { interpolate } from '../../src/core/bilirubin';
import type { AbgInput } from '../../src/core/types';

const adult = (v: Partial<AbgInput>): AbgInput => ({ pH: 7.4, pCO2: 40, sampleType: 'arterial', ageCategory: 'adult', ...v });
const work = (v: Partial<AbgInput>, s = { advanced: true, agWithK: false }) => interpret(adult(v), s).workings;
const find = (w: ReturnType<typeof work>, key: string) => w.find((x) => x.key === key);

describe('формулы с подставленными значениями', () => {
  it('Винтерс, AG, AG_корр, Δ/Δ (кейс 6 ТЗ)', () => {
    const w = work({ pH: 7.33, pCO2: 35, HCO3: 18, Na: 140, Cl: 110, albumin: 20 });
    expect(find(w, 'consistency')).toBeDefined();
    expect(find(w, 'metAcid')!.params).toMatchObject({ HCO3: 18, exp: 35, lo: 33, hi: 37, pCO2: 35 });
    expect(find(w, 'ag')!.params).toMatchObject({ Na: 140, Cl: 110, HCO3: 18, ag: 12 });
    expect(find(w, 'agCorr')!.params).toMatchObject({ ag: 12, alb: 20, v: 17 });
    expect(find(w, 'delta')!.params).toMatchObject({ agc: 17, base: 12, HCO3: 18, v: 0.83 });
  });
  it('расчётный HCO3, метаболический алкалоз с копенгагенской проверкой, респираторный', () => {
    expect(find(work({ pH: 7.4, pCO2: 40 }), 'hco3Calc')!.params.v).toBe(24.5);
    const alk = work({ pH: 7.465, pCO2: 44.1, HCO3: 31.3, BE: 7.3 });
    expect(find(alk, 'metAlk')!.params.exp).toBe(42.9);
    expect(find(alk, 'copenAlk')!.params.v).toBe(44.4);
    expect(find(work({ pH: 7.25, pCO2: 60, HCO3: 26 }), 'respAcid')!.params).toMatchObject({ a: 26, c: 31 });
    expect(find(work({ pH: 7.55, pCO2: 25, HCO3: 21 }), 'respAlk')).toBeDefined();
    expect(find(work({ pH: 7.28, pCO2: 26, HCO3: 12, BE: -14 }), 'copenAcid')!.params.v).toBe(26);
  });
  it('AG с K⁺, осмолярный разрыв, Стюарт, оксигенация, ctO2', () => {
    expect(find(work({ Na: 140, K: 4, Cl: 104, HCO3: 24 }, { advanced: false, agWithK: true }), 'agK')!.params.ag).toBe(16);
    expect(find(work({ Na: 140, glucose: 5, urea: 5, measuredOsm: 310 }), 'osm')!.params).toMatchObject({ calc: 290, gap: 20 });
    expect(find(work({ pH: 7.2, pCO2: 30, Na: 140, Cl: 115, albumin: 20, lactate: 4, BE: -15 }), 'stewart')!.params).toMatchObject({ naCl: -13, albE: 5.5, uma: -3.5 });
    const ox = work({ FiO2: 0.5, pO2: 100, PEEP: 8, MAP: 15, SpO2: 94, Hb: 150, SaO2: 97 });
    expect(find(ox, 'PAO2')!.params.v).toBe(285);
    expect(find(ox, 'Aa')!.params.v).toBe(185);
    expect(find(ox, 'PF')!.params.v).toBe(200);
    expect(find(ox, 'OI')!.params.v).toBe(7.5);
    expect(find(ox, 'SF')!.params.v).toBe(188);
    expect(find(ox, 'OSI')!.params.v).toBe(8);
    expect(find(ox, 'ctO2')!.params).toMatchObject({ Hb: 15, sO2: 97 });
  });
  it('лечение: бикарбонат, ЧД, K⁺, Ca²⁺', () => {
    const n = interpret({ pH: 7.28, pCO2: 26, HCO3: 12, BE: -14, Na: 140, Cl: 118, albumin: 40, sampleType: 'arterial', ageCategory: 'term_neonate', weightKg: 3, K: 2.6, iCa: 1.0 });
    expect(n.workings.find((x) => x.key === 'bicarb')!.params).toMatchObject({ f: 0.3, w: 3, BE: -14, def: 12.6, dose: 6.3, vol: 12.6 });
    expect(n.workings.find((x) => x.key === 'kPed')!.params).toMatchObject({ dose: 1.5, rate: 0.6, h: 2.5 });
    expect(n.workings.find((x) => x.key === 'caPed')!.params).toMatchObject({ ml: 1.5, mg: 150 });
    expect(find(work({ pH: 7.25, pCO2: 60, HCO3: 26, ventilation: { mode: 'conventional', rate: 14 } }), 'vent')!.params).toMatchObject({ raw: 18.7, next: 19 });
    expect(find(work({ pH: 7.4, pCO2: 40, HCO3: 24, K: 2.6, weightKg: 70 }), 'kAdult')).toBeDefined();
  });
});

describe('дефициты', () => {
  it('Na⁺ (Adrogué–Madias) с ограничением 8 ммоль/л за сутки', () => {
    const r = interpret(adult({ Na: 120, weightKg: 70 }));
    const d = r.deficits.find((x) => x.id === 'sodium')!;
    expect(d.amount).toBeCloseTo(0.6 * 70 * 15);
    expect(d.first24h).toBeCloseTo(0.6 * 70 * 8);
    expect(r.workings.find((x) => x.key === 'sodium')!.params).toMatchObject({ v: 630, first: 336 });
  });
  it('свободная вода при гипернатриемии; новорождённый — 0,75 л/кг', () => {
    const d = interpret(adult({ Na: 160, weightKg: 70 })).deficits.find((x) => x.id === 'freeWater')!;
    expect(d.amount).toBeCloseTo(0.6 * 70 * (160 / 140 - 1));
    expect(d.first24h).toBeCloseTo(0.6 * 70 * (160 / 150 - 1));
    const n = interpret({ pH: 7.35, pCO2: 40, sampleType: 'capillary', ageCategory: 'term_neonate', Na: 152, weightKg: 3 }).deficits[0];
    expect(n.tbwFactor).toBe(0.75);
  });
  it('Cl⁻ только при метаболическом алкалозе; без веса — нет дефицитов', () => {
    expect(interpret(adult({ pH: 7.51, pCO2: 46, HCO3: 36, Cl: 90, weightKg: 70 })).deficits.find((x) => x.id === 'chloride')!.amount).toBeCloseTo(140);
    expect(interpret(adult({ Cl: 90, weightKg: 70 })).deficits.map((d) => d.id)).toEqual(['maintenance']);
    expect(interpret(adult({ Na: 120 })).deficits).toEqual([]);
  });
});

describe('билирубин', () => {
  it('интерполяция кривой порогов', () => {
    const c: [number, number][] = [[0, 100], [24, 200], [48, 260]];
    expect(interpolate(c, -1)).toBe(100);
    expect(interpolate(c, 12)).toBe(150);
    expect(interpolate(c, 36)).toBe(230);
    expect(interpolate(c, 100)).toBe(260);
  });
  it('≥ 35 нед: пока таблицы AAP 2022 не внесены — отсылка к номограмме', () => {
    expect(normsJson.labs.bilirubinAAP2022.verified).toBe(false);
    const r = interpret({ pH: 7.35, pCO2: 40, sampleType: 'capillary', ageCategory: 'term_neonate', bilirubin: 250, ageHours: 48 });
    expect(r.bilirubin!.source).toBe('aap2022_missing');
  });
  it('≥ 35 нед: с внесёнными таблицами — пороги по часам (тестовые числа, не клинические)', () => {
    const norms = structuredClone(normsJson) as typeof normsJson;
    const aap = norms.labs.bilirubinAAP2022 as unknown as { verified: boolean; photo: Record<string, Record<string, number[][]>>; exchange: Record<string, Record<string, number[][]>> };
    aap.verified = true;
    aap.photo.noRisk['39'] = [[0, 100], [48, 300]];
    aap.exchange.noRisk['39'] = [[0, 200], [48, 400]];
    aap.photo.risk['38'] = [[0, 80], [48, 250]];
    aap.exchange.risk['38'] = [[0, 180], [48, 350]];
    const base = { pH: 7.35, pCO2: 40, sampleType: 'capillary' as const, ageCategory: 'term_neonate' as const, ageHours: 24, gestationalWeeks: 39 };
    const codes = (b: number, extra = {}) => interpret({ ...base, bilirubin: b, ...extra }, undefined, norms).flags.map((f) => f.code);
    expect(codes(150)).toContain('bili_aap_below');
    expect(codes(220)).toContain('bili_aap_photo');
    expect(codes(280)).toContain('bili_aap_escalation');
    expect(codes(310)).toContain('bili_aap_exchange');
    expect(codes(200, { biliRisk: true })).toContain('bili_aap_photo');
    expect(interpret({ ...base, bilirubin: 150 }, undefined, norms).bilirubin!.photoNow).toBe(200);
  });
});
