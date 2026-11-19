import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ExternalLink, FileText, FileUp, Info, Plus } from 'lucide-react';
import type { Card, DeckCard, DeckCategory, DeckFormat, DeckToken } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { toast } from '../../state/ui.tsx';
import { openDeck } from '../../state/nav.ts';
import { FORMAT_LIST, formatInfo } from '../../types/formats.ts';
import { mergeEntries, parseDeckList } from '../../services/importParser.ts';
import { resolveEntries, type ResolvedEntry } from '../../services/importer.ts';
import { cardWithMpcArt, driveThumb, mpcCardName, mpcOrderEntries, parseMpcXml, type MpcOrder } from '../../services/mpcfill.ts';
import { getCollection, getTokensForCards } from '../../services/scryfall.ts';
import { normalizeDeck, uid } from '../../services/normalize.ts';
import { namesMatch, sameArt } from '../../types/cardRules.ts';
import { Modal } from '../common/Modal.tsx';
import { CommanderPicker } from '../decks/CommanderPicker.tsx';
import { assignCommanders, buildDeckCards } from '../decks/deckBuild.ts';
import { TagSelect } from '../decks/TagSelect.tsx';
import { usePersistent } from '../common/hooks.ts';

type Target = 'new-deck' | 'existing-deck';
const FORMAT_NAMES: Record<string, string> = { arena: 'MTG Arena', moxfield: 'Moxfield', ligamagic: 'LigaMagic', simple: 'Lista simples', csv: 'CSV' };

