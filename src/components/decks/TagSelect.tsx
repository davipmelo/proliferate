import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, Search, Settings2, Tag, X } from 'lucide-react';
import type { DeckTag } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { openModal } from '../../state/ui.tsx';
import { uid } from '../../services/normalize.ts';
import { Popover } from '../common/Popover.tsx';
import { TAG_COLORS, TagManagerModal } from './TagManagerModal.tsx';

export type TagMatch = 'all' | 'any';

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  /** "filter": filtra a lista de decks (mostra Todas/Qualquer); "assign": aplica tags a um deck. */
  mode?: 'assign' | 'filter';
  match?: TagMatch;
  onMatch?: (m: TagMatch) => void;
  /** Gatilho personalizado (ex.: botão de ícone). */
  trigger?: (open: boolean, toggle: () => void) => ReactNode;
  align?: 'left' | 'right';
  placeholder?: string;
}

/** Pílula de tag. */
export function TagPill({ tag, onRemove }: { tag: DeckTag; onRemove?: () => void }) {
  return (
    <span className="tag-pill">
      <span className="tag-dot" style={{ background: tag.color }} />
      <span className="ellipsis">{tag.name}</span>
      {onRemove && (
        <button type="button" className="tag-pill-x" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label={`Remover ${tag.name}`}><X size={11} /></button>
      )}
    </span>
  );
}

/** Mostra até `max` tags e um "+N" com as demais no título. */
export function TagPills({ ids, max = 2 }: { ids: string[]; max?: number }) {
  const { data } = useStore();
  const tags = ids.map((id) => data.tags.find((t) => t.id === id)).filter(Boolean) as DeckTag[];
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const rest = tags.slice(max);
  return (
    <span className="tag-pills">
      {shown.map((t) => <TagPill key={t.id} tag={t} />)}
      {rest.length > 0 && <span className="tag-pill tag-more" title={rest.map((t) => t.name).join(', ')}>+{rest.length}</span>}
    </span>
  );
}

/** Seleção de tags em lista suspensa, com busca, criação e atalho para gerenciar. */
export function TagSelect({ value, onChange, mode = 'assign', match = 'all', onMatch, trigger, align = 'left', placeholder = 'Tags' }: Props) {
  const store = useStore();
  const { data } = store;
  const [q, setQ] = useState('');
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data.decks) for (const t of d.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [data.decks]);
  const needle = q.trim().toLowerCase();
  const list = data.tags.filter((t) => !needle || t.name.toLowerCase().includes(needle));
  const exact = data.tags.some((t) => t.name.toLowerCase() === needle);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const create = () => {
    const name = q.trim();
    if (!name || exact) return;
    const tag: DeckTag = { id: uid('tag'), name, color: TAG_COLORS[data.tags.length % TAG_COLORS.length] };
    store.setTags((t) => [...t, tag]);
    onChange([...value, tag.id]);
    setQ('');
  };
  const selected = value.map((id) => data.tags.find((t) => t.id === id)).filter(Boolean) as DeckTag[];

  const defaultTrigger = (open: boolean, toggleOpen: () => void) => (
    <button type="button" className={`tag-trigger ${open ? 'open' : ''} ${selected.length ? 'has-value' : ''}`} onClick={toggleOpen} aria-expanded={open}>
      <Tag size={15} />
      {selected.length === 0 ? (
        <span className="tag-trigger-label">{placeholder}</span>
      ) : mode === 'filter' ? (
        <span className="tag-trigger-label">
          {selected.length === 1 ? selected[0].name : `${selected.length} tags`}
          {selected.length > 1 && <small> · {match === 'all' ? 'todas' : 'qualquer'}</small>}
        </span>
      ) : (
        <span className="tag-trigger-pills">
          {selected.slice(0, 2).map((t) => <TagPill key={t.id} tag={t} />)}
          {selected.length > 2 && <span className="tag-pill tag-more">+{selected.length - 2}</span>}
        </span>
      )}
      <ChevronDown size={14} className="tag-trigger-chev" />
    </button>
  );

  return (
    <Popover align={align} width={290} className="tag-popover" trigger={trigger ?? defaultTrigger}>
      {(close) => (
        <>
          <div className="tag-pop-search">
            <Search size={15} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (list.length === 1 && needle) toggle(list[0].id);
                else if (!exact && mode === 'assign') create();
              }}
              placeholder={mode === 'assign' ? 'Buscar ou criar tag…' : 'Buscar tag…'}
              aria-label="Buscar tag"
            />
          </div>
          {mode === 'filter' && value.length > 1 && onMatch && (
            <div className="tag-pop-match">
              <span>Mostrar decks com</span>
              <div className="seg">
                <button type="button" className={`seg-btn wide ${match === 'all' ? 'active' : ''}`} onClick={() => onMatch('all')}>todas</button>
                <button type="button" className={`seg-btn wide ${match === 'any' ? 'active' : ''}`} onClick={() => onMatch('any')}>qualquer</button>
              </div>
            </div>
          )}
          <div className="tag-pop-list" role="listbox" aria-multiselectable="true">
            {data.tags.length === 0 && !needle && <p className="tag-pop-empty">{mode === 'assign' ? 'Nenhuma tag ainda. Digite um nome para criar a primeira.' : 'Nenhuma tag criada ainda.'}</p>}
            {list.map((t) => {
              const on = value.includes(t.id);
              return (
                <button type="button" key={t.id} role="option" aria-selected={on} className={`tag-option ${on ? 'on' : ''}`} onClick={() => toggle(t.id)}>
                  <span className="tag-check">{on && <Check size={12} strokeWidth={3} />}</span>
                  <span className="tag-dot" style={{ background: t.color }} />
                  <span className="grow ellipsis">{t.name}</span>
                  <span className="tag-count">{usage.get(t.id) ?? 0}</span>
                </button>
              );
            })}
            {needle && !exact && mode === 'assign' && (
              <button type="button" className="tag-option create" onClick={create}>
                <Plus size={14} /> Criar tag <b>“{q.trim()}”</b>
              </button>
            )}
            {needle && !list.length && mode === 'filter' && <p className="tag-pop-empty">Nenhuma tag com esse nome.</p>}
          </div>
          <div className="tag-pop-foot">
            {value.length > 0 && <button type="button" className="btn btn-ghost btn-xs" onClick={() => onChange([])}><X size={13} /> Limpar</button>}
            <div className="spacer" />
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => { close(); openModal((c) => <TagManagerModal onClose={c} />); }}><Settings2 size={13} /> Gerenciar tags</button>
          </div>
        </>
      )}
    </Popover>
  );
}
