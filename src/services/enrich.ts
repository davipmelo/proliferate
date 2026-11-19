// Reparo de cartas com dados incompletos (ex.: importadas do MPCFill pelo v1 com tipo "Proxy Alter MPCFill").
import type { AppData, Card } from '../types/models.ts';
import { canHaveBack, frontName, normalizeName } from '../types/cardRules.ts';

const FAKE_TYPE = /^(proxy alter|verso de carta|mpcfill)/i;
const CARDBACK = /^verso de carta|cardback/i;

/** A carta precisa ter as regras completadas pelo Scryfall? (arte é preservada) */
export function needsEnrichment(card: Card): boolean {
  if (CARDBACK.test(card.typeLine ?? '') || /^card ?back$/i.test(card.name)) return false;
  return !card.typeLine?.trim() || FAKE_TYPE.test(card.typeLine);
}

/** Nome para buscar no Scryfall (remove sufixos de arquivo do MPCFill). */
export function lookupName(card: Card): string {
  return card.name.replace(/\.(png|jpe?g|webp)$/i, '').replace(/\s*[([].*?[)\]]\s*/g, ' ').trim();
}

/** Mescla os dados oficiais mantendo arte, id e marcações de arte personalizada. */
export function mergeOfficial(card: Card, official: Card): Card {
  const keepArt = card.artSource === 'mpcfill' || card.artSource === 'custom' || /^(mpc|custom)-/.test(card.id);
  return {
    ...official,
    ...(keepArt
      ? {
          id: card.id,
          images: card.images,
          artSource: card.artSource ?? (card.id.startsWith('custom-') ? 'custom' : 'mpcfill'),
          backImage: canHaveBack(official) ? card.backImage : undefined,
          hasBleed: card.hasBleed,
          setName: card.setName ?? official.setName,
          setCode: card.setCode ?? official.setCode,
          collectorNumber: card.collectorNumber,
          artist: card.artist ?? official.artist,
          // Faces mantêm o texto oficial, mas sem imagens oficiais quando há verso próprio.
          cardFaces: official.cardFaces?.map((f, i) => (i === 1 && card.backImage ? { ...f, images: undefined } : f)),
        }
      : { id: card.id, images: card.images }),
    isFoil: card.isFoil,
    namePt: card.namePt ?? official.namePt,
  };
}

/** Todas as cartas incompletas do app (nomes únicos para busca). */
export function collectIncomplete(data: AppData): string[] {
  const names = new Set<string>();
  const visit = (c?: Card) => c && needsEnrichment(c) && lookupName(c) && names.add(lookupName(c));
  data.collection.forEach((i) => visit(i.card));
  data.decks.forEach((d) => {
    visit(d.commander);
    visit(d.partner);
    d.cards.forEach((c) => visit(c.card));
  });
  data.proxies.forEach((p) => visit(p.card));
  return [...names];
}

/** Aplica os dados oficiais encontrados (por nome normalizado) a todas as cartas incompletas. */
export function applyEnrichment(data: AppData, found: Map<string, Card>): AppData {
  const fix = <T extends Card | undefined>(c: T): T => {
    if (!c || !needsEnrichment(c)) return c;
    const key = normalizeName(lookupName(c));
    const off = found.get(key) ?? found.get(frontName(lookupName(c)));
    return (off ? mergeOfficial(c, off) : c) as T;
  };
  return {
    ...data,
    collection: data.collection.map((i) => ({ ...i, card: fix(i.card) })),
    decks: data.decks.map((d) => ({ ...d, commander: fix(d.commander), partner: fix(d.partner), cards: d.cards.map((c) => ({ ...c, card: fix(c.card) })) })),
    proxies: data.proxies.map((p) => ({ ...p, card: { ...fix(p.card), ...('utilityType' in p.card ? { utilityType: p.card.utilityType } : {}) } })),
  };
}
