import { useState } from 'react';
import type { CollectionItem, Condition } from '../../types/models.ts';
import { CONDITIONS } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { Modal } from '../common/Modal.tsx';
import { frontImage } from '../../types/cardRules.ts';

const LANGS: [string, string][] = [['en', 'Inglês'], ['pt', 'Português'], ['es', 'Espanhol'], ['ja', 'Japonês'], ['de', 'Alemão'], ['fr', 'Francês'], ['it', 'Italiano'], ['ko', 'Coreano'], ['ru', 'Russo'], ['zhs', 'Chinês']];

export function ItemEditModal({ item, onClose }: { item: CollectionItem; onClose: () => void }) {
  const { updateCollectionItem } = useStore();
  const [quantity, setQuantity] = useState(item.quantity);
  const [isFoil, setFoil] = useState(item.isFoil);
  const [condition, setCondition] = useState<Condition>(item.condition);
  const [language, setLanguage] = useState(item.language);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [tags, setTags] = useState(item.tags.join(', '));
  const save = () => {
    updateCollectionItem(item.id, {
      quantity: Math.max(1, quantity),
      isFoil,
      condition,
      language,
      notes: notes.trim() || undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    onClose();
  };
  return (
    <Modal
      title={item.card.name}
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save}>Salvar</button></>}
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <img src={frontImage(item.card, 'normal')} alt="" style={{ width: 140, borderRadius: 8 }} className="hide-mobile" />
        <div className="col grow" style={{ gap: 12 }}>
          <div className="field-row">
            <div className="field"><label>Quantidade</label><input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></div>
            <div className="field"><label>Condição</label><select className="select" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Idioma</label><select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <label className="check"><input type="checkbox" checked={isFoil} onChange={(e) => setFoil(e.target.checked)} /> Foil</label>
          <div className="field"><label>Tags (separadas por vírgula)</label><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="troca, binder, …" /></div>
          <div className="field"><label>Notas</label><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      </div>
    </Modal>
  );
}
