import { lazy, Suspense, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRightLeft, ChevronDown, ChevronsDownUp, ChevronsUpDown, Crop, Download, Hand, Image as ImageIcon, ImageDown,
  MoreVertical, Pencil, Plus, Printer, Search, Trash2, Upload,
} from 'lucide-react';
import type { ColorMatchMode, Deck, DeckCard, DeckCategory, DeckGroupMode } from '../../types/models.ts';
import { CATEGORY_LABELS } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { confirmDialog, openModal, previewProps, toast } from '../../state/ui.tsx';
import { formatInfo } from '../../types/formats.ts';
import { backImage, frontImage, isLand, mainType, matchesColorFilter, TYPE_LABELS, TYPE_ORDER, type ColorFilterValue, type MainType } from '../../types/cardRules.ts';
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
const SampleHandModal = lazy(() => import('./SampleHandModal.tsx'));

const SORTS: SortKey[] = ['name', 'quantity', 'cmc', 'type', 'set', 'rarity', 'price'];
const GROUP_LABELS: Record<DeckGroupMode, string> = { none: 'Não agrupar', type: 'Agrupar por tipo', cmc: 'Agrupar por custo de mana' };

interface Group {
  key: string;
  label: string;
  cards: DeckCard[];
}

/** Monta os grupos do editor (lógica de apresentação). */
function buildGroups(cards: DeckCard[], mode: DeckGroupMode): Group[] {
  const main = cards.filter((c) => c.category === 'main');
  const extra: Group[] = [
    { key: 'companion', label: 'Companheiro', cards: cards.filter((c) => c.category === 'companion') },
    { key: 'sideboard', label: 'Sideboard', cards: cards.filter((c) => c.category === 'sideboard') },
    { key: 'maybeboard', label: 'Talvez', cards: cards.filter((c) => c.category === 'maybeboard') },
  ];
  let body: Group[];
  if (mode === 'type') {
    body = TYPE_ORDER.map((t) => ({ key: `t-${t}`, label: TYPE_LABELS[t as MainType], cards: main.filter((c) => mainType(c.card.typeLine) === t) }));
  } else if (mode === 'cmc') {
    const lands = main.filter((c) => isLand(c.card));
    const spells = main.filter((c) => !isLand(c.card));
    body = [
      ...Array.from({ length: 8 }, (_, i) => ({
        key: `cmc-${i}`,
        label: i === 7 ? 'Custo 7+' : `Custo ${i}`,
        cards: spells.filter((c) => (i === 7 ? c.card.cmc >= 7 : Math.floor(c.card.cmc) === i)),
      })),
      { key: 'cmc-land', label: 'Terrenos', cards: lands },
    ];
  } else body = [{ key: 'main', label: 'Deck principal', cards: main }];
  return [...body, ...extra].filter((g) => g.cards.length);
}

