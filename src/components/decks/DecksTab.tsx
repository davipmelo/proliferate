import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.tsx';
import { DeckList } from './DeckList.tsx';
import { DeckEditor } from './DeckEditor.tsx';

export default function DecksTab() {
  const { data } = useStore();
  const [openId, setOpenId] = useState<string | null>(() => sessionStorage.getItem('proliferate:open-deck'));

  useEffect(() => {
    const on = (e: Event) => setOpenId((e as CustomEvent<string>).detail);
    window.addEventListener('proliferate:open-deck', on);
    return () => window.removeEventListener('proliferate:open-deck', on);
  }, []);

  const open = (id: string | null) => {
    setOpenId(id);
    if (id) sessionStorage.setItem('proliferate:open-deck', id);
    else sessionStorage.removeItem('proliferate:open-deck');
    window.scrollTo({ top: 0 });
  };

  const deck = openId ? data.decks.find((d) => d.id === openId) : undefined;
  if (deck) return <DeckEditor deck={deck} onBack={() => open(null)} />;
  return <DeckList onOpen={open} />;
}
