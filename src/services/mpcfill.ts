// Integração com o MPCFill (artes da comunidade) via proxy CORS (Cloudflare Worker).
import type { Card, CardPrint } from '../types/models.ts';
import { frontName, normalizeName } from '../types/cardRules.ts';

const DEFAULT_PROXY = 'https://mpcfill-proxy.anancinho.workers.dev';

export function mpcBaseUrl(): string {
  if (import.meta.env?.DEV) return '/api-mpcfill';
  return (import.meta.env?.VITE_MPCFILL_PROXY as string | undefined) || DEFAULT_PROXY;
}

/** Miniatura reduzida do Google Drive (nunca o arquivo original). */
export function driveThumb(id: string, width: 400 | 1000 | 1600 = 400): string {
  return `https://lh3.googleusercontent.com/d/${id}=w${width}`;
}

export function driveIdFromUrl(url: string): string | null {
  const m =
    url.match(/googleusercontent\.com\/d\/([\w-]{20,})/) ||
    url.match(/drive\.google\.com\/file\/d\/([\w-]{20,})/) ||
    url.match(/[?&]id=([\w-]{20,})/) ||
    url.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?.*?id=([\w-]{20,})/);
  return m ? m[1] : null;
}

/** Converte links do Google Drive em URL de miniatura grande; outras URLs ficam iguais. */
export function normalizeImageUrl(url: string): string {
  const id = /drive\.google|googleusercontent/.test(url) ? driveIdFromUrl(url) : null;
  return id ? driveThumb(id, 1000) : url.trim();
}

export interface MpcSource {
  pk: number;
  key: string;
  name: string;
  description?: string;
}

let sourcesCache: MpcSource[] | null = null;

async function mpcFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(mpcBaseUrl() + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || ct.includes('text/html')) throw new Error('O MPCFill não respondeu. Tente novamente mais tarde.');
  return res.json() as Promise<T>;
}

export async function getMpcSources(): Promise<MpcSource[]> {
  if (sourcesCache) return sourcesCache;
  const r = await mpcFetch<{ results: Record<string, MpcSource> }>('/2/sources/');
  sourcesCache = Object.values(r.results ?? {});
  return sourcesCache;
}

export interface MpcSearchOptions {
  type?: 'CARD' | 'TOKEN';
  minDpi?: number;
  fuzzy?: boolean;
}

/** Ordem dos criadores no MPCFill (pk menor = mais prioritário/"melhores criadores"). */
export function sourceRank(p: CardPrint): number {
  return (p as CardPrint & { sourceRank?: number }).sourceRank ?? 9999;
}

