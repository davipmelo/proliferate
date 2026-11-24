// Temas + tribos com contagem e arte (exploreMeta.json), prontos para a grade da aba Explorar.
import meta from './exploreMeta.json';
import { MIN_TRIBE_COMMANDERS, THEMES, TRIBES, type ExploreTheme } from './exploreThemes.ts';

export interface CatalogItem extends ExploreTheme {
  count?: number;
  art?: string;
  artCard?: string;
}

const items = (meta as { items: Record<string, { count: number; art?: string; artCard?: string }> }).items;
const withMeta = (t: ExploreTheme): CatalogItem => ({ ...t, ...items[t.slug] });

/** Grade: temas com algum commander e tribos acima do mínimo, em ordem alfabética. */
export const CATALOG: CatalogItem[] = [
  ...THEMES.map(withMeta).filter((t) => t.count == null || t.count > 0),
  ...TRIBES.map(withMeta).filter((t) => t.count == null || t.count >= MIN_TRIBE_COMMANDERS),
].sort((a, b) => a.name.replace(/^[^a-z0-9]+/i, '').localeCompare(b.name.replace(/^[^a-z0-9]+/i, ''), 'en'));

const BY_SLUG = new Map(CATALOG.map((t) => [t.slug, t]));
export const findTheme = (slug: string) => BY_SLUG.get(slug);
