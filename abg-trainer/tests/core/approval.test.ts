import { describe, expect, it } from 'vitest';
import registry from '../../src/content/approval.json';
import norms from '../../src/content/norms.json';
import { approvalSummary, pathValue, type ApprovalRecord, type RegistryItem } from '../../src/core/approval';

const items = registry as RegistryItem[];

describe('лист утверждения норм: реестр', () => {
  it('каждый путь реестра существует в norms.json, id уникальны', () => {
    const ids = new Set<string>();
    for (const it of items) {
      expect(ids.has(it.id), it.id).toBe(false);
      ids.add(it.id);
      for (const p of it.paths) expect(pathValue(norms, p), `${it.id}: ${p}`).not.toBeUndefined();
      if (it.source) expect(Object.keys(norms.sources), `${it.id}: источник ${it.source}`).toContain(it.source);
    }
  });

  it('каждый пункт из _assumed покрыт реестром', () => {
    const covered = (a: string) => items.some((it) => it.paths.some((p) => p === a || p.startsWith(a + '.') || a.startsWith(p + '.')));
    for (const a of norms._assumed) expect(covered(a), a).toBe(true);
  });

  it('значения, помеченные как «по памяти» или «допущение», не отмечены как подтверждённые', () => {
    for (const a of ['dka.child.severity', 'dka.effOsmHigh', 'hyperK.insulin.adult', 'pn.defaults']) {
      const it = items.find((x) => x.paths.includes(a))!;
      expect(['recalled', 'assumed']).toContain(it.status);
    }
  });
});

describe('лист утверждения норм: сводка', () => {
  const v = '2026-test';
  const rec = (by: string, date: string, version = v): ApprovalRecord => ({ by, date, version });

  it('пока ничего не отмечено — не утверждено; «не загружено» не требуется', () => {
    const s = approvalSummary(items, {}, v);
    expect(s.complete).toBe(false);
    expect(s.required).toBe(items.filter((i) => i.status !== 'missing').length);
    expect(s.pendingIds).not.toContain('bilirubinAAP');
  });

  it('утверждено, когда отмечены все требуемые пункты; последняя запись — самая поздняя', () => {
    const rs: Record<string, ApprovalRecord> = {};
    items.filter((i) => i.status !== 'missing').forEach((i, n) => (rs[i.id] = rec('Проф. Тестов', n === 3 ? '2026-11-09' : '2026-11-08')));
    const s = approvalSummary(items, rs, v);
    expect(s.complete).toBe(true);
    expect(s.last).toMatchObject({ by: 'Проф. Тестов', date: '2026-11-09' });
  });

  it('утверждение другой версии норм не засчитывается', () => {
    const rs: Record<string, ApprovalRecord> = {};
    items.filter((i) => i.status !== 'missing').forEach((i) => (rs[i.id] = rec('A', '2026-11-08', 'old')));
    const s = approvalSummary(items, rs, v);
    expect(s.complete).toBe(false);
    expect(s.approved).toBe(0);
    expect(s.stale).toBe(s.required);
  });
});
