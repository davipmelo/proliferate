import type { Card, Deck, DeckCard } from '../../types/models.ts';
import { formatInfo } from '../../types/formats.ts';
import { frontImage } from '../../types/cardRules.ts';

/** Cartas que contam para a meta do formato (sem sideboard/maybeboard). */
export function countedCards(deck: Deck): DeckCard[] {
  return deck.cards.filter((c) => c.category !== 'sideboard' && c.category !== 'maybeboard');
}

export function deckCount(deck: Deck): number {
  return countedCards(deck).reduce((s, c) => s + c.quantity, 0);
}

export function deckTarget(deck: Deck): number {
  return formatInfo(deck.format).target;
}

export function deckValue(deck: Deck): number {
  return deck.cards.filter((c) => c.category !== 'maybeboard').reduce((s, c) => s + (c.card.priceUsd ?? 0) * c.quantity, 0);
}

/** Imagem de capa: escolhida pelo usuário, arte do comandante ou da carta mais cara. */
export function deckCoverImage(deck: Deck): string | undefined {
  if (deck.cover.image) return deck.cover.image;
  const cmd = deck.commander ?? deck.cards.find((c) => c.category === 'commander')?.card;
  if (cmd) return cmd.images.art_crop || frontImage(cmd, 'normal');
  const top = deck.cards.slice().sort((a, b) => (b.card.priceUsd ?? 0) - (a.card.priceUsd ?? 0))[0]?.card;
  return top ? top.images.art_crop || frontImage(top, 'normal') : undefined;
}

export function deckColors(deck: Deck): string[] {
  const set = new Set<string>();
  const src: Card[] = deck.commander ? [deck.commander, ...(deck.partner ? [deck.partner] : [])] : deck.cards.map((c) => c.card);
  for (const c of src) for (const x of c.colorIdentity ?? []) set.add(x);
  return ['W', 'U', 'B', 'R', 'G'].filter((c) => set.has(c));
}

/** Estilo de capa (zoom 1–3 e posição vertical 0–100%). */
export function coverStyle(deck: Pick<Deck, 'cover'>): React.CSSProperties {
  return {
    objectPosition: `50% ${deck.cover.positionY}%`,
    transform: `scale(${deck.cover.zoom})`,
    transformOrigin: `50% ${deck.cover.positionY}%`,
  };
}
