// Layout das folhas de proxies (lógica pura, em milímetros).
import type { Card, ProxyItem, ProxySettings } from '../types/models.ts';
import { backImage, frontImage, isDoubleFaced } from '../types/cardRules.ts';

export const PAGE_W = 210;
export const PAGE_H = 297;
export const CARD_W = 63;
export const CARD_H = 88;
export const COLS = 3;
export const ROWS = 3;
export const PER_PAGE = COLS * ROWS;
export const MARGIN_X = (PAGE_W - CARD_W * COLS) / 2; // 10,5 mm
export const MARGIN_Y = (PAGE_H - CARD_H * ROWS) / 2; // 16,5 mm
export const CORNER_RADIUS = 3; // mm

export interface Slot {
  key: string;
  itemId: string;
  name: string;
  face: 'front' | 'back';
  image: string;
  trimBleed: boolean;
  card: Card;
}

/** Expande a fila: quantidade × (frente + verso para dupla face). */
export function expandQueue(items: ProxyItem[], size: 'large' | 'normal' = 'large'): Slot[] {
  const out: Slot[] = [];
  for (const item of items) {
    const dfc = isDoubleFaced(item.card);
    const front = frontImage(item.card, size);
    const back = dfc ? backImage(item.card, size) : undefined;
    const bleed = !!item.card.hasBleed;
    for (let i = 0; i < item.quantity; i++) {
      out.push({ key: `${item.id}-${i}-f`, itemId: item.id, name: item.card.cardFaces?.[0]?.name ?? item.card.name, face: 'front', image: front, trimBleed: bleed, card: item.card });
      if (back) {
        // Verso customizado (MPCFill) também tem sangria; verso oficial não.
        const backBleed = bleed && !!item.card.backImage && item.card.artSource === 'mpcfill';
        out.push({ key: `${item.id}-${i}-b`, itemId: item.id, name: item.card.cardFaces?.[1]?.name ?? `${item.card.name} (verso)`, face: 'back', image: back, trimBleed: backBleed, card: item.card });
      }
    }
  }
  return out;
}

/** Divide em páginas de 9 (nunca gera página vazia). */
export function paginate<T>(slots: T[]): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < slots.length; i += PER_PAGE) pages.push(slots.slice(i, i + PER_PAGE));
  return pages;
}

export function slotPosition(index: number): { x: number; y: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS) % ROWS;
  return { x: MARGIN_X + col * CARD_W, y: MARGIN_Y + row * CARD_H };
}

/** Posições das linhas de corte (bordas da grade). */
export function cutPositions(): { xs: number[]; ys: number[] } {
  return {
    xs: Array.from({ length: COLS + 1 }, (_, i) => MARGIN_X + i * CARD_W),
    ys: Array.from({ length: ROWS + 1 }, (_, i) => MARGIN_Y + i * CARD_H),
  };
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'cut' | 'crop' | 'ruler' | 'cross';
}

/** Gera todas as linhas de uma folha conforme as configurações (mesmo para preview, impressão e PDF). */
export function sheetLines(s: ProxySettings, rowsUsed = ROWS): Line[] {
  const lines: Line[] = [];
  const { xs, ys: allYs } = cutPositions();
  const ys = allYs.slice(0, rowsUsed + 1);
  const top = ys[0];
  const bottom = ys[ys.length - 1];
  if (s.cutLines) {
    for (const x of xs) lines.push({ x1: x, y1: 0, x2: x, y2: PAGE_H, kind: 'cut' });
    for (const y of ys) lines.push({ x1: 0, y1: y, x2: PAGE_W, y2: y, kind: 'cut' });
  }
  if (s.cropMarks) {
    const L = s.cropMarkLength;
    const gap = 1; // mm de folga entre a marca e a carta
    for (const x of xs) {
      lines.push({ x1: x, y1: Math.max(0, top - gap - L), x2: x, y2: top - gap, kind: 'crop' });
      lines.push({ x1: x, y1: bottom + gap, x2: x, y2: Math.min(PAGE_H, bottom + gap + L), kind: 'crop' });
    }
    for (const y of ys) {
      lines.push({ x1: Math.max(0, xs[0] - gap - L), y1: y, x2: xs[0] - gap, y2: y, kind: 'crop' });
      lines.push({ x1: xs[xs.length - 1] + gap, y1: y, x2: Math.min(PAGE_W, xs[xs.length - 1] + gap + L), y2: y, kind: 'crop' });
    }
  }
  if (s.rulers) {
    // Régua em mm nas margens superior e esquerda.
    for (let x = 0; x <= PAGE_W; x++) {
      const len = x % 10 === 0 ? 3 : x % 5 === 0 ? 2 : 1;
      lines.push({ x1: x, y1: 0, x2: x, y2: len, kind: 'ruler' });
      lines.push({ x1: x, y1: PAGE_H, x2: x, y2: PAGE_H - len, kind: 'ruler' });
    }
    for (let y = 0; y <= PAGE_H; y++) {
      const len = y % 10 === 0 ? 3 : y % 5 === 0 ? 2 : 1;
      lines.push({ x1: 0, y1: y, x2: len, y2: y, kind: 'ruler' });
      lines.push({ x1: PAGE_W, y1: y, x2: PAGE_W - len, y2: y, kind: 'ruler' });
    }
  }
  if (s.cornerCrosses) {
    const c = 1.5;
    for (const x of xs)
      for (const y of ys) {
        lines.push({ x1: x - c, y1: y, x2: x + c, y2: y, kind: 'cross' });
        lines.push({ x1: x, y1: y - c, x2: x, y2: y + c, kind: 'cross' });
      }
  }
  return lines;
}

