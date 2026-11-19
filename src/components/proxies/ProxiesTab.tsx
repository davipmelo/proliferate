import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, FileDown, Image as ImageIcon, Layers, Library, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';
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
import { openArtPicker } from '../launchers.tsx';
import { Sheet } from './Sheet.tsx';

const MM_PX = 96 / 25.4;

export default function ProxiesTab() {
  const store = useStore();
  const { data, prefs, setPrefs } = store;
  const s = prefs.proxySettings;
  const set = (patch: Partial<ProxySettings>) => setPrefs({ proxySettings: { ...s, ...patch } });
  const preset = detectPreset(s);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
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

  const changeArt = (start: number) =>
    openArtPicker({
      cards: data.proxies.map((p) => p.card),
      start,
      onSelect: (i, card) => {
        const id = data.proxies[i].id;
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
        <aside className="proxy-col proxy-col-left">
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
              <div className="proxy-queue col" style={{ gap: 1 }}>
                {data.proxies.map((p, i) => (
                  <div key={p.id} className="queue-row">
                    <CardThumb card={p.card} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="ellipsis small" style={{ fontWeight: 600 }}>{p.card.name}</div>
                      <div className="xs subtle ellipsis">{isDoubleFaced(p.card) ? 'Frente + verso · ' : ''}{p.card.artSource === 'mpcfill' ? 'MPCFill' : p.card.artSource === 'custom' ? 'Arte própria' : p.card.setCode?.toUpperCase()}</div>
                    </div>
                    <QtyControl value={p.quantity} min={1} onChange={(n) => store.updateProxies((ps) => ps.map((x) => (x.id === p.id ? { ...x, quantity: n } : x)))} />
                    <button className="btn btn-ghost btn-icon btn-xs" title="Trocar arte" onClick={() => changeArt(i)}><ImageIcon size={14} /></button>
                    <button className="btn btn-ghost btn-icon btn-xs" title="Remover" onClick={() => store.updateProxies((ps) => ps.filter((x) => x.id !== p.id))}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <aside className="proxy-col proxy-col-right">
          <div className="section proxy-settings" style={{ flex: 1 }}>
            <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}>Predefinições {!preset && <span className="badge">Personalizado</span>}</div>
            <div className="preset-grid">
              {PROXY_PRESETS.map((p) => (
                <button key={p.id} className={`preset ${preset === p.id ? 'active' : ''}`} onClick={() => set(p.values)}>
                  <b>{p.label}</b>
                  <small>{p.hint}</small>
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

        <div className="proxy-center">
          {total === 0 ? (
            <Empty icon={<Printer size={40} />} title="A fila de impressão está vazia" action={<button className="btn btn-secondary" onClick={addDeck}><Plus size={16} /> Enviar um deck</button>}>
              Adicione cartas pela busca ao lado ou pelos botões de impressão em Decks, Coleção e Utilitários.
            </Empty>
          ) : (
            <div className="sheets">
              {pages.map((pg, i) => (
                <div key={i} className="sheet-wrap" ref={i === 0 ? wrapRef : undefined}>
                  <div className="sheet-label"><span>Folha {i + 1} de {pages.length}</span><span>{pg.length} carta(s)</span></div>
                  <div className="sheet-scale">
                    <Sheet slots={pg} settings={s} page={i + 1} total={pages.length} scale={scale} />
                  </div>
                </div>
              ))}
            </div>
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
      <div className="control-row"><label>Fundo dos cantos</label>
        <select className="select select-sm" style={{ width: 160 }} value={s.cornerFill} onChange={(e) => set({ cornerFill: e.target.value as ProxySettings['cornerFill'] })}>
          <option value="black">Preto (quinas arredondadas)</option><option value="white">Branco (economiza tinta)</option><option value="none">Nenhum</option>
        </select>
      </div>
      <button className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }} onClick={() => set(DEFAULT_PROXY_SETTINGS)}>Restaurar padrão</button>
    </div>
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
