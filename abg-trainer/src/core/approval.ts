/** Norm approval sheet: which thresholds need a clinical sign-off and who has given it. Pure logic. */

export type ApprovalStatus = 'checked' | 'recalled' | 'assumed' | 'missing';

export interface RegistryItem {
  id: string;
  area: string;
  status: ApprovalStatus;
  /** Dot paths into norms.json whose current values are shown for review. */
  paths: string[];
  /** Key in norms.sources with the reference text. */
  source: string | null;
}

export interface ApprovalRecord {
  by: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  note?: string;
  /** norms.version at the time of approval; an approval of another version no longer counts. */
  version: string;
}

export interface ApprovalSummary {
  /** Items that can be approved (everything except those whose source data is missing). */
  required: number;
  approved: number;
  pendingIds: string[];
  /** Approvals given for an older version of the norms. */
  stale: number;
  complete: boolean;
  /** Latest approval, when complete. */
  last?: ApprovalRecord;
}

/** Value at a dot path (`labs.K.hyperMild`); undefined when the path does not exist. */
export function pathValue(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(key in (cur as Record<string, unknown>))) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function approvalSummary(items: RegistryItem[], records: Record<string, ApprovalRecord>, version: string): ApprovalSummary {
  const required = items.filter((i) => i.status !== 'missing');
  const valid = required.filter((i) => records[i.id]?.version === version);
  const stale = required.filter((i) => records[i.id] && records[i.id].version !== version).length;
  const pendingIds = required.filter((i) => !valid.includes(i)).map((i) => i.id);
  const complete = required.length > 0 && pendingIds.length === 0;
  const last = complete ? valid.map((i) => records[i.id]).sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
  return { required: required.length, approved: valid.length, pendingIds, stale, complete, last };
}
