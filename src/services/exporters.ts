// Exportação de decks e coleção (lógica pura).
import type { Deck, DeckCard, DeckCategory } from '../types/models.ts';
import { CATEGORY_LABELS } from '../types/models.ts';

export type ExportFormat = 'arena' | 'moxfield' | 'ligamagic' | 'csv' | 'json';
export const EXPORT_LABELS: Record<ExportFormat, string> = {
  arena: 'MTG Arena (.txt)',
  moxfield: 'Moxfield (com edição e número)',
  ligamagic: 'LigaMagic',
  csv: 'CSV (planilha)',
  json: 'JSON (Proliferate)',
};
export const EXPORT_EXT: Record<ExportFormat, string> = { arena: 'txt', moxfield: 'txt', ligamagic: 'txt', csv: 'csv', json: 'json' };

const ORDER: DeckCategory[] = ['commander', 'partner', 'companion', 'main', 'sideboard', 'maybeboard'];

/** Nome de exportação: "Frente // Verso" vira só a frente no Arena (padrão do cliente). */
function exportName(name: string, fmt: ExportFormat): string {
  if (fmt === 'arena') return name.split(' // ')[0];
  return name;
}

function line(dc: { quantity: number; card: DeckCard['card']; isFoil?: boolean }, fmt: ExportFormat): string {
  const n = exportName(dc.card.name, fmt);
  const set = dc.card.setCode && !['mpc', 'custom'].includes(dc.card.setCode) ? dc.card.setCode.toUpperCase() : '';
  if (fmt === 'moxfield' && set && dc.card.collectorNumber) {
    return `${dc.quantity} ${n} (${set}) ${dc.card.collectorNumber}${dc.isFoil || dc.card.isFoil ? ' *F*' : ''}`;
  }
  if (fmt === 'moxfield' && dc.isFoil) return `${dc.quantity} ${n} *F*`;
  return `${dc.quantity} ${n}`;
}

function grouped(deck: Deck): Map<DeckCategory, DeckCard[]> {
  const m = new Map<DeckCategory, DeckCard[]>();
  for (const c of ORDER) m.set(c, []);
  for (const dc of deck.cards) m.get(dc.category)!.push(dc);
  for (const list of m.values()) list.sort((a, b) => a.card.name.localeCompare(b.card.name));
  return m;
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportDeck(deck: Deck, fmt: ExportFormat): string {
  const g = grouped(deck);
  if (fmt === 'json') return JSON.stringify({ app: 'proliferate', type: 'deck', deck }, null, 2);
  if (fmt === 'csv') {
    const rows = [['Quantidade', 'Nome', 'Edição', 'Número', 'Foil', 'Categoria', 'Preço USD']];
    for (const cat of ORDER)
      for (const dc of g.get(cat)!)
        rows.push([String(dc.quantity), dc.card.name, dc.card.setCode?.toUpperCase() ?? '', dc.card.collectorNumber ?? '', dc.isFoil ? 'sim' : '', cat, dc.card.priceUsd?.toFixed(2) ?? '']);
    return rows.map((r) => r.map(csvCell).join(',')).join('\n');
  }
  const out: string[] = [];
  const push = (header: string, list: DeckCard[]) => {
    if (!list.length) return;
    if (out.length) out.push('');
    out.push(header);
    for (const dc of list) out.push(line(dc, fmt));
  };
  if (fmt === 'arena') {
    push('Commander', [...g.get('commander')!, ...g.get('partner')!]);
    push('Companion', g.get('companion')!);
    push('Deck', g.get('main')!);
    push('Sideboard', g.get('sideboard')!);
  } else if (fmt === 'moxfield') {
    // Moxfield: principal sem cabeçalho; seções com "SIDEBOARD:", "COMMANDER:" etc.
    const cmd = [...g.get('commander')!, ...g.get('partner')!];
    if (cmd.length) push('COMMANDER:', cmd);
    if (g.get('companion')!.length) push('COMPANION:', g.get('companion')!);
    if (out.length) out.push('');
    for (const dc of g.get('main')!) out.push(line(dc, fmt));
    push('SIDEBOARD:', g.get('sideboard')!);
    push('MAYBEBOARD:', g.get('maybeboard')!);
  } else {
    // LigaMagic: "Qtd Nome" com seções em português.
    push('Comandante', [...g.get('commander')!, ...g.get('partner')!]);
    push('Companheiro', g.get('companion')!);
    push(CATEGORY_LABELS.main, g.get('main')!);
    push('Sideboard', g.get('sideboard')!);
  }
  return out.join('\n').trim() + '\n';
}

/** Item exportável da coleção (derivada dos decks). */
export interface ExportableEntry {
  card: DeckCard['card'];
  quantity: number;
  isFoil?: boolean;
  decks?: { deckName: string; quantity: number }[];
}

export function exportCollection(items: ExportableEntry[], fmt: ExportFormat): string {
  const sorted = items.slice().sort((a, b) => a.card.name.localeCompare(b.card.name));
  if (fmt === 'json') return JSON.stringify({ app: 'proliferate', type: 'collection', collection: sorted }, null, 2);
  if (fmt === 'csv') {
    const rows = [['Quantidade', 'Nome', 'Edição', 'Número', 'Foil', 'Preço USD', 'Decks']];
    for (const i of sorted)
      rows.push([String(i.quantity), i.card.name, i.card.setCode?.toUpperCase() ?? '', i.card.collectorNumber ?? '', i.isFoil ? 'sim' : '', i.card.priceUsd?.toFixed(2) ?? '', (i.decks ?? []).map((d) => `${d.quantity}× ${d.deckName}`).join('; ')]);
    return rows.map((r) => r.map(csvCell).join(',')).join('\n');
  }
  return sorted.map((i) => line({ quantity: i.quantity, card: i.card, isFoil: i.isFoil }, fmt)).join('\n') + '\n';
}

/** Texto simples para copiar/colar no formulário de criação de deck. */
export function deckToText(deck: Deck): string {
  return exportDeck(deck, 'moxfield');
}
