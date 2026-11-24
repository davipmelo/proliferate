import { ArrowLeft, Layers } from 'lucide-react';
import { useStore } from '../../state/store.tsx';
import { useRoute } from '../../state/router.ts';
import { closeDeck, openDeck } from '../../state/nav.ts';
import { Empty } from '../common/bits.tsx';
import { DeckList } from './DeckList.tsx';
import { DeckEditor } from './DeckEditor.tsx';

export default function DecksTab() {
  const { data } = useStore();
  const { rest } = useRoute();
  const openId = rest[0] ?? null;

  if (openId) {
    const deck = data.decks.find((d) => d.id === openId);
    if (deck) return <DeckEditor deck={deck} onBack={closeDeck} />;
    return (
      <Empty
        icon={<Layers size={40} />}
        title="Deck não encontrado"
        action={<button className="btn btn-secondary" onClick={closeDeck}><ArrowLeft size={16} /> Ver meus decks</button>}
      >
        Este deck não existe neste navegador. Os decks ficam salvos só para quem os criou.
      </Empty>
    );
  }
  return <DeckList onOpen={openDeck} />;
}
