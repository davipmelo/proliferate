import { useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import type { DeckCategory } from '../../types/models.ts';
import { CATEGORY_LABELS } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { openModal } from '../../state/ui.tsx';
import { formatInfo } from '../../types/formats.ts';
import { Modal } from './Modal.tsx';

interface Props {
  title?: string;
  onPick: (deckId: string, category: DeckCategory) => void;
  onClose: () => void;
  showCategory?: boolean;
}

function DeckPickerModal({ title = 'Escolher deck', onPick, onClose, showCategory = true }: Props) {
  const { data, createDeck } = useStore();
  const [category, setCategory] = useState<DeckCategory>('main');
  const [newName, setNewName] = useState('');
  return (
    <Modal title={title} onClose={onClose} size="sm">
      {showCategory && (
        <div className="field">
          <label>Categoria</label>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value as DeckCategory)}>
            {(['main', 'sideboard', 'maybeboard', 'commander', 'partner', 'companion'] as DeckCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      )}
      {data.decks.length === 0 && <p className="muted small">Você ainda não tem decks.</p>}
      <div className="list" style={{ maxHeight: 340, overflowY: 'auto' }}>
        {data.decks.map((d) => (
          <button key={d.id} className="list-row clickable" style={{ border: 'none', textAlign: 'left', color: 'inherit', font: 'inherit', width: '100%' }} onClick={() => { onPick(d.id, category); onClose(); }}>
            <Layers size={16} className="subtle" />
            <div className="list-main">
              <div className="list-title"><span>{d.name}</span></div>
              <div className="list-sub">{formatInfo(d.format).label} · {d.cards.reduce((s, c) => s + c.quantity, 0)} cartas</div>
            </div>
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          const deck = createDeck({ name: newName.trim(), format: 'casual' });
          onPick(deck.id, category);
          onClose();
        }}
      >
        <input className="input" placeholder="Ou crie um deck novo…" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn btn-secondary" type="submit" disabled={!newName.trim()}>
          <Plus size={16} /> Criar
        </button>
      </form>
    </Modal>
  );
}

export function pickDeck(opts: Omit<Props, 'onClose'>): void {
  openModal((close) => <DeckPickerModal {...opts} onClose={close} />);
}
