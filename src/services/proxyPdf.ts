// PDF direto com jsPDF (carregado sob demanda) — mesmo layout da impressão pelo navegador.
import type { ProxySettings } from '../types/models.ts';
import { CARD_H, CARD_W, CORNER_RADIUS, footerText, lineStyle, PAGE_H, PAGE_W, paginate, ROWS, COLS, sheetLines, slotPosition, type Slot } from './proxyLayout.ts';
import { loadImage } from './image.ts';

const PX_PER_MM = 745 / CARD_W; // ~11,8 px/mm (≈300 DPI)

/** Prepara a imagem da carta (recorte de sangria + cantos) como JPEG em data URL. */
async function prepareImage(slot: Slot, s: ProxySettings, cache: Map<string, string>): Promise<string> {
  const key = `${slot.image}|${slot.trimBleed && s.trimBleed}|${s.cornerFill}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const img = await loadImage(slot.image);
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (slot.trimBleed && s.trimBleed) {
    const bx = sw * (0.125 / 2.75);
    const by = sh * (0.125 / 3.75);
    sx = bx;
    sy = by;
    sw -= 2 * bx;
    sh -= 2 * by;
  }
  const W = Math.round(CARD_W * PX_PER_MM);
  const H = Math.round(CARD_H * PX_PER_MM);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  if (s.cornerFill !== 'none') {
    ctx.fillStyle = s.cornerFill === 'black' ? '#000' : '#fff';
    ctx.fillRect(0, 0, W, H);
    const r = CORNER_RADIUS * PX_PER_MM;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, r);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    ctx.restore();
  } else {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  }
  const url = c.toDataURL('image/jpeg', 0.9);
  cache.set(key, url);
  return url;
}

export async function generateProxyPdf(slots: Slot[], s: ProxySettings, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pages = paginate(slots);
  const cache = new Map<string, string>();
  let done = 0;
  const failed: string[] = [];
  for (let p = 0; p < pages.length; p++) {
    if (p > 0) doc.addPage('a4', 'portrait');
    const page = pages[p];
    for (let i = 0; i < page.length; i++) {
      const { x, y } = slotPosition(i);
      try {
        const data = await prepareImage(page[i], s, cache);
        doc.addImage(data, 'JPEG', x, y, CARD_W, CARD_H, undefined, 'FAST');
      } catch {
        failed.push(page[i].name);
        doc.setDrawColor('#999999');
        doc.setLineWidth(0.3);
        doc.rect(x, y, CARD_W, CARD_H);
        doc.setFontSize(9);
        doc.text(page[i].name, x + CARD_W / 2, y + CARD_H / 2, { align: 'center', maxWidth: CARD_W - 6 });
      }
      onProgress?.(++done, slots.length);
    }
    const rowsUsed = Math.min(ROWS, Math.ceil(page.length / COLS));
    for (const l of sheetLines(s, rowsUsed)) {
      const st = lineStyle(s, l.kind);
      doc.setDrawColor(st.color);
      doc.setLineWidth(st.width);
      doc.setLineDashPattern(st.dash ?? [], 0);
      doc.line(l.x1, l.y1, l.x2, l.y2);
    }
    doc.setLineDashPattern([], 0);
    if (s.footer) {
      doc.setFontSize(7);
      doc.setTextColor('#777777');
      doc.text(footerText(p + 1, pages.length, page.length), PAGE_W / 2, PAGE_H - 4, { align: 'center' });
    }
  }
  if (failed.length) console.warn('Imagens que falharam no PDF:', failed);
  return doc.output('blob');
}
