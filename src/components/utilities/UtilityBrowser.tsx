import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Image as ImageIcon, Layers, Printer, Search, Sparkles, X } from 'lucide-react';
import type { TokenCard, UtilityCategory } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { previewProps, toast } from '../../state/ui.tsx';
import { searchUtilities, UTILITY_CATEGORIES, type SearchResult } from '../../services/scryfall.ts';
import { getLocal, setLocal } from '../../services/storage.ts';
import { uid } from '../../services/normalize.ts';
import { backImage, frontImage, matchesColorFilter, sameArt, type ColorFilterValue } from '../../types/cardRules.ts';
import { Empty, Loading, Spinner, useDebounced } from '../common/bits.tsx';
import { ColorFilter } from '../common/ColorFilter.tsx';
import { GridControls, SelectBox, useSelection } from '../common/selection.tsx';
import { pickDeck } from '../common/DeckPicker.tsx';
import { openArtPicker } from '../launchers.tsx';

type Kind = UtilityCategory | 'all';
const KIND_LABELS: Record<Kind, string> = {
  all: 'Tudo', token: 'Fichas', emblem: 'Emblemas', counter: 'Marcadores do jogo', plane: 'Planos e fenômenos',
  dungeon: 'Masmorras', scheme: 'Esquemas', conspiracy: 'Conspirações', attraction: 'Atrações',
};
const ESSENTIALS = ['Treasure', 'Food', 'Clue', 'Blood', 'Map', 'Gold', 'Powerstone', 'Junk', 'Shard', 'Incubator', 'Copy', 'Role'];
const RECENT_KEY = 'util-recent';

function pushRecent(cards: TokenCard[]) {
  const cur = getLocal<TokenCard[]>(RECENT_KEY, []);
  const next = [...cards, ...cur.filter((c) => !cards.some((x) => sameArt(x, c)))].slice(0, 16);
  setLocal(RECENT_KEY, next);
}

interface Props {
  /** "pick": usado dentro do deck — clicar seleciona e o botão principal adiciona. */
  mode: 'tab' | 'pick';
  onPick?: (cards: TokenCard[]) => void;
}

