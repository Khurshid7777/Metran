import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCENARIOS, generateCase, GENERATOR_SETTINGS } from '../../src/core/generator';
import { interpret } from '../../src/core/interpret';
import { buildQuestions } from '../../src/modules/trainer/questions';

const ru = JSON.parse(readFileSync('src/content/i18n/ru.json', 'utf8')) as Record<string, string>;
const PREFIX: Record<string, string> = { primary: 'disorder.', deltaRatio: 'delta.', anionGap: 'ag.', osmolar: 'osm.', oxygenation: 'oxy.' };

describe('i18n: все ключи, которые выдаёт ядро, есть в словаре', () => {
  it('для кейсов всех сценариев', () => {
    const missing = new Set<string>();
    const need = (k: string) => {
      if (!(k in ru)) missing.add(k);
    };
    for (const sc of SCENARIOS) {
      for (let seed = 1; seed <= 30; seed++) {
        const c = generateCase(sc.id, seed)!;
        for (const s of [GENERATOR_SETTINGS, { advanced: false, agWithK: true }]) {
          const r = interpret(c.input, s);
          for (const st of r.steps) {
            need('step.' + st.id + '.title');
            need(st.explanationKey);
            if (st.verdict) need((PREFIX[st.id] ?? 'verdict.') + st.verdict);
            Object.keys(st.details).forEach((k) => typeof st.details[k] === 'number' && need('detail.' + k));
          }
          for (const f of r.flags) {
            need('flag.' + f.code + '.short');
            need('flag.' + f.code + '.text');
          }
          for (const p of r.summary) {
            need(p.key);
            for (const v of Object.values(p.params ?? {})) {
              if (typeof v === 'string') v.split('|').filter((x) => x.startsWith('@')).forEach((x) => need(x.slice(1)));
            }
          }
          for (const d of r.differentials) {
            need('diff.group.' + d.group);
            d.causes.forEach((x) => need('diff.cause.' + x));
            d.checks.forEach((x) => need('diff.check.' + x));
          }
          r.workings.forEach((w) => need('work.' + w.key));
          r.deficits.forEach((d) => need('deficit.' + d.id + '.title'));
          const tr = r.treatment!;
          [...tr.hfoHints, ...tr.causeHints].forEach(need);
          tr.bicarbonate?.blockers.concat(tr.bicarbonate.warnings).forEach((f) => need('flag.' + f.code + '.text'));
          for (const q of buildQuestions(c, r, 3)) {
            need(q.promptKey);
            need(q.hintKey);
            need(q.explanationKey);
            need('step.' + q.stepId + '.title');
            q.options?.forEach((o) => need(o.labelKey));
          }
        }
      }
    }
    expect([...missing]).toEqual([]);
  });
});
