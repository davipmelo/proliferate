import type { Card } from '../types/models.ts';
import { mainType, TYPE_ORDER } from '../types/cardRules.ts';

export type SortKey = 'name' | 'cmc' | 'type' | 'set' | 'rarity' | 'price' | 'quantity' | 'date';
export const SORT_LABELS: Record<SortKey, string> = {
  name: 'Nome',
  cmc: 'Custo',
  type: 'Tipo',
  set: 'Edição',
  rarity: 'Raridade',
  price: 'Preço',
  quantity: 'Quantidade',
  date: 'Data de inclusão',
};

const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3, special: 4, bonus: 5 };

export interface Sortable {
  card: Card;
  quantity?: number;
  date?: string;
}

export function compareBy(key: SortKey): (a: Sortable, b: Sortable) => number {
  const byName = (a: Sortable, b: Sortable) => a.card.name.localeCompare(b.card.name);
  switch (key) {
    case 'cmc':
      return (a, b) => a.card.cmc - b.card.cmc || byName(a, b);
    case 'type':
      return (a, b) => TYPE_ORDER.indexOf(mainType(a.card.typeLine)) - TYPE_ORDER.indexOf(mainType(b.card.typeLine)) || byName(a, b);
    case 'set':
      return (a, b) => (a.card.setName ?? '').localeCompare(b.card.setName ?? '') || (parseInt(a.card.collectorNumber ?? '0') - parseInt(b.card.collectorNumber ?? '0'));
    case 'rarity':
      return (a, b) => (RARITY_RANK[b.card.rarity ?? ''] ?? -1) - (RARITY_RANK[a.card.rarity ?? ''] ?? -1) || byName(a, b);
    case 'price':
      return (a, b) => (b.card.priceUsd ?? -1) - (a.card.priceUsd ?? -1) || byName(a, b);
    case 'quantity':
      return (a, b) => (b.quantity ?? 0) - (a.quantity ?? 0) || byName(a, b);
    case 'date':
      return (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || byName(a, b);
    default:
      return byName;
  }
}

/** Busca textual simples em nome (inglês/português), tipo e edição. */
export function matchesText(card: Card, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hay = `${card.name} ${card.namePt ?? ''} ${card.typeLine} ${card.setName ?? ''} ${card.setCode ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return needle.split(/\s+/).every((t) => hay.includes(t));
}
