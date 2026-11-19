import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, FileUp, ImagePlus, Link2, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import type { Card, CardPrint } from '../../types/models.ts';
import { backImage, frontImage, isDoubleFaced } from '../../types/cardRules.ts';
import { getPrints } from '../../services/scryfall.ts';
import { cardWithMpcArt, driveIdFromUrl, driveThumb, mpcOrderEntries, normalizeImageUrl, parseMpcXml, searchMpc, sourceRank } from '../../services/mpcfill.ts';
import { compressImage } from '../../services/image.ts';
import { uid } from '../../services/normalize.ts';
import { previewProps, toast } from '../../state/ui.tsx';
import { Modal } from '../common/Modal.tsx';
import { formatUsd, Loading } from '../common/bits.tsx';

interface Props {
  cards: Card[];
  start?: number;
  title?: string;
  tokens?: boolean;
  onSelect: (index: number, card: Card) => void;
  onClose: () => void;
}

type Tab = 'official' | 'mpc' | 'custom';
type Face = 'front' | 'back';

export default function ArtPicker({ cards: initialCards, start = 0, title, tokens, onSelect, onClose }: Props) {
  // Mantém a versão atualizada de cada carta (após trocas) para navegação.
  const [cards, setCards] = useState(initialCards);
  const [index, setIndex] = useState(Math.min(start, initialCards.length - 1));
  const [tab, setTab] = useState<Tab>('official');
  const [face, setFace] = useState<Face>('front');
  const [hover, setHover] = useState<string | null>(null);
  const card = cards[index];
  const dfc = isDoubleFaced(card);

  const apply = useCallback(
    (next: Card) => {
      setCards((cs) => cs.map((c, i) => (i === index ? next : c)));
      onSelect(index, next);
    },
    [index, onSelect],
  );

  const go = useCallback(
    (d: number) => {
      setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + d)));
      setFace('front');
      setHover(null);
    },
    [cards.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') go(-1);
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const current = face === 'back' ? backImage(card, 'normal') : frontImage(card, 'normal');

  return (
    <Modal
      size="xl"
      onClose={onClose}
      title={
        <span className="row" style={{ gap: 8 }}>
          {title ?? 'Escolher arte'} <span className="subtle">·</span> <span className="ellipsis">{card.name}</span>
        </span>
      }
      headerExtra={
        cards.length > 1 ? (
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => go(-1)} disabled={index === 0} title="Anterior (← ou A)"><ChevronLeft size={18} /></button>
            <span className="small subtle nowrap">{index + 1} / {cards.length}</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => go(1)} disabled={index === cards.length - 1} title="Próxima (→ ou D)"><ChevronRight size={18} /></button>
          </div>
        ) : null
      }
      tabs={
        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'official' ? 'active' : ''}`} onClick={() => setTab('official')}>Artes Oficiais</button>
          <button className={`modal-tab ${tab === 'mpc' ? 'active' : ''}`} onClick={() => setTab('mpc')}>Artes do MPCFill</button>
          <button className={`modal-tab ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>Importar a Própria Arte</button>
          <div className="spacer" />
          {dfc && (
            <div className="btn-group" style={{ alignSelf: 'center' }}>
              <button className={`btn btn-ghost btn-xs ${face === 'front' ? 'active' : ''}`} onClick={() => setFace('front')}>Frente</button>
              <button className={`btn btn-ghost btn-xs ${face === 'back' ? 'active' : ''}`} onClick={() => setFace('back')}>Verso</button>
            </div>
          )}
        </div>
      }
      footer={
        <>
          <span className="small subtle hide-mobile">
            <span className="kbd">←</span> <span className="kbd">→</span> ou <span className="kbd">A</span> <span className="kbd">D</span> navegam · <span className="kbd">Esc</span> conclui
          </span>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>Concluir</button>
        </>
      }
      bodyClassName="art-body"
    >
      <div className="art-layout">
        <div className="art-main">
          {tab === 'official' && <OfficialArts card={card} face={face} onPick={apply} onHover={setHover} />}
          {tab === 'mpc' && <MpcArts card={card} face={face} tokens={tokens} onPick={apply} onHover={setHover} />}
          {tab === 'custom' && <CustomArt card={card} face={face} onPick={apply} />}
        </div>
        <aside className="art-compare hide-mobile">
          <div className="col" style={{ gap: 4 }}>
            <span className="label">Atual</span>
            {current ? <img src={current} alt="Arte atual" {...previewProps(current)} /> : <div className="art-ph">Sem verso</div>}
          </div>
          <div className="col" style={{ gap: 4 }}>
            <span className="label">{hover ? 'Comparando' : 'Passe o mouse para comparar'}</span>
            {hover ? <img src={hover} alt="Arte em comparação" {...previewProps(hover)} /> : <div className="art-ph" />}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

