import { useState } from 'react';
import { Image as ImageIcon, Info, Plus, Printer, Trash2, Wand2 } from 'lucide-react';
import type { Deck, DeckToken, TokenCard, ViewMode } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { previewProps, toast } from '../../state/ui.tsx';
import { getTokensForCards } from '../../services/scryfall.ts';
import { uid } from '../../services/normalize.ts';
import { backImage, frontImage, sameArt } from '../../types/cardRules.ts';
import { CardThumb, QtyControl, Spinner } from '../common/bits.tsx';
import { openArtPicker, openCardInfo, openUtilityPicker } from '../launchers.tsx';
import { DeckPart } from './DeckPart.tsx';

const TYPE_LABELS: Record<string, string> = {
  token: 'Ficha', emblem: 'Emblema', counter: 'Marcador', plane: 'Plano', dungeon: 'Masmorra', scheme: 'Esquema', conspiracy: 'Conspiração', attraction: 'Atração',
};

interface Props {
  deck: Deck;
  view: ViewMode;
  gridSize: number;
  details: boolean;
  closed: boolean;
  onToggle: () => void;
}

/** Seção "Fichas e utilitários" do editor de deck. */
export function DeckTokens({ deck, view, gridSize, details, closed, onToggle }: Props) {
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
  const changeArt = (i: number) =>
    openArtPicker({ cards: deck.tokens.map((x) => x.card), start: i, tokens: true, onSelect: (idx, c) => setTokens((ts) => ts.map((x, j) => (j === idx ? { ...x, card: { ...c, utilityType: x.card.utilityType } } : x))) });
  const remove = (id: string) => setTokens((ts) => ts.filter((x) => x.instanceId !== id));
  const setQty = (id: string, n: number) => setTokens((ts) => ts.map((x) => (x.instanceId === id ? { ...x, quantity: n } : x)));
  const print = (tokens: DeckToken[]) => {
    store.addToProxies(tokens.map((t) => ({ card: t.card, quantity: t.quantity })));
    toast(`${tokens.reduce((s, t) => s + t.quantity, 0)} ficha(s) na fila de impressão.`);
  };

  const actions = (
    <>
      {busy && <Spinner />}
      <button className="btn btn-ghost btn-sm" onClick={suggest} disabled={busy || !deck.cards.length} title="Busca as fichas criadas pelas cartas do deck"><Wand2 size={15} /> <span className="hide-mobile">Detectar</span></button>
      <button className="btn btn-ghost btn-sm" disabled={!total} onClick={() => print(deck.tokens)} title="Mandar todas as fichas para a fila de impressão"><Printer size={15} /> <span className="hide-mobile">Imprimir</span></button>
      <button className="btn btn-secondary btn-sm" onClick={() => openUtilityPicker({ title: `Fichas para ${deck.name}`, onPick: (c) => { add(c); toast(`${c.length} item(ns) adicionados ao deck.`); } })}><Plus size={15} /> Adicionar</button>
    </>
  );

  return (
    <DeckPart title="Tokens" count={total || undefined} closed={closed} onToggle={onToggle} actions={actions}>
      {deck.tokens.length === 0 ? (
        <div className="part-empty small subtle">Nenhuma ficha. Use “Detectar” para buscar as fichas que as cartas do deck criam, ou “Adicionar” para escolher qualquer utilitário.</div>
      ) : view === 'list' ? (
        <div className="list">
          <div className="group-rows two-col">
            {deck.tokens.map((t, i) => (
              <div key={t.instanceId} className={`list-row ${details ? '' : 'compact'}`}>
                <CardThumb card={t.card} />
                <div className="list-main">
                  <div className="list-title"><span>{t.card.name}</span></div>
                  {details && <div className="list-sub"><span className="ellipsis">{TYPE_LABELS[t.card.utilityType] ?? 'Utilitário'} · {t.card.typeLine.replace(/^Token /, '')}</span></div>}
                </div>
                <div className="list-actions">
                  <QtyControl value={t.quantity} min={1} onChange={(n) => setQty(t.instanceId, n)} />
                  <button className="btn btn-ghost btn-icon btn-sm" title="Informações" onClick={() => openCardInfo(t.card)}><Info size={15} /></button>
                  <button className="btn btn-ghost btn-icon btn-sm" title="Trocar arte" onClick={() => changeArt(i)}><ImageIcon size={15} /></button>
                  <button className="btn btn-ghost btn-icon btn-sm" title="Remover" onClick={() => remove(t.instanceId)}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card-grid" style={{ ['--card-w' as string]: `${gridSize}px` }}>
          {deck.tokens.map((t, i) => (
            <div key={t.instanceId} className="card-tile">
              <div className="card-img-wrap" {...previewProps(frontImage(t.card, 'normal'), backImage(t.card))}>
                <img src={frontImage(t.card, gridSize > 200 ? 'normal' : 'small')} loading="lazy" decoding="async" alt={t.card.name} />
                {t.quantity > 1 && <span className="qty-badge">{t.quantity}×</span>}
                <div className="card-tile-actions">
                  <button className="btn btn-secondary btn-icon btn-sm" title="Informações" onClick={() => openCardInfo(t.card)}><Info size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Trocar arte" onClick={() => changeArt(i)}><ImageIcon size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Mandar para proxies" onClick={() => print([t])}><Printer size={15} /></button>
                  <button className="btn btn-secondary btn-icon btn-sm" title="Remover" onClick={() => remove(t.instanceId)}><Trash2 size={15} /></button>
                </div>
              </div>
              {details && (
                <div className="card-tile-info">
                  <span className="name">{t.card.name}</span>
                  <span className="meta"><QtyControl value={t.quantity} min={1} onChange={(n) => setQty(t.instanceId, n)} /><span className="ellipsis">{TYPE_LABELS[t.card.utilityType] ?? ''}</span></span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DeckPart>
  );
}
