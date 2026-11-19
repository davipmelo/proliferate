// Estatísticas de conjuntos de cartas (coleção, decks) — lógica pura.
import type { Card, Deck } from '../types/models.ts';
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
  power: number[]; // força das criaturas 0..7+
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
  const power = new Array(8).fill(0);
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
      const pw = parseInt(card.power ?? card.cardFaces?.[0]?.power ?? '', 10);
      if (Number.isFinite(pw) && pw >= 0) power[Math.min(7, pw)] += q;
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
    power,
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
  sizes: Ranked[]; // cartas por deck
  commanders: Ranked[];
  /** Custo médio (sem terrenos) de cada deck. */
  avgCmcByDeck: Ranked[];
  /** Média dos custos médios dos decks. */
  avgCmc: number;
  /** Terrenos de cada deck. */
  landsByDeck: Ranked[];
  avgLands: number;
  /** Quantos decks usam cada cor (W U B R G). */
  colorPresence: Ranked[];
  /** Decks por número de cores: incolor, mono, 2…5. */
  colorCount: number[];
  avgColors: number;
  /** Composição média de um deck por tipo de carta. */
  composition: Ranked[];
  tags: Ranked[];
  /** Decks por última edição: ≤7 dias, ≤30, ≤90, ≤365, mais. */
  activity: number[];
  avgTokens: number;
}

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;
const COLOR_LABEL: Record<string, string> = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde' };

export function computeDecksExtras(decks: Deck[], tagNames: Map<string, string> = new Map(), now = Date.now()): DecksExtras {
  const formats = new Map();
  const identities = new Map();
  const staples = new Map();
  const commanders = new Map();
  const tags = new Map();
  const presence: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const colorCount = new Array(6).fill(0);
  const typeTotals = new Map<string, number>();
  const activity = new Array(5).fill(0);
  let valueSum = 0, complete = 0, cmcSum = 0, cmcDecks = 0, landSum = 0, colorSum = 0, tokenSum = 0;
  const sizes: Ranked[] = [];
  const priciest: Ranked[] = [];
  const avgCmcByDeck: Ranked[] = [];
  const landsByDeck: Ranked[] = [];
  for (const d of decks) {
    const info = formatInfo(d.format);
    bump(formats, d.format, info.label, 1);
    const counted = d.cards.filter((c) => c.category !== 'sideboard' && c.category !== 'maybeboard');
    const count = counted.reduce((s, c) => s + c.quantity, 0);
    if (count === info.target) complete++;
    const value = d.cards.filter((c) => c.category !== 'maybeboard').reduce((s, c) => s + (c.card.priceUsd ?? 0) * c.quantity, 0);
    valueSum += value;
    priciest.push({ key: d.id, label: d.name, value, extra: info.label });
    sizes.push({ key: d.id, label: d.name, value: count, extra: `meta ${info.target}` });

    const idSrc = d.commander ? [d.commander, ...(d.partner ? [d.partner] : [])] : counted.map((c) => c.card);
    const id = [...new Set(idSrc.flatMap((c) => c.colorIdentity ?? []))];
    const idName = identityName(id);
    bump(identities, idName, idName, 1);
    for (const c of id) if (c in presence) presence[c]++;
    colorCount[Math.min(5, id.length)]++;
    colorSum += id.length;

    if (d.commander) bump(commanders, d.commander.name, d.commander.name, 1, d.commander);
    for (const t of d.tags) bump(tags, t, tagNames.get(t) ?? t, 1);
    tokenSum += d.tokens.reduce((s, t) => s + t.quantity, 0);

    let lands = 0, cmc = 0, spells = 0;
    for (const c of counted) {
      const t = mainType(c.card.typeLine);
      typeTotals.set(t, (typeTotals.get(t) ?? 0) + c.quantity);
      if (isLand(c.card)) lands += c.quantity;
      else {
        cmc += c.card.cmc * c.quantity;
        spells += c.quantity;
      }
    }
    landSum += lands;
    landsByDeck.push({ key: d.id, label: d.name, value: lands, extra: count ? `${Math.round((lands / count) * 100)}%` : undefined });
    if (spells) {
      const avg = cmc / spells;
      avgCmcByDeck.push({ key: d.id, label: d.name, value: Math.round(avg * 100) / 100, extra: info.label });
      cmcSum += avg;
      cmcDecks++;
    }

    const age = (now - Date.parse(d.updatedAt)) / 864e5;
    activity[!Number.isFinite(age) ? 4 : age <= 7 ? 0 : age <= 30 ? 1 : age <= 90 ? 2 : age <= 365 ? 3 : 4]++;

    const seen = new Set<string>();
    for (const c of counted) {
      if (isBasicLand(c.card) || seen.has(c.card.name)) continue;
      seen.add(c.card.name);
      bump(staples, c.card.name, c.card.name, 1, c.card);
    }
  }
  const n = decks.length || 1;
  return {
    decks: decks.length,
    formats: rank(formats, 9),
    identities: rank(identities, 8),
    staples: rank(staples, 10).filter((s) => s.value > 1),
    priciest: priciest.sort((a, b) => b.value - a.value).slice(0, 5),
    avgValue: decks.length ? valueSum / decks.length : 0,
    complete,
    sizes: sizes.sort((a, b) => b.value - a.value),
    commanders: rank(commanders, 5),
    avgCmcByDeck: avgCmcByDeck.sort((a, b) => b.value - a.value),
    avgCmc: cmcDecks ? cmcSum / cmcDecks : 0,
    landsByDeck: landsByDeck.sort((a, b) => b.value - a.value),
    avgLands: landSum / n,
    colorPresence: COLOR_ORDER.map((c) => ({ key: c, label: COLOR_LABEL[c], value: presence[c] })).filter((x) => x.value > 0),
    colorCount,
    avgColors: colorSum / n,
    composition: TYPE_ORDER.filter((t) => typeTotals.get(t)).map((t) => ({ key: t, label: t, value: Math.round(((typeTotals.get(t) ?? 0) / n) * 10) / 10 })),
    tags: rank(tags, 8),
    activity,
    avgTokens: tokenSum / n,
  };
}
