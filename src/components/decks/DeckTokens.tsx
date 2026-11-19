import { useState } from 'react';
import { Image as ImageIcon, Plus, Printer, Search, Trash2, Wand2 } from 'lucide-react';
import type { Deck, DeckToken, TokenCard } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { previewProps, toast } from '../../state/ui.tsx';
import { getTokensForCards, searchUtilities } from '../../services/scryfall.ts';
import { uid } from '../../services/normalize.ts';
import { sameArt, frontImage } from '../../types/cardRules.ts';
import { CardThumb, QtyControl, Spinner } from '../common/bits.tsx';
import { openArtPicker } from '../launchers.tsx';

export function DeckTokens({ deck }: { deck: Deck }) {
  const store = useStore();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<TokenCard[] | null>(null);
  const [busy, setBusy] = useState(false);

  const setTokens = (fn: (t: DeckToken[]) => DeckToken[]) => store.updateDeck(deck.id, (d) => ({ ...d, tokens: fn(d.tokens) }));
  const add = (cards: TokenCard[]) =>
    setTokens((t) => {
      const next = t.slice();
      for (const c of cards) if (!next.some((x) => sameArt(x.card, c) || x.card.name === c.name)) next.push({ instanceId: uid('dt'), card: c, quantity: 1 });
      return next;
    });

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await searchUtilities('all', q);
      setResults(r.items.slice(0, 24));
    } catch (e: any) {
      toast(e?.message ?? 'Erro na busca.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const suggest = async () => {
    setBusy(true);
    try {
      const found = await getTokensForCards(deck.cards.map((c) => c.card.id));
      if (!found.length) toast('Nenhuma ficha encontrada para as cartas do deck.', 'info');
      else {
        add(found);
        toast(`${found.length} ficha(s)/utilitário(s) adicionados.`);
      }
    } catch (e: any) {
      toast(e?.message ?? 'Erro ao buscar fichas.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section">
      <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}>
        Fichas do deck <span className="count">({deck.tokens.reduce((s, t) => s + t.quantity, 0)})</span>
        <div className="spacer" />
        {busy && <Spinner />}
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm grow" onClick={suggest} disabled={busy || !deck.cards.length} title="Busca as fichas criadas pelas cartas do deck"><Wand2 size={15} /> Detectar fichas</button>
        <button className="btn btn-secondary btn-sm grow" disabled={!deck.tokens.length} onClick={() => { store.addToProxies(deck.tokens.map((t) => ({ card: t.card, quantity: t.quantity }))); toast('Fichas na fila de impressão.'); }}><Printer size={15} /> Imprimir fichas</button>
      </div>
      {deck.tokens.length > 0 && (
        <div className="col" style={{ gap: 4, marginBottom: 10 }}>
          {deck.tokens.map((t, i) => (
            <div key={t.instanceId} className="row" style={{ gap: 8 }}>
              <CardThumb card={t.card} />
              <span className="grow ellipsis small" title={t.card.typeLine}>{t.card.name}</span>
              <QtyControl value={t.quantity} min={1} onChange={(n) => setTokens((ts) => ts.map((x) => (x.instanceId === t.instanceId ? { ...x, quantity: n } : x)))} />
              <button className="btn btn-ghost btn-icon btn-xs" title="Trocar arte" onClick={() => openArtPicker({ cards: deck.tokens.map((x) => x.card), start: i, tokens: true, onSelect: (idx, c) => setTokens((ts) => ts.map((x, j) => (j === idx ? { ...x, card: { ...c, utilityType: x.card.utilityType } } : x))) })}><ImageIcon size={14} /></button>
              <button className="btn btn-ghost btn-icon btn-xs" title="Remover" onClick={() => setTokens((ts) => ts.filter((x) => x.instanceId !== t.instanceId))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <div className="input-icon"><Search size={15} /><input className="input input-sm" placeholder="Buscar ficha/utilitário (inglês)…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn btn-ghost btn-sm" type="submit" disabled={!q.trim() || busy}>Buscar</button>
      </form>
      {results && (
        <div className="print-grid" style={{ marginTop: 8, maxHeight: 260 }}>
          {results.length === 0 && <span className="small subtle">Nada encontrado.</span>}
          {results.map((r) => (
            <button key={r.id} className="print-option" title={`${r.name} — ${r.typeLine}`} onClick={() => { add([r]); toast(`${r.name} adicionada.`); }} {...previewProps(frontImage(r, 'normal'))}>
              <img src={frontImage(r, 'small')} loading="lazy" alt="" />
              <span className="print-label"><Plus size={10} /> {r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
