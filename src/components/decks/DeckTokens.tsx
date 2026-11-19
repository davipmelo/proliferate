import { useState } from 'react';
import { Image as ImageIcon, Plus, Printer, Trash2, Wand2 } from 'lucide-react';
import type { Deck, DeckToken, TokenCard } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { previewProps, toast } from '../../state/ui.tsx';
import { getTokensForCards } from '../../services/scryfall.ts';
import { uid } from '../../services/normalize.ts';
import { frontImage, sameArt } from '../../types/cardRules.ts';
import { QtyControl, Spinner } from '../common/bits.tsx';
import { openArtPicker, openUtilityPicker } from '../launchers.tsx';

export function DeckTokens({ deck }: { deck: Deck }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const setTokens = (fn: (t: DeckToken[]) => DeckToken[]) => store.updateDeck(deck.id, (d) => ({ ...d, tokens: fn(d.tokens) }));
  const add = (cards: TokenCard[]) =>
    setTokens((t) => {
      const next = t.slice();
      for (const c of cards) {
        const i = next.findIndex((x) => sameArt(x.card, c));
        if (i >= 0) next[i] = { ...next[i], quantity: next[i].quantity + 1 };
        else next.push({ instanceId: uid('dt'), card: c, quantity: 1 });
      }
      return next;
    });

  const suggest = async () => {
    setBusy(true);
    try {
      const found = (await getTokensForCards(deck.cards.map((c) => c.card.id))).filter((f) => !deck.tokens.some((t) => t.card.name === f.name));
      if (!found.length) toast('Nenhuma ficha nova encontrada para as cartas do deck.', 'info');
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

  const total = deck.tokens.reduce((s, t) => s + t.quantity, 0);

  return (
    <div className="section">
      <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}>
        Fichas e utilitários <span className="count">{total || ''}</span>
        <div className="spacer" />
        {busy && <Spinner />}
      </div>
      <div className="token-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => openUtilityPicker({ title: `Fichas para ${deck.name}`, onPick: (c) => { add(c); toast(`${c.length} item(ns) adicionados ao deck.`); } })}><Plus size={15} /> Adicionar</button>
        <button className="btn btn-ghost btn-sm" onClick={suggest} disabled={busy || !deck.cards.length} title="Busca as fichas criadas pelas cartas do deck"><Wand2 size={15} /> Detectar</button>
        <button className="btn btn-ghost btn-sm" disabled={!total} onClick={() => { store.addToProxies(deck.tokens.map((t) => ({ card: t.card, quantity: t.quantity }))); toast('Fichas na fila de impressão.'); }}><Printer size={15} /> Imprimir</button>
      </div>
      {deck.tokens.length === 0 ? (
        <p className="small subtle" style={{ marginTop: 10 }}>Nenhuma ficha. Use “Detectar” para buscar as fichas que as cartas do deck criam, ou “Adicionar” para escolher qualquer utilitário.</p>
      ) : (
        <div className="token-grid">
          {deck.tokens.map((t, i) => (
            <div key={t.instanceId} className="token-tile">
              <div className="token-img" {...previewProps(frontImage(t.card, 'normal'))}>
                <img src={frontImage(t.card, 'small')} alt={t.card.name} loading="lazy" />
                <div className="token-hover">
                  <button className="btn btn-secondary btn-icon btn-xs" title="Trocar arte" onClick={() => openArtPicker({ cards: deck.tokens.map((x) => x.card), start: i, tokens: true, onSelect: (idx, c) => setTokens((ts) => ts.map((x, j) => (j === idx ? { ...x, card: { ...c, utilityType: x.card.utilityType } } : x))) })}><ImageIcon size={13} /></button>
                  <button className="btn btn-secondary btn-icon btn-xs" title="Remover" onClick={() => setTokens((ts) => ts.filter((x) => x.instanceId !== t.instanceId))}><Trash2 size={13} /></button>
                </div>
              </div>
              <span className="token-name ellipsis" title={t.card.typeLine}>{t.card.name}</span>
              <QtyControl value={t.quantity} min={1} onChange={(n) => setTokens((ts) => ts.map((x) => (x.instanceId === t.instanceId ? { ...x, quantity: n } : x)))} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
