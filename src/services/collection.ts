// Coleção derivada dos decks: mostra exatamente as cartas que estão nos decks,
// agrupando cópias da mesma arte/impressão (lógica pura).
import type { Card, Deck, DeckCategory } from '../types/models.ts';
import { stripImageSize } from '../types/cardRules.ts';

export interface CollectionDeckRef {
  deckId: string;
  deckName: string;
  quantity: number;
}

export interface CollectionEntry {
  /** Chave estável: arte + foil. */
  key: string;
  card: Card;
  quantity: number;
  isFoil: boolean;
  decks: CollectionDeckRef[];
}

/** Categorias que contam como "cartas do deck" (o "Talvez" fica de fora). */
export const COLLECTION_CATEGORIES: DeckCategory[] = ['commander', 'partner', 'companion', 'main', 'sideboard'];

/** Identidade da arte: id do Scryfall ou URL da imagem para artes próprias/MPCFill. */
export function artKey(card: Card): string {
  const custom = card.artSource === 'mpcfill' || card.artSource === 'custom' || /^(mpc|custom)-/.test(card.id);
  return custom ? `img:${stripImageSize(card.images.normal ?? card.images.large ?? card.id)}` : `id:${card.id}`;
}

export function entryKey(card: Card, isFoil?: boolean): string {
  return `${artKey(card)}|${isFoil ? 'f' : 'n'}`;
}

export function deriveCollection(decks: Deck[]): CollectionEntry[] {
  const map = new Map<string, CollectionEntry>();
  for (const deck of decks) {
    for (const dc of deck.cards) {
      if (!COLLECTION_CATEGORIES.includes(dc.category)) continue;
      const foil = !!(dc.isFoil || dc.card.isFoil);
      const key = entryKey(dc.card, foil);
      let e = map.get(key);
      if (!e) {
        e = { key, card: dc.card, quantity: 0, isFoil: foil, decks: [] };
        map.set(key, e);
      }
      e.quantity += dc.quantity;
      const ref = e.decks.find((d) => d.deckId === deck.id);
      if (ref) ref.quantity += dc.quantity;
      else e.decks.push({ deckId: deck.id, deckName: deck.name, quantity: dc.quantity });
    }
  }
  return [...map.values()];
}

export interface CollectionSummary {
  total: number;
  unique: number;
  value: number;
  foil: number;
}

export function summarize(entries: CollectionEntry[]): CollectionSummary {
  let total = 0;
  let value = 0;
  let foil = 0;
  for (const e of entries) {
    total += e.quantity;
    value += (e.card.priceUsd ?? 0) * e.quantity;
    if (e.isFoil) foil += e.quantity;
  }
  return { total, unique: entries.length, value, foil };
}

/** Aplica uma alteração a todas as cópias (em todos os decks) de uma entrada da coleção. */
export function mapEntryInDecks(decks: Deck[], key: string, fn: (card: Card) => Card | null): Deck[] {
  const now = new Date().toISOString();
  return decks.map((d) => {
    let changed = false;
    const cards = d.cards.flatMap((dc) => {
      if (!COLLECTION_CATEGORIES.includes(dc.category) || entryKey(dc.card, dc.isFoil || dc.card.isFoil) !== key) return [dc];
      changed = true;
      const next = fn(dc.card);
      return next ? [{ ...dc, card: next }] : [];
    });
    if (!changed) return d;
    const commander = cards.find((c) => c.category === 'commander')?.card;
    const partner = cards.find((c) => c.category === 'partner')?.card;
    return { ...d, cards, commander, partner, updatedAt: now };
  });
}
