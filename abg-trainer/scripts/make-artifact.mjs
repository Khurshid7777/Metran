// Converts the single-file build (dist/index.html) into the body-only page format of a claude.ai Artifact:
// <title> and meta first, then styles, the root element and the inlined scripts. Also copies the standalone build.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
// The inlined JS itself contains strings like "<head>" or "<style>", so locate the real tags from the end:
// the build is <head> title… <script>JS</script><style>CSS</style></head><body>…</body>.
const scriptStart = html.indexOf('<script');
const scriptEnd = html.lastIndexOf('</script>') + '</script>'.length;
const headEnd = html.lastIndexOf('</head>');
const bodyStart = html.lastIndexOf('<body>') + '<body>'.length;
const bodyEnd = html.lastIndexOf('</body>');

const preamble = html.slice(0, scriptStart);
const title = preamble.match(/<title>[\s\S]*?<\/title>/)[0];
const fitSides = preamble.match(/<meta name="claude:viewport-fit-sides"[^>]*>/)?.[0] ?? '';
const script = html.slice(scriptStart, scriptEnd);
const styles = html.slice(scriptEnd, headEnd).trim();
const body = html.slice(bodyStart, bodyEnd).trim();

// Module scripts run deferred, so they may stay ahead of #root; keep them after it anyway for clarity.
const page = [title, fitSides, styles, body, script].join('\n') + '\n';

mkdirSync('release', { recursive: true });
writeFileSync('release/abg-trainer.html', html);
writeFileSync('release/abg-trainer-artifact.html', page);
console.log(`release/abg-trainer.html ${(html.length / 1024).toFixed(0)} KB; release/abg-trainer-artifact.html ${(page.length / 1024).toFixed(0)} KB`);
