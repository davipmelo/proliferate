import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Layers, Printer, Search, Sparkles, X } from 'lucide-react';
import type { TokenCard, UtilityCategory } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { previewProps, toast } from '../../state/ui.tsx';
import { searchUtilities, UTILITY_CATEGORIES, type SearchResult } from '../../services/scryfall.ts';
import { uid } from '../../services/normalize.ts';
import { backImage, frontImage, matchesColorFilter, sameArt, type ColorFilterValue } from '../../types/cardRules.ts';
import { CardThumb, Empty, Loading, ViewToggle } from '../common/bits.tsx';
import { ColorFilter } from '../common/ColorFilter.tsx';
import { GridControls, SelectBox, useSelection } from '../common/selection.tsx';
import { usePersistent } from '../common/hooks.ts';
import { pickDeck } from '../common/DeckPicker.tsx';
import { openArtPicker } from '../launchers.tsx';

type Shortcut = { id: string; label: string; query: string; order?: string };
const SHORTCUTS: Shortcut[] = [
  { id: 'all', label: 'Todos (A–Z)', query: '' },
  { id: 'popular', label: 'Populares', query: '(' + ['Treasure', 'Food', 'Clue', 'Blood', 'Map', 'Soldier', 'Zombie', 'Goblin', 'Spirit', 'Saproling', 'Beast', 'Human', 'Elf Warrior', 'Copy', 'Thopter', 'Servo', 'Insect', 'Angel', 'Dragon', 'Squirrel'].map((n) => `!"${n}"`).join(' or ') + ')' },
  { id: 'treasure', label: 'Tesouro', query: '!"Treasure"' },
  { id: 'food', label: 'Comida', query: '!"Food"' },
  { id: 'clue', label: 'Pista', query: '!"Clue"' },
  { id: 'blood', label: 'Sangue', query: '!"Blood"' },
  { id: 'map', label: 'Mapa', query: '!"Map"' },
  { id: 'zombie', label: 'Zumbi', query: 't:zombie' },
  { id: 'soldier', label: 'Soldado', query: 't:soldier' },
  { id: 'goblin', label: 'Goblin', query: 't:goblin' },
  { id: 'spirit', label: 'Espírito', query: 't:spirit' },
  { id: 'angel', label: 'Anjo', query: 't:angel' },
  { id: 'dragon', label: 'Dragão', query: 't:dragon' },
  { id: 'beast', label: 'Fera', query: 't:beast' },
  { id: 'thopter', label: 'Tóptero', query: 't:thopter' },
  { id: 'copy', label: 'Cópia', query: '!"Copy"' },
  { id: 'enchantment', label: 'Encantamento', query: 't:enchantment' },
];

