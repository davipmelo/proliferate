// Cliente da API pública do Scryfall: requisições sequenciais com intervalo, cache de impressões.
import type { Card, CardImages, CardPrint, TokenCard, UtilityCategory } from '../types/models.ts';
import { normalizeCard } from './normalize.ts';

const API = 'https://api.scryfall.com';
const MIN_INTERVAL = 110; // ms entre requisições (Scryfall pede 50–100 ms)

let chain: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Executa fetches em fila (um por vez) respeitando o intervalo mínimo. */
export function sfFetch<T = any>(pathOrUrl: string, init?: RequestInit): Promise<T> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl;
  const run = async (): Promise<T> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const delta = Date.now() - lastRequest;
      if (delta < MIN_INTERVAL) await wait(MIN_INTERVAL - delta);
      lastRequest = Date.now();
      const res = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json;q=0.9,*/*;q=0.8', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
      });
      if (res.status === 429) {
        await wait(1000 * (attempt + 1));
        continue;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.details || `Scryfall respondeu ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return json as T;
    }
    throw new Error('Scryfall: muitas requisições, tente novamente em instantes.');
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

/** URL de imagem a partir do id da impressão (sem precisar consultar a API). */
export function imageUrlFromId(id: string, size: keyof CardImages = 'normal', face: 'front' | 'back' = 'front'): string {
  const ext = size === 'art_crop' ? 'jpg' : 'jpg';
  return `https://cards.scryfall.io/${size}/${face}/${id[0]}/${id[1]}/${id}.${ext}`;
}

function imagesFromId(id: string): CardImages {
  return {
    normal: imageUrlFromId(id, 'normal'),
    large: imageUrlFromId(id, 'large'),
    small: imageUrlFromId(id, 'small'),
    art_crop: imageUrlFromId(id, 'art_crop'),
  };
}

/** Converte o JSON do Scryfall no modelo Card. */
export function mapScryfallCard(raw: any): Card {
  const card = normalizeCard(raw);
  if (raw?.lang && raw.lang !== 'en' && raw.printed_name) card.namePt = raw.printed_name;
  else delete card.namePt;
  if (raw?.layout === 'meld' && Array.isArray(raw.all_parts)) {
    const self = raw.all_parts.find((p: any) => p.id === raw.id);
    const result = raw.all_parts.find((p: any) => p.component === 'meld_result');
    const partner = raw.all_parts.find((p: any) => p.component === 'meld_part' && p.id !== raw.id);
    card.meld = {
      role: self?.component === 'meld_result' ? 'meld_result' : 'meld_part',
      partnerName: partner?.name,
      resultName: result?.name,
      resultId: result?.id,
      resultImages: result?.id ? imagesFromId(result.id) : undefined,
    };
  }
  // Para dupla face, as imagens principais são as da frente.
  if (!raw?.image_uris && card.cardFaces?.[0]?.images) card.images = { ...card.cardFaces[0].images };
  return card;
}

export function mapToken(raw: any, type: UtilityCategory): TokenCard {
  return { ...mapScryfallCard(raw), utilityType: type };
}

export function mapPrint(raw: any): CardPrint {
  const card = mapScryfallCard(raw);
  return {
    id: card.id,
    source: 'scryfall',
    name: card.name,
    setCode: card.setCode,
    setName: card.setName,
    collectorNumber: card.collectorNumber,
    artist: card.artist,
    releasedAt: card.releasedAt,
    frame: card.frame,
    priceUsd: card.priceUsd ?? (raw?.prices?.usd_foil ? Number(raw.prices.usd_foil) : undefined),
    images: card.images,
    backImages: card.cardFaces?.[1]?.images,
    isPromo: !!raw?.promo,
    setType: raw?.set_type,
    borderColor: raw?.border_color,
    card,
  };
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextPage?: string;
}

export async function autocomplete(q: string, includeExtras = false): Promise<string[]> {
  if (q.trim().length < 2) return [];
  const r = await sfFetch<{ data: string[] }>(
    `/cards/autocomplete?q=${encodeURIComponent(q)}${includeExtras ? '&include_extras=true' : ''}`,
  );
  return r.data ?? [];
}

export async function searchCards(
  query: string,
  opts: { unique?: 'cards' | 'art' | 'prints'; order?: string; dir?: 'auto' | 'asc' | 'desc'; extras?: boolean; page?: string } = {},
): Promise<SearchResult<Card>> {
  const url =
    opts.page ??
    `/cards/search?q=${encodeURIComponent(query)}&unique=${opts.unique ?? 'cards'}&order=${opts.order ?? 'name'}` +
      `${opts.dir ? `&dir=${opts.dir}` : ''}${opts.extras ? '&include_extras=true' : ''}`;
  try {
    const r = await sfFetch<any>(url);
    return { items: (r.data ?? []).map(mapScryfallCard), total: r.total_cards ?? 0, hasMore: !!r.has_more, nextPage: r.next_page };
  } catch (e: any) {
    if (e?.status === 404) return { items: [], total: 0, hasMore: false };
    throw e;
  }
}

