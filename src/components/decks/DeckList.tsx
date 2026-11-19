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
import { StatsPanel } from '../stats/StatsPanel.tsx';
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

      {data.decks.length > 0 && <StatsPanel kind="decks" teaser={<><span>{data.decks.length} decks</span><span>{formatUsd(data.decks.reduce((s2, d) => s2 + deckValue(d), 0))}</span></>} />}

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
        <div className="list deck-list">
          {decks.map((d) => {
            const img = deckCoverImage(d);
            const count = deckCount(d);
            const target = deckTarget(d);
            return (
              <div key={d.id} className="list-row clickable deck-row" onClick={() => onOpen(d.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(d.id)}>
                <div className="deck-row-art">{img && <img src={img} loading="lazy" alt="" style={coverStyle(d)} />}</div>
                <div className="list-main">
                  <div className="list-title"><span className="deck-row-name">{d.name}</span><ColorPips colors={deckColors(d)} /></div>
                  <div className="list-sub">
                    <span className="badge">{formatInfo(d.format).label}</span>
                    {d.commander && <span className="ellipsis">{d.commander.name}{d.partner ? ` & ${d.partner.name}` : ''}</span>}
                  </div>
                </div>
                <div className="deck-row-tags hide-mobile"><Tags_ d={d} /></div>
                <div className="deck-row-count hide-mobile">
                  <span className="tabular"><b className={count === target ? 'success-text' : count > target ? 'warning-text' : ''}>{count}</b><span className="subtle"> / {target}</span></span>
                  <div className="progress"><div style={{ width: `${Math.min(100, (count / target) * 100)}%`, background: count === target ? 'var(--success)' : undefined }} /></div>
                </div>
                <div className="deck-row-value hide-mobile tabular">{formatUsd(deckValue(d))}</div>
                <div className="deck-row-date hide-mobile subtle small">{relativeDate(d.updatedAt)}</div>
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
            const count = deckCount(d);
            const target = deckTarget(d);
            return (
              <div key={d.id} className="deck-card" onClick={() => onOpen(d.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(d.id)}>
                <div className="deck-cover">
                  {img && <img src={img} loading="lazy" alt="" style={coverStyle(d)} />}
                  <div className="deck-cover-info">
                    <span className="badge badge-accent">{formatInfo(d.format).label}</span>
                    <h3 className="ellipsis">{d.name}</h3>
                  </div>
                </div>
                <div className="deck-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Mandar para impressão" onClick={() => print(d)}><Printer size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Ajustar capa" onClick={() => cover(d)}><Crop size={15} /></button>
                  <Actions d={d} />
                </div>
                <div className="deck-card-body">
                  <div className="row small">
                    <ColorPips colors={deckColors(d)} />
                    <span className="grow ellipsis subtle">{d.commander?.name ?? `${d.cards.length} cartas distintas`}</span>
                    <b className="tabular">{formatUsd(deckValue(d))}</b>
                  </div>
                  <div className="row small">
                    <div className="progress grow"><div style={{ width: `${Math.min(100, (count / target) * 100)}%`, background: count === target ? 'var(--success)' : undefined }} /></div>
                    <span className="tabular subtle">{count}/{target}</span>
                  </div>
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

function relativeDate(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const day = 864e5;
  if (!Number.isFinite(diff)) return '';
  if (diff < 60e3) return 'agora';
  if (diff < 36e5) return `há ${Math.floor(diff / 60e3)} min`;
  if (diff < day) return `há ${Math.floor(diff / 36e5)} h`;
  if (diff < 30 * day) return `há ${Math.floor(diff / day)} dia(s)`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