export default function UtilitiesTab() {
  const store = useStore();
  const { prefs, setPrefs } = store;
  const [cat, setCat] = usePersistent<UtilityCategory>('util-cat', 'token');
  const [shortcut, setShortcut] = useState<string>('all');
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [colors, setColors] = useState<ColorFilterValue[]>([]);
  const [result, setResult] = useState<SearchResult<TokenCard> | null>(null);
  const [items, setItems] = useState<TokenCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = prefs.utilitiesView;

  const sc = SHORTCUTS.find((s) => s.id === shortcut) ?? SHORTCUTS[0];
  const query = [cat === 'token' ? sc.query : '', submitted].filter(Boolean).join(' ');
  const order = cat === 'token' ? sc.order ?? 'name' : 'name';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setItems([]);
    searchUtilities(cat, query, { order })
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
  }, [cat, query, order]);

  const loadMore = async () => {
    if (!result?.nextPage) return;
    setLoading(true);
    try {
      const r = await searchUtilities(cat, query, { page: result.nextPage });
      setResult(r);
      setItems((x) => [...x, ...r.items]);
    } catch (e: any) {
      toast(e?.message ?? 'Erro ao carregar mais.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo(() => items.filter((c) => matchesColorFilter(c, colors, 'exact')), [items, colors]);
  const ids = useMemo(() => visible.map((c) => c.id), [visible]);
  const sel = useSelection(ids);
  const selected = () => visible.filter((c) => sel.selected.has(c.id));

  const toProxies = (cards: TokenCard[]) => {
    store.addToProxies(cards.map((c) => ({ card: c, quantity: 1 })));
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
        toast(`${cards.length} item(ns) adicionados às fichas do deck.`);
        sel.clear();
      },
    });
  // Trocar a arte aqui vale para a próxima ação (fila/deck) — atualiza o item exibido.
  const changeArt = (i: number) =>
    openArtPicker({
      cards: visible,
      start: i,
      tokens: true,
      onSelect: (idx, card) => {
        const target = visible[idx];
        setItems((xs) => xs.map((x) => (x.id === target.id ? { ...card, utilityType: x.utilityType } : x)));
      },
    });

  return (
    <div>
      <div className="page-header">
        <div className="grow">
          <h1>Utilitários</h1>
          <p className="desc">Fichas, emblemas, planos, masmorras, marcadores, esquemas, conspirações e atrações do Scryfall.</p>
        </div>
      </div>

      <div className="util-cats" role="tablist">
        {UTILITY_CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={`tab ${cat === c.id ? 'active' : ''}`} onClick={() => { setCat(c.id); setShortcut('all'); }}>
            {c.label}
          </button>
        ))}
      </div>

      {cat === 'token' && (
        <div className="chips-scroll" style={{ marginBottom: 12 }}>
          {SHORTCUTS.map((s) => (
            <button key={s.id} className={`chip ${shortcut === s.id ? 'active' : ''}`} onClick={() => setShortcut(s.id)}>{s.label}</button>
          ))}
        </div>
      )}

      <div className="toolbar">
        <form className="row grow" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); setSubmitted(text.trim()); }}>
          <div className="input-icon">
            <Search size={16} />
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Busca livre em inglês (ex.: flying, 1/1, Elf Warrior)…" />
          </div>
          <button className="btn btn-secondary" type="submit">Buscar</button>
          {submitted && <button type="button" className="btn btn-ghost btn-icon" onClick={() => { setText(''); setSubmitted(''); }} aria-label="Limpar busca"><X size={16} /></button>}
        </form>
        <div className="spacer" />
        {view === 'grid' && <GridControls size={prefs.gridSize} onSize={(n) => setPrefs({ gridSize: n })} details={prefs.showDetails} onDetails={(b) => setPrefs({ showDetails: b })} />}
        <ViewToggle value={view} onChange={(v) => setPrefs({ utilitiesView: v })} />
      </div>
      <div className="toolbar">
        <ColorFilter value={colors} onChange={setColors} />
        <div className="spacer" />
        {result && <span className="small subtle">{visible.length} de {result.total}</span>}
        {visible.length > 0 && <button className="btn btn-ghost btn-xs" onClick={sel.count === visible.length ? sel.clear : sel.selectAll}>{sel.count === visible.length ? 'Desmarcar tudo' : 'Selecionar tudo'}</button>}
      </div>

      {error && <div className="callout danger">{error}</div>}
      {!loading && !error && visible.length === 0 && <Empty icon={<Sparkles size={36} />} title="Nada encontrado">Tente outra busca (em inglês) ou categoria.</Empty>}

      {view === 'grid' ? (
        <div className="card-grid" style={{ ['--card-w' as string]: `${prefs.gridSize}px` }}>
          {visible.map((c, i) => (
            <div key={c.id} className={`card-tile ${sel.isSelected(c.id) ? 'selected' : ''}`}>
              <div className="card-img-wrap" {...previewProps(frontImage(c, 'normal'), backImage(c))} onClick={(e) => (e.shiftKey || sel.count > 0) && sel.toggle(c.id, e)}>
                <img src={frontImage(c, prefs.gridSize > 200 ? 'normal' : 'small')} loading="lazy" decoding="async" alt={c.name} />
                <SelectBox checked={sel.isSelected(c.id)} onClick={(e) => sel.toggle(c.id, e)} />
                <div className="card-tile-actions">
                  <button className="btn btn-secondary btn-icon btn-sm" title="Trocar arte" onClick={() => changeArt(i)}><ImageIcon size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Adicionar à fila de impressão" onClick={() => toProxies([c])}><Printer size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Adicionar a um deck" onClick={() => toDeck([c])}><Layers size={15} /></button>
                </div>
              </div>
              {prefs.showDetails && (
                <div className="card-tile-info">
                  <span className="name">{c.name}</span>
                  <span className="meta ellipsis">{c.typeLine.replace(/^Token /, '')}{c.power != null ? ` · ${c.power}/${c.toughness}` : ''}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        visible.length > 0 && (
          <div className="list">
            {visible.map((c, i) => (
              <div key={c.id} className={`list-row ${sel.isSelected(c.id) ? 'selected' : ''}`}>
                <SelectBox checked={sel.isSelected(c.id)} onClick={(e) => sel.toggle(c.id, e)} className="inline-select" />
                <CardThumb card={c} />
                <div className="list-main">
                  <div className="list-title"><span>{c.name}</span>{c.power != null && <span className="badge">{c.power}/{c.toughness}</span>}</div>
                  <div className="list-sub"><span className="ellipsis">{c.typeLine} · {c.setName}</span></div>
                </div>
                <div className="list-actions">
                  <button className="btn btn-ghost btn-icon btn-sm" title="Trocar arte" onClick={() => changeArt(i)}><ImageIcon size={16} /></button>
                  <button className="btn btn-ghost btn-icon btn-sm" title="Adicionar à fila de impressão" onClick={() => toProxies([c])}><Printer size={16} /></button>
                  <button className="btn btn-ghost btn-icon btn-sm" title="Adicionar a um deck" onClick={() => toDeck([c])}><Layers size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
      {loading && <Loading text="Buscando no Scryfall…" />}
      {!loading && result?.hasMore && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={loadMore}>Carregar mais</button>
        </div>
      )}

      {sel.count > 0 && (
        <div className="selection-bar">
          <strong>{sel.count} selecionado(s)</strong>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => { toProxies(selected()); sel.clear(); }}><Printer size={15} /> Imprimir</button>
          <button className="btn btn-secondary btn-sm" onClick={() => toDeck(selected())}><Layers size={15} /> Ao deck</button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={sel.clear} aria-label="Limpar seleção"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
