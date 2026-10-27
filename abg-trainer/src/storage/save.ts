/**
 * Saves a generated file. Inside a claude.ai artifact the page cannot download directly,
 * so it goes through the `downloads` capability; elsewhere (file://, own hosting) a plain link is used.
 */

interface DownloadsNs {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}
type ClaudeHost = { use(name: string): Promise<unknown> };

function host(): ClaudeHost | undefined {
  return (window as unknown as { claude?: ClaudeHost }).claude;
}

let downloadsPromise: Promise<DownloadsNs | null> | null = null;
function downloads(): Promise<DownloadsNs | null> {
  const c = host();
  if (!c?.use) return Promise.resolve(null);
  downloadsPromise ??= c.use('downloads').then((d) => (d as DownloadsNs) ?? null, () => null);
  return downloadsPromise;
}

function linkDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

export async function saveFile(filename: string, data: string | Blob, mime: string): Promise<SaveOutcome> {
  const d = await downloads();
  if (d) {
    try {
      await d.save({ filename, data });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      return code === 'declined' || code === 'rate_limited' ? 'declined' : 'unavailable';
    }
  }
  linkDownload(filename, typeof data === 'string' ? new Blob([data], { type: mime }) : data);
  return 'saved';
}
