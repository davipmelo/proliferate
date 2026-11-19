import { useMemo, useState } from 'react';
import { Crop, Layers, MoreVertical, Pencil, Printer, Search, Tags, Trash2, Download, X } from 'lucide-react';
import type { ColorMatchMode, Deck } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { confirmDialog, openModal, toast } from '../../state/ui.tsx';
import { FORMAT_LIST, formatInfo } from '../../types/formats.ts';
import { matchesColorFilter, type ColorFilterValue } from '../../types/cardRules.ts';
import { ColorFilter } from '../common/ColorFilter.tsx';
import { ColorPips, Dropdown, Empty, formatUsd, ViewToggle } from '../common/bits.tsx';
import { usePersistent } from '../common/hooks.ts';
import { openImport } from '../launchers.tsx';
import { DeckFormModal } from './DeckFormModal.tsx';
import { TagPills, TagSelect, type TagMatch } from './TagSelect.tsx';
import { CoverEditorModal } from './CoverEditorModal.tsx';
import { StatsPanel } from '../stats/StatsPanel.tsx';
import { coverStyle, deckColors, deckCount, deckCoverImage, deckTarget, deckValue } from './deckUtils.ts';

type DeckSort = 'updated' | 'name' | 'format' | 'count' | 'value' | 'colors' | 'progress';
type DeckStatus = 'all' | 'complete' | 'incomplete' | 'over';

const SORT_LABELS: Record<DeckSort, string> = {
  updated: 'Recentes', name: 'Nome', format: 'Formato', count: 'Nº de cartas', value: 'Valor', colors: 'Nº de cores', progress: 'Progresso',
};
const STATUS_LABELS: Record<DeckStatus, string> = { all: 'Todos os status', complete: 'Completos', incomplete: 'Incompletos', over: 'Acima da meta' };

