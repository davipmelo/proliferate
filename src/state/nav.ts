import type { TabId } from '../types/models.ts';

/** Navega para uma aba a partir de qualquer componente. */
export function goToTab(t: TabId): void {
  window.dispatchEvent(new CustomEvent('proliferate:tab', { detail: t }));
}

/** Abre um deck específico na aba Decks. */
export function openDeck(deckId: string): void {
  sessionStorage.setItem('proliferate:open-deck', deckId);
  goToTab('decks');
  window.dispatchEvent(new CustomEvent('proliferate:open-deck', { detail: deckId }));
}

/** Fecha o deck aberto e volta para a lista de decks. */
export function closeDeck(): void {
  sessionStorage.removeItem('proliferate:open-deck');
  window.dispatchEvent(new CustomEvent('proliferate:open-deck', { detail: null }));
}
