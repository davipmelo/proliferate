// Estatísticas de conjuntos de cartas (coleção, decks) — lógica pura.
import type { Card, CollectionItem, CollectionUsage, Deck } from '../types/models.ts';
import { frontType, isBasicLand, isLand, mainType, TYPE_ORDER, type MainType } from '../types/cardRules.ts';
import { formatInfo } from '../types/formats.ts';

export interface Entry {
  card: Card;
  quantity: number;
}

export interface Ranked {
  key: string;
  label: string;
  value: number;
  extra?: string;
  card?: Card;
}

export interface CardStats {
  total: number;
  unique: number;
  value: number;
  avgCmc: number;
  avgPrice: number;
  lands: number;
  colors: Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'M', number>;
  identities: Ranked[];
  types: Ranked[];
  curve: number[]; // 0..7+
  rarity: Ranked[];
  sets: Ranked[];
  topValue: Ranked[];
  priceBands: Ranked[];
  tribes: Ranked[];
  keywords: Ranked[];
  artists: Ranked[];
  mostCopies: Ranked[];
  legendary: number;
  doubleFaced: number;
}

const COLOR_PAIRS: Record<string, string> = {
  W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde', '': 'Incolor',
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', GW: 'Selesnya',
  WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', RW: 'Boros', GU: 'Simic',
  WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', RGW: 'Naya', GWU: 'Bant',
  WBG: 'Abzan', URW: 'Jeskai', BGU: 'Sultai', RWB: 'Mardu', GUR: 'Temur',
  WUBR: 'Sem verde', UBRG: 'Sem branco', BRGW: 'Sem azul', RGWU: 'Sem preto', GWUB: 'Sem vermelho', WUBRG: 'Cinco cores',
};

