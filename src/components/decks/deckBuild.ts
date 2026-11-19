import type { Card, DeckCard, DeckCategory } from '../../types/models.ts';
import { canBeCommander, hasPartner, namesMatch } from '../../types/cardRules.ts';
import { uid } from '../../services/normalize.ts';
import type { ResolvedEntry } from '../../services/importer.ts';

/**
 * Monta as cartas do deck a partir de entradas resolvidas, reaproveitando a arte e o vínculo
 * com a coleção de cartas já existentes (quando a lista não especifica a edição).
 */
export function buildDeckCards(resolved: ResolvedEntry[], existing: DeckCard[] = []): DeckCard[] {
  const out: DeckCard[] = [];
  for (const r of resolved) {
    if (r.entry.section === 'token') continue;
    const category = r.entry.section as DeckCategory;
    const prev = !r.entry.set ? existing.find((e) => namesMatch(e.card.name, r.card.name)) : undefined;
    const card: Card = prev?.card ?? r.card;
    const same = out.find((o) => o.card.id === card.id && o.category === category && !!o.isFoil === !!r.entry.foil);
    if (same) same.quantity += r.entry.quantity;
    else
      out.push({
        instanceId: uid('dc'),
        card,
        quantity: r.entry.quantity,
        category,
        collectionItemId: prev?.collectionItemId,
        isFoil: r.entry.foil || prev?.isFoil || undefined,
      });
  }
  return out;
}

/**
 * Lista colada sem seção de comandante: se a primeira carta (1 cópia) pode ser comandante, ela é o
 * comandante; se a segunda também puder e ambas tiverem Partner, ela vira o parceiro.
 */
export function detectCommanderFromList(resolved: ResolvedEntry[]): { commander?: Card; partner?: Card; consumed: number } {
  const main = resolved.filter((r) => r.entry.section === 'main');
  if (resolved.some((r) => r.entry.section === 'commander')) return { consumed: 0 };
  const first = main[0];
  if (!first || first.entry.quantity !== 1 || !canBeCommander(first.card)) return { consumed: 0 };
  const second = main[1];
  if (second && second.entry.quantity === 1 && canBeCommander(second.card) && hasPartner(first.card) && hasPartner(second.card)) {
    return { commander: first.card, partner: second.card, consumed: 2 };
  }
  return { commander: first.card, consumed: 1 };
}
