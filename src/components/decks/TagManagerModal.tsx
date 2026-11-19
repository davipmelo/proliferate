import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { DeckTag } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { uid } from '../../services/normalize.ts';
import { confirmDialog } from '../../state/ui.tsx';
import { Modal } from '../common/Modal.tsx';

export const TAG_COLORS = ['#ffbb00', '#f2555a', '#f0745a', '#5cb87e', '#4cc38a', '#5aa9f0', '#6eb3e8', '#a78bfa', '#e879f9', '#bdb9b2'];

function ColorChoice({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="tag-color-grid">
      {TAG_COLORS.map((c) => (
        <button key={c} className={`tag-color ${value === c ? 'active' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={`Cor ${c}`} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Cor personalizada" />
    </div>
  );
}

export function TagManagerModal({ onClose }: { onClose: () => void }) {
  const { data, setTags, update } = useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [editing, setEditing] = useState<DeckTag | null>(null);

  const add = () => {
    if (!name.trim()) return;
    setTags((t) => [...t, { id: uid('tag'), name: name.trim(), color }]);
    setName('');
    setColor(TAG_COLORS[(data.tags.length + 1) % TAG_COLORS.length]);
  };

  const remove = async (t: DeckTag) => {
    const used = data.decks.filter((d) => d.tags.includes(t.id)).length;
    if (!(await confirmDialog({ title: 'Excluir tag?', message: <p>A tag <b>{t.name}</b> será removida{used ? ` de ${used} deck(s)` : ''}.</p>, danger: true, confirmLabel: 'Excluir' }))) return;
    update((d) => ({ ...d, tags: d.tags.filter((x) => x.id !== t.id), decks: d.decks.map((dk) => ({ ...dk, tags: dk.tags.filter((x) => x !== t.id) })) }));
  };

  return (
    <Modal title="Tags de decks" onClose={onClose} size="sm" footer={<button className="btn btn-primary" onClick={onClose}>Concluir</button>}>
      <form className="col" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="row">
          <input className="input" placeholder="Nova tag (ex.: cEDH, Casual, Em construção)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-secondary" type="submit" disabled={!name.trim()}><Plus size={16} /> Criar</button>
        </div>
        <ColorChoice value={color} onChange={setColor} />
      </form>
      <hr className="divider" />
      {data.tags.length === 0 && <p className="small muted">Nenhuma tag criada.</p>}
      <div className="col" style={{ gap: 6 }}>
        {data.tags.map((t) =>
          editing?.id === t.id ? (
            <div key={t.id} className="col section" style={{ padding: 10 }}>
              <input className="input input-sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
              <ColorChoice value={editing.color} onChange={(c) => setEditing({ ...editing, color: c })} />
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}><X size={14} /> Cancelar</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setTags((ts) => ts.map((x) => (x.id === t.id ? { ...editing, name: editing.name.trim() || x.name } : x))); setEditing(null); }}><Check size={14} /> Salvar</button>
              </div>
            </div>
          ) : (
            <div key={t.id} className="row">
              <span className="tag-pill grow" style={{ height: 28 }}><span className="tag-dot" style={{ background: t.color }} />{t.name}</span>
              <span className="small subtle">{data.decks.filter((d) => d.tags.includes(t.id)).length} deck(s)</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(t)} aria-label="Editar"><Pencil size={15} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(t)} aria-label="Excluir"><Trash2 size={15} /></button>
            </div>
          ),
        )}
      </div>
    </Modal>
  );
}
