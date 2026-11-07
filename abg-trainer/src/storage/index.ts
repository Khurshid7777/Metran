/** localStorage wrapper: every read/write is guarded; if storage is unavailable the app keeps working. */

const PREFIX = 'abg-trainer:';
let available: boolean | null = null;

export function storageAvailable(): boolean {
  if (available !== null) return available;
  try {
    const k = PREFIX + '__probe';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): boolean {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}

/** Everything the app keeps in this browser, as one object (for a backup file). */
export function exportAll(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(PREFIX) || k === PREFIX + '__probe') continue;
      try {
        out[k.slice(PREFIX.length)] = JSON.parse(window.localStorage.getItem(k) ?? 'null');
      } catch {
        /* unreadable entry skipped */
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out;
}

/** Restores a backup made by exportAll; returns the number of keys written. */
export function importAll(data: Record<string, unknown>): number {
  let n = 0;
  for (const [k, v] of Object.entries(data)) if (/^[\w.-]+$/.test(k) && save(k, v)) n++;
  return n;
}
