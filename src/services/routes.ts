import type { TabId } from '../types/models.ts';
import type { ColorFilterValue } from '../types/cardRules.ts';

/** Abas que têm caminho próprio na URL (o caminho é o próprio id). */
export const ROUTE_TABS: readonly TabId[] = ['decks', 'collection', 'explore', 'utilities', 'proxies'];
export const DEFAULT_TAB: TabId = 'decks';

export interface PathRoute {
  tab: TabId;
  /** Segmentos depois da aba (ex.: /decks/<id> → ["<id>"]). */
  rest: string[];
}

/** Caminho relativo à base do site, sem barras nas pontas ("decks/abc"). */
export function relativePath(pathname: string, base: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  let p = pathname;
  if (p.startsWith(b)) p = p.slice(b.length);
  else if (`${p}/` === b) p = '';
  return p.replace(/^\/+|\/+$/g, '');
}

export function parsePath(rel: string): PathRoute {
  const segs = rel.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  const tab = ROUTE_TABS.find((t) => t === segs[0]);
  if (!tab) return { tab: DEFAULT_TAB, rest: [] };
  return { tab, rest: segs.slice(1) };
}

/** Monta o caminho relativo ("decks/abc") a partir das partes, já codificado. */
export function buildPath(tab: TabId, ...rest: string[]): string {
  return [tab, ...rest].map(encodeURIComponent).join('/');
}

const COLOR_ORDER: ColorFilterValue[] = ['W', 'U', 'B', 'R', 'G', 'M', 'C'];

/** Filtro de cores ⇄ texto curto na URL ("wub"). */
export function colorsToParam(c: ColorFilterValue[]): string {
  return COLOR_ORDER.filter((x) => c.includes(x)).join('').toLowerCase();
}
export function colorsFromParam(s: string): ColorFilterValue[] {
  const up = s.toUpperCase();
  return COLOR_ORDER.filter((x) => up.includes(x));
}

/** Lista ⇄ texto separado por vírgulas. */
export function listToParam(l: string[]): string {
  return l.join(',');
}
export function listFromParam(s: string): string[] {
  return s ? s.split(',').filter(Boolean) : [];
}
