import { useMemo, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import type { Deck } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { toast } from '../../state/ui.tsx';
import { EXPORT_EXT, EXPORT_LABELS, exportCollection, exportDeck, type ExportFormat } from '../../services/exporters.ts';
import { downloadText, slugify } from '../../services/image.ts';
import { Modal } from '../common/Modal.tsx';

export default function ExportModal({ deck, onClose }: { deck?: Deck; onClose: () => void }) {
  const { data, collection } = useStore();
  const [scope, setScope] = useState<string>(deck?.id ?? (data.decks[0]?.id || 'collection'));
  const [fmt, setFmt] = useState<ExportFormat>('moxfield');
  const target = scope === 'collection' ? null : data.decks.find((d) => d.id === scope);
  const text = useMemo(() => (target ? exportDeck(target, fmt) : exportCollection(collection, fmt)), [target, fmt, collection]);
  const filename = `${slugify(target?.name ?? 'colecao')}-${fmt}.${EXPORT_EXT[fmt]}`;

  return (
    <Modal
      title="Exportar"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copiado.'), () => toast('Não foi possível copiar.', 'error'))}><Copy size={16} /> Copiar</button>
          <button className="btn btn-primary" onClick={() => downloadText(text, filename, fmt === 'json' ? 'application/json' : fmt === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8')}><Download size={16} /> Baixar</button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label>O que exportar</label>
          <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="collection">Coleção inteira ({collection.length} artes)</option>
            {data.decks.map((d) => <option key={d.id} value={d.id}>Deck: {d.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Formato</label>
          <select className="select" value={fmt} onChange={(e) => setFmt(e.target.value as ExportFormat)}>
            {(Object.keys(EXPORT_LABELS) as ExportFormat[]).map((f) => <option key={f} value={f}>{EXPORT_LABELS[f]}</option>)}
          </select>
        </div>
      </div>
      <textarea className="textarea mono" readOnly value={text} style={{ minHeight: 320 }} onFocus={(e) => e.currentTarget.select()} />
      <span className="field-hint">{filename} · {text.split('\n').length} linhas</span>
    </Modal>
  );
}