export default function ImportModal({ onClose, deckId, target }: { onClose: () => void; deckId?: string; target?: Target }) {
  const [tab, setTab] = useState<'text' | 'mpc'>('text');
  const existing = target === 'existing-deck' || (!target && !!deckId);
  return (
    <Modal
      title={existing ? 'Importar lista para o deck' : 'Importar deck'}
      onClose={onClose}
      size="lg"
      tabs={
        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'text' ? 'active' : ''}`} onClick={() => setTab('text')}><FileText size={15} /> Lista de cartas</button>
          <button className={`modal-tab ${tab === 'mpc' ? 'active' : ''}`} onClick={() => setTab('mpc')}><FileUp size={15} /> Pedido XML do MPCFill</button>
        </div>
      }
    >
      {tab === 'mpc' ? <MpcImport onClose={onClose} /> : existing && deckId ? <ExistingDeckImport onClose={onClose} deckId={deckId} /> : <NewDeckImport onClose={onClose} />}
    </Modal>
  );
}

interface Analysis {
  /** Entradas resolvidas que não são fichas. */
  cards: ResolvedEntry[];
  tokens: ResolvedEntry[];
  unresolved: string[];
  detected: { commander: boolean; partner: boolean };
}

const sumQty = (l: { quantity: number }[]) => l.reduce((s, x) => s + x.quantity, 0);

/** Importar lista criando um deck novo: dados do deck → comandante → lista → extras, com revisão antes de criar. */
function NewDeckImport({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<DeckFormat>('commander');
  const [commander, setCommander] = useState<Card | undefined>();
  const [partner, setPartner] = useState<Card | undefined>();
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [detectTokens, setDetectTokens] = usePersistent<boolean>('import-detect-tokens', true);
  const [toProxies, setToProxies] = usePersistent<boolean>('import-to-proxies', false);
  const [progress, setProgress] = useState<{ msg: string; pct: number } | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // Depois que o usuário mexe no comandante na revisão, não deduzimos mais nada da lista.
  const [manual, setManual] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const info = formatInfo(format);
  const parsed = useMemo(() => (text.trim() ? parseDeckList(text) : null), [text]);
  const total = parsed ? sumQty(parsed.entries) : 0;
  const listHasCommander = !!parsed?.entries.some((e) => e.section === 'commander' || e.section === 'partner');

  // Monta as cartas finais a partir da análise e dos comandantes atuais.
  const build = (a: Analysis) => {
    const asg = assignCommanders(a.cards, { commander, partner, hasCommander: info.hasCommander && !manual });
    const cards: DeckCard[] = [
      ...(asg.commander ? [{ instanceId: uid('dc'), card: asg.commander, quantity: 1, category: 'commander' as const }] : []),
      ...(asg.partner ? [{ instanceId: uid('dc'), card: asg.partner, quantity: 1, category: 'partner' as const }] : []),
      ...buildDeckCards(asg.rest),
    ];
    return { asg, cards };
  };

  const analyze = async () => {
    if (!parsed?.entries.length) return;
    try {
      const { resolved, unresolved } = await resolveEntries(mergeEntries(parsed.entries), (msg, pct) => setProgress({ msg, pct }));
      const cards = resolved.filter((r) => r.entry.section !== 'token');
      const tokens = resolved.filter((r) => r.entry.section === 'token');
      let hasCmd = info.hasCommander;
      if (!hasCmd && cards.some((r) => r.entry.section === 'commander')) {
        // A lista tem comandante: o formato certo é Commander.
        setFormat('commander');
        hasCmd = true;
        toast('A lista tem comandante — formato ajustado para Commander.', 'info');
      }
      const asg = assignCommanders(cards, { commander, partner, hasCommander: hasCmd });
      if (asg.commander && !commander) setCommander(asg.commander);
      if (asg.partner && !partner) setPartner(asg.partner);
      setAnalysis({ cards, tokens, unresolved: unresolved.map((u) => `${u.quantity} ${u.name}`), detected: asg.detected });
    } catch (e: any) {
      toast(e?.message ?? 'Falha ao ler a lista.', 'error');
    } finally {
      setProgress(null);
    }
  };

  const create = async () => {
    const finalName = name.trim() || commander?.name.split(' // ')[0] || 'Novo deck';
    const { cards } = analysis ? build(analysis) : { cards: [...(commander ? [{ instanceId: uid('dc'), card: commander, quantity: 1, category: 'commander' as const }] : []), ...(partner ? [{ instanceId: uid('dc'), card: partner, quantity: 1, category: 'partner' as const }] : [])] as DeckCard[] };
    let tokens: DeckToken[] = (analysis?.tokens ?? []).map((r) => ({ instanceId: uid('dt'), card: { ...r.card, utilityType: 'token' as const }, quantity: r.entry.quantity }));
    if (detectTokens && cards.length) {
      setProgress({ msg: 'Buscando fichas criadas pelas cartas…', pct: 90 });
      try {
        const found = await getTokensForCards(cards.map((c) => c.card.id));
        tokens = [...tokens, ...found.filter((f) => !tokens.some((t) => t.card.name === f.name)).map((c) => ({ instanceId: uid('dt'), card: c, quantity: 1 }))];
      } catch {
        /* fichas são opcionais */
      }
      setProgress(null);
    }
    const now = new Date().toISOString();
    const deck = normalizeDeck({
      id: uid('deck'),
      name: finalName,
      format,
      description: description.trim(),
      tags,
      commander: cards.find((c) => c.category === 'commander')?.card,
      partner: cards.find((c) => c.category === 'partner')?.card,
      cards,
      tokens,
      createdAt: now,
      updatedAt: now,
    });
    store.update((d) => ({ ...d, decks: [deck, ...d.decks] }));
    if (toProxies && cards.length) store.addToProxies(cards.filter((c) => c.category !== 'maybeboard').map((c) => ({ card: c.card, quantity: c.quantity })));
    toast(`Deck “${finalName}” criado${toProxies && cards.length ? ' e enviado para a impressão' : ''}.`);
    onClose();
    openDeck(deck.id);
  };

  // ---------- Revisão ----------
  if (analysis) {
    const { asg, cards } = build(analysis);
    const by = (cat: DeckCategory) => sumQty(cards.filter((c) => c.category === cat));
    const counted = sumQty(cards.filter((c) => c.category !== 'sideboard' && c.category !== 'maybeboard'));
    const identity = new Set([...(asg.commander?.colorIdentity ?? []), ...(asg.partner?.colorIdentity ?? [])]);
    const offColor = asg.commander ? cards.filter((c) => c.category === 'main' && (c.card.colorIdentity ?? []).some((x) => !identity.has(x))) : [];
    const target = info.target;
    return (
      <>
        <div className="import-review-head">
          <div className="grow">
            <div className="small subtle">Revisão</div>
            <h3>{name.trim() || commander?.name.split(' // ')[0] || 'Novo deck'}</h3>
          </div>
          <span className="badge badge-accent">{info.label}</span>
        </div>

        {info.hasCommander && (
          <>
            <div className="field-row">
              <CommanderPicker label={<>Comandante {analysis.detected.commander && asg.commander && namesMatch(asg.commander.name, commander?.name ?? '') && <span className="badge">detectado na lista</span>}</>} value={commander} onChange={(c) => { setCommander(c); setManual(true); }} />
              <CommanderPicker label={<>Parceiro {analysis.detected.partner && asg.partner && namesMatch(asg.partner.name, partner?.name ?? '') && <span className="badge">detectado na lista</span>}</>} value={partner} onChange={(c) => { setPartner(c); setManual(true); }} placeholder="Opcional — parceiro ou Background" />
            </div>
            {!asg.commander && <div className="callout warning"><AlertTriangle size={16} /><span>Nenhum comandante encontrado na lista. Escolha acima ou crie assim mesmo e defina depois.</span></div>}
          </>
        )}

        <div className="import-counts">
          <div className={`import-count total ${counted === target ? 'ok' : counted > target ? 'over' : ''}`}><b>{counted}</b><span>de {target} cartas</span></div>
          <div className="import-count"><b>{by('main')}</b><span>principal</span></div>
          {by('sideboard') > 0 && <div className="import-count"><b>{by('sideboard')}</b><span>sideboard</span></div>}
          {by('maybeboard') > 0 && <div className="import-count"><b>{by('maybeboard')}</b><span>talvez</span></div>}
          {by('companion') > 0 && <div className="import-count"><b>{by('companion')}</b><span>companheiro</span></div>}
          {analysis.tokens.length > 0 && <div className="import-count"><b>{sumQty(analysis.tokens.map((t) => t.entry))}</b><span>fichas</span></div>}
        </div>

        {analysis.unresolved.length > 0 && (
          <div className="callout warning"><AlertTriangle size={16} /><span><b>{analysis.unresolved.length} carta(s) não encontradas</b> e serão ignoradas: {analysis.unresolved.join(', ')}</span></div>
        )}
        {offColor.length > 0 && (
          <div className="callout"><Info size={16} /><span>{offColor.length} carta(s) fora da identidade de cor do comandante: {offColor.slice(0, 6).map((c) => c.card.name).join(', ')}{offColor.length > 6 ? '…' : ''}</span></div>
        )}

        {progress && <ImportProgress progress={progress} />}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => { setAnalysis(null); setManual(false); }} disabled={!!progress}><ArrowLeft size={16} /> Voltar</button>
          <button className="btn btn-primary" onClick={create} disabled={!!progress}><Check size={16} /> Criar deck</button>
        </div>
      </>
    );
  }

  // ---------- Formulário ----------
  return (
    <>
      <div className="field-row">
        <div className="field"><label>Nome do deck</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={commander ? commander.name.split(' // ')[0] : 'Ex.: Atraxa Superfriends'} autoFocus /></div>
        <div className="field"><label>Formato</label><select className="select" value={format} onChange={(e) => setFormat(e.target.value as DeckFormat)}>{FORMAT_LIST.map((f) => <option key={f.id} value={f.id}>{f.label} — {f.target} cartas</option>)}</select></div>
      </div>

      {info.hasCommander && (
        <div className="field-row">
          <CommanderPicker label="Comandante" value={commander} onChange={setCommander} placeholder="Opcional — detectado da lista" />
          <CommanderPicker label="Parceiro" value={partner} onChange={setPartner} placeholder="Opcional — parceiro ou Background" />
        </div>
      )}

      <div className="field">
        <div className="row">
          <label className="grow">Lista de cartas</label>
          <input ref={fileRef} type="file" accept=".txt,.csv,.dec,.dek,text/plain,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setText(await f.text()); if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, '')); e.target.value = ''; }} />
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()}><FileUp size={13} /> Abrir arquivo</button>
        </div>
        <textarea className="textarea mono" style={{ minHeight: 190 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1 Atraxa, Praetors\' Voice\n1 Sol Ring (C21) 263 *F*\n1 Contramágica\n10 Forest\n\nSideboard\n2 Pyroblast'} />
        <span className="field-hint">
          {parsed ? (
            <>
              <b>{FORMAT_NAMES[parsed.format]}</b> · {total} carta(s) em {parsed.entries.length} linha(s)
              {parsed.errors.length > 0 && <span className="warning-text"> · {parsed.errors.length} linha(s) ignorada(s)</span>}
              {info.hasCommander && !commander && (listHasCommander ? ' · comandante marcado na lista' : ' · o comandante será detectado automaticamente')}
            </>
          ) : (
            <>Aceita Arena, Moxfield, Archidekt, LigaMagic, CSV e nomes em português. Deixe vazio para começar um deck em branco.</>
          )}
        </span>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Descrição <span className="subtle">(opcional)</span></label>
          <textarea className="textarea" style={{ minHeight: 64 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Estratégia, combos, observações…" />
        </div>
        <div className="field">
          <label>Tags <span className="subtle">(opcional)</span></label>
          <TagSelect value={tags} onChange={setTags} placeholder="Escolher ou criar tags" />
          <div className="col" style={{ gap: 4, marginTop: 6 }}>
            <label className="check"><input type="checkbox" checked={detectTokens} onChange={(e) => setDetectTokens(e.target.checked)} /> Detectar fichas das cartas</label>
            <label className="check"><input type="checkbox" checked={toProxies} onChange={(e) => setToProxies(e.target.checked)} /> Enviar para a fila de impressão</label>
          </div>
        </div>
      </div>

      {progress && <ImportProgress progress={progress} />}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={!!progress}>Cancelar</button>
        {total ? (
          <button className="btn btn-primary" disabled={!!progress} onClick={analyze}>Revisar {total} carta(s) <ArrowRight size={16} /></button>
        ) : (
          <button className="btn btn-primary" disabled={!!progress} onClick={create}><Plus size={16} /> Criar deck vazio</button>
        )}
      </div>
    </>
  );
}

function ImportProgress({ progress }: { progress: { msg: string; pct: number } }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <span className="small muted">{progress.msg}</span>
      <div className="progress"><div style={{ width: `${progress.pct}%` }} /></div>
    </div>
  );
}

/** Importar lista para um deck que já existe (aberto pelo menu do próprio deck). */
function ExistingDeckImport({ onClose, deckId }: { onClose: () => void; deckId: string }) {
  const store = useStore();
  const deck = store.data.decks.find((d) => d.id === deckId);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<{ msg: string; pct: number } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text.trim() ? parseDeckList(text) : null), [text]);
  const total = parsed ? sumQty(parsed.entries) : 0;

  const run = async () => {
    if (!parsed?.entries.length || !deck) return;
    setMissing([]);
    try {
      const { resolved, unresolved } = await resolveEntries(mergeEntries(parsed.entries), (msg, pct) => setProgress({ msg, pct }));
      const tokens = resolved.filter((r) => r.entry.section === 'token').map((r) => ({ instanceId: uid('dt'), card: { ...r.card, utilityType: 'token' as const }, quantity: r.entry.quantity }));
      const hasCmd = formatInfo(deck.format).hasCommander;
      const asg = assignCommanders(resolved.filter((r) => r.entry.section !== 'token'), { commander: deck.commander, partner: deck.partner, hasCommander: hasCmd && !deck.commander });
      const extra: DeckCard[] = [];
      if (!deck.commander && asg.commander) extra.push({ instanceId: uid('dc'), card: asg.commander, quantity: 1, category: 'commander' });
      if (!deck.partner && asg.partner && !(deck.commander && namesMatch(deck.commander.name, asg.partner.name))) extra.push({ instanceId: uid('dc'), card: asg.partner, quantity: 1, category: 'partner' });
      const newCards = [...extra, ...buildDeckCards(asg.rest)];
      store.updateDeck(deck.id, (dk) => {
        const merged = dk.cards.slice();
        for (const nc of newCards) {
          const i = merged.findIndex((c) => sameArt(c.card, nc.card) && c.category === nc.category);
          if (i >= 0) merged[i] = { ...merged[i], quantity: merged[i].quantity + nc.quantity };
          else merged.push(nc);
        }
        return normalizeDeck({ ...dk, commander: merged.find((c) => c.category === 'commander')?.card, partner: merged.find((c) => c.category === 'partner')?.card, cards: merged, tokens: [...dk.tokens, ...tokens] });
      });
      toast(`${sumQty(newCards)} carta(s) adicionadas a “${deck.name}”.`);
      if (unresolved.length) setMissing(unresolved.map((u) => `${u.quantity} ${u.name}`));
      else onClose();
    } catch (e: any) {
      toast(e?.message ?? 'Falha na importação.', 'error');
    } finally {
      setProgress(null);
    }
  };

  if (!deck) return <p className="small subtle">Deck não encontrado.</p>;
  return (
    <>
      <div className="field">
        <div className="row">
          <label className="grow">Cartas para adicionar a <b>{deck.name}</b></label>
          <input ref={fileRef} type="file" accept=".txt,.csv,.dec,.dek,text/plain,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ''; }} />
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()}><FileUp size={13} /> Abrir arquivo</button>
        </div>
        <textarea className="textarea mono" style={{ minHeight: 200 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1 Sol Ring\n4 Lightning Bolt\n\nSideboard\n2 Pyroblast'} autoFocus />
        {parsed && <span className="field-hint"><b>{FORMAT_NAMES[parsed.format]}</b> · {total} carta(s) em {parsed.entries.length} linha(s){parsed.errors.length > 0 && <span className="warning-text"> · {parsed.errors.length} linha(s) ignorada(s)</span>}</span>}
      </div>
      {progress && <ImportProgress progress={progress} />}
      {missing.length > 0 && <div className="callout warning"><AlertTriangle size={16} /><span><b>{missing.length} carta(s) não encontradas:</b> {missing.join(', ')}</span></div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>{missing.length ? 'Fechar' : 'Cancelar'}</button>
        <button className="btn btn-primary" disabled={!total || !!progress} onClick={run}>Adicionar {total ? `${total} carta(s)` : ''}</button>
      </div>
    </>
  );
}

function MpcImport({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [order, setOrder] = useState<MpcOrder | null>(null);
  const [toProxies, setToProxies] = useState(true);
  const [makeDeck, setMakeDeck] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [format, setFormat] = useState<DeckFormat>('commander');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => (order ? mpcOrderEntries(order) : []), [order]);

  const onFile = async (f: File) => {
    try {
      setOrder(parseMpcXml(await f.text()));
      setDeckName(f.name.replace(/\.xml$/i, ''));
    } catch (e: any) {
      toast(e?.message ?? 'XML inválido.', 'error');
    }
  };

  const run = async () => {
    if (!entries.length) return;
    setBusy(true);
    try {
      const names = [...new Set(entries.map((e) => mpcCardName(e.front)))];
      const { found } = await getCollection(names.map((n) => ({ name: n })));
      const cards = entries.map((e) => {
        const nm = mpcCardName(e.front);
        const base: Card = found.find((c) => namesMatch(c.name, nm)) ?? { id: `mpc-${e.front.id}`, name: nm.replace(/\b\w/g, (m) => m.toUpperCase()), cmc: 0, typeLine: '', colors: [], colorIdentity: [], images: {} };
        const art = { id: `mpc-${e.front.id}`, source: 'mpcfill' as const, name: nm, sourceName: 'MPCFill', images: { small: driveThumb(e.front.id, 400), normal: driveThumb(e.front.id, 1000), large: driveThumb(e.front.id, 1600) } };
        const back = e.back ? { ...art, id: `mpc-${e.back.id}`, images: { small: driveThumb(e.back.id, 400), normal: driveThumb(e.back.id, 1000), large: driveThumb(e.back.id, 1600) } } : undefined;
        return { card: cardWithMpcArt(base, art, back), quantity: e.quantity };
      });
      if (toProxies) store.addToProxies(cards);
      if (makeDeck) {
        const deck = store.createDeck({
          name: deckName.trim() || 'Deck do MPCFill',
          format,
          cards: cards.map((c) => ({ instanceId: uid('dc'), card: c.card, quantity: c.quantity, category: 'main' })),
        });
        openDeck(deck.id);
      }
      toast(`${cards.reduce((s, c) => s + c.quantity, 0)} carta(s) importadas do MPCFill.`);
      onClose();
    } catch (e: any) {
      toast(e?.message ?? 'Falha ao importar o XML.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="callout"><Info size={16} /><span>No MPCFill, monte seu pedido e use <b>Download → XML</b>. As artes escolhidas são mantidas (miniaturas reduzidas do Google Drive).</span></div>
      <div className="row">
        <input ref={fileRef} type="file" accept=".xml,text/xml" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><FileUp size={16} /> Escolher XML…</button>
        <a className="btn btn-ghost btn-sm" href="https://mpcfill.com/editor" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir MPCFill</a>
      </div>
      {order && (
        <>
          <p className="small muted">{entries.length} arte(s), {entries.reduce((s, e) => s + e.quantity, 0)} carta(s){order.backs.length ? `, ${order.backs.length} verso(s) personalizados` : ''}.</p>
          <div className="print-grid" style={{ maxHeight: 240 }}>
            {entries.map((e) => (
              <div key={e.front.id + (e.back?.id ?? '')} className="print-option" title={e.front.name}>
                <img src={driveThumb(e.front.id, 400)} loading="lazy" alt="" referrerPolicy="no-referrer" />
                <span className="print-label">{e.quantity}× {mpcCardName(e.front)}</span>
              </div>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={toProxies} onChange={(e) => setToProxies(e.target.checked)} /> Adicionar à fila de proxies</label>
          <label className="check"><input type="checkbox" checked={makeDeck} onChange={(e) => setMakeDeck(e.target.checked)} /> Criar um deck com estas artes</label>
          {makeDeck && (
            <div className="field-row">
              <div className="field"><label>Nome</label><input className="input" value={deckName} onChange={(e) => setDeckName(e.target.value)} /></div>
              <div className="field"><label>Formato</label><select className="select" value={format} onChange={(e) => setFormat(e.target.value as DeckFormat)}>{FORMAT_LIST.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
            </div>
          )}
        </>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!order || busy || (!toProxies && !makeDeck)} onClick={run}>{busy ? 'Importando…' : 'Importar'}</button>
      </div>
    </>
  );
}
