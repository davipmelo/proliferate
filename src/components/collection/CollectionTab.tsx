import { useMemo, useState } from 'react';
import { Download, Image as ImageIcon, Layers, Library, MoreVertical, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import type { CollectionItem, ColorMatchMode } from '../../types/models.ts';
import { CONDITIONS } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { confirmDialog, openModal, previewProps, toast } from '../../state/ui.tsx';
import { ItemEditModal } from './ItemEditModal.tsx';
import { backImage, frontImage, matchesColorFilter, type ColorFilterValue } from '../../types/cardRules.ts';
import { summarizeCollection } from '../../services/usage.ts';
import { compareBy, matchesText, SORT_LABELS, type SortKey } from '../../services/sorting.ts';
import { CardThumb, Dropdown, Empty, formatUsd, ManaCost, QtyControl, ViewToggle } from '../common/bits.tsx';
import { ColorFilter } from '../common/ColorFilter.tsx';
import { GridControls, SelectBox, useSelection } from '../common/selection.tsx';
import { usePersistent, useProgressive } from '../common/hooks.ts';
import { pickDeck } from '../common/DeckPicker.tsx';
import { openAddCard, openArtPicker, openImport } from '../launchers.tsx';
import { openDeck } from '../../state/nav.ts';

const SORTS: SortKey[] = ['name', 'date', 'available', 'quantity', 'cmc', 'type', 'set', 'rarity', 'price'];

export default function CollectionTab() {
  const store = useStore();
  const { data, usage, prefs, setPrefs } = store;
  const [q, setQ] = useState('');
  const [colors, setColors] = useState<ColorFilterValue[]>([]);
  const [mode, setMode] = usePersistent<ColorMatchMode>('col-color-mode', 'identity');
  const [sort, setSort] = usePersistent<SortKey>('col-sort', 'name');
  const [onlyAvailable, setOnlyAvailable] = useState<'all' | 'free' | 'used'>('all');

  const summary = useMemo(() => summarizeCollection(data.collection, usage), [data.collection, usage]);

  const filtered = useMemo(() => {
    const cmp = compareBy(sort);
    return data.collection
      .filter((i) => matchesText(i.card, q) && matchesColorFilter(i.card, colors, mode))
      .filter((i) => {
        if (onlyAvailable === 'all') return true;
        const u = usage.get(i.id);
        return onlyAvailable === 'free' ? (u?.available ?? i.quantity) > 0 : (u?.inUse ?? 0) > 0;
      })
      .map((i) => ({ item: i, card: i.card, quantity: i.quantity, available: usage.get(i.id)?.available ?? i.quantity, date: i.dateAdded }))
      .sort(cmp)
      .map((x) => x.item);
  }, [data.collection, q, colors, mode, sort, usage, onlyAvailable]);

  const ids = useMemo(() => filtered.map((i) => i.id), [filtered]);
  const sel = useSelection(ids);
  const { visible, sentinel, hasMore } = useProgressive(filtered);
  const view = prefs.collectionView;

  const selectedItems = () => data.collection.filter((i) => sel.selected.has(i.id));

  const changeArt = (item: CollectionItem) => {
    openArtPicker({
      cards: [item.card],
      onSelect: (_i, card) => {
        store.update((d) => ({
          ...d,
          collection: d.collection.map((c) => (c.id === item.id ? { ...c, card } : c)),
          // Decks vinculados acompanham a nova arte.
          decks: d.decks.map((dk) => ({ ...dk, cards: dk.cards.map((dc) => (dc.collectionItemId === item.id ? { ...dc, card } : dc)) })),
        }));
      },
    });
  };

  const remove = async (items: CollectionItem[]) => {
    const used = items.filter((i) => (usage.get(i.id)?.inUse ?? 0) > 0).length;
    const ok = await confirmDialog({
      title: items.length === 1 ? 'Remover carta?' : `Remover ${items.length} itens?`,
      message: (
        <p>
          {items.length === 1 ? <b>{items[0].card.name}</b> : `${items.length} itens`} sairão da coleção.
          {used > 0 && <><br /><span className="warning-text">{used} item(ns) estão em decks — as cartas continuam nos decks, mas sem vínculo.</span></>}
        </p>
      ),
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    store.removeCollectionItems(items.map((i) => i.id));
    sel.clear();
    toast('Removido da coleção.');
  };

  const toProxies = (items: CollectionItem[]) => {
    store.addToProxies(items.map((i) => ({ card: i.card, quantity: i.quantity })));
    toast(`${items.reduce((s, i) => s + i.quantity, 0)} carta(s) na fila de impressão.`);
  };

  const toDeck = (items: CollectionItem[]) =>
    pickDeck({
      title: 'Adicionar ao deck',
      onPick: (deckId, category) => {
        store.update((d) => ({
          ...d,
          decks: d.decks.map((dk) => {
            if (dk.id !== deckId) return dk;
            const cards = dk.cards.slice();
            for (const it of items) {
              const idx = cards.findIndex((c) => c.collectionItemId === it.id && c.category === category);
              if (idx >= 0) cards[idx] = { ...cards[idx], quantity: cards[idx].quantity + 1 };
              else cards.push({ instanceId: `dc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, card: it.card, quantity: 1, category, collectionItemId: it.id, isFoil: it.isFoil || undefined });
            }
            return { ...dk, cards, updatedAt: new Date().toISOString(), ...(category === 'commander' ? { commander: items[0].card } : {}) };
          }),
        }));
        toast(`${items.length} carta(s) adicionada(s) ao deck.`);
        sel.clear();
      },
    });

  return (
    <div>
      <div className="page-header">
        <div className="grow">
          <h1>Coleção</h1>
          <p className="desc">Cada arte/impressão é um item separado. O uso nos decks é calculado automaticamente.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => openImport({ target: 'collection' })}>
          <Download size={16} /> <span className="hide-mobile">Importar lista</span>
        </button>
        <button className="btn btn-primary" onClick={() => openAddCard()}>
          <Plus size={16} /> Adicionar carta
        </button>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">Total de cartas</div><div className="value">{summary.total}</div><div className="hint">{summary.unique} {summary.unique === 1 ? 'item distinto' : 'itens distintos'}</div></div>
        <div className="stat"><div className="label">Disponíveis</div><div className="value accent">{summary.available}</div><div className="hint">livres para novos decks</div></div>
        <div className="stat"><div className="label">Em uso</div><div className="value">{summary.inUse}</div><div className="hint">em {data.decks.length} deck(s)</div></div>
        <div className="stat"><div className="label">Valor estimado</div><div className="value">{formatUsd(summary.value)}</div><div className="hint">preços do Scryfall</div></div>
      </div>

      <div className="toolbar">
        <div className="input-icon">
          <Search size={16} />
          <input className="input" placeholder="Buscar na coleção (nome, tipo, edição)…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select select-sm" style={{ width: 'auto' }} value={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.value as typeof onlyAvailable)} aria-label="Disponibilidade">
          <option value="all">Todas</option>
          <option value="free">Com cópias livres</option>
          <option value="used">Em uso em decks</option>
        </select>
        <select className="select select-sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar">
          {SORTS.map((s) => <option key={s} value={s}>Ordenar: {SORT_LABELS[s]}</option>)}
        </select>
        <div className="spacer" />
        {view === 'grid' && <GridControls size={prefs.gridSize} onSize={(n) => setPrefs({ gridSize: n })} details={prefs.showDetails} onDetails={(b) => setPrefs({ showDetails: b })} />}
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

      {data.collection.length === 0 ? (
        <Empty icon={<Library size={40} />} title="Sua coleção está vazia" action={<div className="row-wrap" style={{ justifyContent: 'center' }}><button className="btn btn-secondary" onClick={() => openAddCard()}><Plus size={16} /> Adicionar carta</button><button className="btn btn-secondary" onClick={() => openImport({ target: 'collection' })}><Download size={16} /> Importar lista</button></div>}>
          Adicione cartas uma a uma ou importe uma lista (Arena, Moxfield, LigaMagic…).
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty icon={<Search size={36} />} title="Nada encontrado">Ajuste a busca ou os filtros.</Empty>
      ) : view === 'list' ? (
        <div className="list">
          {visible.map((item) => {
            const u = usage.get(item.id);
            return (
              <div key={item.id} className={`list-row ${sel.isSelected(item.id) ? 'selected' : ''}`} onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey || sel.count > 0) && sel.toggle(item.id, e)}>
                <SelectBox checked={sel.isSelected(item.id)} onClick={(e) => sel.toggle(item.id, e)} className="inline-select" />
                <CardThumb card={item.card} />
                <div className="list-main">
                  <div className="list-title">
                    <span>{item.card.name}</span>
                    {item.isFoil && <span className="badge badge-accent">Foil</span>}
                    <ManaCost cost={item.card.manaCost} />
                  </div>
                  <div className="list-sub">
                    <span className="ellipsis">{item.card.setName ?? item.card.setCode?.toUpperCase() ?? 'Arte customizada'}{item.card.collectorNumber ? ` #${item.card.collectorNumber}` : ''}</span>
                    {item.condition !== 'NM' && <span className="badge">{item.condition}</span>}
                    {item.language !== 'en' && <span className="badge">{item.language.toUpperCase()}</span>}
                  </div>
                </div>
                <div className="list-meta hide-mobile">
                  <UsageBadges item={item} inUse={u?.inUse ?? 0} available={u?.available ?? item.quantity} decks={u?.decks ?? []} />
                  <span className="small subtle nowrap" style={{ width: 64, textAlign: 'right' }}>{formatUsd(item.card.priceUsd)}</span>
                </div>
                <div className="list-actions" onClick={(e) => e.stopPropagation()}>
                  <QtyControl value={item.quantity} min={1} onChange={(n) => store.updateCollectionItem(item.id, { quantity: n })} />
                  <ItemMenu item={item} onArt={() => changeArt(item)} onProxy={() => toProxies([item])} onDeck={() => toDeck([item])} onRemove={() => remove([item])} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-grid" style={{ ['--card-w' as string]: `${prefs.gridSize}px` }}>
          {visible.map((item) => {
            const u = usage.get(item.id);
            return (
              <div key={item.id} className={`card-tile ${sel.isSelected(item.id) ? 'selected' : ''}`}>
                <div className={`card-img-wrap ${item.isFoil ? 'foil-shine' : ''}`} {...previewProps(frontImage(item.card, 'normal'), backImage(item.card))} onClick={(e) => (e.shiftKey || sel.count > 0) && sel.toggle(item.id, e)}>
                  <img src={frontImage(item.card, prefs.gridSize > 200 ? 'normal' : 'small')} loading="lazy" decoding="async" alt={item.card.name} />
                  <SelectBox checked={sel.isSelected(item.id)} onClick={(e) => sel.toggle(item.id, e)} />
                  <div className="corner-badges"><span className="badge" style={{ background: 'rgba(0,0,0,.78)', color: 'var(--accent)' }}>{item.quantity}×</span></div>
                  <div className="card-tile-actions">
                    <button className="btn btn-secondary btn-icon btn-sm" title="Trocar arte" onClick={() => changeArt(item)}><ImageIcon size={15} /></button>
                    <button className="btn btn-secondary btn-icon btn-sm" title="Adicionar à fila de impressão" onClick={() => toProxies([item])}><Printer size={15} /></button>
                    <button className="btn btn-secondary btn-icon btn-sm" title="Adicionar a um deck" onClick={() => toDeck([item])}><Layers size={15} /></button>
                    <button className="btn btn-secondary btn-icon btn-sm" title="Remover" onClick={() => remove([item])}><Trash2 size={15} /></button>
                  </div>
                </div>
                {prefs.showDetails && (
                  <div className="card-tile-info">
                    <span className="name">{item.card.name}</span>
                    <span className="meta">
                      <QtyControl value={item.quantity} min={1} onChange={(n) => store.updateCollectionItem(item.id, { quantity: n })} />
                      <span className={(u?.available ?? item.quantity) > 0 ? 'success-text' : 'subtle'}>{u?.available ?? item.quantity} livre(s)</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {hasMore && <div ref={sentinel} className="loading small">Carregando mais…</div>}

      {sel.count > 0 && (
        <div className="selection-bar">
          <strong>{sel.count} selecionado(s)</strong>
          <span className="small subtle hide-mobile">Shift+clique seleciona um intervalo</span>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => toProxies(selectedItems())}><Printer size={15} /> Imprimir</button>
          <button className="btn btn-secondary btn-sm" onClick={() => toDeck(selectedItems())}><Layers size={15} /> Ao deck</button>
          <select
            className="select select-sm"
            style={{ width: 'auto' }}
            value=""
            onChange={(e) => {
              const c = e.target.value as CollectionItem['condition'];
              if (!c) return;
              store.update((d) => ({ ...d, collection: d.collection.map((i) => (sel.selected.has(i.id) ? { ...i, condition: c } : i)) }));
              toast('Condição atualizada.');
            }}
            aria-label="Definir condição"
          >
            <option value="">Condição…</option>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn btn-danger btn-sm" onClick={() => remove(selectedItems())}><Trash2 size={15} /> Remover</button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={sel.clear} aria-label="Limpar seleção"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

function UsageBadges({ inUse, available, decks }: { item: CollectionItem; inUse: number; available: number; decks: { deckId: string; deckName: string; quantity: number }[] }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      {available > 0 && <span className="badge badge-success">{available} livre{available > 1 ? 's' : ''}</span>}
      {inUse > 0 && (
        <span className="badge badge-info usage-badge" title={decks.map((d) => `${d.quantity}× ${d.deckName}`).join('\n')}>
          {inUse} em uso
          <span className="usage-pop">
            {decks.map((d) => (
              <button key={d.deckId} className="btn btn-ghost btn-xs" onClick={() => openDeck(d.deckId)}>{d.quantity}× {d.deckName}</button>
            ))}
          </span>
        </span>
      )}
      {available === 0 && inUse === 0 && <span className="badge">0</span>}
    </span>
  );
}

function ItemMenu({ item, onArt, onProxy, onDeck, onRemove }: { item: CollectionItem; onArt: () => void; onProxy: () => void; onDeck: () => void; onRemove: () => void }) {
  return (
    <Dropdown trigger={(_o, t) => <button className="btn btn-ghost btn-icon btn-sm" onClick={t} aria-label="Ações"><MoreVertical size={16} /></button>}>
      {(close) => (
        <>
          <button className="menu-item" onClick={() => { close(); onArt(); }}><ImageIcon size={16} /> Trocar arte</button>
          <button className="menu-item" onClick={() => { close(); onProxy(); }}><Printer size={16} /> Adicionar à impressão</button>
          <button className="menu-item" onClick={() => { close(); onDeck(); }}><Layers size={16} /> Adicionar a um deck</button>
          <button className="menu-item" onClick={() => { close(); openModal((c) => <ItemEditModal item={item} onClose={c} />); }}><Pencil size={16} /> Editar detalhes</button>
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={() => { close(); onRemove(); }}><Trash2 size={16} /> Remover</button>
        </>
      )}
    </Dropdown>
  );
}