export function UtilityBrowser({ mode, onPick }: Props) {
  const store = useStore();
  const { prefs, setPrefs } = store;
  const [text, setText] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [explore, setExplore] = useState(false);
  const [colors, setColors] = useState<ColorFilterValue[]>([]);
  const query = useDebounced(text.trim(), 350);
  const searching = !!query || kind !== 'all' || explore;
  const [picked, setPicked] = useState<TokenCard[]>([]);

  const deckTokens = useMemo(() => {
    const seen = new Set<string>();
    return store.data.decks.flatMap((d) => d.tokens.map((t) => t.card)).filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
  }, [store.data.decks]);
  const recent = useMemo(() => getLocal<TokenCard[]>(RECENT_KEY, []), [picked.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ações
  const toProxies = (cards: TokenCard[]) => {
    store.addToProxies(cards.map((c) => ({ card: c, quantity: 1 })));
    pushRecent(cards);
    toast(`${cards.length} item(ns) na fila de impressão.`);
  };
  const toDeck = (cards: TokenCard[]) =>
    pickDeck({
      title: 'Adicionar às fichas do deck',
      showCategory: false,
      onPick: (deckId) => {
        store.updateDeck(deckId, (d) => {
          const tokens = d.tokens.slice();
          for (const c of cards) {
            const i = tokens.findIndex((t) => sameArt(t.card, c));
            if (i >= 0) tokens[i] = { ...tokens[i], quantity: tokens[i].quantity + 1 };
            else tokens.push({ instanceId: uid('dt'), card: c, quantity: 1 });
          }
          return { ...d, tokens };
        });
        pushRecent(cards);
        toast(`${cards.length} item(ns) adicionados às fichas do deck.`);
      },
    });
  const togglePick = (c: TokenCard) => setPicked((p) => (p.some((x) => x.id === c.id) ? p.filter((x) => x.id !== c.id) : [...p, c]));

  const tileProps: TileGridProps = { mode, picked, onTogglePick: togglePick, onPrint: toProxies, onDeck: toDeck, colors };

  return (
    <div className={`util ${mode === 'pick' ? 'util-pick' : ''}`}>
      <div className="util-search">
        <div className="input-icon util-input">
          <Search size={18} />
          <input className="input" autoFocus={mode === 'pick'} value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar fichas, emblemas, marcadores, planos… (em inglês: zombie, treasure, flying 2/2)" />
          {text && <button className="btn btn-ghost btn-icon btn-xs util-clear" onClick={() => setText('')} aria-label="Limpar busca"><X size={14} /></button>}
        </div>
        <select className="select util-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Tipo de utilitário">
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
      </div>
      <div className="toolbar util-filters">
        <ColorFilter value={colors} onChange={setColors} />
        <div className="spacer" />
        {(searching || explore) && <button className="btn btn-ghost btn-sm" onClick={() => { setText(''); setKind('all'); setExplore(false); }}><X size={14} /> Voltar ao início</button>}
        <GridControls size={prefs.gridSize} onSize={(n) => setPrefs({ gridSize: n })} details={prefs.showDetails} onDetails={(b) => setPrefs({ showDetails: b })} />
      </div>

      {searching ? (
        <Results kind={kind} query={query} tile={tileProps} />
      ) : (
        <div className="util-home">
          {deckTokens.length > 0 && <Shelf title="Fichas dos seus decks" hint="já usadas nos seus decks" cards={deckTokens} tile={tileProps} />}
          {recent.length > 0 && <Shelf title="Recentes" cards={recent} tile={tileProps} />}
          <RemoteShelf title="Essenciais" hint="tesouro, comida, pista e companhia" query={`(${ESSENTIALS.map((n) => `!"${n}"`).join(' or ')})`} kind="token" tile={tileProps} />
          <RemoteShelf title="Marcadores do jogo" hint="monarca, iniciativa, dia/noite, o Anel…" query="" kind="counter" tile={tileProps} onMore={() => setKind('counter')} />
          <RemoteShelf title="Emblemas" query="" kind="emblem" tile={tileProps} onMore={() => setKind('emblem')} />
          <div className="util-explore">
            <div>
              <h3>Explorar tudo</h3>
              <p className="small subtle">Mais de 2.000 fichas e utilitários do Scryfall, de A a Z. Use o filtro de tipo para planos, masmorras, esquemas, conspirações e atrações.</p>
            </div>
            <button className="btn btn-secondary" onClick={() => setExplore(true)}>Explorar <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {mode === 'pick' && (
        <div className="util-pick-bar">
          <span className="small">{picked.length ? `${picked.length} selecionado(s)` : 'Clique nas cartas para selecionar'}</span>
          <div className="spacer" />
          {picked.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setPicked([])}>Limpar</button>}
          <button className="btn btn-primary" disabled={!picked.length} onClick={() => { pushRecent(picked); onPick?.(picked); }}><Check size={16} /> Adicionar {picked.length || ''}</button>
        </div>
      )}
    </div>
  );
}

interface TileGridProps {
  mode: 'tab' | 'pick';
  picked: TokenCard[];
  onTogglePick: (c: TokenCard) => void;
  onPrint: (c: TokenCard[]) => void;
  onDeck: (c: TokenCard[]) => void;
  colors: ColorFilterValue[];
}

function Shelf({ title, hint, cards, tile, onMore, loading }: { title: string; hint?: string; cards: TokenCard[]; tile: TileGridProps; onMore?: () => void; loading?: boolean }) {
  return (
    <section className="util-shelf">
      <header>
        <h3>{title}</h3>
        {hint && <span className="small subtle">{hint}</span>}
        <div className="spacer" />
        {loading && <Spinner />}
        {onMore && cards.length > 0 && <button className="btn btn-ghost btn-sm" onClick={onMore}>Ver todos ({cards.length >= 175 ? '175+' : cards.length}) <ArrowRight size={14} /></button>}
      </header>
      <TileGrid cards={cards.slice(0, 16)} {...tile} limitRows />
    </section>
  );
}

function RemoteShelf({ title, hint, query, kind, tile, onMore }: { title: string; hint?: string; query: string; kind: UtilityCategory; tile: TileGridProps; onMore?: () => void }) {
  const [cards, setCards] = useState<TokenCard[] | null>(null);
  useEffect(() => {
    let alive = true;
    searchUtilities(kind, query, { order: 'name' })
      .then((r) => {
        if (!alive) return;
        // Uma arte por nome nas prateleiras (variedade em vez de repetições).
        const seen = new Set<string>();
        setCards(r.items.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true))));
      })
      .catch(() => alive && setCards([]));
    return () => {
      alive = false;
    };
  }, [kind, query]);
  if (cards && !cards.length) return null;
  return <Shelf title={title} hint={hint} cards={cards ?? []} tile={tile} onMore={onMore} loading={!cards} />;
}

