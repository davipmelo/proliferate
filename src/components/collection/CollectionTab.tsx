import { useMemo, useState } from 'react';
import { Download, Image as ImageIcon, Layers, Library, MoreVertical, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import type { ColorMatchMode } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { confirmDialog, previewProps, toast } from '../../state/ui.tsx';
import { openDeck } from '../../state/nav.ts';
import { backImage, frontImage, matchesColorFilter, type ColorFilterValue } from '../../types/cardRules.ts';
import { summarize, type CollectionEntry } from '../../services/collection.ts';
import { compareBy, matchesText, SORT_LABELS, type SortKey } from '../../services/sorting.ts';
import { CardThumb, Dropdown, Empty, formatUsd, ManaCost, ViewToggle } from '../common/bits.tsx';
import { ColorFilter } from '../common/ColorFilter.tsx';
import { GridControls, SelectBox, useSelection } from '../common/selection.tsx';
import { usePersistent, useProgressive } from '../common/hooks.ts';
import { pickDeck } from '../common/DeckPicker.tsx';
import { openAddCard, openArtPicker, openImport } from '../launchers.tsx';
import { StatsPanel } from '../stats/StatsPanel.tsx';

const SORTS: SortKey[] = ['name', 'quantity', 'cmc', 'type', 'set', 'rarity', 'price'];

export default function CollectionTab() {
  const store = useStore();
  const { data, collection, prefs, setPrefs } = store;
  const [q, setQ] = useState('');
  const [colors, setColors] = useState<ColorFilterValue[]>([]);
  const [mode, setMode] = usePersistent<ColorMatchMode>('col-color-mode', 'identity');
  const [sort, setSort] = usePersistent<SortKey>('col-sort', 'name');
  const [deckFilter, setDeckFilter] = useState('');

  const summary = useMemo(() => summarize(collection), [collection]);

  const filtered = useMemo(() => {
    const cmp = compareBy(sort);
    return collection
      .filter((e) => matchesText(e.card, q) && matchesColorFilter(e.card, colors, mode))
      .filter((e) => !deckFilter || e.decks.some((d) => d.deckId === deckFilter))
      .sort(cmp);
  }, [collection, q, colors, mode, sort, deckFilter]);

  const keys = useMemo(() => filtered.map((e) => e.key), [filtered]);
  const sel = useSelection(keys);
  const { visible, sentinel, hasMore } = useProgressive(filtered);
  const view = prefs.collectionView;
  const selectedEntries = () => filtered.filter((e) => sel.selected.has(e.key));

  // Trocar a arte vale para todas as cópias nos decks.
  const changeArt = (entry: CollectionEntry) =>
    openArtPicker({ cards: [entry.card], onSelect: (_i, card) => store.replaceEntryCard(entry.key, card) });

  const remove = async (entries: CollectionEntry[]) => {
    const total = entries.reduce((s, e) => s + e.quantity, 0);
    const decks = new Set(entries.flatMap((e) => e.decks.map((d) => d.deckName)));
    const ok = await confirmDialog({
      title: entries.length === 1 ? 'Remover dos decks?' : `Remover ${entries.length} cartas dos decks?`,
      message: <p>{entries.length === 1 ? <b>{entries[0].card.name}</b> : `${total} cópias`} {total === 1 ? 'sairá' : 'sairão'} de {decks.size === 1 ? 'um deck' : `${decks.size} decks`}: {[...decks].join(', ')}. A coleção mostra só o que está nos decks.</p>,
      confirmLabel: 'Remover dos decks',
      danger: true,
    });
    if (!ok) return;
    store.removeEntries(entries.map((e) => e.key));
    sel.clear();
    toast('Removido dos decks.');
  };

  const toProxies = (entries: CollectionEntry[]) => {
    store.addToProxies(entries.map((e) => ({ card: e.card, quantity: e.quantity })));
    toast(`${entries.reduce((s, e) => s + e.quantity, 0)} carta(s) na fila de impressão.`);
  };

  const toDeck = (entries: CollectionEntry[]) =>
    pickDeck({
      title: 'Adicionar a outro deck',
      onPick: (deckId, category) => {
        for (const e of entries) store.addCardToDeck(deckId, e.card, { quantity: 1, category, isFoil: e.isFoil });
        toast(`${entries.length} carta(s) adicionada(s) ao deck.`);
        sel.clear();
      },
    });

  const add = () => (data.decks.length ? openAddCard() : toast('Crie um deck primeiro — a coleção mostra as cartas dos seus decks.', 'info', 5000));

  return (
    <div>
      <div className="page-header">
        <div className="grow">
          <h1>Coleção</h1>
          <p className="desc">Todas as cartas dos seus decks, agrupadas pela mesma arte. Alterar os decks atualiza a coleção.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => openImport({ target: 'new-deck' })}><Download size={16} /> <span className="hide-mobile">Importar deck</span></button>
        <button className="btn btn-primary" onClick={add}><Plus size={16} /> Adicionar carta</button>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">Total de cartas</div><div className="value">{summary.total.toLocaleString('pt-BR')}</div><div className="hint">em {data.decks.length} deck(s)</div></div>
        <div className="stat"><div className="label">Artes diferentes</div><div className="value">{summary.unique.toLocaleString('pt-BR')}</div><div className="hint">cada arte é um item</div></div>
        <div className="stat"><div className="label">Foils</div><div className="value">{summary.foil}</div><div className="hint">{summary.total ? Math.round((summary.foil / summary.total) * 100) : 0}% das cartas</div></div>
        <div className="stat"><div className="label">Valor estimado</div><div className="value accent">{formatUsd(summary.value)}</div><div className="hint">preços do Scryfall</div></div>
      </div>

      {collection.length > 0 && <StatsPanel kind="collection" teaser={<><span>{summary.unique} artes</span><span>{formatUsd(summary.value)}</span></>} />}

      <div className="toolbar">
        <div className="input-icon">
          <Search size={16} />
          <input className="input" placeholder="Buscar na coleção (nome, tipo, edição)…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select select-sm" style={{ width: 'auto', maxWidth: 220 }} value={deckFilter} onChange={(e) => setDeckFilter(e.target.value)} aria-label="Filtrar por deck">
          <option value="">Todos os decks</option>
          {data.decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="select select-sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar">
          {SORTS.map((s) => <option key={s} value={s}>Ordenar: {SORT_LABELS[s]}</option>)}
        </select>
        <div className="spacer" />
        <GridControls size={prefs.gridSize} onSize={view === 'grid' ? (n) => setPrefs({ gridSize: n }) : undefined} details={prefs.showDetails} onDetails={(b) => setPrefs({ showDetails: b })} foil={view === 'grid' ? prefs.showFoil : undefined} onFoil={(b) => setPrefs({ showFoil: b })} />
        <ViewToggle value={view} onChange={(v) => setPrefs({ collectionView: v })} />
      </div>
      <div className="toolbar">
        <ColorFilter value={colors} onChange={setColors} mode={mode} onModeChange={setMode} />
        <div className="spacer" />
        <span className="small subtle">{filtered.length} {filtered.length === 1 ? 'item' : 'itens'}</span>
        {filtered.length > 0 && (
          <button className="btn btn-ghost btn-xs" onClick={sel.count === filtered.length ? sel.clear : sel.selectAll}>
            {sel.count === filtered.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
          </button>
        )}
      </div>

      {collection.length === 0 ? (
        <Empty icon={<Library size={40} />} title="Sua coleção está vazia" action={<button className="btn btn-secondary" onClick={() => openImport({ target: 'new-deck' })}><Download size={16} /> Importar um deck</button>}>
          A coleção mostra automaticamente todas as cartas dos seus decks. Crie ou importe um deck para começar.
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty icon={<Search size={36} />} title="Nada encontrado">Ajuste a busca ou os filtros.</Empty>
      ) : view === 'list' ? (
        <div className="list">
          {visible.map((e) => (
            <div key={e.key} className={`list-row ${sel.isSelected(e.key) ? 'selected' : ''} ${prefs.showDetails ? '' : 'compact'}`} onClick={(ev) => (ev.shiftKey || ev.ctrlKey || ev.metaKey || sel.count > 0) && sel.toggle(e.key, ev)}>
              <SelectBox checked={sel.isSelected(e.key)} onClick={(ev) => sel.toggle(e.key, ev)} className="inline-select" />
              <CardThumb card={e.card} />
              <div className="list-main">
                <div className="list-title">
                  <span>{e.card.name}</span>
                  {e.isFoil && <span className="badge badge-accent">Foil</span>}
                  <ManaCost cost={e.card.manaCost} />
                </div>
                {prefs.showDetails && (
                  <div className="list-sub">
                    <span className="ellipsis">{e.card.setName ?? e.card.setCode?.toUpperCase() ?? 'Arte customizada'}{e.card.collectorNumber ? ` #${e.card.collectorNumber}` : ''}</span>
                  </div>
                )}
              </div>
              <div className="col-decks hide-mobile" onClick={(ev) => ev.stopPropagation()}><DeckChips entry={e} /></div>
              <span className="col-price small muted hide-mobile">{formatUsd(e.card.priceUsd)}</span>
              <span className="col-qty tabular">{e.quantity}×</span>
              <div className="list-actions" onClick={(ev) => ev.stopPropagation()}>
                <EntryMenu onArt={() => changeArt(e)} onProxy={() => toProxies([e])} onDeck={() => toDeck([e])} onRemove={() => remove([e])} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-grid" style={{ ['--card-w' as string]: `${prefs.gridSize}px` }}>
          {visible.map((e) => (
            <div key={e.key} className={`card-tile ${sel.isSelected(e.key) ? 'selected' : ''}`}>
              <div className={`card-img-wrap ${e.isFoil && prefs.showFoil ? 'foil' : ''}`} {...previewProps(frontImage(e.card, 'normal'), backImage(e.card))} onClick={(ev) => (ev.shiftKey || sel.count > 0) && sel.toggle(e.key, ev)}>
                <img src={frontImage(e.card, prefs.gridSize > 200 ? 'normal' : 'small')} loading="lazy" decoding="async" alt={e.card.name} />
                <SelectBox checked={sel.isSelected(e.key)} onClick={(ev) => sel.toggle(e.key, ev)} />
                {e.quantity > 1 && <span className="qty-badge" style={{ left: 'auto', right: 7 }}>{e.quantity}×</span>}
                <div className="card-tile-actions">
                  <button className="btn btn-secondary btn-icon btn-sm" title="Trocar arte (em todos os decks)" onClick={() => changeArt(e)}><ImageIcon size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Adicionar à fila de impressão" onClick={() => toProxies([e])}><Printer size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Adicionar a outro deck" onClick={() => toDeck([e])}><Layers size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Remover dos decks" onClick={() => remove([e])}><Trash2 size={15} /></button>
                </div>
              </div>
              {prefs.showDetails && (
                <div className="card-tile-info">
                  <span className="name">{e.card.name}</span>
                  <span className="meta ellipsis">{e.decks.map((d) => d.deckName).join(' · ')}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {hasMore && <div ref={sentinel} className="loading small">Carregando mais…</div>}

      {sel.count > 0 && (
        <div className="selection-bar">
          <strong>{sel.count} selecionado(s)</strong>
          <span className="small subtle hide-mobile">Shift+clique seleciona um intervalo</span>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => toProxies(selectedEntries())}><Printer size={15} /> Imprimir</button>
          <button className="btn btn-secondary btn-sm" onClick={() => toDeck(selectedEntries())}><Layers size={15} /> A outro deck</button>
          <button className="btn btn-danger btn-sm" onClick={() => remove(selectedEntries())}><Trash2 size={15} /> Remover dos decks</button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={sel.clear} aria-label="Limpar seleção"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

/** Decks onde a carta está (clique abre o deck). */
function DeckChips({ entry }: { entry: CollectionEntry }) {
  const shown = entry.decks.slice(0, 2);
  const rest = entry.decks.length - shown.length;
  return (
    <span className="deck-chips">
      {shown.map((d) => (
        <button key={d.deckId} className="deck-chip" onClick={() => openDeck(d.deckId)} title={`Abrir ${d.deckName}`}>
          <span className="ellipsis">{d.deckName}</span>{d.quantity > 1 && <b>{d.quantity}</b>}
        </button>
      ))}
      {rest > 0 && <span className="deck-chip more" title={entry.decks.slice(2).map((d) => `${d.quantity}× ${d.deckName}`).join('\n')}>+{rest}</span>}
    </span>
  );
}

function EntryMenu({ onArt, onProxy, onDeck, onRemove }: { onArt: () => void; onProxy: () => void; onDeck: () => void; onRemove: () => void }) {
  return (
    <Dropdown trigger={(_o, t) => <button className="btn btn-ghost btn-icon btn-sm" onClick={t} aria-label="Ações"><MoreVertical size={16} /></button>}>
      {(close) => (
        <>
          <button className="menu-item" onClick={() => { close(); onArt(); }}><ImageIcon size={16} /> Trocar arte (em todos os decks)</button>
          <button className="menu-item" onClick={() => { close(); onProxy(); }}><Printer size={16} /> Adicionar à impressão</button>
          <button className="menu-item" onClick={() => { close(); onDeck(); }}><Layers size={16} /> Adicionar a outro deck</button>
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={() => { close(); onRemove(); }}><Trash2 size={16} /> Remover dos decks</button>
        </>
      )}
    </Dropdown>
  );
}
