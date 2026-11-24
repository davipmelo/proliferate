import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Compass, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { CATALOG, findTheme, type CatalogItem } from '../../data/exploreCatalog.ts';
import type { ExploreKind } from '../../data/exploreThemes.ts';
import { buildExploreQuery, searchCommanders, SORT_LABELS, type ExploreCommander, type ExploreFilters, type ExplorePage, type ExploreSort, type IdentityMode } from '../../services/explore.ts';
import { buildPath, colorsFromParam, colorsToParam } from '../../services/routes.ts';
import { hrefFor, navigate, useRoute, useUrlParam, useUrlState } from '../../state/router.ts';
import { previewProps } from '../../state/ui.tsx';
import { backImage, frontImage, type ColorFilterValue } from '../../types/cardRules.ts';
import { Empty, formatUsd, Loading, useDebounced } from '../common/bits.tsx';
import { ColorFilter } from '../common/ColorFilter.tsx';
import { openCardInfo } from '../launchers.tsx';

const themesPath = (slugs: string[]) => buildPath('explore', ...slugs);

/** Link interno que respeita Ctrl/Cmd/botão do meio (abrir em nova aba). */
function navClick(path: string, keepQuery = false) {
  return (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(path + (keepQuery ? window.location.search : ''));
  };
}

export default function ExploreTab() {
  const { rest } = useRoute();
  if (!rest.length) return <ThemeGrid />;
  const themes = rest.map(findTheme).filter((t): t is CatalogItem => !!t);
  if (!themes.length) {
    return (
      <Empty icon={<Compass size={40} />} title="Tema não encontrado" action={<a className="btn btn-secondary" href={hrefFor(themesPath([]))} onClick={navClick(themesPath([]))}><ArrowLeft size={16} /> Ver todos os temas</a>}>
        Esse tema não existe (ou mudou de nome).
      </Empty>
    );
  }
  return <CommanderBrowser themes={themes} />;
}

/* ---------------- Grade de temas ---------------- */

const KIND_LABELS: Record<'' | ExploreKind, string> = { '': 'Todos', theme: 'Temas', tribe: 'Tribos' };

