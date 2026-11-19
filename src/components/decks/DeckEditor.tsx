import { lazy, Suspense, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRightLeft, Crop, Download, Image as ImageIcon, ImageDown, Library, MoreVertical, Pencil, Plus, Printer, Search, Trash2, Upload,
} from 'lucide-react';
import type { CollectionUsage, ColorMatchMode, Deck, DeckCard, DeckCategory } from '../../types/models.ts';
import { CATEGORY_LABELS } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { confirmDialog, openModal, previewProps, toast } from '../../state/ui.tsx';
import { formatInfo } from '../../types/formats.ts';
import { backImage, frontImage, isLand, mainType, matchesColorFilter, TYPE_LABELS, TYPE_ORDER, type ColorFilterValue, type MainType } from '../../types/cardRules.ts';
import { deckCardAvailability } from '../../services/usage.ts';
import { compareBy, matchesText, SORT_LABELS, type SortKey } from '../../services/sorting.ts';
import { CardThumb, ColorPips, Dropdown, formatUsd, Loading, ManaCost, QtyControl, ViewToggle } from '../common/bits.tsx';
import { ColorFilter } from '../common/ColorFilter.tsx';
import { GridControls } from '../common/selection.tsx';
import { usePersistent } from '../common/hooks.ts';
import { openAddCard, openArtPicker, openExport, openImport } from '../launchers.tsx';
import { DeckFormModal } from './DeckFormModal.tsx';
import { CoverEditorModal } from './CoverEditorModal.tsx';
import { DeckTokens } from './DeckTokens.tsx';
import { coverStyle, deckColors, deckCount, deckCoverImage, deckTarget, deckValue } from './deckUtils.ts';

const DeckCharts = lazy(() => import('./DeckCharts.tsx'));
const PosterModal = lazy(() => import('./PosterModal.tsx'));

const SORTS: SortKey[] = ['name', 'quantity', 'available', 'cmc', 'type', 'set', 'rarity', 'price'];
const LIST_CATEGORIES: DeckCategory[] = ['companion', 'main', 'sideboard', 'maybeboard'];

interface Group {
  key: string;
  label: string;
  cards: DeckCard[];
}

