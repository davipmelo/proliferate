import { useEffect, useRef, useState } from 'react';
import { Download, ImageDown } from 'lucide-react';
import type { Deck } from '../../types/models.ts';
import { toast } from '../../state/ui.tsx';
import { useAccount } from '../../state/syncStatus.ts';
import { downloadBlob, slugify } from '../../services/image.ts';
import { getLocal, setLocal } from '../../services/storage.ts';
import {
  ASPECTS, exportPoster, renderPoster, RES_LABELS, SORT_LABELS, THEME_LABELS,
  type PosterAspect, type PosterOptions, type PosterResolution, type PosterSort, type PosterTheme,
} from '../../services/poster.ts';
import { Modal } from '../common/Modal.tsx';

const DEFAULTS: Omit<PosterOptions, 'title' | 'author'> = {
  resolution: 'high', aspect: 'a4-landscape', format: 'jpeg', quality: 0.9, theme: 'dark', sort: 'default',
  groupCopies: true, highlightCommander: true, showNames: false, showHeader: true, includeSideboard: false,
};

export default function PosterModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const acc = useAccount();
  const [o, setO] = useState<PosterOptions>(() => ({ ...DEFAULTS, ...getLocal('poster-opts', {}), title: deck.name, author: getLocal('poster-author', acc.user?.username ?? '') }));
  const [progress, setProgress] = useState<{ pct: number; msg: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [size, setSize] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const set = (p: Partial<PosterOptions>) => setO((x) => ({ ...x, ...p }));

  useEffect(() => {
    const { title, author, ...rest } = o;
    void title;
    setLocal('poster-opts', rest);
    setLocal('poster-author', author);
  }, [o]);

  const generate = async () => {
    setProgress({ pct: 0, msg: 'Preparando…' });
    try {
      const canvas = await renderPoster(deck, o, (pct, msg) => setProgress({ pct, msg }));
      canvasRef.current = canvas;
      setSize(`${canvas.width} × ${canvas.height} px`);
      // Prévia leve (reduzida)
      const k = Math.min(1, 1400 / canvas.width);
      const pv = document.createElement('canvas');
      pv.width = Math.round(canvas.width * k);
      pv.height = Math.round(canvas.height * k);
      pv.getContext('2d')!.drawImage(canvas, 0, 0, pv.width, pv.height);
      setPreview(pv.toDataURL(o.format === 'png' ? 'image/png' : 'image/jpeg', 0.85));
    } catch (e: any) {
      toast(e?.message ?? 'Falha ao gerar o pôster.', 'error');
    } finally {
      setProgress(null);
    }
  };

  const download = async () => {
    if (!canvasRef.current) return;
    setProgress({ pct: 97, msg: 'Exportando…' });
    try {
      const blob = await exportPoster(canvasRef.current, o);
      downloadBlob(blob, `${slugify(o.title || deck.name)}-poster.${o.format === 'jpeg' ? 'jpg' : o.format}`);
    } catch (e: any) {
      toast(e?.message ?? 'Falha ao exportar.', 'error');
    } finally {
      setProgress(null);
    }
  };

  // Mudou alguma opção → precisa gerar de novo.
  useEffect(() => {
    canvasRef.current = null;
    setPreview(null);
  }, [o]);

  const sel = <T extends string>(label: string, value: T, options: Record<T, string>, on: (v: T) => void) => (
    <div className="field">
      <label>{label}</label>
      <select className="select select-sm" value={value} onChange={(e) => on(e.target.value as T)}>
        {(Object.keys(options) as T[]).map((k) => <option key={k} value={k}>{options[k]}</option>)}
      </select>
    </div>
  );

  return (
    <Modal
      title={`Pôster · ${deck.name}`}
      onClose={onClose}
      size="xl"
      footer={
        <>
          {progress && (
            <div className="col grow" style={{ gap: 4, maxWidth: 420 }}>
              <span className="small muted">{progress.msg}</span>
              <div className="progress"><div style={{ width: `${progress.pct}%` }} /></div>
            </div>
          )}
          {!progress && size && <span className="small subtle">{size}</span>}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className={`btn ${preview ? 'btn-secondary' : 'btn-primary'}`} disabled={!!progress} onClick={generate}><ImageDown size={16} /> {preview ? 'Gerar de novo' : 'Gerar pôster'}</button>
          {preview && <button className="btn btn-primary" disabled={!!progress} onClick={download}><Download size={16} /> Baixar {o.format.toUpperCase()}</button>}
        </>
      }
    >
      <div className="poster-layout">
        <div className="col" style={{ gap: 10 }}>
          <div className="field"><label>Título</label><input className="input input-sm" value={o.title} onChange={(e) => set({ title: e.target.value })} /></div>
          <div className="field"><label>Autor</label><input className="input input-sm" value={o.author} onChange={(e) => set({ author: e.target.value })} placeholder="Seu nome (opcional)" /></div>
          <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {sel<PosterResolution>('Resolução', o.resolution, RES_LABELS, (v) => set({ resolution: v }))}
            {sel<PosterAspect>('Proporção', o.aspect, Object.fromEntries(Object.entries(ASPECTS).map(([k, v]) => [k, v.label])) as Record<PosterAspect, string>, (v) => set({ aspect: v }))}
            {sel<PosterOptions['format']>('Formato', o.format, { jpeg: 'JPEG', png: 'PNG', pdf: 'PDF' }, (v) => set({ format: v }))}
            {sel<PosterSort>('Ordenação', o.sort, SORT_LABELS, (v) => set({ sort: v }))}
          </div>
          {sel<PosterTheme>('Fundo', o.theme, THEME_LABELS, (v) => set({ theme: v, ...(v === 'transparent' ? { format: 'png' as const } : {}) }))}
          {o.format !== 'png' && (
            <div className="field"><label>Qualidade JPEG ({Math.round(o.quality * 100)}%)</label><input type="range" min={0.5} max={1} step={0.05} value={o.quality} onChange={(e) => set({ quality: Number(e.target.value) })} /></div>
          )}
          <label className="check"><input type="checkbox" checked={o.groupCopies} onChange={(e) => set({ groupCopies: e.target.checked })} /> Agrupar cópias (selo de quantidade)</label>
          <label className="check"><input type="checkbox" checked={o.highlightCommander} onChange={(e) => set({ highlightCommander: e.target.checked })} /> Destacar comandante</label>
          <label className="check"><input type="checkbox" checked={o.showNames} onChange={(e) => set({ showNames: e.target.checked })} /> Mostrar nomes</label>
          <label className="check"><input type="checkbox" checked={o.showHeader} onChange={(e) => set({ showHeader: e.target.checked })} /> Cabeçalho</label>
          <label className="check"><input type="checkbox" checked={o.includeSideboard} onChange={(e) => set({ includeSideboard: e.target.checked })} /> Incluir sideboard</label>
        </div>
        <div className="poster-preview">
          {preview ? <img src={preview} alt="Prévia do pôster" /> : <span className="muted small">{progress ? progress.msg : 'Ajuste as opções e clique em “Gerar pôster”.'}</span>}
        </div>
      </div>
    </Modal>
  );
}
