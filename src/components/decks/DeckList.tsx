import { useMemo, useState } from 'react';
import { Crop, Layers, MoreVertical, Pencil, Plus, Printer, Search, Tags, Trash2, Download } from 'lucide-react';
import type { Deck } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { confirmDialog, openModal, toast } from '../../state/ui.tsx';
import { formatInfo } from '../../types/formats.ts';
import { ColorPips, Dropdown, Empty, formatUsd, ViewToggle } from '../common/bits.tsx';
import { usePersistent } from '../common/hooks.ts';
import { openImport } from '../launchers.tsx';
import { DeckFormModal } from './DeckFormModal.tsx';
import { TagManagerModal } from './TagManagerModal.tsx';
import { CoverEditorModal } from './CoverEditorModal.tsx';
import { coverStyle, deckColors, deckCount, deckCoverImage, deckTarget, deckValue } from './deckUtils.ts';

type DeckSort = 'updated' | 'name' | 'format' | 'count';

export function DeckList({ onOpen }: { onOpen: (id: string) => void }) {
  const store = useStore();
  const { data, prefs, setPrefs } = store;
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sort, setSort] = usePersistent<DeckSort>('deck-sort', 'updated');
  const view = prefs.decksView;

  const decks = useMemo(() => {
    const needle = q.toLowerCase();
    const l = data.decks.filter(
      (d) =>
        (!needle || `${d.name} ${d.description} ${d.commander?.name ?? ''} ${formatInfo(d.format).label}`.toLowerCase().includes(needle)) &&
        tagFilter.every((t) => d.tags.includes(t)),
    );
    const by: Record<DeckSort, (a: Deck, b: Deck) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      name: (a, b) => a.name.localeCompare(b.name),
      format: (a, b) => a.format.localeCompare(b.format) || a.name.localeCompare(b.name),
      count: (a, b) => deckCount(b) - deckCount(a),
    };
    return l.sort(by[sort]);
  }, [data.decks, q, tagFilter, sort]);

  const create = () => openModal((close) => <DeckFormModal onClose={close} onSaved={(id) => onOpen(id)} />);
  const edit = (d: Deck) => openModal((close) => <DeckFormModal deck={d} onClose={close} />);
  const cover = (d: Deck) => openModal((close) => <CoverEditorModal deck={d} onClose={close} />);
  const print = (d: Deck) => {
    const cards = d.cards.filter((c) => c.category !== 'maybeboard');
    store.addToProxies(cards.map((c) => ({ card: c.card, quantity: c.quantity })));
    toast(`${cards.reduce((s, c) => s + c.quantity, 0)} cartas de “${d.name}” na fila de impressão.`);
  };
  const remove = async (d: Deck) => {
    const ok = await confirmDialog({ title: 'Excluir deck?', message: <p><b>{d.name}</b> será excluído. As cartas continuam na coleção e ficam disponíveis.</p>, confirmLabel: 'Excluir', danger: true });
    if (ok) {
      store.deleteDeck(d.id);
      toast('Deck excluído.');
    }
  };

  const tagById = new Map(data.tags.map((t) => [t.id, t]));
  const Tags_ = ({ d }: { d: Deck }) => (
    <>
      {d.tags.map((id) => tagById.get(id)).filter(Boolean).map((t) => (
        <span key={t!.id} className="tag-pill"><span className="tag-dot" style={{ background: t!.color }} />{t!.name}</span>
      ))}
    </>
  );

  const Actions = ({ d }: { d: Deck }) => (
    <Dropdown trigger={(_o, t) => <button className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); t(); }} aria-label="Ações do deck"><MoreVertical size={16} /></button>}>
      {(close) => (
        <div onClick={(e) => e.stopPropagation()}>
          <button className="menu-item" onClick={() => { close(); print(d); }}><Printer size={16} /> Mandar para impressão</button>
          <button className="menu-item" onClick={() => { close(); edit(d); }}><Pencil size={16} /> Editar deck</button>
          <button className="menu-item" onClick={() => { close(); cover(d); }}><Crop size={16} /> Ajustar capa</button>
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={() => { close(); remove(d); }}><Trash2 size={16} /> Excluir</button>
        </div>
      )}
    </Dropdown>
  );

  return (
    <div>
      <div className="page-header">
        <div className="grow">
          <h1>Decks</h1>
          <p className="desc">{data.decks.length} deck(s). Abra um deck para editar, ver gráficos, fichas e gerar pôster.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => openImport({ target: 'new-deck' })}><Download size={16} /> <span className="hide-mobile">Importar deck</span></button>
        <button className="btn btn-primary" onClick={create}><Plus size={16} /> Novo deck</button>
      </div>

      <div className="toolbar">
        <div className="input-icon"><Search size={16} /><input className="input" placeholder="Buscar decks…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select select-sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as DeckSort)} aria-label="Ordenar">
          <option value="updated">Recentes</option>
          <option value="name">Nome</option>
          <option value="format">Formato</option>
          <option value="count">Nº de cartas</option>
        </select>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => openModal((c) => <TagManagerModal onClose={c} />)}><Tags size={16} /> Tags</button>
        <ViewToggle value={view} onChange={(v) => setPrefs({ decksView: v })} />
      </div>
      {data.tags.length > 0 && (
        <div className="chips-scroll" style={{ marginBottom: 12 }}>
          {data.tags.map((t) => (
            <button key={t.id} className={`chip ${tagFilter.includes(t.id) ? 'active' : ''}`} onClick={() => setTagFilter((f) => (f.includes(t.id) ? f.filter((x) => x !== t.id) : [...f, t.id]))}>
              <span className="tag-dot" style={{ background: t.color }} /> {t.name}
            </button>
          ))}
          {tagFilter.length > 0 && <button className="btn btn-ghost btn-xs" onClick={() => setTagFilter([])}>Limpar</button>}
        </div>
      )}

      {data.decks.length === 0 ? (
        <Empty icon={<Layers size={40} />} title="Nenhum deck ainda" action={<div className="row-wrap" style={{ justifyContent: 'center' }}><button className="btn btn-secondary" onClick={create}><Plus size={16} /> Criar deck</button><button className="btn btn-secondary" onClick={() => openImport({ target: 'new-deck' })}><Download size={16} /> Importar lista</button></div>}>
          Crie um deck do zero, cole uma lista ou importe do Arena/Moxfield/LigaMagic.
        </Empty>
      ) : decks.length === 0 ? (
        <Empty icon={<Search size={36} />} title="Nenhum deck encontrado" />
      ) : view === 'list' ? (
        <div className="list">
          {decks.map((d) => {
            const img = deckCoverImage(d);
            const count = deckCount(d);
            const target = deckTarget(d);
            return (
              <div key={d.id} className="list-row clickable" onClick={() => onOpen(d.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(d.id)}>
                {img ? <img className="list-thumb-wide" src={img} loading="lazy" alt="" /> : <div className="list-thumb-wide" />}
                <div className="list-main">
                  <div className="list-title"><span>{d.name}</span><ColorPips colors={deckColors(d)} /></div>
                  <div className="list-sub">
                    <span>{formatInfo(d.format).label}</span>
                    <span className={count === target ? 'success-text' : ''}>{count}/{target}</span>
                    {d.commander && <span className="ellipsis hide-mobile">{d.commander.name}</span>}
                    <span className="hide-mobile row" style={{ gap: 4 }}><Tags_ d={d} /></span>
                  </div>
                </div>
                <div className="list-meta hide-mobile"><span className="small subtle">{formatUsd(deckValue(d))}</span></div>
                <div className="list-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-icon btn-sm hide-mobile" title="Mandar deck para impressão" onClick={() => print(d)}><Printer size={16} /></button>
                  <button className="btn btn-ghost btn-icon btn-sm hide-mobile" title="Editar" onClick={() => edit(d)}><Pencil size={16} /></button>
                  <Actions d={d} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="deck-cards">
          {decks.map((d) => {
            const img = deckCoverImage(d);
            return (
              <div key={d.id} className="deck-card" onClick={() => onOpen(d.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(d.id)}>
                <div className="deck-cover">{img && <img src={img} loading="lazy" alt="" style={coverStyle(d)} />}</div>
                <div className="deck-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Mandar para impressão" onClick={() => print(d)}><Printer size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Ajustar capa" onClick={() => cover(d)}><Crop size={15} /></button>
                  <Actions d={d} />
                </div>
                <div className="deck-card-body">
                  <div className="row"><b className="grow ellipsis">{d.name}</b><ColorPips colors={deckColors(d)} /></div>
                  <div className="small subtle row"><span>{formatInfo(d.format).label}</span>·<span>{deckCount(d)}/{deckTarget(d)} cartas</span>·<span>{formatUsd(deckValue(d))}</span></div>
                  {d.tags.length > 0 && <div className="row-wrap" style={{ gap: 4 }}><Tags_ d={d} /></div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