export function DeckEditor({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const store = useStore();
  const { data, prefs, setPrefs } = store;
  const [q, setQ] = useState('');
  const [colors, setColors] = useState<ColorFilterValue[]>([]);
  const [mode, setMode] = usePersistent<ColorMatchMode>('deck-color-mode', 'identity');
  const [sort, setSort] = usePersistent<SortKey>('deck-sort-cards', 'name');
  const [collapsed, setCollapsed] = usePersistent<string[]>('deck-collapsed-groups', []);
  const view = prefs.deckEditorView;
  const groupMode: DeckGroupMode = prefs.deckGroupMode ?? 'none';
  const info = formatInfo(deck.format);
  const count = deckCount(deck);
  const target = deckTarget(deck);

  const filtered = useMemo(() => {
    const cmp = compareBy(sort);
    return deck.cards
      .filter((c) => c.category !== 'commander' && c.category !== 'partner')
      .filter((c) => matchesText(c.card, q) && matchesColorFilter(c.card, colors, mode))
      .map((c) => ({ dc: c, card: c.card, quantity: c.quantity }))
      .sort(cmp)
      .map((x) => x.dc);
  }, [deck.cards, q, colors, mode, sort]);

  const groups = useMemo(() => buildGroups(filtered, groupMode), [filtered, groupMode]);
  const ordered = useMemo(() => groups.flatMap((g) => g.cards), [groups]);
  const isCollapsed = (k: string) => collapsed.includes(k);
  const toggleGroup = (k: string) => setCollapsed(isCollapsed(k) ? collapsed.filter((x) => x !== k) : [...collapsed, k]);
  const allCollapsed = groups.length > 0 && groups.every((g) => isCollapsed(g.key));

  const setCard = (instanceId: string, patch: Partial<DeckCard> | null) =>
    store.updateDeck(deck.id, (d) => {
      const cards = patch === null ? d.cards.filter((c) => c.instanceId !== instanceId) : d.cards.map((c) => (c.instanceId === instanceId ? { ...c, ...patch } : c));
      const cmd = cards.find((c) => c.category === 'commander')?.card;
      const ptn = cards.find((c) => c.category === 'partner')?.card;
      return { ...d, cards, commander: cmd, partner: ptn };
    });

  const changeArt = (list: DeckCard[], start: number) =>
    openArtPicker({ cards: list.map((c) => c.card), start, onSelect: (i, card) => setCard(list[i].instanceId, { card }) });

  const toProxy = (cards: DeckCard[], label?: string) => {
    store.addToProxies(cards.map((c) => ({ card: c.card, quantity: c.quantity })));
    toast(`${cards.reduce((s, c) => s + c.quantity, 0)} carta(s)${label ? ` ${label}` : ''} na fila de impressão.`);
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Excluir deck?', message: <p><b>{deck.name}</b> será excluído.</p>, danger: true, confirmLabel: 'Excluir' }))) return;
    store.deleteDeck(deck.id);
    onBack();
  };

  const openPoster = () => openModal((c) => <Suspense fallback={null}><PosterModal deck={deck} onClose={c} /></Suspense>);
  const openHand = () => openModal((c) => <Suspense fallback={null}><SampleHandModal deck={deck} onClose={c} /></Suspense>);

  const cmdCards = deck.cards.filter((c) => c.category === 'commander' || c.category === 'partner');
  const cover = deckCoverImage(deck);
  const nonLand = deck.cards.filter((c) => c.category === 'main' || c.category === 'commander' || c.category === 'partner').filter((c) => !isLand(c.card));
  const avgCmc = nonLand.length ? nonLand.reduce((s, c) => s + c.card.cmc * c.quantity, 0) / nonLand.reduce((s, c) => s + c.quantity, 0) : 0;
  const details = prefs.showDetails;

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={16} /> Decks</button>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm hide-mobile" onClick={() => openModal((c) => <DeckFormModal deck={deck} onClose={c} />)}><Pencil size={15} /> Editar</button>
        <button className="btn btn-ghost btn-sm hide-mobile" onClick={openHand}><Hand size={15} /> Mão de teste</button>
        <button className="btn btn-ghost btn-sm hide-mobile" onClick={() => toProxy(deck.cards.filter((c) => c.category !== 'maybeboard'))}><Printer size={15} /> Imprimir deck</button>
        <button className="btn btn-ghost btn-sm hide-mobile" onClick={openPoster}><ImageDown size={15} /> Pôster</button>
        <Dropdown trigger={(_o, t) => <button className="btn btn-ghost btn-icon btn-sm" onClick={t} aria-label="Mais ações"><MoreVertical size={16} /></button>}>
          {(close) => (
            <>
              <button className="menu-item only-mobile" onClick={() => { close(); openModal((c) => <DeckFormModal deck={deck} onClose={c} />); }}><Pencil size={16} /> Editar deck</button>
              <button className="menu-item only-mobile" onClick={() => { close(); openHand(); }}><Hand size={16} /> Mão de teste</button>
              <button className="menu-item only-mobile" onClick={() => { close(); toProxy(deck.cards.filter((c) => c.category !== 'maybeboard')); }}><Printer size={16} /> Imprimir deck</button>
              <button className="menu-item only-mobile" onClick={() => { close(); openPoster(); }}><ImageDown size={16} /> Gerar pôster</button>
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

      <div className="deck-hero-cover">
        {cover && <img src={cover} alt="" style={coverStyle(deck)} />}
        <div className="deck-hero-info">
          <div className="row-wrap">
            <span className="badge badge-accent">{info.label}</span>
            <ColorPips colors={deckColors(deck)} />
            {deck.tags.map((id) => data.tags.find((t) => t.id === id)).filter(Boolean).map((t) => <span key={t!.id} className="tag-pill"><span className="tag-dot" style={{ background: t!.color }} />{t!.name}</span>)}
          </div>
          <h1>{deck.name}</h1>
          {deck.description && <p className="small muted deck-desc">{deck.description}</p>}
          <div className="hero-metrics">
            <div className="count-meter">
              <span className="label">Cartas</span>
              <span className="nums" style={{ color: count === target ? 'var(--success)' : count > target ? 'var(--warning)' : undefined }}>{count}<small> / {target}</small></span>
              <div className="progress"><div style={{ width: `${Math.min(100, (count / target) * 100)}%`, background: count > target ? 'var(--warning)' : undefined }} /></div>
            </div>
            <div className="count-meter" style={{ minWidth: 0 }}><span className="label">Custo médio</span><span className="nums">{avgCmc.toFixed(2)}</span></div>
            <div className="count-meter" style={{ minWidth: 0 }}><span className="label">Valor estimado</span><span className="nums">{formatUsd(deckValue(deck))}</span></div>
            <div className="count-meter" style={{ minWidth: 0 }}><span className="label">Fichas</span><span className="nums">{deck.tokens.reduce((s, t) => s + t.quantity, 0)}</span></div>
          </div>
        </div>
      </div>

      <div className="editor-layout">
        <div style={{ minWidth: 0 }}>
          <div className="panel-bar">
            <div className="toolbar">
              <div className="input-icon"><Search size={16} /><input className="input" placeholder="Buscar no deck…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <select className="select select-sm" style={{ width: 'auto' }} value={groupMode} onChange={(e) => setPrefs({ deckGroupMode: e.target.value as DeckGroupMode })} aria-label="Agrupar">
                {(Object.keys(GROUP_LABELS) as DeckGroupMode[]).map((g) => <option key={g} value={g}>{GROUP_LABELS[g]}</option>)}
              </select>
              <select className="select select-sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar">
                {SORTS.map((s) => <option key={s} value={s}>Ordenar: {SORT_LABELS[s]}</option>)}
              </select>
              <div className="spacer" />
              {groups.length > 1 && (
                <button className="btn btn-ghost btn-icon btn-sm" title={allCollapsed ? 'Expandir todos os grupos' : 'Recolher todos os grupos'} onClick={() => setCollapsed(allCollapsed ? [] : groups.map((g) => g.key))}>
                  {allCollapsed ? <ChevronsUpDown size={16} /> : <ChevronsDownUp size={16} />}
                </button>
              )}
              <GridControls size={prefs.gridSize} onSize={view === 'grid' ? (n) => setPrefs({ gridSize: n }) : undefined} details={details} onDetails={(b) => setPrefs({ showDetails: b })} foil={view === 'grid' ? prefs.showFoil : undefined} onFoil={(b) => setPrefs({ showFoil: b })} />
              <ViewToggle value={view} onChange={(v) => setPrefs({ deckEditorView: v })} />
            </div>
            <div className="toolbar"><ColorFilter value={colors} onChange={setColors} mode={mode} onModeChange={setMode} /></div>
          </div>

          {groups.length === 0 && (
            <div className="empty">
              <h3>{deck.cards.length ? 'Nenhuma carta com esses filtros' : 'Deck vazio'}</h3>
              {!deck.cards.length && <div className="row-wrap" style={{ justifyContent: 'center' }}><button className="btn btn-secondary" onClick={() => openAddCard({ deckId: deck.id })}><Plus size={16} /> Adicionar carta</button><button className="btn btn-secondary" onClick={() => openImport({ target: 'existing-deck', deckId: deck.id })}><Download size={16} /> Colar lista</button></div>}
            </div>
          )}

          <div className={`deck-groups ${view === 'list' ? 'list-mode' : ''} ${groups.length === 1 && view === 'list' ? 'single' : ''}`}>
            {groups.map((g) => {
              const closed = isCollapsed(g.key);
              const qty = g.cards.reduce((s, c) => s + c.quantity, 0);
              const header = (
                <button className={`group-header ${closed ? 'closed' : ''}`} onClick={() => toggleGroup(g.key)} aria-expanded={!closed}>
                  <ChevronDown size={15} className="group-chev" />
                  <span>{g.label}</span>
                  <span className="count">{qty}</span>
                  <span className="spacer" />
                  <span className="group-value">{formatUsd(g.cards.reduce((s, c) => s + (c.card.priceUsd ?? 0) * c.quantity, 0))}</span>
                </button>
              );
              return (
                <section key={g.key} className={`deck-group ${closed ? 'closed' : ''}`}>
                  {view === 'list' ? (
                    <div className="list">
                      {header}
                      {!closed && (
                        <div className={`group-rows ${groups.length === 1 ? 'two-col' : ''}`}>
                          {g.cards.map((dc) => (
                            <div key={dc.instanceId} className={`list-row ${details ? '' : 'compact'}`}>
                              <CardThumb card={dc.card} />
                              <div className="list-main">
                                <div className="list-title"><span>{dc.card.name}</span>{dc.isFoil && <span className="badge badge-accent">Foil</span>}<ManaCost cost={dc.card.manaCost} /></div>
                                {details && <div className="list-sub"><span className="ellipsis">{dc.card.setName ?? ''}{dc.card.collectorNumber ? ` #${dc.card.collectorNumber}` : ''}</span></div>}
                              </div>
                              {details && <div className="list-meta hide-mobile"><span className="deck-price small subtle tabular">{formatUsd(dc.card.priceUsd)}</span></div>}
                              <div className="list-actions">
                                <QtyControl value={dc.quantity} min={1} onChange={(n) => setCard(dc.instanceId, { quantity: n })} />
                                <CardMenu dc={dc} onArt={() => changeArt(ordered, ordered.indexOf(dc))} onProxy={() => toProxy([dc])} onMove={(cat) => setCard(dc.instanceId, { category: cat })} onRemove={() => setCard(dc.instanceId, null)} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {header}
                      {!closed && (
                        <div className="card-grid" style={{ ['--card-w' as string]: `${prefs.gridSize}px`, marginTop: 10 }}>
                          {g.cards.map((dc) => (
                            <div key={dc.instanceId} className="card-tile">
                              <div className={`card-img-wrap ${(dc.isFoil || dc.card.isFoil) && prefs.showFoil ? 'foil' : ''}`} {...previewProps(frontImage(dc.card, 'normal'), backImage(dc.card))}>
                                <img src={frontImage(dc.card, prefs.gridSize > 200 ? 'normal' : 'small')} loading="lazy" decoding="async" alt={dc.card.name} />
                                {dc.quantity > 1 && <span className="qty-badge">{dc.quantity}×</span>}
                                <div className="card-tile-actions">
                                  <button className="btn btn-secondary btn-icon btn-sm" title="Trocar arte" onClick={() => changeArt(ordered, ordered.indexOf(dc))}><ImageIcon size={15} /></button>
                                  <button className="btn btn-secondary btn-icon btn-sm" title="Mandar para proxies" onClick={() => toProxy([dc])}><Printer size={15} /></button>
                                  <button className="btn btn-secondary btn-icon btn-sm" title="Remover" onClick={() => setCard(dc.instanceId, null)}><Trash2 size={15} /></button>
                                </div>
                              </div>
                              {details && (
                                <div className="card-tile-info">
                                  <span className="name">{dc.card.name}</span>
                                  <span className="meta"><QtyControl value={dc.quantity} min={1} onChange={(n) => setCard(dc.instanceId, { quantity: n })} /><span className="tabular">{formatUsd(dc.card.priceUsd)}</span></span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </div>

        <aside className="editor-side">
          {cmdCards.length > 0 && (
            <div className="section commander-panel">
              <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}>{cmdCards.length > 1 ? 'Comandantes' : 'Comandante'}</div>
              <div className={`commander-slot n${cmdCards.length}`}>
                {cmdCards.map((c, i) => (
                  <div key={c.instanceId} className="cmd">
                    <div className={`cmd-img ${(c.isFoil || c.card.isFoil) && prefs.showFoil ? 'foil' : ''}`}>
                      <img src={frontImage(c.card, 'normal')} alt={c.card.name} loading="lazy" onClick={() => changeArt(cmdCards, i)} title="Trocar arte" {...previewProps(frontImage(c.card, 'large'), backImage(c.card))} />
                    </div>
                    <span className="small subtle ellipsis" style={{ maxWidth: '100%' }}>{c.card.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Suspense fallback={<div className="section"><Loading text="Carregando gráficos…" /></div>}>
            <DeckCharts deck={deck} />
          </Suspense>
          <DeckTokens deck={deck} />
        </aside>
      </div>
    </div>
  );
}

function CardMenu({ dc, onArt, onProxy, onMove, onRemove }: { dc: DeckCard; onArt: () => void; onProxy: () => void; onMove: (c: DeckCategory) => void; onRemove: () => void }) {
  return (
    <Dropdown trigger={(_o, t) => <button className="btn btn-ghost btn-icon btn-sm" onClick={t} aria-label="Ações"><MoreVertical size={16} /></button>}>
      {(close) => (
        <>
          <button className="menu-item" onClick={() => { close(); onArt(); }}><ImageIcon size={16} /> Trocar arte</button>
          <button className="menu-item" onClick={() => { close(); onProxy(); }}><Printer size={16} /> Mandar para proxies</button>
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