export function DeckEditor({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const store = useStore();
  const { data, prefs, setPrefs, usage } = store;
  const [q, setQ] = useState('');
  const [colors, setColors] = useState<ColorFilterValue[]>([]);
  const [mode, setMode] = usePersistent<ColorMatchMode>('deck-color-mode', 'identity');
  const [sort, setSort] = usePersistent<SortKey>('deck-sort-cards', 'name');
  const view = prefs.deckEditorView;
  const groupBy = prefs.deckGroupBy;
  const info = formatInfo(deck.format);
  const count = deckCount(deck);
  const target = deckTarget(deck);

  const filtered = useMemo(() => {
    const cmp = compareBy(sort);
    return deck.cards
      .filter((c) => c.category !== 'commander' && c.category !== 'partner')
      .filter((c) => matchesText(c.card, q) && matchesColorFilter(c.card, colors, mode))
      .map((c) => ({ dc: c, card: c.card, quantity: c.quantity, available: availOf(c, data.collection, usage) }))
      .sort(cmp)
      .map((x) => x.dc);
  }, [deck.cards, q, colors, mode, sort, data.collection, usage]);

  const groups: Group[] = useMemo(() => {
    if (groupBy === 'category') {
      return LIST_CATEGORIES.map((cat) => ({ key: cat, label: CATEGORY_LABELS[cat], cards: filtered.filter((c) => c.category === cat) })).filter((g) => g.cards.length);
    }
    const main = filtered.filter((c) => c.category === 'main' || c.category === 'companion');
    const byType = TYPE_ORDER.map((t) => ({ key: t, label: TYPE_LABELS[t as MainType], cards: main.filter((c) => mainType(c.card.typeLine) === t) }));
    return [
      ...byType,
      { key: 'sideboard', label: 'Sideboard', cards: filtered.filter((c) => c.category === 'sideboard') },
      { key: 'maybeboard', label: 'Talvez', cards: filtered.filter((c) => c.category === 'maybeboard') },
    ].filter((g) => g.cards.length);
  }, [filtered, groupBy]);

  const ordered = useMemo(() => groups.flatMap((g) => g.cards), [groups]);

  const setCard = (instanceId: string, patch: Partial<DeckCard> | null) =>
    store.updateDeck(deck.id, (d) => {
      const cards = patch === null ? d.cards.filter((c) => c.instanceId !== instanceId) : d.cards.map((c) => (c.instanceId === instanceId ? { ...c, ...patch } : c));
      const cmd = cards.find((c) => c.category === 'commander')?.card;
      const ptn = cards.find((c) => c.category === 'partner')?.card;
      return { ...d, cards, commander: cmd, partner: ptn };
    });

  const changeArt = (list: DeckCard[], start: number) =>
    openArtPicker({
      cards: list.map((c) => c.card),
      start,
      onSelect: (i, card) => setCard(list[i].instanceId, { card, collectionItemId: undefined }),
    });

  const toProxy = (cards: DeckCard[]) => {
    store.addToProxies(cards.map((c) => ({ card: c.card, quantity: c.quantity })));
    toast(`${cards.reduce((s, c) => s + c.quantity, 0)} carta(s) na fila de impressão.`);
  };

  const addToCollection = (dc: DeckCard) => {
    store.update((d) => {
      const id = `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      return {
        ...d,
        collection: [{ id, card: dc.card, quantity: dc.quantity, isFoil: !!dc.isFoil, condition: 'NM', language: 'en', tags: [], dateAdded: new Date().toISOString() }, ...d.collection],
        decks: d.decks.map((dk) => (dk.id === deck.id ? { ...dk, cards: dk.cards.map((c) => (c.instanceId === dc.instanceId ? { ...c, collectionItemId: id } : c)) } : dk)),
      };
    });
    toast(`${dc.card.name} registrada na coleção.`);
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Excluir deck?', message: <p><b>{deck.name}</b> será excluído.</p>, danger: true, confirmLabel: 'Excluir' }))) return;
    store.deleteDeck(deck.id);
    onBack();
  };

  const cmdCards = deck.cards.filter((c) => c.category === 'commander' || c.category === 'partner');
  const cover = deckCoverImage(deck);
  const nonLand = deck.cards.filter((c) => c.category === 'main' || c.category === 'commander' || c.category === 'partner').filter((c) => !isLand(c.card));
  const avgCmc = nonLand.length ? nonLand.reduce((s, c) => s + c.card.cmc * c.quantity, 0) / nonLand.reduce((s, c) => s + c.quantity, 0) : 0;

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={16} /> Decks</button>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm hide-mobile" onClick={() => openModal((c) => <DeckFormModal deck={deck} onClose={c} />)}><Pencil size={15} /> Editar</button>
        <button className="btn btn-ghost btn-sm hide-mobile" onClick={() => toProxy(deck.cards.filter((c) => c.category !== 'maybeboard'))}><Printer size={15} /> Imprimir deck</button>
        <button className="btn btn-ghost btn-sm hide-mobile" onClick={() => openModal((c) => <Suspense fallback={null}><PosterModal deck={deck} onClose={c} /></Suspense>)}><ImageDown size={15} /> Pôster</button>
        <Dropdown trigger={(_o, t) => <button className="btn btn-ghost btn-icon btn-sm" onClick={t} aria-label="Mais ações"><MoreVertical size={16} /></button>}>
          {(close) => (
            <>
              <button className="menu-item only-mobile" onClick={() => { close(); openModal((c) => <DeckFormModal deck={deck} onClose={c} />); }}><Pencil size={16} /> Editar deck</button>
              <button className="menu-item only-mobile" onClick={() => { close(); toProxy(deck.cards.filter((c) => c.category !== 'maybeboard')); }}><Printer size={16} /> Imprimir deck</button>
              <button className="menu-item only-mobile" onClick={() => { close(); openModal((c) => <Suspense fallback={null}><PosterModal deck={deck} onClose={c} /></Suspense>); }}><ImageDown size={16} /> Gerar pôster</button>
              <button className="menu-item" onClick={() => { close(); openImport({ target: 'existing-deck', deckId: deck.id }); }}><Download size={16} /> Importar lista para este deck</button>
              <button className="menu-item" onClick={() => { close(); openExport({ deck }); }}><Upload size={16} /> Exportar deck</button>
              <button className="menu-item" onClick={() => { close(); openModal((c) => <CoverEditorModal deck={deck} onClose={c} />); }}><Crop size={16} /> Ajustar capa</button>
              <div className="menu-sep" />
              <button className="menu-item danger" onClick={() => { close(); remove(); }}><Trash2 size={16} /> Excluir deck</button>
            </>
          )}
        </Dropdown>
        <button className="btn btn-primary btn-sm" onClick={() => openAddCard({ deckId: deck.id })}><Plus size={16} /> Adicionar carta</button>
      </div>

      <div className="deck-hero">
        <div className="deck-hero-cover">
          {cover && <img src={cover} alt="" style={coverStyle(deck)} />}
          <div className="deck-hero-info">
            <div className="row-wrap">
              <span className="badge badge-accent">{info.label}</span>
              <ColorPips colors={deckColors(deck)} />
              {deck.tags.map((id) => data.tags.find((t) => t.id === id)).filter(Boolean).map((t) => <span key={t!.id} className="tag-pill"><span className="tag-dot" style={{ background: t!.color }} />{t!.name}</span>)}
            </div>
            <h1>{deck.name}</h1>
            {deck.description && <p className="small muted" style={{ maxWidth: 640, whiteSpace: 'pre-wrap' }}>{deck.description}</p>}
            <div className="hero-metrics">
              <div className="count-meter">
                <span className="label">Cartas</span>
                <span className="nums" style={{ color: count === target ? 'var(--success)' : count > target ? 'var(--warning)' : undefined }}>{count}<small> / {target}</small></span>
                <div className="progress"><div style={{ width: `${Math.min(100, (count / target) * 100)}%`, background: count > target ? 'var(--warning)' : undefined }} /></div>
              </div>
              <div className="count-meter" style={{ minWidth: 0 }}><span className="label">Custo médio</span><span className="nums">{avgCmc.toFixed(2)}</span></div>
              <div className="count-meter" style={{ minWidth: 0 }}><span className="label">Valor estimado</span><span className="nums">{formatUsd(deckValue(deck))}</span></div>
            </div>
          </div>
        </div>
        {cmdCards.length > 0 && (
          <div className="commander-slot">
            {cmdCards.map((c, i) => (
              <div key={c.instanceId} className="cmd">
                <img src={frontImage(c.card, 'normal')} alt={c.card.name} loading="lazy" onClick={() => changeArt(cmdCards, i)} title="Trocar arte" {...previewProps(frontImage(c.card, 'large'), backImage(c.card))} />
                <span>{CATEGORY_LABELS[c.category]}</span>
                <AvailBadge dc={c} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="editor-layout">
        <div style={{ minWidth: 0 }}>
          <div className="toolbar">
            <div className="input-icon"><Search size={16} /><input className="input" placeholder="Buscar no deck…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className="select select-sm" style={{ width: 'auto' }} value={groupBy} onChange={(e) => setPrefs({ deckGroupBy: e.target.value as 'category' | 'type' })} aria-label="Agrupar">
              <option value="type">Agrupar por tipo</option>
              <option value="category">Agrupar por categoria</option>
            </select>
            <select className="select select-sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar">
              {SORTS.map((s) => <option key={s} value={s}>Ordenar: {SORT_LABELS[s]}</option>)}
            </select>
            <div className="spacer" />
            {view === 'grid' && <GridControls size={prefs.gridSize} onSize={(n) => setPrefs({ gridSize: n })} details={prefs.showDetails} onDetails={(b) => setPrefs({ showDetails: b })} />}
            <ViewToggle value={view} onChange={(v) => setPrefs({ deckEditorView: v })} />
          </div>
          <div className="toolbar"><ColorFilter value={colors} onChange={setColors} mode={mode} onModeChange={setMode} /></div>

          {groups.length === 0 && (
            <div className="empty">
              <h3>{deck.cards.length ? 'Nenhuma carta com esses filtros' : 'Deck vazio'}</h3>
              {!deck.cards.length && <div className="row-wrap" style={{ justifyContent: 'center' }}><button className="btn btn-secondary" onClick={() => openAddCard({ deckId: deck.id })}><Plus size={16} /> Adicionar carta</button><button className="btn btn-secondary" onClick={() => openImport({ target: 'existing-deck', deckId: deck.id })}><Download size={16} /> Colar lista</button></div>}
            </div>
          )}

          <div className={`deck-groups ${view === 'list' ? 'list-mode' : ''}`}>
            {groups.map((g) => (
              <section key={g.key}>
                {view === 'list' ? (
                  <div className="list">
                    <div className="list-group-header">{g.label} <span className="count">({g.cards.reduce((s, c) => s + c.quantity, 0)})</span></div>
                    {g.cards.map((dc) => (
                      <div key={dc.instanceId} className="list-row">
                        <CardThumb card={dc.card} />
                        <div className="list-main">
                          <div className="list-title"><span>{dc.card.name}</span>{dc.isFoil && <span className="badge badge-accent">Foil</span>}<ManaCost cost={dc.card.manaCost} /></div>
                          <div className="list-sub"><span className="only-mobile"><AvailBadge dc={dc} /></span><span className="ellipsis">{dc.card.setName ?? ''}{dc.card.collectorNumber ? ` #${dc.card.collectorNumber}` : ''}</span></div>
                        </div>
                        <div className="list-meta hide-mobile"><AvailBadge dc={dc} /><span className="deck-price small subtle hide-mobile tabular">{formatUsd(dc.card.priceUsd)}</span></div>
                        <div className="list-actions">
                          <QtyControl value={dc.quantity} min={1} onChange={(n) => setCard(dc.instanceId, { quantity: n })} />
                          <CardMenu dc={dc} onArt={() => changeArt(ordered, ordered.indexOf(dc))} onProxy={() => toProxy([dc])} onMove={(cat) => setCard(dc.instanceId, { category: cat })} onRemove={() => setCard(dc.instanceId, null)} onCollect={() => addToCollection(dc)} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}>{g.label} <span className="count">({g.cards.reduce((s, c) => s + c.quantity, 0)})</span></div>
                    <div className="card-grid" style={{ ['--card-w' as string]: `${prefs.gridSize}px` }}>
                      {g.cards.map((dc) => (
                        <div key={dc.instanceId} className="card-tile">
                          <div className={`card-img-wrap ${dc.isFoil ? 'foil-shine' : ''}`} {...previewProps(frontImage(dc.card, 'normal'), backImage(dc.card))}>
                            <img src={frontImage(dc.card, prefs.gridSize > 200 ? 'normal' : 'small')} loading="lazy" decoding="async" alt={dc.card.name} />
                            {dc.quantity > 1 && <span className="qty-badge">{dc.quantity}×</span>}
                            <div className="card-tile-actions">
                              <button className="btn btn-secondary btn-icon btn-sm" title="Trocar arte" onClick={() => changeArt(ordered, ordered.indexOf(dc))}><ImageIcon size={15} /></button>
                              <button className="btn btn-secondary btn-icon btn-sm" title="Mandar para proxies" onClick={() => toProxy([dc])}><Printer size={15} /></button>
                              <button className="btn btn-secondary btn-icon btn-sm" title="Remover" onClick={() => setCard(dc.instanceId, null)}><Trash2 size={15} /></button>
                            </div>
                          </div>
                          {prefs.showDetails && (
                            <div className="card-tile-info">
                              <span className="name">{dc.card.name}</span>
                              <span className="meta"><QtyControl value={dc.quantity} min={1} onChange={(n) => setCard(dc.instanceId, { quantity: n })} /><AvailBadge dc={dc} /></span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            ))}
          </div>
        </div>

        <aside className="editor-side">
          <Suspense fallback={<div className="section"><Loading text="Carregando gráficos…" /></div>}>
            <DeckCharts deck={deck} />
          </Suspense>
          <DeckTokens deck={deck} />
        </aside>
      </div>
    </div>
  );
}

function availOf(dc: DeckCard, collection: Parameters<typeof deckCardAvailability>[1], usage: Map<string, CollectionUsage>): number {
  const a = deckCardAvailability(dc, collection, usage);
  return a.owned - a.inUse;
}

function AvailBadge({ dc }: { dc: DeckCard }) {
  const { data, usage } = useStore();
  const a = deckCardAvailability(dc, data.collection, usage);
  if (a.status === 'missing')
    return (
      <span className="row" style={{ gap: 2 }}>
        <span className="avail missing" title="Esta impressão não está na sua coleção">fora da coleção</span>
      </span>
    );
  if (a.status === 'short') return <span className="avail short" title={`Você tem ${a.owned}, mas ${a.inUse} cópias estão em uso nos decks`}>faltam {a.inUse - a.owned}</span>;
  return <span className="avail ok" title={`${a.owned} na coleção · ${a.inUse} em uso nos decks`}>{a.owned} na coleção</span>;
}

function CardMenu({ dc, onArt, onProxy, onMove, onRemove, onCollect }: { dc: DeckCard; onArt: () => void; onProxy: () => void; onMove: (c: DeckCategory) => void; onRemove: () => void; onCollect: () => void }) {
  const { data, usage } = useStore();
  const a = deckCardAvailability(dc, data.collection, usage);
  return (
    <Dropdown trigger={(_o, t) => <button className="btn btn-ghost btn-icon btn-sm" onClick={t} aria-label="Ações"><MoreVertical size={16} /></button>}>
      {(close) => (
        <>
          <button className="menu-item" onClick={() => { close(); onArt(); }}><ImageIcon size={16} /> Trocar arte</button>
          <button className="menu-item" onClick={() => { close(); onProxy(); }}><Printer size={16} /> Mandar para proxies</button>
          {a.status === 'missing' && <button className="menu-item" onClick={() => { close(); onCollect(); }}><Library size={16} /> Registrar na coleção</button>}
          <div className="menu-label">Mover para</div>
          {(['main', 'sideboard', 'maybeboard', 'companion', 'commander', 'partner'] as DeckCategory[]).filter((c) => c !== dc.category).map((c) => (
            <button key={c} className="menu-item" onClick={() => { close(); onMove(c); }}><ArrowRightLeft size={16} /> {CATEGORY_LABELS[c]}</button>
          ))}
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={() => { close(); onRemove(); }}><Trash2 size={16} /> Remover do deck</button>
        </>
      )}
    </Dropdown>
  );
}
