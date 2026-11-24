// Busca de commanders da aba Explorar (Scryfall).
import type { Card } from '../types/models.ts';
import { COMMANDER_BASE, NO_BACKGROUNDS, type ExploreTheme } from '../data/exploreThemes.ts';
import type { ColorFilterValue } from '../types/cardRules.ts';
import { mapScryfallCard, sfFetch } from './scryfall.ts';

export type ExploreSort = 'popular' | 'unpopular' | 'name' | 'cmc' | 'released' | 'price';
export type IdentityMode = 'exact' | 'within' | 'includes';

export const SORT_LABELS: Record<ExploreSort, string> = {
  popular: 'Mais populares',
  unpopular: 'Menos populares',
  name: 'Nome',
  cmc: 'Custo',
  released: 'Mais recentes',
  price: 'Preço',
};

const SORT_PARAMS: Record<ExploreSort, string> = {
  popular: 'order=edhrec&dir=asc',
  unpopular: 'order=edhrec&dir=desc',
  name: 'order=name&dir=asc',
  cmc: 'order=cmc&dir=asc',
  released: 'order=released&dir=desc',
  price: 'order=usd&dir=desc',
};

export interface ExploreFilters {
  colors: ColorFilterValue[];
  identity: IdentityMode;
  /** "" (qualquer), "1".."6" ou "7" (7 ou mais). */
  cmc: string;
  /** Preço máximo em USD ("" = qualquer). */
  maxPrice: string;
  /** "" (qualquer), "recent" (últimos 2 anos), "2020", "2015", "old" (antes de 2015). */
  era: string;
  partner: boolean;
  backgrounds: boolean;
  /** Busca avançada na sintaxe do Scryfall. */
  extra: string;
}

export const EMPTY_FILTERS: ExploreFilters = { colors: [], identity: 'within', cmc: '', maxPrice: '', era: '', partner: false, backgrounds: false, extra: '' };

/** Consulta completa do Scryfall para os temas combinados (todos precisam casar) e os filtros. */
export function buildExploreQuery(themes: Pick<ExploreTheme, 'query'>[], f: ExploreFilters, now = new Date()): string {
  const parts = [COMMANDER_BASE];
  if (!f.backgrounds) parts.push(NO_BACKGROUNDS);
  for (const t of themes) parts.push(`(${t.query})`);

  const wubrg = (['W', 'U', 'B', 'R', 'G'] as const).filter((c) => f.colors.includes(c)).join('').toLowerCase();
  const colorless = f.colors.includes('C');
  if (wubrg || colorless) {
    // Incolor só faz sentido sozinho; com cores, "dentro de" já inclui os incolores.
    const id = wubrg || 'c';
    const op = f.identity === 'exact' ? '=' : f.identity === 'within' ? '<=' : '>=';
    parts.push(`id${op}${id}`);
  }
  if (f.colors.includes('M')) parts.push('id:m');

  if (f.cmc) parts.push(Number(f.cmc) >= 7 ? 'cmc>=7' : `cmc=${Number(f.cmc)}`);
  if (f.maxPrice) parts.push(`usd<=${Number(f.maxPrice)}`);
  if (f.era === 'recent') parts.push(`year>=${now.getFullYear() - 1}`);
  else if (f.era === 'old') parts.push('year<2015');
  else if (/^\d{4}$/.test(f.era)) parts.push(`year>=${f.era}`);
  if (f.partner) parts.push('(keyword:partner or o:"friends forever" or o:"choose a background" or o:"doctor\'s companion")');
  if (f.extra.trim()) parts.push(`(${f.extra.trim()})`);
  return parts.join(' ');
}

export interface ExploreCommander {
  card: Card;
  banned: boolean;
  edhrecUrl?: string;
}

export interface ExplorePage {
  items: ExploreCommander[];
  total: number;
  nextPage?: string;
}

function mapCommander(raw: any): ExploreCommander {
  return { card: mapScryfallCard(raw), banned: raw?.legalities?.commander === 'banned', edhrecUrl: raw?.related_uris?.edhrec };
}

const cache = new Map<string, ExplorePage>();

/** Uma página de commanders (a primeira, ou a indicada por `page`). Resultados ficam em cache na sessão. */
export async function searchCommanders(query: string, sort: ExploreSort, page?: string): Promise<ExplorePage> {
  const url = page ?? `/cards/search?q=${encodeURIComponent(query)}&unique=cards&${SORT_PARAMS[sort]}`;
  const hit = cache.get(url);
  if (hit) return hit;
  let result: ExplorePage;
  try {
    const r = await sfFetch<any>(url);
    result = { items: (r.data ?? []).map(mapCommander), total: r.total_cards ?? 0, nextPage: r.has_more ? r.next_page : undefined };
  } catch (e: any) {
    if (e?.status !== 404) throw e;
    result = { items: [], total: 0 };
  }
  cache.set(url, result);
  return result;
}