/** Nome da combinação de cores ("Azorius", "Jund"…), independente da ordem. */
export function identityName(colors: string[]): string {
  const order = 'WUBRG';
  const sorted = [...new Set(colors)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('');
  if (COLOR_PAIRS[sorted]) return COLOR_PAIRS[sorted];
  // Procura a mesma combinação em outra ordem (ex.: "GW").
  for (const [k, v] of Object.entries(COLOR_PAIRS)) {
    if (k.length === sorted.length && [...k].every((c) => sorted.includes(c))) return v;
  }
  return sorted;
}

const RARITY_LABEL: Record<string, string> = { common: 'Comum', uncommon: 'Incomum', rare: 'Rara', mythic: 'Mítica', special: 'Especial', bonus: 'Bônus' };
const KEYWORDS = [
  ['Flying', 'Voar'], ['Trample', 'Atropelar'], ['Haste', 'Ímpeto'], ['Deathtouch', 'Toque mortífero'], ['Lifelink', 'Vínculo com a vida'],
  ['Vigilance', 'Vigilância'], ['First strike', 'Iniciativa'], ['Double strike', 'Golpe duplo'], ['Hexproof', 'Resistência a magia'],
  ['Flash', 'Lampejo'], ['Menace', 'Ameaçar'], ['Reach', 'Alcance'], ['Indestructible', 'Indestrutível'], ['Ward', 'Proteção paga'],
  ['Defender', 'Defensor'], ['Proliferate', 'Proliferar'], ['Scry', 'Vidência'], ['Draw a card', 'Compra cartas'], ['Create', 'Cria fichas'],
] as const;

function rank(map: Map<string, { value: number; label: string; card?: Card; extra?: string }>, limit = 10): Ranked[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function bump(map: Map<string, { value: number; label: string; card?: Card }>, key: string, label: string, n: number, card?: Card) {
  const cur = map.get(key);
  if (cur) cur.value += n;
  else map.set(key, { value: n, label, card });
}

export function computeCardStats(entries: Entry[]): CardStats {
  const colors = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, M: 0 };
  const curve = new Array(8).fill(0);
  const identities = new Map();
  const types = new Map();
  const rarity = new Map();
  const sets = new Map();
  const tribes = new Map();
  const keywords = new Map();
  const artists = new Map();
  const unique = new Set<string>();
  const byName = new Map<string, { card: Card; qty: number; price: number }>();
  let total = 0, value = 0, cmcSum = 0, nonLand = 0, lands = 0, legendary = 0, doubleFaced = 0, priced = 0, priceSum = 0;

  for (const { card, quantity: q } of entries) {
    if (q <= 0) continue;
    total += q;
    unique.add(card.oracleId ?? card.name);
    const price = card.priceUsd ?? 0;
    value += price * q;
    if (card.priceUsd != null) {
      priced += q;
      priceSum += price * q;
    }
    const prev = byName.get(card.name);
    if (prev) {
      prev.qty += q;
      prev.price = Math.max(prev.price, price);
    } else byName.set(card.name, { card, qty: q, price });

    const t: MainType = mainType(card.typeLine);
    bump(types, t, t, q);
    if (/\bLegendary\b/i.test(card.typeLine)) legendary += q;
    if ((card.cardFaces?.length ?? 0) > 1 && ['transform', 'modal_dfc', 'meld', 'battle', 'reversible_card'].includes(card.layout ?? '')) doubleFaced += q;

    if (isLand(card)) {
      lands += q;
    } else {
      curve[Math.min(7, Math.floor(card.cmc))] += q;
      cmcSum += card.cmc * q;
      nonLand += q;
      const cols = card.colors ?? [];
      if (cols.length === 0) colors.C += q;
      else if (cols.length > 1) colors.M += q;
      else colors[cols[0] as 'W'] += q;
    }
    if (!isBasicLand(card)) {
      const id = card.colorIdentity ?? [];
      const name = identityName(id);
      bump(identities, name, name, q);
    }
    const r = card.rarity ?? 'unknown';
    if (!isBasicLand(card)) bump(rarity, r, RARITY_LABEL[r] ?? 'Outra', q);
    if (card.setName && card.artSource !== 'custom' && card.artSource !== 'mpcfill') bump(sets, card.setCode ?? card.setName, card.setName, q);
    if (card.artist && card.artSource !== 'custom') bump(artists, card.artist, card.artist, q);
    if (/\bCreature\b/i.test(frontType(card.typeLine))) {
      const sub = (card.typeLine.split('//')[0].split('—')[1] ?? '').trim();
      for (const s of sub.split(/\s+/).filter(Boolean)) bump(tribes, s, s, q);
    }
    const text = `${card.oracleText ?? ''} ${(card.cardFaces ?? []).map((f) => f.oracleText ?? '').join(' ')}`;
    for (const [kw, label] of KEYWORDS) {
      const re = kw === 'Create' ? /\bcreate\b[^.]*\btoken/i : kw === 'Draw a card' ? /\bdraws? (a|two|three|\w+) cards?/i : new RegExp(`\\b${kw}\\b`, 'i');
      if (re.test(text)) bump(keywords, kw, label, q);
    }
  }

  const bands: [string, number, number][] = [['< $1', 0, 1], ['$1–5', 1, 5], ['$5–20', 5, 20], ['$20–50', 20, 50], ['$50+', 50, Infinity]];
  const priceBands = bands.map(([label, lo, hi]) => ({
    key: label,
    label,
    value: entries.filter((e) => e.card.priceUsd != null && e.card.priceUsd >= lo && e.card.priceUsd < hi).reduce((s, e) => s + e.quantity, 0),
  }));

  const typeRanked = TYPE_ORDER.map((t) => ({ key: t, label: t, value: types.get(t)?.value ?? 0 })).filter((x) => x.value > 0);
  const rarityOrder = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus', 'unknown'];
  return {
    total,
    unique: unique.size,
    value,
    avgCmc: nonLand ? cmcSum / nonLand : 0,
    avgPrice: priced ? priceSum / priced : 0,
    lands,
    colors,
    identities: rank(identities, 8),
    types: typeRanked,
    curve,
    rarity: rank(rarity, 10).sort((a, b) => rarityOrder.indexOf(a.key) - rarityOrder.indexOf(b.key)),
    sets: rank(sets, 8),
    topValue: [...byName.values()]
      .filter((x) => x.price > 0)
      .sort((a, b) => b.price - a.price)
      .slice(0, 8)
      .map((x) => ({ key: x.card.name, label: x.card.name, value: x.price, extra: x.qty > 1 ? `${x.qty}×` : undefined, card: x.card })),
    priceBands,
    tribes: rank(tribes, 8),
    keywords: rank(keywords, 8),
    artists: rank(artists, 6),
    mostCopies: [...byName.values()]
      .filter((x) => !isBasicLand(x.card))
      .sort((a, b) => b.qty - a.qty || a.card.name.localeCompare(b.card.name))
      .slice(0, 6)
      .map((x) => ({ key: x.card.name, label: x.card.name, value: x.qty, card: x.card })),
    legendary,
    doubleFaced,
  };
}

export interface CollectionExtras {
  foil: number;
  free: number;
  inUse: number;
  languages: Ranked[];
  conditions: Ranked[];
  recent: number; // adicionadas nos últimos 30 dias
}

export function computeCollectionExtras(items: CollectionItem[], usage: Map<string, CollectionUsage>, now = Date.now()): CollectionExtras {
  const langs = new Map();
  const conds = new Map();
  const LANG: Record<string, string> = { en: 'Inglês', pt: 'Português', es: 'Espanhol', ja: 'Japonês', de: 'Alemão', fr: 'Francês', it: 'Italiano', ko: 'Coreano', ru: 'Russo', zhs: 'Chinês' };
  let foil = 0, inUse = 0, total = 0, recent = 0;
  for (const i of items) {
    total += i.quantity;
    if (i.isFoil) foil += i.quantity;
    inUse += Math.min(i.quantity, usage.get(i.id)?.inUse ?? 0);
    bump(langs, i.language, LANG[i.language] ?? i.language.toUpperCase(), i.quantity);
    bump(conds, i.condition, i.condition, i.quantity);
    if (now - Date.parse(i.dateAdded) < 30 * 864e5) recent += i.quantity;
  }
  const condOrder = ['NM', 'SP', 'MP', 'HP', 'DMG'];
  return {
    foil,
    inUse,
    free: total - inUse,
    languages: rank(langs, 6),
    conditions: rank(conds, 5).sort((a, b) => condOrder.indexOf(a.key) - condOrder.indexOf(b.key)),
    recent,
  };
}

export interface DecksExtras {
  decks: number;
  formats: Ranked[];
  identities: Ranked[];
  staples: Ranked[]; // cartas presentes em mais decks
  priciest: Ranked[];
  avgValue: number;
  complete: number; // decks com a contagem da meta
  ownedPct: number; // % das cartas dos decks que existem na coleção
  commanders: Ranked[];
}

export function computeDecksExtras(decks: Deck[], ownedIds: Set<string>, ownedNames: Set<string>): DecksExtras {
  const formats = new Map();
  const identities = new Map();
  const staples = new Map();
  const commanders = new Map();
  let valueSum = 0, complete = 0, cardTotal = 0, owned = 0;
  const priciest: Ranked[] = [];
  for (const d of decks) {
    const info = formatInfo(d.format);
    bump(formats, d.format, info.label, 1);
    const counted = d.cards.filter((c) => c.category !== 'sideboard' && c.category !== 'maybeboard');
    const count = counted.reduce((s, c) => s + c.quantity, 0);
    if (count === info.target) complete++;
    const value = d.cards.filter((c) => c.category !== 'maybeboard').reduce((s, c) => s + (c.card.priceUsd ?? 0) * c.quantity, 0);
    valueSum += value;
    priciest.push({ key: d.id, label: d.name, value, extra: info.label });
    const idSrc = d.commander ? [d.commander, ...(d.partner ? [d.partner] : [])] : counted.map((c) => c.card);
    const id = [...new Set(idSrc.flatMap((c) => c.colorIdentity ?? []))];
    const idName = identityName(id);
    bump(identities, idName, idName, 1);
    if (d.commander) bump(commanders, d.commander.name, d.commander.name, 1, d.commander);
    const seen = new Set<string>();
    for (const c of counted) {
      cardTotal += c.quantity;
      if (c.collectionItemId || ownedIds.has(c.card.id) || ownedNames.has(c.card.name)) owned += c.quantity;
      if (isBasicLand(c.card) || seen.has(c.card.name)) continue;
      seen.add(c.card.name);
      bump(staples, c.card.name, c.card.name, 1, c.card);
    }
  }
  return {
    decks: decks.length,
    formats: rank(formats, 9),
    identities: rank(identities, 8),
    staples: rank(staples, 10).filter((s) => s.value > 1),
    priciest: priciest.sort((a, b) => b.value - a.value).slice(0, 5),
    avgValue: decks.length ? valueSum / decks.length : 0,
    complete,
    ownedPct: cardTotal ? owned / cardTotal : 0,
    commanders: rank(commanders, 5),
  };
}