export async function getCardByName(name: string, set?: string): Promise<Card | null> {
  for (const mode of ['exact', 'fuzzy'] as const) {
    try {
      const raw = await sfFetch(`/cards/named?${mode}=${encodeURIComponent(name)}${set ? `&set=${encodeURIComponent(set)}` : ''}`);
      return mapScryfallCard(raw);
    } catch (e: any) {
      if (e?.status !== 404) throw e;
    }
  }
  return null;
}

export async function getCardById(id: string): Promise<Card | null> {
  try {
    return mapScryfallCard(await sfFetch(`/cards/${encodeURIComponent(id)}`));
  } catch {
    return null;
  }
}

export async function getCardBySetNumber(set: string, number: string): Promise<Card | null> {
  try {
    return mapScryfallCard(await sfFetch(`/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(number)}`));
  } catch {
    return null;
  }
}

export type Identifier = { name: string } | { set: string; collector_number: string } | { id: string } | { name: string; set: string };

/** Busca em lote (/cards/collection, 75 por requisição). Retorna resultados na ordem + não encontrados. */
export async function getCollection(
  ids: Identifier[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ found: Card[]; notFound: Identifier[] }> {
  const found: Card[] = [];
  const notFound: Identifier[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const chunk = ids.slice(i, i + 75);
    const r = await sfFetch<any>('/cards/collection', { method: 'POST', body: JSON.stringify({ identifiers: chunk }) });
    found.push(...(r.data ?? []).map(mapScryfallCard));
    notFound.push(...(r.not_found ?? []));
    onProgress?.(Math.min(ids.length, i + 75), ids.length);
  }
  return { found, notFound };
}

/** Traduz um nome em português para o nome em inglês (usa printed_name de impressões em pt). */
export async function translatePtName(name: string): Promise<string | null> {
  const clean = name.replace(/"/g, '').trim();
  const r = await searchCards(`lang:pt !"${clean}"`, { unique: 'cards' }).catch(() => null);
  if (r?.items[0]) return r.items[0].name;
  const r2 = await searchCards(`lang:pt "${clean}"`, { unique: 'cards' }).catch(() => null);
  return r2?.items[0]?.name ?? null;
}

/** Nome em português de uma carta (impressão pt mais recente), se existir. */
export async function getPtName(oracleId: string): Promise<string | null> {
  const r = await searchCards(`oracleid:${oracleId} lang:pt`, { unique: 'prints' }).catch(() => null);
  const raw = r?.items[0];
  return raw?.namePt ?? null;
}

// ---------- Impressões (cache) ----------

const PRINTS_CACHE_KEY = 'proliferate:prints-cache';
const PRINTS_TTL = 1000 * 60 * 60 * 24 * 3; // 3 dias
const printsMem = new Map<string, { at: number; prints: CardPrint[] }>();

function loadPrintsCache() {
  if (printsMem.size) return;
  try {
    const raw = JSON.parse(sessionStorage.getItem(PRINTS_CACHE_KEY) || '{}');
    for (const [k, v] of Object.entries<any>(raw)) printsMem.set(k, v);
  } catch {
    /* sem cache */
  }
}

function savePrintsCache() {
  try {
    // Mantém só as 40 mais recentes para não estourar o sessionStorage.
    const entries = [...printsMem.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 40);
    sessionStorage.setItem(PRINTS_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignora cota */
  }
}

/** Todas as impressões de uma carta (por oracle id ou nome). */
export async function getPrints(card: Pick<Card, 'oracleId' | 'name'>, force = false): Promise<CardPrint[]> {
  loadPrintsCache();
  const key = card.oracleId ? `o:${card.oracleId}` : `n:${card.name.toLowerCase()}`;
  const cached = printsMem.get(key);
  if (!force && cached && Date.now() - cached.at < PRINTS_TTL) return cached.prints;
  const q = card.oracleId ? `oracleid:${card.oracleId}` : `!"${card.name.split(' // ')[0]}"`;
  const prints: CardPrint[] = [];
  let page: string | undefined =
    `/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=desc&include_extras=true&include_variations=true`;
  let guard = 0;
  while (page && guard++ < 10) {
    try {
      const r: any = await sfFetch(page);
      prints.push(...(r.data ?? []).map(mapPrint));
      page = r.has_more ? r.next_page : undefined;
    } catch (e: any) {
      if (e?.status === 404) break;
      throw e;
    }
  }
  printsMem.set(key, { at: Date.now(), prints });
  savePrintsCache();
  return prints;
}

// ---------- Utilitários ----------

// Consultas validadas contra o Scryfall. Cartas auxiliares (Poison Counter, Experience, Monarch,
// Day // Night, Bounty…) vêm dos sets de fichas (st:token) com tipo "Card", e nem todas têm layout
// de ficha — por isso o filtro usa o tipo de set em vez do layout.
export const UTILITY_CATEGORIES: { id: UtilityCategory; label: string; query: string }[] = [
  { id: 'token', label: 'Fichas', query: '(t:token or (st:token (t:creature or t:artifact or t:enchantment or t:land))) -t:emblem -t:card -t:boss -t:event' },
  { id: 'plane', label: 'Planos', query: '(t:plane or t:phenomenon)' },
  { id: 'emblem', label: 'Emblemas', query: 't:emblem' },
  { id: 'counter', label: 'Marcadores', query: '((t:card st:token) or (st:token (t:boss or t:event))) -t:dungeon -t:emblem -name:checklist -name:"god pack"' },
  { id: 'dungeon', label: 'Masmorras', query: 't:dungeon -t:creature' },
  { id: 'scheme', label: 'Esquemas', query: 't:scheme' },
  { id: 'conspiracy', label: 'Conspirações', query: 't:conspiracy' },
  { id: 'attraction', label: 'Atrações', query: 't:attraction' },
];

export function utilityQuery(cat: UtilityCategory): string {
  return UTILITY_CATEGORIES.find((c) => c.id === cat)?.query ?? 't:token';
}

/** Classifica um card de utilitário pela linha de tipo. */
export function detectUtilityType(card: Pick<Card, 'typeLine' | 'layout'>): UtilityCategory {
  const t = card.typeLine.toLowerCase();
  if (t.includes('emblem')) return 'emblem';
  if (/\bplane\b/.test(t) || t.includes('phenomenon')) return 'plane';
  if (t.includes('dungeon')) return 'dungeon';
  if (t.includes('scheme')) return 'scheme';
  if (t.includes('conspiracy')) return 'conspiracy';
  if (t.includes('attraction')) return 'attraction';
  if (/^card\b/.test(t) || /^(boss|event)\b/.test(t)) return 'counter';
  return 'token';
}

export async function searchUtilities(
  cat: UtilityCategory | 'all',
  text: string,
  opts: { order?: string; page?: string; colors?: string } = {},
): Promise<SearchResult<TokenCard>> {
  // Cada categoria entre parênteses: sem isso o "or" mistura os filtros negativos de categorias vizinhas.
  const base = cat === 'all' ? `(${UTILITY_CATEGORIES.map((c) => `(${c.query})`).join(' or ')})` : `(${utilityQuery(cat)})`;
  const q = [base, text.trim(), opts.colors ? `c=${opts.colors}` : ''].filter(Boolean).join(' ');
  const r = await searchCards(q, { unique: 'art', order: opts.order ?? 'name', extras: true, page: opts.page });
  return { ...r, items: r.items.map((c) => ({ ...c, utilityType: detectUtilityType(c) })) };
}

/** Fichas relacionadas a uma carta (all_parts do Scryfall). */
export async function getRelatedTokens(cardId: string): Promise<TokenCard[]> {
  const raw: any = await sfFetch(`/cards/${cardId}`).catch(() => null);
  const parts = (raw?.all_parts ?? []).filter((p: any) => p.component === 'token' || /Emblem|Dungeon/.test(p.type_line ?? ''));
  if (!parts.length) return [];
  const { found } = await getCollection(parts.map((p: any) => ({ id: p.id })));
  return found.map((c) => ({ ...c, utilityType: detectUtilityType(c) }));
}

/** Fichas/emblemas gerados por um conjunto de cartas (via all_parts, em lote). */
export async function getTokensForCards(cardIds: string[]): Promise<TokenCard[]> {
  const ids = [...new Set(cardIds.filter((id) => /^[0-9a-f-]{36}$/.test(id)))];
  const partIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 75) {
    const r = await sfFetch<any>('/cards/collection', { method: 'POST', body: JSON.stringify({ identifiers: ids.slice(i, i + 75).map((id) => ({ id })) }) });
    for (const raw of r.data ?? []) {
      for (const p of raw.all_parts ?? []) {
        if (p.id !== raw.id && (p.component === 'token' || /Emblem|Dungeon|Card\b/.test(p.type_line ?? ''))) partIds.add(p.id);
      }
    }
  }
  if (!partIds.size) return [];
  const { found } = await getCollection([...partIds].map((id) => ({ id })));
  const seen = new Set<string>();
  return found
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .map((c) => ({ ...c, utilityType: detectUtilityType(c) }));
}