export function DeckList({ onOpen }: { onOpen: (id: string) => void }) {
  const store = useStore();
  const { data, prefs, setPrefs } = store;
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = usePersistent<TagMatch>('decks-tag-match', 'all');
  const [colors, setColors] = useState<ColorFilterValue[]>([]);
  const [colorMode, setColorMode] = usePersistent<ColorMatchMode>('decks-color-mode', 'identity');
  const [formatFilter, setFormatFilter] = useState('');
  const [status, setStatus] = useState<DeckStatus>('all');
  const [sort, setSort] = usePersistent<DeckSort>('deck-sort', 'updated');
  const [cardW, setCardW] = usePersistent<number>('decks-grid-size', 310);
  const view = prefs.decksView;
  const formatsInUse = useMemo(() => FORMAT_LIST.filter((f) => data.decks.some((d) => formatInfo(d.format).id === f.id)), [data.decks]);
  const filtersOn = !!(q || tagFilter.length || colors.length || formatFilter || status !== 'all');
  const clearFilters = () => {
    setQ('');
    setTagFilter([]);
    setColors([]);
    setFormatFilter('');
    setStatus('all');
  };

  // Busca também pelas cartas do deck (mostra qual carta casou).
  const { decks, cardHits } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hits = new Map<string, string>();
    const l = data.decks.filter((d) => {
      if (needle) {
        const own = `${d.name} ${d.description} ${d.commander?.name ?? ''} ${d.partner?.name ?? ''} ${formatInfo(d.format).label}`.toLowerCase().includes(needle);
        if (!own) {
          const hit = d.cards.find((c) => c.card.name.toLowerCase().includes(needle) || c.card.namePt?.toLowerCase().includes(needle));
          if (!hit) return false;
          hits.set(d.id, hit.card.name);
        }
      }
      if (tagFilter.length && !(tagMatch === 'all' ? tagFilter.every((t) => d.tags.includes(t)) : tagFilter.some((t) => d.tags.includes(t)))) return false;
      if (formatFilter && formatInfo(d.format).id !== formatFilter) return false;
      if (status !== 'all') {
        const n = deckCount(d);
        const t = deckTarget(d);
        if (status === 'complete' && n !== t) return false;
        if (status === 'incomplete' && n >= t) return false;
        if (status === 'over' && n <= t) return false;
      }
      if (colors.length) {
        const id = deckColors(d);
        if (!matchesColorFilter({ colors: id, colorIdentity: id }, colors, colorMode)) return false;
      }
      return true;
    });
    const progress = (d: Deck) => deckCount(d) / deckTarget(d);
    const by: Record<DeckSort, (a: Deck, b: Deck) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      name: (a, b) => a.name.localeCompare(b.name),
      format: (a, b) => a.format.localeCompare(b.format) || a.name.localeCompare(b.name),
      count: (a, b) => deckCount(b) - deckCount(a),
      value: (a, b) => deckValue(b) - deckValue(a),
      colors: (a, b) => deckColors(b).length - deckColors(a).length || a.name.localeCompare(b.name),
      progress: (a, b) => progress(b) - progress(a) || a.name.localeCompare(b.name),
    };
    return { decks: l.sort(by[sort]), cardHits: hits };
  }, [data.decks, q, tagFilter, tagMatch, formatFilter, status, colors, colorMode, sort]);

  const edit = (d: Deck) => openModal((close) => <DeckFormModal deck={d} onClose={close} />);
  const cover = (d: Deck) => openModal((close) => <CoverEditorModal deck={d} onClose={close} />);
  const print = (d: Deck) => {
    const cards = d.cards.filter((c) => c.category !== 'maybeboard');
    store.addToProxies(cards.map((c) => ({ card: c.card, quantity: c.quantity })));
    toast(`${cards.reduce((s, c) => s + c.quantity, 0)} cartas de “${d.name}” na fila de impressão.`);
  };
  const remove = async (d: Deck) => {
    const ok = await confirmDialog({ title: 'Excluir deck?', message: <p><b>{d.name}</b> será excluído. As cartas dele também saem da coleção.</p>, confirmLabel: 'Excluir', danger: true });
    if (ok) {
      store.deleteDeck(d.id);
      toast('Deck excluído.');
    }
  };

  const setDeckTags = (d: Deck, tags: string[]) => store.updateDeck(d.id, (x) => ({ ...x, tags }));
  const TagButton = ({ d, cls }: { d: Deck; cls: string }) => (
    <TagSelect
      value={d.tags}
      onChange={(t) => setDeckTags(d, t)}
      align="right"
      trigger={(open, toggle) => (
        <button className={`${cls} ${open ? 'active' : ''}`} title="Tags do deck" aria-label="Tags do deck" onClick={toggle}><Tags size={15} /></button>
      )}
    />
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
        <button className="btn btn-primary" onClick={() => openImport({ target: 'new-deck' })}><Download size={16} /> Importar deck</button>
      </div>

      {data.decks.length > 0 && <StatsPanel kind="decks" teaser={<><span>{data.decks.length} decks</span><span>{formatUsd(data.decks.reduce((s2, d) => s2 + deckValue(d), 0))}</span></>} />}

      <div className="panel-bar">
        <div className="toolbar">
          <div className="input-icon">
            <Search size={16} />
            <input className="input" placeholder="Buscar decks, comandantes ou cartas…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select select-sm" style={{ width: 'auto' }} value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} aria-label="Filtrar por formato">
            <option value="">Todos os formatos</option>
            {formatsInUse.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select className="select select-sm" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as DeckStatus)} aria-label="Filtrar por status">
            {(Object.keys(STATUS_LABELS) as DeckStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}
          </select>
          <select className="select select-sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as DeckSort)} aria-label="Ordenar">
            {(Object.keys(SORT_LABELS) as DeckSort[]).map((k) => <option key={k} value={k}>Ordenar: {SORT_LABELS[k]}</option>)}
          </select>
          <div className="spacer" />
          {view === 'grid' && <input type="range" min={230} max={480} step={10} value={cardW} onChange={(e) => setCardW(Number(e.target.value))} aria-label="Tamanho dos decks" title="Tamanho dos decks" style={{ width: 110 }} />}
          <ViewToggle value={view} onChange={(v) => setPrefs({ decksView: v })} />
        </div>
        <div className="toolbar">
          <ColorFilter value={colors} onChange={setColors} mode={colorMode} onModeChange={setColorMode} />
          <TagSelect mode="filter" value={tagFilter} onChange={setTagFilter} match={tagMatch} onMatch={setTagMatch} placeholder="Filtrar por tags" />
          <div className="spacer" />
          <span className="small subtle">{decks.length === data.decks.length ? `${decks.length} deck(s)` : `${decks.length} de ${data.decks.length} decks`}</span>
          {filtersOn && <button className="btn btn-ghost btn-xs" onClick={clearFilters}><X size={13} /> Limpar filtros</button>}
        </div>
      </div>

      {data.decks.length === 0 ? (
        <Empty icon={<Layers size={40} />} title="Nenhum deck ainda" action={<button className="btn btn-primary" onClick={() => openImport({ target: 'new-deck' })}><Download size={16} /> Importar deck</button>}>
          Cole uma lista do Arena, Moxfield ou LigaMagic — ou comece um deck vazio e adicione as cartas depois.
        </Empty>
      ) : decks.length === 0 ? (
        <Empty icon={<Search size={36} />} title="Nenhum deck encontrado" action={filtersOn ? <button className="btn btn-secondary" onClick={clearFilters}><X size={16} /> Limpar filtros</button> : undefined}>Ajuste a busca ou os filtros.</Empty>
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
                    {cardHits.has(d.id) ? <span className="ellipsis deck-hit">contém <b>{cardHits.get(d.id)}</b></span> : d.commander && <span className="ellipsis">{d.commander.name}{d.partner ? ` & ${d.partner.name}` : ''}</span>}
                  </div>
                </div>
                <div className="deck-row-tags hide-mobile"><TagPills ids={d.tags} max={2} /></div>
                <div className="deck-row-count hide-mobile">
                  <span className="tabular"><b className={count === target ? 'success-text' : count > target ? 'warning-text' : ''}>{count}</b><span className="subtle"> / {target}</span></span>
                  <div className="progress"><div style={{ width: `${Math.min(100, (count / target) * 100)}%`, background: count === target ? 'var(--success)' : undefined }} /></div>
                </div>
                <div className="deck-row-value hide-mobile tabular">{formatUsd(deckValue(d))}</div>
                <div className="deck-row-date hide-mobile subtle small">{relativeDate(d.updatedAt)}</div>
                <div className="list-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-icon btn-sm hide-mobile" title="Mandar deck para impressão" onClick={() => print(d)}><Printer size={16} /></button>
                  <TagButton d={d} cls="btn btn-ghost btn-icon btn-sm hide-mobile" />
                  <button className="btn btn-ghost btn-icon btn-sm hide-mobile" title="Editar" onClick={() => edit(d)}><Pencil size={16} /></button>
                  <Actions d={d} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="deck-cards" style={{ ['--deck-w' as string]: `${cardW}px` }}>
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
                  <TagButton d={d} cls="btn btn-secondary btn-icon btn-sm" />
                  <button className="btn btn-secondary btn-icon btn-sm" title="Ajustar capa" onClick={() => cover(d)}><Crop size={15} /></button>
                  <Actions d={d} />
                </div>
                <div className="deck-card-body">
                  <div className="row small">
                    <ColorPips colors={deckColors(d)} />
                    {cardHits.has(d.id) ? <span className="grow ellipsis deck-hit">contém <b>{cardHits.get(d.id)}</b></span> : <span className="grow ellipsis subtle">{d.commander?.name ?? `${d.cards.length} cartas distintas`}</span>}
                    <b className="tabular">{formatUsd(deckValue(d))}</b>
                  </div>
                  <div className="row small">
                    <div className="progress grow"><div style={{ width: `${Math.min(100, (count / target) * 100)}%`, background: count === target ? 'var(--success)' : undefined }} /></div>
                    <span className="tabular subtle">{count}/{target}</span>
                  </div>
                  {d.tags.length > 0 && <div className="row"><TagPills ids={d.tags} max={3} /></div>}
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
