import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, FileDown, Image as ImageIcon, Info, Layers, Library, Maximize2, Minus, Plus, Printer, Search, Sparkles, Trash2, X, ZoomIn } from 'lucide-react';
import type { ProxySettings } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { confirmDialog, toast } from '../../state/ui.tsx';
import { goToTab } from '../../state/nav.ts';
import { DEFAULT_PROXY_SETTINGS } from '../../services/storage.ts';
import { detectPreset, expandQueue, paginate, PROXY_PRESETS } from '../../services/proxyLayout.ts';
import { downloadBlob } from '../../services/image.ts';
import { getCardByName } from '../../services/scryfall.ts';
import { isDoubleFaced } from '../../types/cardRules.ts';
import { CardThumb, Empty, QtyControl, Spinner } from '../common/bits.tsx';
import { CardSearch } from '../common/CardSearch.tsx';
import { pickDeck } from '../common/DeckPicker.tsx';
import { openArtPicker, openCardInfo } from '../launchers.tsx';
import { Sheet } from './Sheet.tsx';
import { useFitsViewport, usePersistent } from '../common/hooks.ts';

const MM_PX = 96 / 25.4;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;
const ZOOM_STEPS = [0.4, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];

export default function ProxiesTab() {
  const store = useStore();
  const { data, prefs, setPrefs } = store;
  const s = prefs.proxySettings;
  const set = (patch: Partial<ProxySettings>) => setPrefs({ proxySettings: { ...s, ...patch } });
  const preset = detectPreset(s);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const [zoom, setZoomRaw] = usePersistent<number>('proxy-zoom', 1);
  const setZoom = (z: number) => setZoomRaw(Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100);
  const [queueQ, setQueueQ] = useState('');
  // Colunas laterais sem rolagem própria: só ficam fixas na tela quando cabem inteiras nela.
  const leftRef = useRef<HTMLElement>(null);
  const rightRef = useRef<HTMLElement>(null);
  const leftFits = useFitsViewport(leftRef);
  const rightFits = useFitsViewport(rightRef);

  // Fila sempre em ordem alfabética (a ordem das folhas não muda).
  const sortedQueue = useMemo(
    () => data.proxies.slice().sort((a, b) => a.card.name.localeCompare(b.card.name, 'pt-BR', { sensitivity: 'base' })),
    [data.proxies],
  );
  const shownQueue = useMemo(() => {
    const n = queueQ.trim().toLowerCase();
    if (!n) return sortedQueue;
    return sortedQueue.filter((p) => p.card.name.toLowerCase().includes(n) || p.card.namePt?.toLowerCase().includes(n) || p.card.setCode?.toLowerCase() === n);
  }, [sortedQueue, queueQ]);
  const [printing, setPrinting] = useState(false);

  const previewSlots = useMemo(() => expandQueue(data.proxies, 'normal'), [data.proxies]);
  const pages = useMemo(() => paginate(previewSlots), [previewSlots]);
  const total = previewSlots.length;

  // Escala do preview conforme a largura disponível.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / (210 * MM_PX)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pages.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/⌘ + roda do mouse sobre as folhas também dá zoom.
  const centerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = centerRef.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Com zoom, arrastar as folhas move a visualização (horizontal e vertical).
  const sheetsRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const startPan = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = sheetsRef.current;
    if (!el || e.button !== 0 || zoom <= 1) return;
    e.preventDefault();
    let lastX = e.clientX;
    let lastY = e.clientY;
    setPanning(true);
    const move = (ev: PointerEvent) => {
      el.scrollLeft -= ev.clientX - lastX;
      window.scrollBy(0, -(ev.clientY - lastY));
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const up = () => {
      setPanning(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const stepZoom = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > zoom + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.001);
    setZoom(next ?? zoom);
  };

  const changeArt = (list: typeof data.proxies, start: number) =>
    openArtPicker({
      cards: list.map((p) => p.card),
      start,
      onSelect: (i, card) => {
        const id = list[i].id;
        store.updateProxies((ps) => ps.map((p) => (p.id === id ? { ...p, card: { ...card, ...('utilityType' in p.card ? { utilityType: p.card.utilityType } : {}) } } : p)));
      },
    });

  const addByName = async (name: string) => {
    const c = await getCardByName(name);
    if (!c) return toast('Carta não encontrada.', 'error');
    store.addToProxies([{ card: c }]);
    toast(`${c.name} na fila.`);
  };

  const addDeck = () =>
    pickDeck({
      title: 'Enviar deck inteiro para a fila',
      showCategory: false,
      onPick: (deckId) => {
        const d = store.data.decks.find((x) => x.id === deckId);
        if (!d) return;
        const cards = d.cards.filter((c) => c.category !== 'maybeboard');
        store.addToProxies(cards.map((c) => ({ card: c.card, quantity: c.quantity })));
        toast(`${cards.reduce((a, c) => a + c.quantity, 0)} cartas de “${d.name}” adicionadas.`);
      },
    });

  const clear = async () => {
    if (await confirmDialog({ title: 'Limpar fila?', message: 'Todos os itens da fila de impressão serão removidos.', danger: true, confirmLabel: 'Limpar' })) store.updateProxies(() => []);
  };

  const downloadPdf = async () => {
    setPdfProgress(0);
    try {
      const { generateProxyPdf } = await import('../../services/proxyPdf.ts');
      const blob = await generateProxyPdf(expandQueue(data.proxies, 'large'), s, (d, t) => setPdfProgress(Math.round((d / t) * 100)));
      downloadBlob(blob, `proxies-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast('PDF gerado. Imprima em escala 100% (tamanho real).');
    } catch (e: any) {
      toast(e?.message ?? 'Falha ao gerar o PDF.', 'error');
    } finally {
      setPdfProgress(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="grow">
          <h1>Proxy Studio</h1>
          <p className="desc">Folhas A4 com 9 cartas em tamanho real (63 × 88 mm). Dupla face vira frente + verso automaticamente.</p>
        </div>
        <button className="btn btn-secondary" disabled={!total || printing} onClick={() => setPrinting(true)}><Printer size={16} /> Imprimir</button>
        <button className="btn btn-primary" disabled={!total || pdfProgress !== null} onClick={downloadPdf}>
          {pdfProgress !== null ? <><Spinner /> {pdfProgress}%</> : <><FileDown size={16} /> Baixar PDF Direto</>}
        </button>
      </div>

      <div className="proxy-layout">
        <aside className={`proxy-col proxy-col-left ${leftFits ? 'is-sticky' : ''}`} ref={leftRef}>
          <div className="section" style={{ flex: 1 }}>
            <div className="section-title" style={{ fontSize: 'var(--fs-md)', marginBottom: 4 }}>
              Fila de impressão
              <div className="spacer" />
              {data.proxies.length > 0 && <button className="btn btn-ghost btn-xs" onClick={clear}><Trash2 size={13} /> Limpar</button>}
            </div>
            <p className="small subtle" style={{ marginBottom: 12 }}>{total} carta(s) · {pages.length} folha(s) A4</p>
            <CardSearch placeholder="Adicionar carta à fila…" onSelect={addByName} clearOnSelect />
            <div className="row-wrap" style={{ marginTop: 8, gap: 6 }}>
              <button className="btn btn-ghost btn-xs" onClick={addDeck}><Layers size={13} /> Deck inteiro</button>
              <button className="btn btn-ghost btn-xs" onClick={() => goToTab('collection')}><Library size={13} /> Da coleção</button>
              <button className="btn btn-ghost btn-xs" onClick={() => goToTab('utilities')}><Sparkles size={13} /> Fichas e utilitários</button>
            </div>
            {data.proxies.length > 0 && (
              <>
                <div className="queue-filter">
                  <div className="input-icon">
                    <Search size={15} />
                    <input className="input input-sm" placeholder={`Buscar na fila (${data.proxies.length} item${data.proxies.length === 1 ? '' : 's'})…`} value={queueQ} onChange={(e) => setQueueQ(e.target.value)} aria-label="Buscar cartas na fila" />
                    {queueQ && <button className="btn btn-ghost btn-icon btn-xs queue-filter-clear" onClick={() => setQueueQ('')} aria-label="Limpar busca"><X size={13} /></button>}
                  </div>
                  {queueQ && <span className="xs subtle">{shownQueue.length} de {data.proxies.length}</span>}
                </div>
                <div className="proxy-queue col" style={{ gap: 1 }}>
                  {shownQueue.length === 0 && <p className="small subtle" style={{ padding: '10px 6px' }}>Nenhuma carta da fila corresponde a “{queueQ}”.</p>}
                  {shownQueue.map((p, i) => (
                    <div key={p.id} className="queue-row">
                      <CardThumb card={p.card} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="ellipsis small" style={{ fontWeight: 600 }}>{p.card.name}</div>
                        <div className="xs subtle ellipsis">{isDoubleFaced(p.card) ? 'Frente + verso · ' : ''}{p.card.artSource === 'mpcfill' ? 'MPCFill' : p.card.artSource === 'custom' ? 'Arte própria' : p.card.setCode?.toUpperCase()}</div>
                      </div>
                      <QtyControl value={p.quantity} min={1} onChange={(n) => store.updateProxies((ps) => ps.map((x) => (x.id === p.id ? { ...x, quantity: n } : x)))} />
                      <button className="btn btn-ghost btn-icon btn-xs" title="Informações" onClick={() => openCardInfo(p.card)}><Info size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-xs" title="Trocar arte" onClick={() => changeArt(shownQueue, i)}><ImageIcon size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-xs" title="Remover" onClick={() => store.updateProxies((ps) => ps.filter((x) => x.id !== p.id))}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>

        <aside className={`proxy-col proxy-col-right ${rightFits ? 'is-sticky' : ''}`} ref={rightRef}>
          <div className="section proxy-settings" style={{ flex: 1 }}>
            <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}>Predefinições {!preset && <span className="badge">Personalizado</span>}</div>
            <div className="preset-grid">
              {PROXY_PRESETS.map((p) => (
                <button key={p.id} className={`preset ${preset === p.id ? 'active' : ''}`} onClick={() => set(p.values)}>
                  <b>{p.label}</b>
                </button>
              ))}
            </div>
            <div className="col" style={{ gap: 2, marginTop: 10 }}>
              <label className="check"><input type="checkbox" checked={s.footer} onChange={(e) => set({ footer: e.target.checked })} /> Rodapé com metadados</label>
              <label className="check"><input type="checkbox" checked={s.trimBleed} onChange={(e) => set({ trimBleed: e.target.checked })} /> Recortar sangria das artes MPCFill</label>
            </div>
            <details className="details" style={{ marginTop: 8 }} open>
              <summary><ChevronRight size={14} className="chev" /> Controles avançados</summary>
              <AdvancedControls s={s} set={set} />
            </details>
          </div>
        </aside>

        <div className="proxy-center" ref={centerRef}>
          {total === 0 ? (
            <Empty icon={<Printer size={40} />} title="A fila de impressão está vazia" action={<button className="btn btn-secondary" onClick={addDeck}><Plus size={16} /> Enviar um deck</button>}>
              Adicione cartas pela busca ao lado ou pelos botões de impressão em Decks, Coleção e Utilitários.
            </Empty>
          ) : (
            <>
            <div className="sheet-zoombar">
              <ZoomIn size={15} className="subtle" />
              <button className="btn btn-ghost btn-icon btn-xs" onClick={() => stepZoom(-1)} disabled={zoom <= ZOOM_MIN} aria-label="Diminuir zoom" title="Diminuir zoom"><Minus size={14} /></button>
              <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom das folhas" />
              <button className="btn btn-ghost btn-icon btn-xs" onClick={() => stepZoom(1)} disabled={zoom >= ZOOM_MAX} aria-label="Aumentar zoom" title="Aumentar zoom"><Plus size={14} /></button>
              <span className="zoom-value tabular">{Math.round(zoom * 100)}%</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setZoom(1)} disabled={zoom === 1} title="Ajustar à largura"><Maximize2 size={13} /> Ajustar</button>
              <span className="xs subtle hide-mobile">{zoom > 1 ? 'Arraste para mover' : 'Ctrl + roda do mouse'}</span>
            </div>
            <div ref={sheetsRef} className={`sheets ${zoom > 1 ? 'pannable' : ''} ${panning ? 'panning' : ''}`} style={{ ['--sheet-zoom' as string]: zoom }} onPointerDown={startPan}>
              {pages.map((pg, i) => (
                <div key={i} className="sheet-wrap" ref={i === 0 ? wrapRef : undefined}>
                  <div className="sheet-label"><span>Folha {i + 1} de {pages.length}</span><span>{pg.length} carta(s)</span></div>
                  <div className="sheet-scale">
                    <Sheet slots={pg} settings={s} page={i + 1} total={pages.length} scale={scale} />
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      </div>
      {printing && <PrintPortal settings={s} onDone={() => setPrinting(false)} />}
    </div>
  );
}

function AdvancedControls({ s, set }: { s: ProxySettings; set: (p: Partial<ProxySettings>) => void }) {
  return (
    <div className="col" style={{ gap: 6, paddingTop: 6 }}>
      <label className="check"><input type="checkbox" checked={s.cutLines} onChange={(e) => set({ cutLines: e.target.checked })} /> Linhas de corte</label>
      {s.cutLines && (
        <>
          <div className="control-row"><label>Cor</label><input type="color" value={s.cutLineColor} onChange={(e) => set({ cutLineColor: e.target.value })} /></div>
          <div className="control-row"><label>Espessura ({s.cutLineWidth.toFixed(2)} mm)</label><input type="range" min={0.15} max={0.6} step={0.05} value={s.cutLineWidth} onChange={(e) => set({ cutLineWidth: Number(e.target.value) })} style={{ width: 130 }} /></div>
          <div className="control-row"><label>Estilo</label>
            <select className="select select-sm" style={{ width: 130 }} value={s.cutLineStyle} onChange={(e) => set({ cutLineStyle: e.target.value as ProxySettings['cutLineStyle'] })}>
              <option value="solid">Sólida</option><option value="dashed">Tracejada</option><option value="dotted">Pontilhada</option>
            </select>
          </div>
        </>
      )}
      <hr className="divider" style={{ margin: '4px 0' }} />
      <label className="check"><input type="checkbox" checked={s.cropMarks} onChange={(e) => set({ cropMarks: e.target.checked })} /> Marcas de enquadramento</label>
      {s.cropMarks && (
        <>
          <div className="control-row"><label>Cor</label><input type="color" value={s.cropMarkColor} onChange={(e) => set({ cropMarkColor: e.target.value })} /></div>
          <div className="control-row"><label>Espessura ({s.cropMarkWidth.toFixed(2)} mm)</label><input type="range" min={0.1} max={0.6} step={0.05} value={s.cropMarkWidth} onChange={(e) => set({ cropMarkWidth: Number(e.target.value) })} style={{ width: 130 }} /></div>
          <div className="control-row"><label>Comprimento ({s.cropMarkLength} mm)</label><input type="range" min={5} max={16} step={1} value={s.cropMarkLength} onChange={(e) => set({ cropMarkLength: Number(e.target.value) })} style={{ width: 130 }} /></div>
        </>
      )}
      <hr className="divider" style={{ margin: '4px 0' }} />
      <label className="check"><input type="checkbox" checked={s.rulers} onChange={(e) => set({ rulers: e.target.checked })} /> Réguas nas margens</label>
      <label className="check"><input type="checkbox" checked={s.cornerCrosses} onChange={(e) => set({ cornerCrosses: e.target.checked })} /> Cruzes nos cantos</label>
      {s.cornerCrosses && (
        <>
          <div className="control-row"><label>Formato</label>
            <div className="seg" role="radiogroup" aria-label="Formato da cruz">
              {CROSS_SHAPES.map(([v, label]) => (
                <button key={v} className={`seg-btn ${s.crossShape === v ? 'active' : ''}`} role="radio" aria-checked={s.crossShape === v} title={label} onClick={() => set({ crossShape: v })}>
                  <CrossIcon shape={v} />
                </button>
              ))}
            </div>
          </div>
          <div className="control-row"><label>Onde</label>
            <select className="select select-sm" style={{ width: 160 }} value={s.crossScope} onChange={(e) => set({ crossScope: e.target.value as ProxySettings['crossScope'] })}>
              <option value="all">Todos os cantos</option><option value="outer">Só na borda da grade</option><option value="inner">Só entre as cartas</option>
            </select>
          </div>
          <div className="control-row"><label>Cor</label><input type="color" value={s.crossColor} onChange={(e) => set({ crossColor: e.target.value })} /></div>
          <div className="control-row"><label>Tamanho ({(s.crossSize * 2).toFixed(1)} mm)</label><input type="range" min={0.5} max={6} step={0.25} value={s.crossSize} onChange={(e) => set({ crossSize: Number(e.target.value) })} style={{ width: 130 }} /></div>
          {s.crossShape !== 'dot' && <div className="control-row"><label>Espessura ({s.crossWidth.toFixed(2)} mm)</label><input type="range" min={0.1} max={0.8} step={0.05} value={s.crossWidth} onChange={(e) => set({ crossWidth: Number(e.target.value) })} style={{ width: 130 }} /></div>}
        </>
      )}
      <div className="control-row"><label>Fundo dos cantos</label>
        <select className="select select-sm" style={{ width: 160 }} value={s.cornerFill} onChange={(e) => set({ cornerFill: e.target.value as ProxySettings['cornerFill'] })}>
          <option value="black">Preto (quinas arredondadas)</option><option value="white">Branco (economiza tinta)</option><option value="none">Nenhum</option>
        </select>
      </div>
      <button className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }} onClick={() => set(DEFAULT_PROXY_SETTINGS)}>Restaurar padrão</button>
    </div>
  );
}

const CROSS_SHAPES: [ProxySettings['crossShape'], string][] = [['plus', 'Cruz (+)'], ['x', 'Xis (×)'], ['hollow', 'Cruz vazada'], ['dot', 'Ponto']];

function CrossIcon({ shape }: { shape: ProxySettings['crossShape'] }) {
  const p = { stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const };
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {shape === 'plus' && <><line x1="2" y1="8" x2="14" y2="8" {...p} /><line x1="8" y1="2" x2="8" y2="14" {...p} /></>}
      {shape === 'x' && <><line x1="3.5" y1="3.5" x2="12.5" y2="12.5" {...p} /><line x1="3.5" y1="12.5" x2="12.5" y2="3.5" {...p} /></>}
      {shape === 'hollow' && <><line x1="2" y1="8" x2="5.5" y2="8" {...p} /><line x1="10.5" y1="8" x2="14" y2="8" {...p} /><line x1="8" y1="2" x2="8" y2="5.5" {...p} /><line x1="8" y1="10.5" x2="8" y2="14" {...p} /></>}
      {shape === 'dot' && <circle cx="8" cy="8" r="2.6" fill="currentColor" />}
    </svg>
  );
}

/** Renderiza as folhas em tamanho real fora do app e chama a impressão do navegador. */
function PrintPortal({ settings, onDone }: { settings: ProxySettings; onDone: () => void }) {
  const { data } = useStore();
  const pages = useMemo(() => paginate(expandQueue(data.proxies, 'large')), [data.proxies]);
  const [root] = useState(() => {
    let el = document.getElementById('print-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'print-root';
      document.body.appendChild(el);
    }
    return el;
  });

  useEffect(() => {
    let cancelled = false;
    const imgs = Array.from(root.querySelectorAll('img'));
    toast('Preparando impressão…', 'info', 2000);
    Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(null); }))))
      .then(() => {
        if (cancelled) return;
        document.body.classList.add('printing');
        const after = () => {
          document.body.classList.remove('printing');
          window.removeEventListener('afterprint', after);
          onDone();
        };
        window.addEventListener('afterprint', after);
        setTimeout(() => window.print(), 50);
      });
    return () => {
      cancelled = true;
      document.body.classList.remove('printing');
    };
  }, [root, onDone]);

  return createPortal(
    <>
      {pages.map((pg, i) => <Sheet key={i} slots={pg} settings={settings} page={i + 1} total={pages.length} eager />)}
    </>,
    root,
  );
}
