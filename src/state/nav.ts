import type { TabId } from '../types/models.ts';
import { buildPath } from '../services/routes.ts';
import { navigate } from './router.ts';

/** Navega para uma aba a partir de qualquer componente. */
export function goToTab(t: TabId): void {
  navigate(buildPath(t));
}

/** Abre um deck específico na aba Decks. */
export function openDeck(deckId: string): void {
  navigate(buildPath('decks', deckId));
}

/** Fecha o deck aberto e volta para a lista de decks. */
export function closeDeck(): void {
  navigate(buildPath('decks'));
}
