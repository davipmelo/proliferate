import { useState } from 'react';
import { ArrowDownAZ, ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { DeckTag } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { uid } from '../../services/normalize.ts';
import { confirmDialog, toast } from '../../state/ui.tsx';
import { Modal } from '../common/Modal.tsx';
import { Popover } from '../common/Popover.tsx';

export const TAG_COLORS = ['#ffbb00', '#f2555a', '#f0745a', '#5cb87e', '#4cc38a', '#5aa9f0', '#6eb3e8', '#a78bfa', '#e879f9', '#bdb9b2'];

/** Escolha de cor em lista suspensa (paleta + cor personalizada). */
export function ColorSelect({ value, onChange, label = 'Cor da tag' }: { value: string; onChange: (c: string) => void; label?: string }) {
  return (
    <Popover
      width={208}
      trigger={(open, toggle) => (
        <button type="button" className={`color-trigger ${open ? 'open' : ''}`} onClick={toggle} aria-label={label} title={label}>
          <span className="color-swatch" style={{ background: value }} />
          <ChevronDown size={13} />
        </button>
      )}
    >
      {(close) => (
        <div className="color-pop">
          <div className="tag-color-grid">
            {TAG_COLORS.map((c) => (
              <button type="button" key={c} className={`tag-color ${value.toLowerCase() === c ? 'active' : ''}`} style={{ background: c }} onClick={() => { onChange(c); close(); }} aria-label={`Cor ${c}`} />
            ))}
          </div>
          <label className="color-custom">
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} /> Personalizada
          </label>
        </div>
      )}
    </Popover>
  );
}

/** Linha editável de uma tag (nome salvo ao sair do campo ou com Enter). */
function TagRow({ tag, count }: { tag: DeckTag; count: number }) {
  const { setTags, update } = useStore();
  const [name, setName] = useState(tag.name);
  const save = (patch: Partial<DeckTag>) => setTags((ts) => ts.map((x) => (x.id === tag.id ? { ...x, ...patch } : x)));
  const commitName = () => {
    const n = name.trim();
    if (!n) setName(tag.name);
    else if (n !== tag.name) save({ name: n });
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Excluir tag?', message: <p>A tag <b>{tag.name}</b> será removida{count ? ` de ${count} deck(s)` : ''}.</p>, danger: true, confirmLabel: 'Excluir' }))) return;
    update((d) => ({ ...d, tags: d.tags.filter((x) => x.id !== tag.id), decks: d.decks.map((dk) => ({ ...dk, tags: dk.tags.filter((x) => x !== tag.id) })) }));
  };
  return (
    <div className="tag-row">
      <ColorSelect value={tag.color} onChange={(c) => save({ color: c })} />
      <input
        className="input input-sm grow"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        aria-label="Nome da tag"
      />
      <span className="tag-row-count">{count} deck{count === 1 ? '' : 's'}</span>
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={remove} aria-label={`Excluir ${tag.name}`} title="Excluir"><Trash2 size={15} /></button>
    </div>
  );
}

export function TagManagerModal({ onClose }: { onClose: () => void }) {
  const { data, setTags } = useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[data.tags.length % TAG_COLORS.length]);
  const exists = data.tags.some((t) => t.name.toLowerCase() === name.trim().toLowerCase());

  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (exists) return toast('Já existe uma tag com esse nome.', 'error');
    setTags((t) => [...t, { id: uid('tag'), name: n, color }]);
    setName('');
    setColor(TAG_COLORS[(data.tags.length + 1) % TAG_COLORS.length]);
  };
  const count = (id: string) => data.decks.filter((d) => d.tags.includes(id)).length;

  return (
    <Modal title="Gerenciar tags" onClose={onClose} size="sm" footer={<button className="btn btn-primary" onClick={onClose}>Concluir</button>}>
      <div className="field">
        <label>Nova tag</label>
        <div className="tag-row">
          <ColorSelect value={color} onChange={setColor} />
          <input
            className="input input-sm grow"
            placeholder="Ex.: cEDH, Casual, Em construção"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          />
          <button type="button" className="btn btn-secondary btn-sm" disabled={!name.trim() || exists} onClick={add}><Plus size={15} /> Criar</button>
        </div>
        {exists && <span className="field-hint warning-text">Já existe uma tag com esse nome.</span>}
      </div>
      <div className="field">
        <div className="row">
          <label className="grow">Suas tags {data.tags.length > 0 && <span className="subtle">({data.tags.length})</span>}</label>
          {data.tags.length > 1 && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTags((ts) => ts.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))}><ArrowDownAZ size={13} /> Ordenar A–Z</button>
          )}
        </div>
        {data.tags.length === 0 ? (
          <p className="small subtle">Nenhuma tag criada. Tags ajudam a separar decks por estilo, nível ou estado (ex.: “cEDH”, “Montando”).</p>
        ) : (
          <div className="col" style={{ gap: 6 }}>
            {data.tags.map((t) => <TagRow key={t.id} tag={t} count={count(t.id)} />)}
          </div>
        )}
        <span className="field-hint">Clique no nome para renomear. Para aplicar ou remover tags, use o botão de tags em cada deck.</span>
      </div>
    </Modal>
  );
}