export function lineStyle(s: ProxySettings, kind: Line['kind']): { color: string; width: number; dash?: number[] } {
  if (kind === 'cut') {
    const w = s.cutLineWidth;
    const dash = s.cutLineStyle === 'dashed' ? [3, 2] : s.cutLineStyle === 'dotted' ? [w, w * 2.5] : undefined;
    return { color: s.cutLineColor, width: w, dash };
  }
  if (kind === 'crop') return { color: s.cropMarkColor, width: s.cropMarkWidth };
  if (kind === 'ruler') return { color: '#9a9a9a', width: 0.12 };
  return { color: s.cropMarkColor, width: Math.max(0.15, s.cropMarkWidth) };
}

// ---------- Presets ----------

export interface ProxyPreset {
  id: 'guillotine' | 'craft-knife' | 'minimal' | 'eco';
  label: string;
  hint: string;
  values: Omit<ProxySettings, 'footer' | 'trimBleed'>;
}

export const PROXY_PRESETS: ProxyPreset[] = [
  {
    id: 'guillotine',
    label: 'Guilhotina',
    hint: 'Linhas finas atravessando a folha',
    values: { cutLines: true, cutLineColor: '#9a9a9a', cutLineWidth: 0.2, cutLineStyle: 'solid', cropMarks: true, cropMarkColor: '#000000', cropMarkWidth: 0.25, cropMarkLength: 8, rulers: false, cornerCrosses: false, cornerFill: 'black' },
  },
  {
    id: 'craft-knife',
    label: 'Estilete Manual',
    hint: 'Marcas longas, réguas e cruzes',
    values: { cutLines: true, cutLineColor: '#555555', cutLineWidth: 0.3, cutLineStyle: 'dashed', cropMarks: true, cropMarkColor: '#000000', cropMarkWidth: 0.35, cropMarkLength: 12, rulers: true, cornerCrosses: true, cornerFill: 'black' },
  },
  {
    id: 'minimal',
    label: 'Minimalista',
    hint: 'Só marcas curtas nas margens',
    values: { cutLines: false, cutLineColor: '#9a9a9a', cutLineWidth: 0.15, cutLineStyle: 'solid', cropMarks: true, cropMarkColor: '#000000', cropMarkWidth: 0.2, cropMarkLength: 5, rulers: false, cornerCrosses: false, cornerFill: 'none' },
  },
  {
    id: 'eco',
    label: 'Econômico',
    hint: 'Cantos brancos, linhas pontilhadas',
    values: { cutLines: true, cutLineColor: '#bbbbbb', cutLineWidth: 0.15, cutLineStyle: 'dotted', cropMarks: true, cropMarkColor: '#777777', cropMarkWidth: 0.15, cropMarkLength: 6, rulers: false, cornerCrosses: false, cornerFill: 'white' },
  },
];

/** Detecta qual preset corresponde aos valores atuais (ou null = personalizado). */
export function detectPreset(s: ProxySettings): ProxyPreset['id'] | null {
  for (const p of PROXY_PRESETS) {
    const match = (Object.keys(p.values) as (keyof ProxyPreset['values'])[]).every((k) => {
      const a = p.values[k];
      const b = s[k];
      return typeof a === 'number' ? Math.abs(a - (b as number)) < 1e-6 : String(a).toLowerCase() === String(b).toLowerCase();
    });
    if (match) return p.id;
  }
  return null;
}

export function footerText(page: number, total: number, cards: number, date = new Date()): string {
  return `Proliferate · Folha ${page} de ${total} · ${cards} carta${cards === 1 ? '' : 's'} · 63 × 88 mm · imprimir em escala 100% · ${date.toLocaleDateString('pt-BR')}`;
}
