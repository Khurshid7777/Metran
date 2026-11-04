import type { BankCase } from '../modules/common/bank';
import { load, save } from './index';

const KEY = 'customCases';

/** Cases written in the editor; they live in this browser until exported. */
export const getCustomCases = (): BankCase[] => load<BankCase[]>(KEY, []);

export function saveCustomCases(list: BankCase[]): boolean {
  return save(KEY, list);
}

/** Merges imported cases by id (imported wins). Returns the merged list and how many were new. */
export function mergeCases(current: BankCase[], incoming: BankCase[]): { list: BankCase[]; added: number } {
  const byId = new Map(current.map((c) => [c.id, c]));
  let added = 0;
  for (const c of incoming) {
    if (!byId.has(c.id)) added++;
    byId.set(c.id, c);
  }
  return { list: [...byId.values()], added };
}

/** Minimal shape check for imported JSON; the core re-validates the answer on load. */
export function isBankCase(x: unknown): x is BankCase {
  if (!x || typeof x !== 'object') return false;
  const c = x as Partial<BankCase>;
  return (
    typeof c.id === 'string' &&
    typeof c.ageCategory === 'string' &&
    typeof c.sampleType === 'string' &&
    typeof c.level === 'number' &&
    typeof c.values?.pH === 'number' &&
    typeof c.values?.pCO2 === 'number' &&
    typeof c.expected?.primary === 'string' &&
    Array.isArray(c.expected?.secondary) &&
    typeof c.vignette === 'object' && c.vignette !== null
  );
}
