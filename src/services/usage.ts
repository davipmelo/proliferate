// Cálculo de uso da coleção pelos decks (lógica pura).
import type { Card, CollectionItem, CollectionUsage, Deck, DeckCard } from '../types/models.ts';
import { sameArt } from '../types/cardRules.ts';

/** Localiza o item da coleção correspondente a uma carta de deck (vínculo explícito ou mesma impressão). */
export function findCollectionItemFor(
  dc: Pick<DeckCard, 'card' | 'collectionItemId' | 'isFoil'>,
  collection: CollectionItem[],
): CollectionItem | undefined {
  if (dc.collectionItemId) {
    const linked = collection.find((i) => i.id === dc.collectionItemId);
    if (linked) return linked;
  }
  return (
    collection.find((i) => sameArt(i.card, dc.card) && !!i.isFoil === !!dc.isFoil) ??
    collection.find((i) => sameArt(i.card, dc.card))
  );
}

/**
 * Para cada item da coleção: quantas cópias estão em decks, quantas estão livres e em quais decks.
 * Uma cópia física só pode estar em um deck; se vários decks usam a mesma impressão a soma pode
 * passar da quantidade possuída (disponível fica 0 e a falta é indicada pelo inUse > quantity).
 */
export function computeUsage(collection: CollectionItem[], decks: Deck[]): Map<string, CollectionUsage> {
  const map = new Map<string, CollectionUsage>();
  for (const item of collection) map.set(item.id, { inUse: 0, available: item.quantity, decks: [] });
  const byId = new Map(collection.map((i) => [i.id, i]));
  const byArt = new Map<string, CollectionItem[]>();
  for (const i of collection) {
    const k = artKey(i.card);
    const list = byArt.get(k) ?? [];
    list.push(i);
    byArt.set(k, list);
  }
  for (const deck of decks) {
    for (const dc of deck.cards) {
      if (dc.category === 'maybeboard') continue;
      let item = dc.collectionItemId ? byId.get(dc.collectionItemId) : undefined;
      if (!item) {
        const cands = byArt.get(artKey(dc.card)) ?? [];
        item = cands.find((i) => !!i.isFoil === !!dc.isFoil) ?? cands[0];
      }
      if (!item) continue;
      const u = map.get(item.id)!;
      u.inUse += dc.quantity;
      const entry = u.decks.find((d) => d.deckId === deck.id);
      if (entry) entry.quantity += dc.quantity;
      else u.decks.push({ deckId: deck.id, deckName: deck.name, quantity: dc.quantity });
    }
  }
  for (const item of collection) {
    const u = map.get(item.id)!;
    u.available = Math.max(0, item.quantity - u.inUse);
  }
  return map;
}

function artKey(card: Card): string {
  if (card.artSource === 'mpcfill' || card.artSource === 'custom' || /^(mpc|custom)-/.test(card.id)) {
    return 'img:' + (card.images.normal ?? '').replace(/=w\d+$/, '');
  }
  return 'id:' + card.id;
}

export interface CollectionSummary {
  total: number;
  available: number;
  inUse: number;
  unique: number;
  value: number;
}

export function summarizeCollection(collection: CollectionItem[], usage: Map<string, CollectionUsage>): CollectionSummary {
  let total = 0;
  let inUse = 0;
  let value = 0;
  for (const i of collection) {
    total += i.quantity;
    inUse += Math.min(i.quantity, usage.get(i.id)?.inUse ?? 0);
    value += (i.card.priceUsd ?? 0) * i.quantity;
  }
  return { total, inUse, available: total - inUse, unique: collection.length, value };
}

/** Disponibilidade de uma carta de deck na coleção (para o editor). */
export function deckCardAvailability(
  dc: DeckCard,
  collection: CollectionItem[],
  usage: Map<string, CollectionUsage>,
): { owned: number; inUse: number; status: 'ok' | 'short' | 'missing' } {
  const item = findCollectionItemFor(dc, collection);
  if (!item) return { owned: 0, inUse: 0, status: 'missing' };
  const u = usage.get(item.id);
  const inUse = u?.inUse ?? 0;
  return { owned: item.quantity, inUse, status: inUse > item.quantity ? 'short' : 'ok' };
}
