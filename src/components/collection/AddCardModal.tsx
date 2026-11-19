import { useEffect, useMemo, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import type { Card, CardPrint, DeckCategory } from '../../types/models.ts';
import { CATEGORY_LABELS } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { toast, previewProps } from '../../state/ui.tsx';
import { getCardByName, getPrints } from '../../services/scryfall.ts';
import { Modal } from '../common/Modal.tsx';
import { CardSearch } from '../common/CardSearch.tsx';
import { formatUsd, Loading, ManaCost } from '../common/bits.tsx';
import { openArtPicker } from '../launchers.tsx';
import { frontImage } from '../../types/cardRules.ts';

interface Props {
  deckId?: string;
  initialName?: string;
  onClose: () => void;
}

export default function AddCardModal({ deckId, initialName, onClose }: Props) {
  const store = useStore();
  const [name, setName] = useState(initialName ?? '');
  const [base, setBase] = useState<Card | null>(null);
  const [prints, setPrints] = useState<CardPrint[]>([]);
  const [chosen, setChosen] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);
  const [qty, setQty] = useState(1);
  const [foil, setFoil] = useState(false);
  const [dest, setDest] = useState<string>(deckId ?? store.data.decks[0]?.id ?? '');
  const [category, setCategory] = useState<DeckCategory>('main');
  const [filter, setFilter] = useState('');
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (!name) return;
    let alive = true;
    setLoading(true);
    setPrints([]);
    (async () => {
      try {
        const card = await getCardByName(name);
        if (!alive) return;
        if (!card) {
          toast('Carta não encontrada no Scryfall.', 'error');
          return;
        }
        setBase(card);
        setChosen(card);
        const p = await getPrints(card);
        if (!alive) return;
        setPrints(p);
        // Prefere a impressão mais recente não promocional.
        const pref = p.find((x) => !x.isPromo && x.setType !== 'memorabilia' && x.card) ?? p[0];
        if (pref?.card) setChosen(pref.card);
      } catch (e: any) {
        toast(e?.message ?? 'Erro ao consultar o Scryfall.', 'error');
      } finally {
        alive && setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [name]);

  const visiblePrints = useMemo(() => {
    const f = filter.toLowerCase();
    return prints.filter((p) => !f || `${p.setName} ${p.setCode} ${p.collectorNumber} ${p.artist}`.toLowerCase().includes(f));
  }, [prints, filter]);

  const add = (closeAfter: boolean) => {
    if (!chosen) return;
    if (!dest) return toast('Escolha um deck.', 'error');
    store.addCardToDeck(dest, chosen, { quantity: qty, category, isFoil: foil });
    const deck = store.data.decks.find((d) => d.id === dest);
    toast(`${qty}× ${chosen.name} → ${deck?.name ?? 'deck'}.`);
    setAdded((a) => a + qty);
    if (closeAfter) onClose();
    else {
      setName('');
      setBase(null);
      setChosen(null);
      setPrints([]);
      setQty(1);
    }
  };

  return (
    <Modal
      title="Adicionar carta ao deck"
      onClose={onClose}
      size="lg"
      footer={
        <>
          {added > 0 && <span className="small subtle">{added} adicionada(s) nesta sessão</span>}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className="btn btn-secondary" disabled={!chosen} onClick={() => add(false)}>Adicionar e continuar</button>
          <button className="btn btn-primary" disabled={!chosen} onClick={() => add(true)}>Adicionar</button>
        </>
      }
    >
      <CardSearch autoFocus={!initialName} initial={initialName} onSelect={setName} placeholder="Digite o nome da carta (em inglês)…" />

      {loading && <Loading text="Buscando edições…" />}

      {chosen && !loading && (
        <div className="add-card-layout">
          <div className="col add-card-preview">
            <img src={frontImage(chosen, 'normal')} alt={chosen.name} className={foil ? 'foil-preview' : ''} style={{ borderRadius: 12, width: '100%' }} />
            <div className="small">
              <div className="row" style={{ justifyContent: 'space-between' }}><b>{chosen.name}</b><ManaCost cost={chosen.manaCost} /></div>
              <div className="subtle">{chosen.typeLine}</div>
              <div className="subtle">{chosen.setName} #{chosen.collectorNumber} · {formatUsd(chosen.priceUsd)}</div>
            </div>
          </div>
          <div className="col grow" style={{ gap: 12, minWidth: 0 }}>
            <div className="field-row">
              <div className="field">
                <label>Quantidade</label>
                <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <div className="field">
                <label>Deck</label>
                <select className="select" value={dest} onChange={(e) => setDest(e.target.value)}>
                  {store.data.decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              {(
                <div className="field">
                  <label>Categoria</label>
                  <select className="select" value={category} onChange={(e) => setCategory(e.target.value as DeckCategory)}>
                    {(Object.keys(CATEGORY_LABELS) as DeckCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="row-wrap">
              <label className="check"><input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} /> Foil</label>
<span className="small subtle">A coleção é atualizada automaticamente.</span>
            </div>
            <div className="row">
              <span className="label grow">Edição / arte ({prints.length})</span>
              <input className="input input-sm" style={{ maxWidth: 200 }} placeholder="Filtrar edição/artista" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <button
                className="btn btn-ghost btn-sm"
                title="Artes do MPCFill ou imagem própria"
                onClick={() => base && openArtPicker({ cards: [chosen], onSelect: (_i, c) => setChosen(c) })}
              >
                <Palette size={15} /> Outras artes
              </button>
            </div>
            <div className="print-grid">
              {visiblePrints.map((p) => (
                <button key={p.id} className={`print-option ${chosen.id === p.id ? 'active' : ''}`} onClick={() => p.card && setChosen(p.card)} title={`${p.setName} #${p.collectorNumber}`} {...previewProps(p.images.normal)}>
                  <img src={p.images.small} loading="lazy" alt="" />
                  <span className="print-label">{p.setCode?.toUpperCase()} #{p.collectorNumber}</span>
                  {chosen.id === p.id && <span className="print-check"><Check size={14} /></span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
