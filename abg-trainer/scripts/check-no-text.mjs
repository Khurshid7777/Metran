// Checks that UI code has no hard-coded text (all strings live in src/content/i18n/*.json)
// and that all three dictionaries have the same keys and placeholders.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'content') walk(p);
    } else if (/\.(tsx?|css)$/.test(name)) check(p);
  }
}

const ALLOWED_ATTR = /^(ABG-[X-]+|[A-Z0-9_\-–.:/ ]+)$/;

function check(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (/[А-Яа-яЁё]/.test(code)) problems.push(`${file}:${i + 1}: Cyrillic text in code`);
    if (!file.endsWith('.tsx')) return;
    // JSX text nodes: >Some words<
    for (const m of code.matchAll(/(?<![=-])>([^<>{}]*)</g)) {
      const s = m[1].trim();
      if (/[A-Za-z]{2,}/.test(s) && !/^[A-Za-z]+\s*[=(]/.test(s)) problems.push(`${file}:${i + 1}: JSX text "${s}"`);
    }
    for (const m of code.matchAll(/\b(aria-label|alt|title|placeholder)="([^"]*)"/g)) {
      if (/[A-Za-z]{2,}/.test(m[2]) && !ALLOWED_ATTR.test(m[2])) problems.push(`${file}:${i + 1}: literal ${m[1]}="${m[2]}"`);
    }
  });
}

walk(src);

const dicts = Object.fromEntries(
  ['ru', 'uz', 'en'].map((l) => [l, JSON.parse(readFileSync(join(src, 'content/i18n', l + '.json'), 'utf8'))]),
);
const keys = (d) => new Set(Object.keys(d).filter((k) => k !== 'reviewed'));
const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const l of ['uz', 'en']) {
  for (const k of keys(dicts.ru)) {
    if (!(k in dicts[l])) problems.push(`i18n/${l}.json: missing key ${k}`);
    else if (ph(dicts.ru[k]) !== ph(dicts[l][k])) problems.push(`i18n/${l}.json: placeholders differ for ${k}`);
  }
  for (const k of keys(dicts[l])) if (!(k in dicts.ru)) problems.push(`i18n/${l}.json: extra key ${k}`);
}
if (dicts.uz.reviewed !== true && dicts.uz.reviewed !== false) problems.push('i18n/uz.json: "reviewed" flag missing');

// literal keys used in code must exist
function walkKeys(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkKeys(p);
    else if (/\.tsx?$/.test(name)) {
      const text = readFileSync(p, 'utf8');
      for (const m of text.matchAll(/\bt\('([\w.]+)'\s*[,)]/g)) if (!(m[1] in dicts.ru)) problems.push(`${p}: unknown i18n key ${m[1]}`);
    }
  }
}
walkKeys(src);

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`OK: no hard-coded text; ${keys(dicts.ru).size} keys in ru/uz/en.`);
