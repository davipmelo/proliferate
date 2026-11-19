// Pôster do deck renderizado em canvas.
import type { Card, Deck, DeckCard } from '../types/models.ts';
import { frontImage, mainType, TYPE_ORDER } from '../types/cardRules.ts';
import { formatInfo } from '../types/formats.ts';
import { loadImage } from './image.ts';

export type PosterResolution = 'ultra' | 'high' | 'standard' | 'compact';
export type PosterAspect = 'a4-portrait' | 'a4-landscape' | '16:9' | '1:1';
export type PosterFormat = 'jpeg' | 'png' | 'pdf';
export type PosterTheme = 'dark' | 'black' | 'playmat' | 'light' | 'transparent';
export type PosterSort = 'default' | 'cmc' | 'type' | 'color' | 'name';

export interface PosterOptions {
  resolution: PosterResolution;
  aspect: PosterAspect;
  format: PosterFormat;
  quality: number; // 0.5–1 (JPEG)
  theme: PosterTheme;
  sort: PosterSort;
  groupCopies: boolean;
  highlightCommander: boolean;
  showNames: boolean;
  showHeader: boolean;
  includeSideboard: boolean;
  title: string;
  author: string;
}

export const RES_CARD_W: Record<PosterResolution, number> = { ultra: 488, high: 340, standard: 240, compact: 150 };
export const RES_LABELS: Record<PosterResolution, string> = { ultra: 'Ultra', high: 'Alta', standard: 'Padrão', compact: 'Compacta' };
export const ASPECTS: Record<PosterAspect, { label: string; ratio: number }> = {
  'a4-portrait': { label: 'A4 retrato', ratio: 210 / 297 },
  'a4-landscape': { label: 'A4 paisagem', ratio: 297 / 210 },
  '16:9': { label: '16:9', ratio: 16 / 9 },
  '1:1': { label: '1:1', ratio: 1 },
};
export const THEME_LABELS: Record<PosterTheme, string> = { dark: 'Gradiente escuro', black: 'Preto minimalista', playmat: 'Playmat (arte do deck)', light: 'Claro', transparent: 'Transparente (PNG)' };
export const SORT_LABELS: Record<PosterSort, string> = { default: 'Padrão (categoria)', cmc: 'Custo', type: 'Tipo', color: 'Cor', name: 'Nome' };

interface Tile {
  card: Card;
  qty: number;
}

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];
function colorKey(c: Card): number {
  const cols = c.colors ?? [];
  if (cols.length === 0) return 7;
  if (cols.length > 1) return 6;
  return COLOR_ORDER.indexOf(cols[0]);
}

/** Lista de cartas do pôster (pura): filtra, ordena e agrupa cópias. */
export function posterTiles(deck: Deck, o: Pick<PosterOptions, 'sort' | 'groupCopies' | 'includeSideboard' | 'highlightCommander'>): { commanders: Card[]; tiles: Tile[] } {
  const cats = ['companion', 'main', ...(o.includeSideboard ? ['sideboard'] : [])];
  const cmds = deck.cards.filter((c) => c.category === 'commander' || c.category === 'partner');
  let cards: DeckCard[] = deck.cards.filter((c) => cats.includes(c.category));
  if (!o.highlightCommander) cards = [...cmds, ...cards];
  const byName = (a: DeckCard, b: DeckCard) => a.card.name.localeCompare(b.card.name);
  const sorters: Record<PosterSort, (a: DeckCard, b: DeckCard) => number> = {
    default: () => 0,
    cmc: (a, b) => a.card.cmc - b.card.cmc || byName(a, b),
    type: (a, b) => TYPE_ORDER.indexOf(mainType(a.card.typeLine)) - TYPE_ORDER.indexOf(mainType(b.card.typeLine)) || byName(a, b),
    color: (a, b) => colorKey(a.card) - colorKey(b.card) || a.card.cmc - b.card.cmc || byName(a, b),
    name: byName,
  };
  cards = cards.slice().sort(sorters[o.sort]);
  const tiles: Tile[] = [];
  for (const dc of cards) {
    if (o.groupCopies) {
      const ex = tiles.find((t) => t.card.id === dc.card.id && t.card.images.normal === dc.card.images.normal);
      if (ex) ex.qty += dc.quantity;
      else tiles.push({ card: dc.card, qty: dc.quantity });
    } else for (let i = 0; i < dc.quantity; i++) tiles.push({ card: dc.card, qty: 1 });
  }
  return { commanders: o.highlightCommander ? cmds.map((c) => c.card) : [], tiles };
}

