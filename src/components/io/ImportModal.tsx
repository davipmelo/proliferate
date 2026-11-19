import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, FileText, FileUp, Info } from 'lucide-react';
import type { Card, DeckCard, DeckFormat } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { toast } from '../../state/ui.tsx';
import { openDeck } from '../../state/nav.ts';
import { FORMAT_LIST, formatInfo } from '../../types/formats.ts';
import { mergeEntries, parseDeckList } from '../../services/importParser.ts';
import { resolveEntries } from '../../services/importer.ts';
import { cardWithMpcArt, driveThumb, mpcCardName, mpcOrderEntries, parseMpcXml, type MpcOrder } from '../../services/mpcfill.ts';
import { getCollection } from '../../services/scryfall.ts';
import { normalizeDeck, uid } from '../../services/normalize.ts';
import { namesMatch, sameArt } from '../../types/cardRules.ts';
import { Modal } from '../common/Modal.tsx';
import { CommanderPicker } from '../decks/CommanderPicker.tsx';
import { buildDeckCards } from '../decks/deckBuild.ts';

type Target = 'collection' | 'new-deck' | 'existing-deck';
const FORMAT_NAMES: Record<string, string> = { arena: 'MTG Arena', moxfield: 'Moxfield', ligamagic: 'LigaMagic', simple: 'Lista simples', csv: 'CSV' };

