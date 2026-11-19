import { useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { Deck } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { compressImage } from '../../services/image.ts';
import { normalizeImageUrl } from '../../services/mpcfill.ts';
import { frontImage } from '../../types/cardRules.ts';
import { Modal } from '../common/Modal.tsx';
import { coverStyle, deckCoverImage } from './deckUtils.ts';

export function CoverEditorModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const { updateDeck } = useStore();
  const [image, setImage] = useState<string | undefined>(deck.cover.image);
  const [zoom, setZoom] = useState(deck.cover.zoom);
  const [pos, setPos] = useState(deck.cover.positionY);
  const [url, setUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = { ...deck, cover: { image, zoom, positionY: pos } };
  const shown = deckCoverImage(preview);

  const options = useMemo(() => {
    const seen = new Set<string>();
    return deck.cards
      .map((c) => c.card.images.art_crop || frontImage(c.card))
      .filter((u) => u && !seen.has(u) && seen.add(u))
      .slice(0, 60);
  }, [deck.cards]);

  const save = () => {
    updateDeck(deck.id, (d) => ({ ...d, cover: { image, zoom, positionY: pos } }));
    onClose();
  };

  return (
    <Modal title="Capa do deck" onClose={onClose} size="lg" footer={<><button className="btn btn-ghost" onClick={() => { setImage(undefined); setZoom(1); setPos(30); }}>Restaurar padrão</button><div className="spacer" /><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save}>Salvar capa</button></>}>
      <div className="cover-preview">{shown && <img src={shown} alt="" style={coverStyle(preview)} />}</div>
      <div className="field-row">
        <div className="field"><label>Zoom ({zoom.toFixed(1)}×)</label><input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></div>
        <div className="field"><label>Posição vertical ({Math.round(pos)}%)</label><input type="range" min={0} max={100} step={1} value={pos} onChange={(e) => setPos(Number(e.target.value))} /></div>
      </div>
      <div className="row">
        <input className="input" placeholder="URL da imagem ou link do Google Drive" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-secondary" disabled={!url.trim()} onClick={() => { setImage(normalizeImageUrl(url)); setUrl(''); }}>Usar URL</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await compressImage(f, 1400, 0.82)); }} />
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Enviar</button>
      </div>
      <span className="label">Ou escolha uma arte do deck</span>
      <div className="art-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        {options.map((u) => (
          <button key={u} className={`art-option ${image === u ? 'active' : ''}`} onClick={() => setImage(u)}>
            <img src={u} loading="lazy" alt="" style={{ aspectRatio: '4 / 3' }} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