/** Junta o zoom ao passar o mouse com a comparação lateral do seletor. */
function withPreview(zoomUrl: string | undefined, onHover: (u: string | null) => void, compareUrl?: string) {
  const pv = previewProps(zoomUrl);
  return {
    onMouseEnter: (e: React.MouseEvent) => {
      onHover(compareUrl ?? zoomUrl ?? null);
      pv.onMouseEnter(e);
    },
    onMouseMove: pv.onMouseMove,
    onMouseLeave: () => {
      onHover(null);
      pv.onMouseLeave();
    },
  };
}

// ---------------- Artes oficiais ----------------

type OfficialFilter = 'all' | 'old' | 'regular' | 'special' | 'priced';
type OfficialSort = 'new' | 'old' | 'set' | 'price' | 'artist';
const REGULAR_SET_TYPES = new Set(['core', 'expansion', 'commander', 'draft_innovation', 'masters', 'starter', 'duel_deck', 'planechase', 'archenemy', 'token']);

function OfficialArts({ card, face, onPick, onHover }: { card: Card; face: Face; onPick: (c: Card) => void; onHover: (u: string | null) => void }) {
  const [prints, setPrints] = useState<CardPrint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<OfficialFilter>('all');
  const [sort, setSort] = useState<OfficialSort>('new');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setPrints(null);
    setError(null);
    getPrints(card, reload > 0)
      .then((p) => alive && setPrints(p))
      .catch((e) => alive && setError(e?.message ?? 'Erro ao carregar impressões.'));
    return () => {
      alive = false;
    };
  }, [card.oracleId, card.name, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    if (!prints) return [];
    let l = prints.filter((p) => {
      if (filter === 'old') return p.frame === '1993' || p.frame === '1997';
      if (filter === 'regular') return !p.isPromo && REGULAR_SET_TYPES.has(p.setType ?? '') && p.borderColor !== 'borderless';
      if (filter === 'special') return p.setCode === 'sld' || p.isPromo || !REGULAR_SET_TYPES.has(p.setType ?? '') || p.borderColor === 'borderless';
      if (filter === 'priced') return p.priceUsd != null;
      return true;
    });
    if (face === 'back') l = l.filter((p) => p.backImages?.normal);
    const by: Record<OfficialSort, (a: CardPrint, b: CardPrint) => number> = {
      new: (a, b) => (b.releasedAt ?? '').localeCompare(a.releasedAt ?? ''),
      old: (a, b) => (a.releasedAt ?? '').localeCompare(b.releasedAt ?? ''),
      set: (a, b) => (a.setName ?? '').localeCompare(b.setName ?? ''),
      price: (a, b) => (b.priceUsd ?? -1) - (a.priceUsd ?? -1),
      artist: (a, b) => (a.artist ?? '').localeCompare(b.artist ?? ''),
    };
    return l.slice().sort(by[sort]);
  }, [prints, filter, sort, face]);

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="chips-scroll">
          {([['all', 'Todas'], ['old', 'Moldura clássica'], ['regular', 'Edições regulares'], ['special', 'Secret Lair & especiais'], ['priced', 'Com preço']] as [OfficialFilter, string][]).map(([v, l]) => (
            <button key={v} className={`chip ${filter === v ? 'active' : ''}`} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <div className="spacer" />
        <select className="select select-sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as OfficialSort)} aria-label="Ordenar">
          <option value="new">Mais recentes</option>
          <option value="old">Mais antigas</option>
          <option value="set">Nome da edição</option>
          <option value="price">Preço</option>
          <option value="artist">Artista</option>
        </select>
        <button className="btn btn-ghost btn-icon btn-sm" title="Recarregar" onClick={() => setReload((r) => r + 1)}><RefreshCw size={15} /></button>
      </div>
      {error && <div className="callout danger">{error}</div>}
      {!prints && !error && <Loading text="Carregando impressões do Scryfall…" />}
      {prints && <span className="small subtle">{list.length} de {prints.length} impressões</span>}
      <div className="art-grid">
        {list.map((p) => {
          const img = face === 'back' ? p.backImages : p.images;
          const active = face === 'front' ? card.id === p.id : card.id === p.id;
          return (
            <button
              key={p.id}
              className={`art-option ${active ? 'active' : ''}`}
              {...withPreview(img?.large ?? img?.normal, onHover, img?.normal)}
              onClick={() => p.card && onPick({ ...p.card, isFoil: card.isFoil, namePt: card.namePt })}
            >
              <img src={img?.small} loading="lazy" alt="" />
              <span className="art-caption">
                <b>{p.setCode?.toUpperCase()} #{p.collectorNumber}</b>
                <span className="ellipsis">{p.setName}</span>
                <span className="subtle ellipsis">{p.artist}{p.priceUsd != null ? ` · ${formatUsd(p.priceUsd)}` : ''}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- MPCFill ----------------

type MpcSort = 'best' | 'dpi' | 'recent' | 'name' | 'source';

function MpcArts({ card, face, tokens, onPick, onHover }: { card: Card; face: Face; tokens?: boolean; onPick: (c: Card) => void; onHover: (u: string | null) => void }) {
  const faceName = face === 'back' ? card.cardFaces?.[1]?.name ?? card.name : card.cardFaces?.[0]?.name ?? card.name;
  const [type, setType] = useState<'CARD' | 'TOKEN'>(tokens || /token|emblem/i.test(card.typeLine) ? 'TOKEN' : 'CARD');
  const [minDpi, setMinDpi] = useState(0);
  const [source, setSource] = useState('');
  const [tagF, setTagF] = useState('');
  const [sort, setSort] = useState<MpcSort>('best');
  const [results, setResults] = useState<CardPrint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xmlPrints, setXmlPrints] = useState<CardPrint[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setResults(null);
    setError(null);
    searchMpc(faceName, { type })
      .then((r) => alive && setResults(r))
      .catch((e) => alive && setError(e?.message ?? 'Falha ao consultar o MPCFill.'));
    return () => {
      alive = false;
    };
  }, [faceName, type]);

  const all = useMemo(() => [...xmlPrints, ...(results ?? [])], [xmlPrints, results]);
  const sources = useMemo(() => [...new Set(all.map((p) => p.sourceName).filter(Boolean))].sort() as string[], [all]);
  const tags = useMemo(() => [...new Set(all.flatMap((p) => p.tags ?? []))].sort(), [all]);
  const list = useMemo(() => {
    const l = all.filter((p) => (p.dpi ?? 9999) >= minDpi && (!source || p.sourceName === source) && (!tagF || p.tags?.includes(tagF)));
    const by: Record<MpcSort, (a: CardPrint, b: CardPrint) => number> = {
      best: (a, b) => sourceRank(a) - sourceRank(b) || (b.dpi ?? 0) - (a.dpi ?? 0),
      dpi: (a, b) => (b.dpi ?? 0) - (a.dpi ?? 0),
      recent: (a, b) => (b.releasedAt ?? '').localeCompare(a.releasedAt ?? ''),
      name: (a, b) => a.name.localeCompare(b.name),
      source: (a, b) => (a.sourceName ?? '').localeCompare(b.sourceName ?? ''),
    };
    return l.sort(by[sort]);
  }, [all, minDpi, source, tagF, sort]);

  const pick = (p: CardPrint) => {
    if (face === 'back') onPick({ ...card, backImage: p.images.normal, artSource: card.artSource ?? 'mpcfill', id: card.artSource ? card.id : `mpc-${uid('b')}` });
    else onPick(cardWithMpcArt(card, p));
  };

  const loadXml = async (file: File) => {
    try {
      const order = parseMpcXml(await file.text());
      const entries = mpcOrderEntries(order);
      const prints: CardPrint[] = entries.flatMap((e) => {
        const mk = (c: typeof e.front): CardPrint => ({
          id: `mpc-${c.id}`, source: 'mpcfill', name: c.name, setName: c.name, sourceName: 'XML importado', artist: 'XML importado',
          images: { small: driveThumb(c.id, 400), normal: driveThumb(c.id, 1000), large: driveThumb(c.id, 1600) }, mpcType: 'CARD',
        });
        return e.back ? [mk(e.front), mk(e.back)] : [mk(e.front)];
      });
      setXmlPrints(prints);
      toast(`${prints.length} arte(s) carregada(s) do XML.`, 'info');
    } catch (e: any) {
      toast(e?.message ?? 'XML inválido.', 'error');
    }
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="btn-group">
          <button className={`btn btn-ghost btn-xs ${type === 'CARD' ? 'active' : ''}`} onClick={() => setType('CARD')}>Cartas</button>
          <button className={`btn btn-ghost btn-xs ${type === 'TOKEN' ? 'active' : ''}`} onClick={() => setType('TOKEN')}>Fichas</button>
        </div>
        <select className="select select-sm" style={{ width: 'auto' }} value={minDpi} onChange={(e) => setMinDpi(Number(e.target.value))} aria-label="DPI mínimo">
          {[0, 200, 300, 400, 600, 800, 1200].map((d) => <option key={d} value={d}>{d ? `${d}+ DPI` : 'Qualquer DPI'}</option>)}
        </select>
        <select className="select select-sm" style={{ width: 'auto', maxWidth: 180 }} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Artista/fonte">
          <option value="">Todas as fontes</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {tags.length > 0 && (
          <select className="select select-sm" style={{ width: 'auto', maxWidth: 160 }} value={tagF} onChange={(e) => setTagF(e.target.value)} aria-label="Estilo/tag">
            <option value="">Todos os estilos</option>
            {tags.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select className="select select-sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as MpcSort)} aria-label="Ordenar">
          <option value="best">Melhores criadores</option>
          <option value="dpi">Maior DPI</option>
          <option value="recent">Mais recentes</option>
          <option value="name">Nome</option>
          <option value="source">Fonte</option>
        </select>
        <div className="spacer" />
        <input ref={fileRef} type="file" accept=".xml,text/xml" hidden onChange={(e) => e.target.files?.[0] && loadXml(e.target.files[0])} />
        <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><FileUp size={15} /> Carregar XML</button>
        <a className="btn btn-ghost btn-sm" href="https://mpcfill.com/editor" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir MPCFill</a>
      </div>
      {face === 'back' && <div className="callout"><span>Escolhendo arte do <b>verso</b> ({faceName}).</span></div>}
      {error && <div className="callout danger">{error}</div>}
      {!results && !error && <Loading text="Buscando artes no MPCFill…" />}
      {results && <span className="small subtle">{list.length} arte(s) para “{faceName}”</span>}
      {results && list.length === 0 && <p className="muted small">Nenhuma arte encontrada com esses filtros.</p>}
      <div className="art-grid">
        {list.map((p) => (
          <button
            key={p.id + (p.sourceName ?? '')}
            className={`art-option ${card.id === p.id || card.backImage === p.images.normal ? 'active' : ''}`}
            {...withPreview(p.images.large ?? p.images.normal, onHover, p.images.normal)}
            onClick={() => pick(p)}
          >
            <img src={p.images.small} loading="lazy" alt="" referrerPolicy="no-referrer" />
            <span className="art-caption">
              <b className="ellipsis">{p.sourceName}</b>
              <span className="subtle">{p.dpi ? `${p.dpi} DPI` : '—'}{p.releasedAt ? ` · ${p.releasedAt.slice(0, 4)}` : ''}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Arte própria ----------------

function CustomArt({ card, face, onPick }: { card: Card; face: Face; onPick: (c: Card) => void }) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    setBusy(true);
    try {
      setPreview(await compressImage(f, 1100, 0.86));
    } catch {
      toast('Não foi possível ler a imagem.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const use = () => {
    if (!preview) return;
    if (face === 'back') {
      onPick({ ...card, backImage: preview, artSource: card.artSource ?? 'custom', id: card.artSource ? card.id : `custom-${uid('b')}` });
    } else {
      onPick({
        ...card,
        id: `custom-${uid('art')}`,
        artSource: 'custom',
        images: { normal: preview, large: preview, small: preview, art_crop: card.images.art_crop },
        setName: 'Arte própria',
        setCode: 'custom',
        collectorNumber: undefined,
        hasBleed: false,
      });
    }
    toast('Arte aplicada.');
  };

  return (
    <div className="custom-art">
      <div className="col" style={{ gap: 14 }}>
        <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }} onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
          <Upload size={28} />
          <b>Enviar imagem</b>
          <span className="small subtle">Clique ou arraste um arquivo. A imagem é comprimida no navegador.</span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
        <div className="field">
          <label>Ou cole uma URL / link do Google Drive</label>
          <div className="row">
            <div className="input-icon"><Link2 size={16} /><input className="input" value={url} placeholder="https://… ou https://drive.google.com/file/d/…" onChange={(e) => setUrl(e.target.value)} /></div>
            <button className="btn btn-secondary" disabled={!url.trim()} onClick={() => setPreview(normalizeImageUrl(url))}>Pré-visualizar</button>
          </div>
          {url && driveIdFromUrl(url) && <span className="field-hint">Link do Drive detectado — usando miniatura de 1000 px.</span>}
        </div>
        <p className="small subtle">Dica: use imagens na proporção 63 × 88 mm (ex.: 745 × 1040 px). A arte vale para a {face === 'back' ? 'face de trás' : 'frente'} desta carta.</p>
      </div>
      <div className="col" style={{ alignItems: 'center', gap: 10 }}>
        <div className="custom-preview">
          {busy ? <Loading text="Comprimindo…" /> : preview ? <img src={preview} alt="Prévia" onError={() => toast('Não foi possível carregar a imagem dessa URL.', 'error')} /> : <ImagePlus size={36} className="subtle" />}
        </div>
        <div className="row">
          {preview && <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}><RotateCcw size={14} /> Limpar</button>}
          <button className="btn btn-primary" disabled={!preview} onClick={use}>Usar esta arte</button>
        </div>
      </div>
    </div>
  );
}