export default function ImportModal({ onClose, deckId, target: initialTarget }: { onClose: () => void; deckId?: string; target?: Target }) {
  const [tab, setTab] = useState<'text' | 'mpc'>('text');
  return (
    <Modal
      title="Importar"
      onClose={onClose}
      size="lg"
      tabs={
        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'text' ? 'active' : ''}`} onClick={() => setTab('text')}><FileText size={15} /> Lista de cartas</button>
          <button className={`modal-tab ${tab === 'mpc' ? 'active' : ''}`} onClick={() => setTab('mpc')}><FileUp size={15} /> Pedido XML do MPCFill</button>
        </div>
      }
    >
      {tab === 'text' ? <TextImport onClose={onClose} deckId={deckId} initialTarget={initialTarget ?? (deckId ? 'existing-deck' : 'collection')} /> : <MpcImport onClose={onClose} />}
    </Modal>
  );
}

function TextImport({ onClose, deckId, initialTarget }: { onClose: () => void; deckId?: string; initialTarget: Target }) {
  const store = useStore();
  const [text, setText] = useState('');
  const [target, setTarget] = useState<Target>(initialTarget);
  const [existing, setExisting] = useState(deckId ?? store.data.decks[0]?.id ?? '');
  const [name, setName] = useState('');
  const [format, setFormat] = useState<DeckFormat>('commander');
  const [commander, setCommander] = useState<Card | undefined>();
  const [alsoCollection, setAlsoCollection] = useState(false);
  const [progress, setProgress] = useState<{ msg: string; pct: number } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text.trim() ? parseDeckList(text) : null), [text]);
  const total = parsed?.entries.reduce((s, e) => s + e.quantity, 0) ?? 0;

  const run = async () => {
    if (!parsed?.entries.length) return;
    if (target === 'new-deck' && !name.trim()) return toast('Dê um nome ao novo deck.', 'error');
    if (target === 'existing-deck' && !existing) return toast('Escolha o deck.', 'error');
    setMissing([]);
    try {
      const { resolved, unresolved } = await resolveEntries(mergeEntries(parsed.entries), (msg, pct) => setProgress({ msg, pct }));
      const cards = resolved.filter((r) => r.entry.section !== 'token');
      if (target === 'collection') {
        store.update((d) => {
          const collection = d.collection.slice();
          for (const r of cards) {
            const idx = collection.findIndex((i) => sameArt(i.card, r.card) && i.isFoil === !!r.entry.foil && i.condition === 'NM');
            if (idx >= 0) collection[idx] = { ...collection[idx], quantity: collection[idx].quantity + r.entry.quantity };
            else collection.unshift({ id: uid('col'), card: r.card, quantity: r.entry.quantity, isFoil: !!r.entry.foil, condition: 'NM', language: r.card.namePt ? 'pt' : 'en', tags: [], dateAdded: new Date().toISOString() });
          }
          return { ...d, collection };
        });
        toast(`${cards.reduce((s, r) => s + r.entry.quantity, 0)} carta(s) importadas para a coleção.`);
      } else {
        const tokens = resolved.filter((r) => r.entry.section === 'token').map((r) => ({ instanceId: uid('dt'), card: { ...r.card, utilityType: 'token' as const }, quantity: r.entry.quantity }));
        let newCards: DeckCard[] = buildDeckCards(cards);
        let cmd = commander ?? newCards.find((c) => c.category === 'commander')?.card;
        // Vincula à coleção (cria/incrementa itens) se pedido.
        const link = (d: { collection: typeof store.data.collection }) => {
          if (!alsoCollection) return d.collection;
          const collection = d.collection.slice();
          newCards = newCards.map((dc) => {
            const idx = collection.findIndex((i) => sameArt(i.card, dc.card) && i.isFoil === !!dc.isFoil);
            if (idx >= 0) {
              collection[idx] = { ...collection[idx], quantity: collection[idx].quantity + dc.quantity };
              return { ...dc, collectionItemId: collection[idx].id };
            }
            const id = uid('col');
            collection.unshift({ id, card: dc.card, quantity: dc.quantity, isFoil: !!dc.isFoil, condition: 'NM', language: 'en', tags: [], dateAdded: new Date().toISOString() });
            return { ...dc, collectionItemId: id };
          });
          return collection;
        };
        if (target === 'new-deck') {
          if (commander && !newCards.some((c) => c.category === 'commander')) {
            // Remove o comandante do principal se veio na lista.
            newCards = newCards.filter((c) => !(c.category === 'main' && namesMatch(c.card.name, commander.name) && c.quantity === 1));
            newCards.unshift({ instanceId: uid('dc'), card: commander, quantity: 1, category: 'commander' });
          }
          const id = uid('deck');
          store.update((d) => {
            const collection = link(d);
            const deck = normalizeDeck({ id, name: name.trim(), format, commander: cmd, cards: newCards, tokens, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            return { ...d, collection, decks: [deck, ...d.decks] };
          });
          toast(`Deck “${name.trim()}” criado.`);
          onClose();
          openDeck(id);
        } else {
          store.update((d) => {
            const collection = link(d);
            return {
              ...d,
              collection,
              decks: d.decks.map((dk) => {
                if (dk.id !== existing) return dk;
                const merged = dk.cards.slice();
                for (const nc of newCards) {
                  const i = merged.findIndex((c) => sameArt(c.card, nc.card) && c.category === nc.category);
                  if (i >= 0) merged[i] = { ...merged[i], quantity: merged[i].quantity + nc.quantity, collectionItemId: merged[i].collectionItemId ?? nc.collectionItemId };
                  else merged.push(nc);
                }
                cmd = dk.commander ?? cmd;
                return normalizeDeck({ ...dk, commander: cmd, cards: merged, tokens: [...dk.tokens, ...tokens], updatedAt: new Date().toISOString() });
              }),
            };
          });
          toast(`${newCards.reduce((s, c) => s + c.quantity, 0)} carta(s) adicionadas ao deck.`);
        }
      }
      if (unresolved.length) setMissing(unresolved.map((u) => `${u.quantity} ${u.name}`));
      else if (target !== 'new-deck') onClose();
    } catch (e: any) {
      toast(e?.message ?? 'Falha na importação.', 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <div className="field">
        <div className="row">
          <label className="label grow">Cole a lista (Arena, Moxfield, LigaMagic, CSV ou simples)</label>
          <input ref={fileRef} type="file" accept=".txt,.csv,.dec,.dek,text/plain,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
          <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()}><FileUp size={13} /> Abrir arquivo</button>
        </div>
        <textarea className="textarea mono" style={{ minHeight: 200 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Commander\n1 Atraxa, Praetors\' Voice\n\nDeck\n1 Sol Ring (C21) 263 *F*\n4x Raio\n1 Contramágica\n\nSideboard\n2 Pyroblast'} autoFocus />
        {parsed && (
          <span className="field-hint">
            Formato detectado: <b>{FORMAT_NAMES[parsed.format]}</b> · {total} carta(s) em {parsed.entries.length} linha(s)
            {parsed.errors.length > 0 && <span className="warning-text"> · {parsed.errors.length} linha(s) ignorada(s)</span>}. Nomes em português são traduzidos automaticamente.
          </span>
        )}
      </div>

      <div className="field">
        <label>Destino</label>
        <div className="btn-group" style={{ alignSelf: 'flex-start' }}>
          <button className={`btn btn-ghost btn-sm ${target === 'collection' ? 'active' : ''}`} onClick={() => setTarget('collection')}>Coleção</button>
          <button className={`btn btn-ghost btn-sm ${target === 'new-deck' ? 'active' : ''}`} onClick={() => setTarget('new-deck')}>Novo deck</button>
          <button className={`btn btn-ghost btn-sm ${target === 'existing-deck' ? 'active' : ''}`} onClick={() => setTarget('existing-deck')} disabled={!store.data.decks.length}>Deck existente</button>
        </div>
      </div>

      {target === 'new-deck' && (
        <>
          <div className="field-row">
            <div className="field"><label>Nome do deck</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field"><label>Formato</label><select className="select" value={format} onChange={(e) => setFormat(e.target.value as DeckFormat)}>{FORMAT_LIST.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
          </div>
          {formatInfo(format).hasCommander && <CommanderPicker label="Comandante (opcional se já estiver na lista)" value={commander} onChange={setCommander} />}
        </>
      )}
      {target === 'existing-deck' && (
        <div className="field"><label>Deck</label><select className="select" value={existing} onChange={(e) => setExisting(e.target.value)}>{store.data.decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      )}
      {target !== 'collection' && (
        <label className="check"><input type="checkbox" checked={alsoCollection} onChange={(e) => setAlsoCollection(e.target.checked)} /> Também registrar as cartas na coleção (se você as possui)</label>
      )}

      {progress && (
        <div className="col" style={{ gap: 6 }}>
          <span className="small muted">{progress.msg}</span>
          <div className="progress"><div style={{ width: `${progress.pct}%` }} /></div>
        </div>
      )}
      {missing.length > 0 && (
        <div className="callout warning"><AlertTriangle size={16} /><span><b>{missing.length} carta(s) não encontradas:</b> {missing.join(', ')}</span></div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>{missing.length ? 'Fechar' : 'Cancelar'}</button>
        <button className="btn btn-primary" disabled={!total || !!progress} onClick={run}>Importar {total ? `${total} carta(s)` : ''}</button>
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
