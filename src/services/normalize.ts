// Normalização e migração de dados antigos guardados no navegador (lógica pura).
import type {
  AppData, Card, CardImages, CollectionItem, Condition, Deck, DeckCard, DeckCategory, DeckFormat,
  DeckTag, DeckToken, ProxyItem, TokenCard, UtilityCategory,
} from '../types/models.ts';
import { CONDITIONS, DECK_CATEGORIES } from '../types/models.ts';
import { FORMATS } from '../types/formats.ts';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}${rnd}`;
}

type Any = Record<string, any>;
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: unknown, d = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
};
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function normalizeImages(raw: Any | undefined, fallback?: Any): CardImages {
  const r = raw ?? {};
  const f = fallback ?? {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = r[k] ?? f[k];
      if (typeof v === 'string' && v) return v;
    }
    return undefined;
  };
  return {
    normal: pick('normal', 'imageUrl', 'image', 'png', 'large'),
    large: pick('large', 'png', 'imageUrlLarge', 'normal', 'imageUrl'),
    small: pick('small', 'imageUrlSmall', 'thumb', 'normal', 'imageUrl'),
    art_crop: pick('art_crop', 'artCrop', 'imageUrlArtCrop'),
  };
}

/** Normaliza uma carta vinda de qualquer versão antiga (ou do Scryfall cru). */
export function normalizeCard(raw: Any | undefined | null): Card {
  const r: Any = raw ?? {};
  const images = normalizeImages(r.images ?? r.image_uris, r);
  const faces = arr<Any>(r.cardFaces ?? r.card_faces).map((f) => ({
    name: str(f.name),
    manaCost: f.manaCost ?? f.mana_cost ?? undefined,
    typeLine: f.typeLine ?? f.type_line ?? undefined,
    oracleText: f.oracleText ?? f.oracle_text ?? undefined,
    power: f.power ?? undefined,
    toughness: f.toughness ?? undefined,
    colors: f.colors ?? undefined,
    images: f.images || f.image_uris ? normalizeImages(f.images ?? f.image_uris) : f.imageUrl ? normalizeImages(f) : undefined,
  }));
  if (!images.normal && faces[0]?.images) Object.assign(images, faces[0].images);
  const price = r.priceUsd ?? r.prices?.usd ?? r.price;
  const card: Card = {
    id: str(r.id, uid('card')),
    oracleId: r.oracleId ?? r.oracle_id ?? undefined,
    name: str(r.name, 'Carta sem nome'),
    namePt: r.namePt ?? r.printed_name ?? undefined,
    manaCost: r.manaCost ?? r.mana_cost ?? faces[0]?.manaCost ?? undefined,
    cmc: num(r.cmc, 0),
    typeLine: str(r.typeLine ?? r.type_line ?? faces[0]?.typeLine),
    oracleText: r.oracleText ?? r.oracle_text ?? undefined,
    colors: arr<string>(r.colors ?? faces[0]?.colors),
    colorIdentity: arr<string>(r.colorIdentity ?? r.color_identity),
    power: r.power ?? undefined,
    toughness: r.toughness ?? undefined,
    rarity: r.rarity ?? undefined,
    setCode: (r.setCode ?? r.set)?.toString().toLowerCase() || undefined,
    setName: r.setName ?? r.set_name ?? undefined,
    collectorNumber: r.collectorNumber ?? r.collector_number ?? undefined,
    images,
    priceUsd: price != null && price !== '' && Number.isFinite(Number(price)) ? Number(price) : undefined,
    isFoil: r.isFoil ? true : undefined,
    layout: r.layout ?? undefined,
    cardFaces: faces.length ? faces : undefined,
    artist: r.artist ?? undefined,
    frame: r.frame ?? undefined,
    releasedAt: r.releasedAt ?? r.released_at ?? undefined,
    meld: r.meld ?? (r.meldResultName ? { role: 'meld_part', resultName: r.meldResultName } : undefined),
    artSource: r.artSource ?? (/^mpc-/.test(str(r.id)) ? 'mpcfill' : /^custom-/.test(str(r.id)) ? 'custom' : undefined),
    backImage: r.backImage ?? undefined,
    hasBleed: r.hasBleed ?? undefined,
  };
  // Remove chaves indefinidas para economizar espaço.
  for (const k of Object.keys(card) as (keyof Card)[]) if (card[k] === undefined) delete card[k];
  return card;
}

export function normalizeTokenCard(raw: Any, fallbackType: UtilityCategory = 'token'): TokenCard {
  return { ...normalizeCard(raw), utilityType: (raw?.utilityType as UtilityCategory) ?? fallbackType };
}

export function normalizeCollectionItem(raw: Any): CollectionItem {
  const cond = str(raw?.condition, 'NM').toUpperCase() as Condition;
  return {
    id: str(raw?.id, uid('col')),
    card: normalizeCard(raw?.card ?? raw),
    quantity: Math.max(0, Math.round(num(raw?.quantity, 1))),
    isFoil: !!(raw?.isFoil ?? raw?.foil),
    condition: CONDITIONS.includes(cond) ? cond : 'NM',
    language: str(raw?.language ?? raw?.lang, 'en'),
    notes: raw?.notes ? str(raw.notes) : undefined,
    tags: arr<string>(raw?.tags).map(String),
    dateAdded: str(raw?.dateAdded ?? raw?.addedAt, new Date().toISOString()),
  };
}

function normalizeCategory(v: unknown): DeckCategory {
  const s = str(v, 'main').toLowerCase();
  if ((DECK_CATEGORIES as string[]).includes(s)) return s as DeckCategory;
  if (s === 'mainboard' || s === 'deck') return 'main';
  if (s === 'side') return 'sideboard';
  if (s === 'maybe') return 'maybeboard';
  return 'main';
}

export function normalizeDeckCard(raw: Any): DeckCard {
  return {
    instanceId: str(raw?.instanceId ?? raw?.id, uid('dc')),
    card: normalizeCard(raw?.card ?? raw),
    quantity: Math.max(1, Math.round(num(raw?.quantity, 1))),
    category: normalizeCategory(raw?.category ?? raw?.board),
    isFoil: raw?.isFoil ? true : undefined,
  };
}

/**
 * Normaliza um deck: preenche campos ausentes, junta cópias repetidas da mesma impressão
 * (mesma categoria, sem vínculo distinto) e garante comandante/parceiro na lista.
 */
export function normalizeDeck(raw: Any): Deck {
  const format: DeckFormat = (Object.keys(FORMATS) as DeckFormat[]).includes(raw?.format) ? raw.format : 'casual';
  const now = new Date().toISOString();
  const cards: DeckCard[] = [];
  const seen = new Set<string>();
  for (const c of arr<Any>(raw?.cards).map(normalizeDeckCard)) {
    if (seen.has(c.instanceId)) c.instanceId = uid('dc');
    seen.add(c.instanceId);
    const same = cards.find(
      (o) => o.card.id === c.card.id && o.category === c.category && !!o.isFoil === !!c.isFoil,
    );
    if (same) same.quantity += c.quantity;
    else cards.push(c);
  }
  const cmdRaw = raw?.commander ?? raw?.commanderCard;
  const ptnRaw = raw?.partner ?? raw?.partnerCard;
  const commander = cmdRaw ? normalizeCard(cmdRaw) : undefined;
  const partner = ptnRaw ? normalizeCard(ptnRaw) : undefined;
  // Comandante e parceiro ficam como DeckCard nas categorias próprias (fonte da verdade = campos do deck).
  const ensure = (card: Card | undefined, category: DeckCategory) => {
    if (!card) return;
    const existing = cards.find((c) => c.category === category);
    if (existing) {
      existing.card = card;
      existing.quantity = 1;
    } else {
      // Se o comandante estava no main, move-o.
      const inMain = cards.find((c) => c.category === 'main' && c.card.name === card.name);
      if (inMain) {
        inMain.quantity -= 1;
        if (inMain.quantity <= 0) cards.splice(cards.indexOf(inMain), 1);
      }
      cards.unshift({ instanceId: uid('dc'), card, quantity: 1, category });
    }
  };
  ensure(commander, 'commander');
  ensure(partner, 'partner');
  const coverRaw: Any = raw?.cover ?? {};
  const tokens: DeckToken[] = arr<Any>(raw?.tokens).map((t) => ({
    instanceId: str(t?.instanceId ?? t?.id, uid('dt')),
    card: normalizeTokenCard(t?.card ?? t?.token ?? t),
    quantity: Math.max(1, Math.round(num(t?.quantity, 1))),
  }));
  return {
    id: str(raw?.id, uid('deck')),
    name: str(raw?.name, 'Deck sem nome').trim() || 'Deck sem nome',
    format,
    description: str(raw?.description),
    commander,
    partner,
    cards,
    tokens,
    cover: {
      image: coverRaw.image ?? raw?.coverImage ?? raw?.coverImageUrl ?? undefined,
      zoom: clamp(num(coverRaw.zoom ?? raw?.coverZoom, 1), 1, 3),
      positionY: clamp(num(coverRaw.positionY ?? raw?.coverPosition, 30), 0, 100),
    },
    tags: arr<string>(raw?.tags).map(String),
    createdAt: str(raw?.createdAt, now),
    updatedAt: str(raw?.updatedAt, now),
  };
}

export function normalizeTag(raw: Any): DeckTag {
  return { id: str(raw?.id, uid('tag')), name: str(raw?.name, 'Tag'), color: str(raw?.color, '#ffbb00') };
}

export function normalizeProxyItem(raw: Any): ProxyItem {
  const c = raw?.card ?? raw;
  const card = c?.utilityType || raw?.isToken ? normalizeTokenCard(c, 'token') : normalizeCard(c);
  return { id: str(raw?.id, uid('px')), card, quantity: Math.max(1, Math.round(num(raw?.quantity, 1))) };
}

/** Garante ids únicos dentro de uma lista. */
function dedupeIds<T extends { id: string }>(list: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return list.map((it) => {
    if (seen.has(it.id)) it = { ...it, id: uid(prefix) };
    seen.add(it.id);
    return it;
  });
}

export function normalizeAppData(raw: Any | null | undefined): AppData {
  const r = raw ?? {};
  return {
    collection: dedupeIds(arr<Any>(r.collection).map(normalizeCollectionItem), 'col'),
    decks: dedupeIds(arr<Any>(r.decks).map(normalizeDeck), 'deck'),
    proxies: dedupeIds(arr<Any>(r.proxies ?? r.proxyQueue).map(normalizeProxyItem), 'px'),
    tags: dedupeIds(arr<Any>(r.tags ?? r.deckTags).map(normalizeTag), 'tag'),
  };
}

// ---------- Empacotamento (cartas deduplicadas) ----------

/**
 * Formato compacto para armazenamento: cartas repetidas (mesma impressão/arte) entre coleção,
 * decks e proxies ficam num dicionário único e são referenciadas por "$ref".
 */
export interface PackedData {
  v: number;
  cards: Record<string, Card>;
  data: Any;
}

function cardKey(c: Card): string {
  return c.artSource && c.artSource !== 'scryfall' ? `${c.id}|${c.images.normal ?? ''}|${c.backImage ?? ''}` : c.id;
}

export function packAppData(data: AppData): PackedData {
  const cards: Record<string, Card> = {};
  const keyToRef = new Map<string, string>();
  const ref = (card: Card | undefined) => {
    if (!card) return undefined;
    // Cartas com campos específicos do contexto (foil/utilityType) não são compartilhadas.
    const base = { ...card } as Any;
    const extra: Any = {};
    for (const k of ['isFoil', 'utilityType']) {
      if (k in base) {
        extra[k] = base[k];
        delete base[k];
      }
    }
    const key = cardKey(base as Card);
    let r = keyToRef.get(key);
    if (!r) {
      r = String(keyToRef.size);
      keyToRef.set(key, r);
      cards[r] = base as Card;
    }
    return { $ref: r, ...extra };
  };
  return {
    v: 1,
    cards,
    data: {
      collection: data.collection.map((i) => ({ ...i, card: ref(i.card) })),
      decks: data.decks.map((d) => ({
        ...d,
        commander: ref(d.commander),
        partner: ref(d.partner),
        cards: d.cards.map((c) => ({ ...c, card: ref(c.card) })),
        tokens: d.tokens.map((t) => ({ ...t, card: ref(t.card) })),
      })),
      proxies: data.proxies.map((p) => ({ ...p, card: ref(p.card) })),
      tags: data.tags,
    },
  };
}

export function unpackAppData(packed: PackedData | Any): AppData {
  if (!packed || !('cards' in packed) || !('data' in packed)) return normalizeAppData(packed);
  const cards = (packed as PackedData).cards;
  const deref = (r: Any | undefined): Any | undefined => {
    if (!r || typeof r !== 'object') return r;
    if (!('$ref' in r)) return r;
    const { $ref, ...extra } = r;
    return { ...cards[$ref], ...extra };
  };
  const d: Any = packed.data ?? {};
  return normalizeAppData({
    collection: arr<Any>(d.collection).map((i) => ({ ...i, card: deref(i.card) })),
    decks: arr<Any>(d.decks).map((dk) => ({
      ...dk,
      commander: deref(dk.commander),
      partner: deref(dk.partner),
      cards: arr<Any>(dk.cards).map((c) => ({ ...c, card: deref(c.card) })),
      tokens: arr<Any>(dk.tokens).map((t) => ({ ...t, card: deref(t.card) })),
    })),
    proxies: arr<Any>(d.proxies).map((p) => ({ ...p, card: deref(p.card) })),
    tags: d.tags,
  });
}