/** Converte "20th February, 2023" em ISO. */
export function parseMpcDate(s?: string): string | undefined {
  if (!s) return undefined;
  const d = new Date(s.replace(/(\d+)(st|nd|rd|th)/, '$1'));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/** Nome do arquivo do MPCFill pertence à carta? ("Sol Ring (Dom)" ↔ "Sol Ring") */
export function mpcNameMatches(fileName: string, cardName: string): boolean {
  const clean = normalizeName(fileName.replace(/\.(png|jpe?g|webp)$/i, '').replace(/\s*[([].*?[)\]]\s*/g, ' ')).trim();
  const target = frontName(cardName);
  return clean === target || clean === normalizeName(cardName) || frontName(clean) === target;
}

export async function searchMpc(cardName: string, opts: MpcSearchOptions = {}): Promise<CardPrint[]> {
  const query = frontName(cardName)
    .replace(/[~`!@#$%^&*(){}[\];:?<>/\\|_+=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!query) return [];
  const sources = await getMpcSources().catch(() => [] as MpcSource[]);
  const rank = new Map(sources.map((s, i) => [s.pk, i]));
  const type = opts.type ?? 'CARD';
  const body = (fuzzy: boolean) => ({
    queries: [{ query, cardType: type }],
    searchSettings: {
      filterSettings: { excludesTags: [], includesTags: [], languages: ['en'], maximumDPI: 1500, maximumSize: 50, minimumDPI: opts.minDpi ?? 0 },
      searchTypeSettings: { filterCardbacks: false, fuzzySearch: fuzzy },
      sourceSettings: { sources: sources.length ? sources.map((s) => [s.pk, true]) : Array.from({ length: 300 }, (_, i) => [i + 1, true]) },
    },
  });
  const pick = (r: any): string[] => {
    const obj = r?.results?.[query] ?? Object.values(r?.results ?? {})[0] ?? {};
    return (obj as any)[type] ?? [];
  };
  let ids = pick(await mpcFetch('/2/editorSearch/', body(!!opts.fuzzy)));
  if (!ids.length && !opts.fuzzy) ids = pick(await mpcFetch('/2/editorSearch/', body(true)));
  if (!ids.length) return [];

  const meta: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 150) {
    const r = await mpcFetch<{ results: Record<string, any> }>('/2/cards/', { cardIdentifiers: ids.slice(i, i + 150) }).catch(() => ({ results: {} }));
    Object.assign(meta, r.results);
  }
  const out: CardPrint[] = [];
  ids.forEach((id, index) => {
    const m = meta[id];
    if (m?.name && !mpcNameMatches(m.name, cardName) && !opts.fuzzy) return;
    out.push({
      id: `mpc-${id}`,
      source: 'mpcfill',
      name: m?.name?.replace(/\.(png|jpe?g)$/i, '') ?? cardName,
      setCode: 'MPC',
      setName: m?.name ?? 'MPCFill',
      artist: m?.sourceName ?? m?.source ?? 'Comunidade MPCFill',
      sourceName: m?.sourceName ?? m?.source ?? 'Comunidade MPCFill',
      dpi: m?.dpi ? Number(m.dpi) : undefined,
      releasedAt: parseMpcDate(m?.dateCreated),
      tags: m?.tags ?? [],
      mpcType: type,
      images: { small: driveThumb(id, 400), normal: driveThumb(id, 1000), large: driveThumb(id, 1600) },
      ...({ sourceRank: rank.get(m?.sourceId) ?? 9999, orderIndex: index } as object),
    });
  });
  return out;
}

/** Cria uma carta com arte do MPCFill a partir da carta base (mantém dados oficiais). */
export function cardWithMpcArt(base: Card, print: CardPrint, back?: CardPrint): Card {
  return {
    ...base,
    id: print.id,
    images: { ...print.images, art_crop: base.images.art_crop },
    artSource: 'mpcfill',
    artist: print.sourceName ?? print.artist,
    setName: `MPCFill · ${print.sourceName ?? ''}`.trim(),
    setCode: 'mpc',
    collectorNumber: print.dpi ? `${print.dpi} DPI` : undefined,
    hasBleed: true,
    backImage: back?.images.normal ?? (base.backImage && base.artSource === 'mpcfill' ? base.backImage : undefined),
  };
}

// ---------- XML exportado pelo MPCFill ----------

export interface MpcOrderCard {
  id: string;
  slots: number[];
  name: string;
  query: string;
}

export interface MpcOrder {
  quantity: number;
  stock?: string;
  foil: boolean;
  fronts: MpcOrderCard[];
  backs: MpcOrderCard[];
  cardback?: string;
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim();
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function parseCards(block: string | undefined): MpcOrderCard[] {
  if (!block) return [];
  return Array.from(block.matchAll(/<card>([\s\S]*?)<\/card>/g), (m) => {
    const c = m[1];
    return {
      id: tag(c, 'id') ?? '',
      slots: (tag(c, 'slots') ?? '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n)),
      name: decode(tag(c, 'name') ?? ''),
      query: decode(tag(c, 'query') ?? ''),
    };
  }).filter((c) => c.id);
}

/** Lê o XML de pedido do MPCFill (sem depender do DOM, testável no Node). */
export function parseMpcXml(xml: string): MpcOrder {
  if (!/<order>/.test(xml)) throw new Error('Arquivo não parece ser um XML do MPCFill.');
  const details = tag(xml, 'details') ?? '';
  return {
    quantity: parseInt(tag(details, 'quantity') ?? '0', 10) || 0,
    stock: tag(details, 'stock'),
    foil: tag(details, 'foil') === 'true',
    fronts: parseCards(tag(xml, 'fronts')),
    backs: parseCards(tag(xml, 'backs')),
    cardback: tag(xml, 'cardback'),
  };
}

/** Agrupa o pedido por slot: frente + verso (quando houver) e quantidade por arte. */
export function mpcOrderEntries(order: MpcOrder): { front: MpcOrderCard; back?: MpcOrderCard; quantity: number }[] {
  const backBySlot = new Map<number, MpcOrderCard>();
  for (const b of order.backs) for (const s of b.slots) backBySlot.set(s, b);
  const out = new Map<string, { front: MpcOrderCard; back?: MpcOrderCard; quantity: number }>();
  for (const f of order.fronts) {
    for (const s of f.slots) {
      const back = backBySlot.get(s);
      const key = `${f.id}|${back?.id ?? ''}`;
      const e = out.get(key);
      if (e) e.quantity++;
      else out.set(key, { front: f, back, quantity: 1 });
    }
  }
  return [...out.values()];
}

/** Nome "limpo" da carta a partir do item do XML. */
export function mpcCardName(c: MpcOrderCard): string {
  if (c.query) return c.query;
  return c.name.replace(/\.(png|jpe?g|webp)$/i, '').replace(/\s*[([].*?[)\]]\s*/g, ' ').trim();
}