function Results({ kind, query, tile }: { kind: Kind; query: string; tile: TileGridProps }) {
  const [result, setResult] = useState<SearchResult<TokenCard> | null>(null);
  const [items, setItems] = useState<TokenCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setItems([]);
    setResult(null);
    searchUtilities(kind, query, { order: 'name' })
      .then((r) => {
        if (!alive) return;
        setResult(r);
        setItems(r.items);
      })
      .catch((e) => alive && setError(e?.message ?? 'Erro ao buscar no Scryfall.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [kind, query]);

  // Carrega mais páginas ao chegar no fim (sem botão).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !result?.hasMore || loading) return;
    const io = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting) || !result.nextPage) return;
      io.disconnect();
      setLoading(true);
      try {
        const r = await searchUtilities(kind, query, { page: result.nextPage });
        setResult(r);
        setItems((x) => [...x, ...r.items]);
      } catch {
        /* ignora */
      } finally {
        setLoading(false);
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [result, loading, kind, query]);

  return (
    <div>
      <div className="row small subtle" style={{ marginBottom: 10 }}>
        {result && <span>{result.total.toLocaleString('pt-BR')} resultado(s){kind !== 'all' ? ` em ${KIND_LABELS[kind]}` : ''}</span>}
      </div>
      {error && <div className="callout danger">{error}</div>}
      {!loading && !error && result && !items.length && <Empty icon={<Sparkles size={36} />} title="Nada encontrado">Tente outro termo em inglês (ex.: “zombie”, “treasure”, “2/2 flying”).</Empty>}
      <TileGrid cards={items} {...tile} />
      <div ref={sentinel} />
      {loading && <Loading text="Buscando no Scryfall…" />}
    </div>
  );
}

function TileGrid({ cards, mode, picked, onTogglePick, onPrint, onDeck, colors, limitRows }: TileGridProps & { cards: TokenCard[]; limitRows?: boolean }) {
  const { prefs } = useStore();
  const [overrides, setOverrides] = useState<Record<string, TokenCard>>({});
  const visible = useMemo(() => cards.map((c) => overrides[c.id] ?? c).filter((c) => matchesColorFilter(c, colors, 'exact')), [cards, overrides, colors]);
  const ids = useMemo(() => visible.map((c) => c.id), [visible]);
  const sel = useSelection(ids);
  const selected = () => visible.filter((c) => sel.selected.has(c.id));

  const changeArt = (i: number) =>
    openArtPicker({
      cards: visible,
      start: i,
      tokens: true,
      onSelect: (idx, card) => setOverrides((o) => ({ ...o, [visible[idx].id]: { ...card, id: visible[idx].id, utilityType: visible[idx].utilityType } })),
    });

  return (
    <>
      <div className={`card-grid ${limitRows ? 'shelf-grid' : ''}`} style={{ ['--card-w' as string]: `${prefs.gridSize}px` }}>
        {visible.map((c, i) => {
          const isPicked = mode === 'pick' ? picked.some((p) => p.id === c.id) : sel.isSelected(c.id);
          return (
            <div key={c.id + i} className={`card-tile ${isPicked ? 'selected' : ''}`}>
              <div
                className="card-img-wrap"
                {...previewProps(frontImage(c, 'normal'), backImage(c))}
                onClick={(e) => (mode === 'pick' ? onTogglePick(c) : (e.shiftKey || sel.count > 0) && sel.toggle(c.id, e))}
                style={mode === 'pick' ? { cursor: 'pointer' } : undefined}
              >
                <img src={frontImage(c, prefs.gridSize > 200 ? 'normal' : 'small')} loading="lazy" decoding="async" alt={c.name} />
                <SelectBox checked={isPicked} onClick={(e) => (mode === 'pick' ? onTogglePick(c) : sel.toggle(c.id, e))} />
                <div className="card-tile-actions">
                  <button className="btn btn-secondary btn-icon btn-sm" title="Trocar arte" onClick={(e) => { e.stopPropagation(); changeArt(i); }}><ImageIcon size={15} /></button>
                  {mode === 'tab' && (
                    <>
                      <button className="btn btn-secondary btn-icon btn-sm" title="Adicionar à fila de impressão" onClick={() => onPrint([c])}><Printer size={15} /></button>
                      <button className="btn btn-secondary btn-icon btn-sm" title="Adicionar às fichas de um deck" onClick={() => onDeck([c])}><Layers size={15} /></button>
                    </>
                  )}
                </div>
              </div>
              {prefs.showDetails && (
                <div className="card-tile-info">
                  <span className="name">{c.name}</span>
                  <span className="meta ellipsis">{c.typeLine.replace(/^Token /, '')}{c.power != null ? ` · ${c.power}/${c.toughness}` : ''}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {mode === 'tab' && sel.count > 0 && (
        <div className="selection-bar">
          <strong>{sel.count} selecionado(s)</strong>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => { onPrint(selected()); sel.clear(); }}><Printer size={15} /> Imprimir</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { onDeck(selected()); sel.clear(); }}><Layers size={15} /> Ao deck</button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={sel.clear} aria-label="Limpar seleção"><X size={16} /></button>
        </div>
      )}
    </>
  );
}

export { UTILITY_CATEGORIES };
