import { jsPDF } from 'jspdf';
import { saveFile, type SaveOutcome } from '../storage/save';

/** All texts are translated by the caller; this module only lays them out. */
export interface CertificateData {
  heading: string;
  subtitle: string;
  name: string;
  body: string;
  details: string[];
  code: string;
  codeLabel: string;
  center: string;
  signatory: string;
  signatureLabel: string;
  disclaimer: string;
  logoDataUrl?: string;
}

const W = 1754;
const H = 1240;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Renders the certificate on a canvas (system fonts cover Cyrillic and Uzbek Latin) and wraps it into a PDF. */
export async function renderCertificateCanvas(d: CertificateData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#0b5c73';
  ctx.lineWidth = 14;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.lineWidth = 3;
  ctx.strokeRect(70, 70, W - 140, H - 140);

  if (d.logoDataUrl) {
    const img = await loadImage(d.logoDataUrl);
    if (img) {
      const h = 140;
      const w = (img.width / img.height) * h;
      ctx.drawImage(img, W / 2 - w / 2, 110, w, h);
    }
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0b5c73';
  ctx.font = `600 34px ${font}`;
  if (d.center) ctx.fillText(d.center, W / 2, 300);
  ctx.font = `700 92px ${font}`;
  ctx.fillText(d.heading, W / 2, 420);
  ctx.fillStyle = '#333';
  ctx.font = `400 36px ${font}`;
  ctx.fillText(d.subtitle, W / 2, 480);
  ctx.fillStyle = '#111';
  ctx.font = `700 64px ${font}`;
  ctx.fillText(d.name, W / 2, 600);
  ctx.font = `400 34px ${font}`;
  let y = 680;
  for (const line of wrap(ctx, d.body, W - 400)) {
    ctx.fillText(line, W / 2, y);
    y += 46;
  }
  ctx.font = `500 34px ${font}`;
  y += 10;
  for (const line of d.details) {
    ctx.fillText(line, W / 2, y);
    y += 46;
  }
  ctx.textAlign = 'left';
  ctx.font = `400 28px ${font}`;
  ctx.fillStyle = '#333';
  ctx.fillText(`${d.codeLabel}: ${d.code}`, 140, H - 150);
  ctx.textAlign = 'right';
  if (d.signatory) ctx.fillText(d.signatory, W - 140, H - 150);
  ctx.beginPath();
  ctx.moveTo(W - 560, H - 200);
  ctx.lineTo(W - 140, H - 200);
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillText(d.signatureLabel, W - 140, H - 110);
  ctx.textAlign = 'center';
  ctx.font = `400 22px ${font}`;
  ctx.fillStyle = '#666';
  ctx.fillText(d.disclaimer, W / 2, H - 90);
  return canvas;
}

export async function certificatePdf(d: CertificateData): Promise<jsPDF> {
  const canvas = await renderCertificateCanvas(d);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
  pdf.setProperties({ title: d.heading + ' — ' + d.name, subject: d.code });
  return pdf;
}

export async function downloadCertificate(d: CertificateData, filename: string): Promise<SaveOutcome> {
  const pdf = await certificatePdf(d);
  return saveFile(filename, pdf.output('blob'), 'application/pdf');
}
