import { useMemo, useState } from 'react';
import { Plus, RotateCcw, Shuffle } from 'lucide-react';
import type { Card, Deck } from '../../types/models.ts';
import { frontImage, isLand } from '../../types/cardRules.ts';
import { previewProps } from '../../state/ui.tsx';
import { Modal } from '../common/Modal.tsx';

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Simula mãos iniciais (mulligan de Londres) e compras de cartas. */
export default function SampleHandModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const library = useMemo(() => deck.cards.filter((c) => c.category === 'main').flatMap((c) => Array.from({ length: c.quantity }, () => c.card)), [deck.cards]);
  const [order, setOrder] = useState<Card[]>(() => shuffle(library));
  const [drawn, setDrawn] = useState(7);
  const [mulligans, setMulligans] = useState(0);
  const hand = order.slice(0, drawn);
  const lands = hand.filter((c) => isLand(c)).length;

  const newHand = (mull: number) => {
    setOrder(shuffle(library));
    setDrawn(7);
    setMulligans(mull);
  };

  return (
    <Modal
      title={`Mão de teste · ${deck.name}`}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <span className="small subtle">
            {library.length} cartas no grimório · {lands} terreno(s) na mão{mulligans ? ` · mulligan ${mulligans}: devolva ${mulligans} carta(s) ao fundo` : ''}
          </span>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={() => newHand(0)}><RotateCcw size={16} /> Nova mão</button>
          <button className="btn btn-secondary" onClick={() => newHand(mulligans + 1)} disabled={mulligans >= 6}><Shuffle size={16} /> Mulligan</button>
          <button className="btn btn-primary" onClick={() => setDrawn((d) => Math.min(order.length, d + 1))} disabled={drawn >= order.length}><Plus size={16} /> Comprar carta</button>
        </>
      }
    >
      {library.length === 0 ? (
        <p className="muted">O deck principal está vazio.</p>
      ) : (
        <div className="hand">
          {hand.map((c, i) => (
            <div key={i} className={`hand-card ${i >= 7 ? 'drawn' : ''}`} style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }} {...previewProps(frontImage(c, 'normal'))}>
              <img src={frontImage(c, 'normal')} alt={c.name} />
              {i >= 7 && <span className="badge badge-accent">Turno {i - 6}</span>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