/** Escolhe nº de colunas que melhor preenche a proporção desejada. */
export function bestColumns(n: number, cardW: number, cardH: number, ratio: number, gap: number, headerH: number, pad: number): number {
  let best = 1;
  let bestArea = Infinity;
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    const gw = pad * 2 + cols * cardW + (cols - 1) * gap;
    const gh = pad * 2 + headerH + rows * cardH + (rows - 1) * gap;
    const W = Math.max(gw, gh * ratio);
    const area = W * (W / ratio);
    if (area < bestArea) {
      bestArea = area;
      best = cols;
    }
  }
  return best;
}

async function loadAll(urls: string[], onProgress: (d: number, t: number) => void): Promise<Map<string, HTMLImageElement | null>> {
  const map = new Map<string, HTMLImageElement | null>();
  const uniq = [...new Set(urls)];
  let i = 0;
  let done = 0;
  const worker = async () => {
    while (i < uniq.length) {
      const u = uniq[i++];
      map.set(u, await loadImage(u).catch(() => null));
      onProgress(++done, uniq.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return map;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function renderPoster(deck: Deck, o: PosterOptions, onProgress: (pct: number, msg: string) => void): Promise<HTMLCanvasElement> {
  const { commanders, tiles } = posterTiles(deck, o);
  const cw = RES_CARD_W[o.resolution];
  const ratio = ASPECTS[o.aspect].ratio;
  const scale = cw / 240;
  const gap = Math.round(10 * scale);
  const pad = Math.round(40 * scale);
  const nameH = o.showNames ? Math.round(22 * scale) : 0;
  const ch = Math.round(cw * (88 / 63));
  const cmdW = Math.round(cw * 1.7);
  const cmdH = Math.round(cmdW * (88 / 63));
  const headerTextH = o.showHeader ? Math.round(120 * scale) : 0;
  const headerH = Math.max(headerTextH, commanders.length ? cmdH + gap * 2 : 0) + (headerTextH || commanders.length ? gap * 2 : 0);

  const cols = bestColumns(tiles.length, cw, ch + nameH, ratio, gap, headerH, pad);
  const rows = Math.ceil(tiles.length / cols);
  const gridW = cols * cw + (cols - 1) * gap;
  const gridH = rows * (ch + nameH) + Math.max(0, rows - 1) * gap;
  let W = Math.max(pad * 2 + gridW, pad * 2 + commanders.length * (cmdW + gap) + 600 * scale, (pad * 2 + headerH + gridH) * ratio);
  let H = W / ratio;
  // Limite seguro de canvas (~120 MP e 16k px).
  const maxSide = 16000;
  const k = Math.min(1, maxSide / Math.max(W, H), Math.sqrt(120e6 / (W * H)));
  W = Math.round(W * k);
  H = Math.round(H * k);

  onProgress(2, 'Carregando imagens…');
  const urls = [...commanders, ...tiles.map((t) => t.card)].map((c) => frontImage(c, o.resolution === 'compact' ? 'normal' : 'large'));
  const bgArt = (deck.commander ?? tiles[0]?.card)?.images.art_crop;
  if (o.theme === 'playmat' && bgArt) urls.push(bgArt);
  const imgs = await loadAll(urls, (d, t) => onProgress(2 + (d / t) * 80, `Carregando imagens… ${d}/${t}`));

  onProgress(85, 'Desenhando…');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(k, k);
  const w = W / k;
  const h = H / k;

  // Fundo
  const light = o.theme === 'light';
  if (o.theme === 'dark' || (o.theme === 'transparent' && o.format !== 'png')) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1d1f24');
    g.addColorStop(1, '#0b0c0e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else if (o.theme === 'black') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  } else if (light) {
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(0, 0, w, h);
  } else if (o.theme === 'playmat') {
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(0, 0, w, h);
    const art = bgArt ? imgs.get(bgArt) : null;
    if (art) {
      const s = Math.max(w / art.naturalWidth, h / art.naturalHeight);
      ctx.save();
      ctx.filter = `blur(${Math.round(6 * scale)}px) brightness(0.45)`;
      ctx.drawImage(art, (w - art.naturalWidth * s) / 2, (h - art.naturalHeight * s) / 2, art.naturalWidth * s, art.naturalHeight * s);
      ctx.restore();
    }
  }

  const textColor = light ? '#16171a' : '#f2f1ec';
  const subColor = light ? '#5c5b57' : '#b4b3ae';
  const accent = '#ffbb00';

  const drawCard = (c: Card, x: number, y: number, cwid: number, chei: number) => {
    const img = imgs.get(frontImage(c, o.resolution === 'compact' ? 'normal' : 'large'));
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 12 * scale;
    ctx.shadowOffsetY = 4 * scale;
    roundRect(ctx, x, y, cwid, chei, cwid * 0.045);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x, y, cwid, chei, cwid * 0.045);
    ctx.clip();
    if (img) {
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (c.hasBleed) {
        sx = sw * (0.125 / 2.75); sy = sh * (0.125 / 3.75); sw -= sx * 2; sh -= sy * 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, cwid, chei);
    } else {
      ctx.fillStyle = '#2a2c31';
      ctx.fillRect(x, y, cwid, chei);
      ctx.fillStyle = '#ddd';
      ctx.font = `600 ${14 * scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(c.name, x + cwid / 2, y + chei / 2, cwid - 10);
    }
    ctx.restore();
  };

  // Cabeçalho
  let y = pad;
  if (headerH) {
    let tx = pad;
    if (commanders.length) {
      commanders.forEach((c, i) => {
        const x = pad + i * (cmdW + gap * 2);
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4 * scale;
        roundRect(ctx, x - 3 * scale, y - 3 * scale, cmdW + 6 * scale, cmdH + 6 * scale, cmdW * 0.05);
        ctx.stroke();
        ctx.restore();
        drawCard(c, x, y, cmdW, cmdH);
      });
      tx = pad + commanders.length * (cmdW + gap * 2) + gap;
    }
    if (o.showHeader) {
      const info = formatInfo(deck.format);
      const count = deck.cards.filter((c) => c.category !== 'sideboard' && c.category !== 'maybeboard').reduce((s, c) => s + c.quantity, 0);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = accent;
      ctx.font = `700 ${16 * scale}px system-ui, sans-serif`;
      ctx.fillText(`${info.label.toUpperCase()} · ${count} CARTAS`, tx, y + 4 * scale);
      ctx.fillStyle = textColor;
      ctx.font = `800 ${46 * scale}px system-ui, sans-serif`;
      ctx.fillText(o.title || deck.name, tx, y + 28 * scale, w - tx - pad);
      if (o.author) {
        ctx.fillStyle = subColor;
        ctx.font = `500 ${20 * scale}px system-ui, sans-serif`;
        ctx.fillText(`por ${o.author}`, tx, y + 84 * scale, w - tx - pad);
      }
    }
    y += headerH;
  }

  // Grade centralizada
  const x0 = (w - gridW) / 2;
  const top = y + Math.max(0, (h - pad - y - gridH) / 2);
  tiles.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = x0 + col * (cw + gap);
    const yy = top + row * (ch + nameH + gap);
    drawCard(t.card, x, yy, cw, ch);
    if (t.qty > 1) {
      const bw = 44 * scale;
      const bh = 26 * scale;
      ctx.save();
      roundRect(ctx, x + 8 * scale, yy + 8 * scale, bw, bh, bh / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.font = `800 ${15 * scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${t.qty}×`, x + 8 * scale + bw / 2, yy + 8 * scale + bh / 2 + 1);
      ctx.restore();
    }
    if (o.showNames) {
      ctx.fillStyle = subColor;
      ctx.font = `500 ${12 * scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(t.card.name.split(' // ')[0], x + cw / 2, yy + ch + 5 * scale, cw);
    }
  });
  // Assinatura discreta
  ctx.fillStyle = light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)';
  ctx.font = `500 ${11 * scale}px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Proliferate', w - pad / 2, h - pad / 4);
  onProgress(95, 'Exportando…');
  return canvas;
}

export async function exportPoster(canvas: HTMLCanvasElement, o: PosterOptions): Promise<Blob> {
  if (o.format === 'png') return new Promise((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error('Falha ao gerar PNG'))), 'image/png'));
  const jpeg = await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error('Falha ao gerar JPEG'))), 'image/jpeg', o.quality));
  if (o.format === 'jpeg') return jpeg;
  const { jsPDF } = await import('jspdf');
  const landscape = canvas.width > canvas.height;
  const isA4 = o.aspect.startsWith('a4');
  const wmm = isA4 ? (landscape ? 297 : 210) : 300;
  const hmm = isA4 ? (landscape ? 210 : 297) : (300 * canvas.height) / canvas.width;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: [wmm, hmm] });
  const data = await new Promise<string>((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result as string);
    fr.readAsDataURL(jpeg);
  });
  doc.addImage(data, 'JPEG', 0, 0, wmm, hmm);
  return doc.output('blob');
}
