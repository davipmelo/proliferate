import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Upload } from 'lucide-react';
import type { Deck } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { compressImage } from '../../services/image.ts';
import { normalizeImageUrl } from '../../services/mpcfill.ts';
import { frontImage } from '../../types/cardRules.ts';
import { Modal } from '../common/Modal.tsx';
import { coverCrop, coverStyle, deckCoverImage } from './deckUtils.ts';

/** Proporções (largura/altura) de onde a capa aparece. */
const ASPECT = { grid: 1 / 0.57, hero: 5, list: 120 / 62 };
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export function CoverEditorModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const { updateDeck } = useStore();
  const [image, setImage] = useState<string | undefined>(deck.cover.image);
  const [zoom, setZoom] = useState(deck.cover.zoom);
  const [px, setPx] = useState(deck.cover.positionX ?? 50);
  const [py, setPy] = useState(deck.cover.positionY);
  const [url, setUrl] = useState('');
  const [aspect, setAspect] = useState(4 / 3);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cover = { image, zoom, positionX: px, positionY: py };
  const preview = { ...deck, cover };
  const shown = deckCoverImage(preview);

  // Proporção real da imagem escolhida (para desenhar o recorte sobre ela).
  useEffect(() => {
    if (!shown) return;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => img.naturalWidth && setAspect(img.naturalWidth / img.naturalHeight);
    img.src = shown;
  }, [shown]);

  // Roda do mouse sobre a imagem ajusta o zoom (sem rolar o modal).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(Math.round((z - e.deltaY * 0.0015) * 100) / 100, 1, 3));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [shown]);

  const options = useMemo(() => {
    const seen = new Set<string>();
    return deck.cards
      .map((c) => c.card.images.art_crop || frontImage(c.card))
      .filter((u) => u && !seen.has(u) && seen.add(u))
      .slice(0, 60);
  }, [deck.cards]);

  const grid = coverCrop(aspect, ASPECT.grid, cover);
  const hero = coverCrop(aspect, ASPECT.hero, cover);

  // Arrastar o quadro move o ponto de recorte (vale para todos os formatos de capa).
  const startDrag = (e: React.PointerEvent) => {
    const el = stageRef.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    let lastX = e.clientX;
    let lastY = e.clientY;
    let x = px / 100;
    let y = py / 100;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - lastX) / rect.width;
      const dy = (ev.clientY - lastY) / rect.height;
      lastX = ev.clientX;
      lastY = ev.clientY;
      const c = coverCrop(aspect, ASPECT.grid, { zoom, positionX: x * 100, positionY: y * 100 });
      if (c.width < 1) x = clamp((c.left + dx) / (1 - c.width), 0, 1);
      if (c.height < 1) y = clamp((c.top + dy) / (1 - c.height), 0, 1);
      setPx(Math.round(x * 1000) / 10);
      setPy(Math.round(y * 1000) / 10);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const save = () => {
    updateDeck(deck.id, (d) => ({ ...d, cover }));
    onClose();
  };
  const pct = (n: number) => `${n * 100}%`;
  const frame = (c: ReturnType<typeof coverCrop>) => ({ left: pct(c.left), top: pct(c.top), width: pct(c.width), height: pct(c.height) });

  return (
    <Modal
      title="Capa do deck"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => { setImage(undefined); setZoom(1); setPx(50); setPy(30); }}>Restaurar padrão</button>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Salvar capa</button>
        </>
      }
    >
      {shown ? (
        <div className="crop-editor">
          <div
            ref={stageRef}
            className="crop-stage"
            style={{ aspectRatio: String(aspect), maxWidth: `calc(330px * ${aspect})` }}
            onPointerDown={startDrag}
          >
            <img src={shown} alt="" draggable={false} referrerPolicy="no-referrer" />
            <div className="crop-frame hero" style={frame(hero)} />
            <div className="crop-frame" style={frame(grid)}><span>Arraste para posicionar</span></div>
          </div>
          <div className="crop-legend small subtle">
            <span><i className="lg-solid" /> Grade de decks</span>
            <span><i className="lg-dashed" /> Página do deck</span>
            <span className="hide-mobile">Roda do mouse ajusta o zoom</span>
          </div>
        </div>
      ) : (
        <div className="cover-empty small subtle">Escolha uma imagem abaixo.</div>
      )}

      <div className="field-row">
        <div className="field"><label>Zoom ({zoom.toFixed(2)}×)</label><input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></div>
        <div className="field">
          <label>Posição ({Math.round(px)}% · {Math.round(py)}%)</label>
          <div className="row">
            <span className="small subtle grow">Arraste o quadro sobre a imagem.</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setPx(50); setPy(50); }}><Crosshair size={14} /> Centralizar</button>
          </div>
        </div>
      </div>

      {shown && (
        <div className="cover-previews">
          <div className="cover-pv">
            <span className="label">Grade</span>
            <div className="cover-pv-box grid" style={{ aspectRatio: String(ASPECT.grid) }}><img src={shown} alt="" style={coverStyle(preview)} referrerPolicy="no-referrer" /><b className="ellipsis">{deck.name}</b></div>
          </div>
          <div className="cover-pv wide">
            <span className="label">Página do deck</span>
            <div className="cover-pv-box hero" style={{ aspectRatio: String(ASPECT.hero) }}><img src={shown} alt="" style={coverStyle(preview)} referrerPolicy="no-referrer" /><b className="ellipsis">{deck.name}</b></div>
          </div>
          <div className="cover-pv">
            <span className="label">Lista</span>
            <div className="cover-pv-box" style={{ aspectRatio: String(ASPECT.list), maxWidth: 160 }}><img src={shown} alt="" style={coverStyle(preview)} referrerPolicy="no-referrer" /></div>
          </div>
        </div>
      )}

      <div className="row">
        <input className="input" placeholder="URL da imagem ou link do Google Drive" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-secondary" disabled={!url.trim()} onClick={() => { setImage(normalizeImageUrl(url)); setUrl(''); }}>Usar URL</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await compressImage(f, 1400, 0.82)); }} />
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Enviar</button>
      </div>
      <span className="label">Ou escolha uma arte do deck</span>
      <div className="art-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        {options.map((u) => (
          <button key={u} className={`art-option ${shown === u ? 'active' : ''}`} onClick={() => setImage(u)}>
            <img src={u} loading="lazy" alt="" style={{ aspectRatio: '4 / 3' }} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
