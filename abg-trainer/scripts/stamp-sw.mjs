// Gives every build its own service-worker cache name, so devices pick up the new version.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let id = Date.now().toString(36);
try {
  id = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '-' + id;
} catch {
  /* not a git checkout */
}
const p = 'dist/sw.js';
writeFileSync(p, readFileSync(p, 'utf8').replace('__BUILD__', id));
console.log('service worker cache: abg-trainer-' + id);
