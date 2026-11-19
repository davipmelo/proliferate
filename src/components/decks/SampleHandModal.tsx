import { useEffect, useMemo, useState } from 'react';
import { ArrowDownWideNarrow, Info, Plus, RotateCcw } from 'lucide-react';
import type { Card, Deck } from '../../types/models.ts';
import { backImage, frontImage, isLand } from '../../types/cardRules.ts';
import { previewProps } from '../../state/ui.tsx';
import { Modal } from '../common/Modal.tsx';
import { openCardInfo } from '../launchers.tsx';

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const HAND = 7;

/** Simula a mão inicial e as compras dos próximos turnos. */
export default function SampleHandModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const library = useMemo(() => deck.cards.filter((c) => c.category === 'main').flatMap((c) => Array.from({ length: c.quantity }, () => c.card)), [deck.cards]);
  const [order, setOrder] = useState<Card[]>(() => shuffle(library));
  const [drawn, setDrawn] = useState(HAND);
  const [byCost, setByCost] = useState(false);
  const [deal, setDeal] = useState(0); // reinicia a animação a cada mão nova

  const cards = order.slice(0, drawn).map((card, i) => ({ card, i }));
  const shown = byCost ? cards.slice().sort((a, b) => Number(isLand(b.card)) - Number(isLand(a.card)) || a.card.cmc - b.card.cmc || a.i - b.i) : cards;
  const lands = cards.filter((c) => isLand(c.card)).length;
  const spells = cards.filter((c) => !isLand(c.card));
  const avg = spells.length ? spells.reduce((s, c) => s + c.card.cmc, 0) / spells.length : 0;
  const cheap = spells.filter((c) => c.card.cmc <= 2).length;
  // O veredito avalia a mão inicial (7 cartas), não as compras seguintes.
  const openingLands = cards.filter((c) => c.i < HAND && isLand(c.card)).length;
  const landsOk = openingLands >= 2 && openingLands <= 4;
  const remaining = order.length - drawn;

  const newHand = () => {
    setOrder(shuffle(library));
    setDrawn(HAND);
    setDeal((d) => d + 1);
  };
  const draw = () => setDrawn((d) => Math.min(order.length, d + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === 'n' || e.key === 'N') newHand();
      if (e.key === 'c' || e.key === 'C' || e.key === ' ') {
        e.preventDefault();
        draw();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Modal
      title={`Mão de teste · ${deck.name}`}
      onClose={onClose}
      size="xl"
      bodyClassName="hand-body"
      footer={
        <>
          <span className="small subtle hide-mobile"><span className="kbd">N</span> nova mão · <span className="kbd">C</span> comprar</span>
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={newHand} disabled={!library.length}><RotateCcw size={16} /> Nova mão</button>
          <button className="btn btn-primary" onClick={draw} disabled={!remaining}><Plus size={16} /> Comprar carta</button>
        </>
      }
    >
      {library.length === 0 ? (
        <p className="muted">O deck principal está vazio.</p>
      ) : (
        <>
          <div className="hand-stats">
            <div className="hand-stat"><b>{lands}</b><span>terreno{lands === 1 ? '' : 's'}</span></div>
            <div className="hand-stat"><b>{spells.length}</b><span>mágica{spells.length === 1 ? '' : 's'}</span></div>
            <div className="hand-stat"><b>{avg.toFixed(1)}</b><span>custo médio</span></div>
            <div className="hand-stat"><b>{cheap}</b><span>custo ≤ 2</span></div>
            <div className="hand-stat"><b>{drawn > HAND ? drawn - HAND : 0}</b><span>compradas</span></div>
            <div className="hand-stat"><b>{remaining}</b><span>no grimório</span></div>
            <div className="spacer" />
            <button className={`btn btn-ghost btn-sm ${byCost ? 'active' : ''}`} onClick={() => setByCost(!byCost)} aria-pressed={byCost} title="Terrenos primeiro, depois por custo">
              <ArrowDownWideNarrow size={15} /> {byCost ? 'Por custo' : 'Ordem de compra'}
            </button>
          </div>
          <p className={`hand-verdict ${landsOk ? 'ok' : 'warn'}`}>
            Mão inicial com {openingLands} terreno{openingLands === 1 ? '' : 's'} — {openingLands < 2 ? 'arriscada, pode faltar mana.' : openingLands > 4 ? 'muita terra, pouca ação.' : 'equilibrada.'}
          </p>
          <div className="hand-row" key={deal} style={{ ['--n' as string]: shown.length }}>
            {shown.map(({ card, i }) => (
              <div key={i} className={`hand-card ${i >= HAND ? 'drawn' : ''}`} style={{ animationDelay: `${Math.min(i, HAND) * 45}ms` }}>
                <div className="hand-card-img" {...previewProps(frontImage(card, 'normal'), backImage(card))}>
                  <img src={frontImage(card, 'normal')} alt={card.name} />
                  <button className="btn btn-secondary btn-icon btn-xs hand-info" title="Informações" onClick={() => openCardInfo(card)}><Info size={13} /></button>
                </div>
                {i >= HAND && <span className="hand-turn">Turno {i - HAND + 1}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