function ThemeGrid() {
  const [q, setQ] = useUrlParam('q');
  const [kind, setKind] = useUrlState<'' | ExploreKind>('kind', (s) => (s === 'theme' || s === 'tribe' ? s : ''), (v) => v);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return CATALOG.filter((t) => (!kind || t.kind === kind) && (!n || t.name.toLowerCase().includes(n)));
  }, [q, kind]);

  return (
    <div>
      <div className="page-header">
        <div className="grow">
          <h1>Explorar</h1>
          <p className="desc">Descubra commanders por tema ou tribo, do mais popular ao menos jogado.</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="input-icon">
          <Search size={16} />
          <input className="input" placeholder="Buscar tema ou tribo (em inglês: tokens, elves…)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg" role="group" aria-label="Tipo">
          {(Object.keys(KIND_LABELS) as ('' | ExploreKind)[]).map((k) => (
            <button key={k} className={`seg-btn wide ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)} aria-pressed={kind === k}>{KIND_LABELS[k]}</button>
          ))}
        </div>
        <div className="spacer" />
        <span className="small subtle">{list.length} {list.length === 1 ? 'item' : 'itens'}</span>
      </div>

      {list.length === 0 ? (
        <Empty icon={<Search size={36} />} title="Nada encontrado">Tente outro nome, em inglês.</Empty>
      ) : (
        <div className="explore-themes">
          {list.map((t) => (
            <a key={t.slug} className="theme-tile" href={hrefFor(themesPath([t.slug]))} onClick={navClick(themesPath([t.slug]))} title={t.artCard ? `${t.name} · capa: ${t.artCard}` : t.name}>
              <span className="theme-tile-art">{t.art && <img src={t.art} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}</span>
              <span className="theme-tile-name">{t.name}</span>
              {t.count != null && <span className="theme-tile-count">{t.count.toLocaleString('pt-BR')}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Commanders de um ou mais temas ---------------- */

const CMC_OPTIONS = ['', '1', '2', '3', '4', '5', '6', '7'];
const PRICE_OPTIONS = ['', '1', '5', '10', '20', '50'];
const ERA_LABELS: Record<string, string> = { '': 'Qualquer época', recent: 'Últimos 2 anos', '2020': 'Desde 2020', '2015': 'Desde 2015', old: 'Antes de 2015' };
const IDENTITY_LABELS: Record<IdentityMode, [string, string]> = {
  within: ['Dentro de', 'Identidade de cor contida nas cores escolhidas'],
  exact: ['Exato', 'Exatamente as cores escolhidas'],
  includes: ['Inclui', 'Tem pelo menos as cores escolhidas'],
};
const flag = (s: string) => s === '1';
const unflag = (b: boolean) => (b ? '1' : '');

function CommanderBrowser({ themes }: { themes: CatalogItem[] }) {
  const slugs = themes.map((t) => t.slug);
  const [colors, setColors] = useUrlState<ColorFilterValue[]>('colors', colorsFromParam, colorsToParam);
  const [identity, setIdentity] = useUrlState<IdentityMode>('id', (s) => (s === 'exact' || s === 'includes' ? s : 'within'), (v) => (v === 'within' ? '' : v));
  const [cmc, setCmc] = useUrlParam('cmc');
  const [maxPrice, setMaxPrice] = useUrlParam('price');
  const [era, setEra] = useUrlParam('era');
  const [partner, setPartner] = useUrlState('partner', flag, unflag);
  const [backgrounds, setBackgrounds] = useUrlState('bg', flag, unflag);
  const [extra, setExtra] = useUrlParam('adv');
  const [sort, setSort] = useUrlState<ExploreSort>('sort', (s) => (s in SORT_LABELS ? (s as ExploreSort) : 'popular'), (v) => (v === 'popular' ? '' : v));
  const [showFilters, setShowFilters] = useState(false);

  // Busca avançada: digita local, aplica na URL com atraso.
  const [extraInput, setExtraInput] = useState(extra);
  const extraDebounced = useDebounced(extraInput, 600);
  useEffect(() => setExtraInput(extra), [extra]);
  useEffect(() => {
    if (extraDebounced !== extra) setExtra(extraDebounced);
  }, [extraDebounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters: ExploreFilters = { colors, identity, cmc, maxPrice, era, partner, backgrounds, extra };
  const query = buildExploreQuery(themes, filters);
  const activeCount = [colors.length > 0, !!cmc, !!maxPrice, !!era, partner, backgrounds, !!extra].filter(Boolean).length;
  const clearFilters = () => navigate(themesPath(slugs) + (sort !== 'popular' ? `?sort=${sort}` : ''), { replace: true });

  const others = useMemo(() => CATALOG.filter((t) => !slugs.includes(t.slug)), [slugs.join('/')]); // eslint-disable-line react-hooks/exhaustive-deps
  const addTheme = (slug: string) => slug && navigate(themesPath([...slugs, slug]) + window.location.search);
  const removeTheme = (slug: string) => {
    const next = slugs.filter((s) => s !== slug);
    navigate(themesPath(next) + (next.length ? window.location.search : ''));
  };

  return (
    <div>
      <a className="btn btn-ghost btn-sm explore-back" href={hrefFor(themesPath([]))} onClick={navClick(themesPath([]))}><ArrowLeft size={15} /> Todos os temas</a>
      <div className="page-header">
        <div className="grow">
          <h1>{themes.map((t) => t.name).join(' + ')}</h1>
          <p className="desc">
            {themes.length > 1 ? 'Commanders que se encaixam em todos os temas escolhidos.' : themes[0].kind === 'tribe' ? 'Commanders da tribo ou que falam dela no texto.' : 'Commanders cujo texto combina com o tema.'}{' '}
            Ordem de popularidade do EDHREC; a seleção vem do texto das cartas, então pode diferir da página do EDHREC.
          </p>
        </div>
      </div>

      <div className="toolbar explore-themes-bar">
        {themes.map((t) => (
          <span key={t.slug} className="chip active">
            {t.name}
            <button className="chip-x" onClick={() => removeTheme(t.slug)} aria-label={`Remover ${t.name}`} title="Remover tema"><X size={13} /></button>
          </span>
        ))}
        <label className="chip explore-add">
          <Plus size={14} /> Combinar com…
          <select value="" onChange={(e) => addTheme(e.target.value)} aria-label="Combinar com outro tema">
            <option value="">Combinar com…</option>
            {others.map((t) => <option key={t.slug} value={t.slug}>{t.name}{t.kind === 'tribe' ? ' (tribo)' : ''}</option>)}
          </select>
        </label>
      </div>

      <div className="toolbar">
        <ColorFilter value={colors} onChange={setColors} />
        <div className="seg" role="group" aria-label="Modo de cor">
          {(Object.keys(IDENTITY_LABELS) as IdentityMode[]).map((m) => (
            <button key={m} className={`seg-btn wide ${identity === m ? 'active' : ''}`} title={IDENTITY_LABELS[m][1]} onClick={() => setIdentity(m)} aria-pressed={identity === m}>{IDENTITY_LABELS[m][0]}</button>
          ))}
        </div>
        <div className="spacer" />
        <button className={`btn btn-secondary btn-sm explore-filter-toggle ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
          <SlidersHorizontal size={15} /> Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        <select className="select select-sm explore-sort" value={sort} onChange={(e) => setSort(e.target.value as ExploreSort)} aria-label="Ordenar">
          {(Object.keys(SORT_LABELS) as ExploreSort[]).map((s) => <option key={s} value={s}>Ordenar: {SORT_LABELS[s]}</option>)}
        </select>
      </div>

      <div className={`toolbar explore-filters ${showFilters ? 'open' : ''}`}>
        <select className="select select-sm" value={cmc} onChange={(e) => setCmc(e.target.value)} aria-label="Custo de mana">
          {CMC_OPTIONS.map((c) => <option key={c} value={c}>{c === '' ? 'Qualquer custo' : c === '7' ? 'Custo 7+' : `Custo ${c}`}</option>)}
        </select>
        <select className="select select-sm" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} aria-label="Preço máximo">
          {PRICE_OPTIONS.map((p) => <option key={p} value={p}>{p === '' ? 'Qualquer preço' : `Até ${formatUsd(Number(p))}`}</option>)}
        </select>
        <select className="select select-sm" value={era} onChange={(e) => setEra(e.target.value)} aria-label="Época de lançamento">
          {Object.entries(ERA_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="check small"><input type="checkbox" checked={partner} onChange={(e) => setPartner(e.target.checked)} /> Com parceiro / Background</label>
        <label className="check small"><input type="checkbox" checked={backgrounds} onChange={(e) => setBackgrounds(e.target.checked)} /> Incluir Backgrounds</label>
        <div className="input-icon explore-adv">
          <Search size={15} />
          <input className="input input-sm" value={extraInput} onChange={(e) => setExtraInput(e.target.value)} placeholder="Busca avançada (sintaxe do Scryfall: t:dragon, pow>=5…)" aria-label="Busca avançada" />
        </div>
        {activeCount > 0 && <button className="btn btn-ghost btn-sm" onClick={clearFilters}><X size={14} /> Limpar filtros</button>}
      </div>

      <CommanderResults query={query} sort={sort} />
    </div>
  );
}

function CommanderResults({ query, sort }: { query: string; sort: ExploreSort }) {
  const [page, setPage] = useState<ExplorePage | null>(null);
  const [items, setItems] = useState<ExploreCommander[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setPage(null);
    setItems([]);
    searchCommanders(query, sort)
      .then((r) => alive && (setPage(r), setItems(r.items)))
      .catch((e) => alive && setError(e?.message ?? 'Erro ao buscar no Scryfall.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query, sort, retry]);

  // Mais páginas ao chegar no fim.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !page?.nextPage || loading) return;
    const next = page.nextPage;
    const io = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setLoading(true);
      try {
        const r = await searchCommanders(query, sort, next);
        setPage(r);
        setItems((x) => [...x, ...r.items]);
      } catch {
        /* tenta de novo ao rolar */
      } finally {
        setLoading(false);
      }
    }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [page, loading, query, sort]);

  return (
    <div>
      <div className="small subtle" style={{ marginBottom: 10 }}>
        {page && `${page.total.toLocaleString('pt-BR')} ${page.total === 1 ? 'commander' : 'commanders'} · ${SORT_LABELS[sort].toLowerCase()}`}
      </div>
      {error && (
        <div className="callout danger">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setRetry((r) => r + 1)}>Tentar de novo</button>
        </div>
      )}
      {!loading && !error && page && !items.length && <Empty icon={<Compass size={36} />} title="Nenhum commander encontrado">Afrouxe os filtros ou remova um dos temas.</Empty>}
      <div className="card-grid explore-grid">
        {items.map((c, i) => (
          <div key={c.card.id} className="card-tile">
            <button
              className="card-img-wrap explore-card"
              {...previewProps(frontImage(c.card, 'normal'), backImage(c.card))}
              onClick={() => openCardInfo(c.card, { edhrecUrl: c.edhrecUrl })}
              title={`${c.card.name} — ver informações`}
            >
              <img src={frontImage(c.card, 'normal')} loading="lazy" decoding="async" alt={c.card.name} referrerPolicy="no-referrer" />
              {sort === 'popular' && <span className="qty-badge">#{i + 1}</span>}
              {c.banned && <span className="banned-badge">Banido</span>}
            </button>
            <div className="card-tile-info">
              <span className="name">{c.card.name}</span>
              <span className="meta">{formatUsd(c.card.priceUsd)}</span>
            </div>
          </div>
        ))}
      </div>
      <div ref={sentinel} />
      {loading && <Loading text="Buscando no Scryfall…" />}
    </div>
  );
}
