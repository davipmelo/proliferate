import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import type { Card, Deck, DeckFormat } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { toast } from '../../state/ui.tsx';
import { FORMAT_LIST, formatInfo } from '../../types/formats.ts';
import { parseDeckList, mergeEntries } from '../../services/importParser.ts';
import { resolveEntries } from '../../services/importer.ts';
import { exportDeck } from '../../services/exporters.ts';
import { normalizeDeck } from '../../services/normalize.ts';
import { Modal } from '../common/Modal.tsx';
import { CommanderPicker } from './CommanderPicker.tsx';
import { buildDeckCards } from './deckBuild.ts';

interface Props {
  deck?: Deck;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

/** Listagem editável (sem comandante/parceiro, que têm campos próprios). */
function listText(deck: Deck): string {
  const d = { ...deck, cards: deck.cards.filter((c) => c.category !== 'commander' && c.category !== 'partner') };
  return d.cards.length ? exportDeck(d, 'moxfield').trim() : '';
}

export function DeckFormModal({ deck, onClose, onSaved }: Props) {
  const store = useStore();
  const [name, setName] = useState(deck?.name ?? '');
  const [format, setFormat] = useState<DeckFormat>(deck?.format ?? 'commander');
  const [description, setDescription] = useState(deck?.description ?? '');
  const [commander, setCommander] = useState<Card | undefined>(deck?.commander);
  const [partner, setPartner] = useState<Card | undefined>(deck?.partner);
  const [tags, setTags] = useState<string[]>(deck?.tags ?? []);
  const initialList = useMemo(() => (deck ? listText(deck) : ''), [deck]);
  const [list, setList] = useState(initialList);
  const [busy, setBusy] = useState<string | null>(null);
  const info = formatInfo(format);
  const preview = useMemo(() => (list.trim() ? parseDeckList(list) : null), [list]);

  const save = async () => {
    if (!name.trim()) return toast('Dê um nome ao deck.', 'error');
    let cards = deck?.cards.filter((c) => c.category !== 'commander' && c.category !== 'partner') ?? [];
    let cmd = commander;
    let ptn = partner;
    let unresolved: string[] = [];
    if (list.trim() !== initialList.trim()) {
      if (list.trim()) {
        setBusy('Lendo lista…');
        try {
          const parsed = parseDeckList(list);
          const { resolved, unresolved: un } = await resolveEntries(mergeEntries(parsed.entries), (m) => setBusy(m));
          unresolved = un.map((u) => u.name);
          // Comandante/parceiro informados na lista.
          const cmdEntries = resolved.filter((r) => r.entry.section === 'commander');
          if (!cmd && cmdEntries[0]) cmd = cmdEntries[0].card;
          if (!ptn && cmdEntries[1]) ptn = cmdEntries[1].card;
          const ptnEntry = resolved.find((r) => r.entry.section === 'partner');
          if (!ptn && ptnEntry) ptn = ptnEntry.card;
          cards = buildDeckCards(
            resolved.filter((r) => r.entry.section !== 'commander' && r.entry.section !== 'partner'),
            deck?.cards ?? [],
          );
        } catch (e: any) {
          setBusy(null);
          return toast(e?.message ?? 'Falha ao ler a lista.', 'error');
        }
      } else cards = [];
    }
    setBusy(null);
    // Mantém vínculo com a coleção do comandante anterior se a carta for a mesma.
    const prevCmd = deck?.cards.find((c) => c.category === 'commander');
    const prevPtn = deck?.cards.find((c) => c.category === 'partner');
    const keep = (c: Card | undefined, prev: typeof prevCmd, category: 'commander' | 'partner') =>
      c ? [{ instanceId: prev?.instanceId ?? `dc-${category}-${Date.now().toString(36)}`, card: c, quantity: 1, category, collectionItemId: prev && prev.card.name === c.name ? prev.collectionItemId : undefined }] : [];
    const base = {
      name: name.trim(),
      format,
      description,
      commander: info.hasCommander || cmd ? cmd : undefined,
      partner: ptn,
      tags,
      cards: [...keep(cmd, prevCmd, 'commander'), ...keep(ptn, prevPtn, 'partner'), ...cards],
    };
    if (deck) {
      store.updateDeck(deck.id, (d) => normalizeDeck({ ...d, ...base }));
      toast('Deck atualizado.');
    } else {
      const created = store.createDeck(base);
      toast('Deck criado.');
      onSaved?.(created.id);
    }
    if (unresolved.length) toast(`Não encontradas: ${unresolved.slice(0, 5).join(', ')}${unresolved.length > 5 ? '…' : ''}`, 'error', 8000);
    onClose();
  };

  return (
    <Modal
      title={deck ? 'Editar deck' : 'Novo deck'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {busy && <span className="small muted row"><span className="spinner" /> {busy}</span>}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose} disabled={!!busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!!busy}>{deck ? 'Salvar alterações' : 'Criar deck'}</button>
        </>
      }
    >
      <div className="field-row">
        <div className="field"><label>Nome</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Atraxa Superfriends" autoFocus /></div>
        <div className="field">
          <label>Formato</label>
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value as DeckFormat)}>
            {FORMAT_LIST.map((f) => <option key={f.id} value={f.id}>{f.label} — meta {f.target}</option>)}
          </select>
        </div>
      </div>
      <div className="callout"><Info size={16} /><span><b>{info.label}:</b> {info.rule}</span></div>
      {info.hasCommander && (
        <div className="field-row">
          <CommanderPicker label="Comandante" value={commander} onChange={setCommander} />
          <CommanderPicker label="Parceiro (opcional)" value={partner} onChange={setPartner} />
        </div>
      )}
      <div className="field"><label>Descrição</label><textarea className="textarea" style={{ minHeight: 70 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Estratégia, combos, observações…" /></div>
      {store.data.tags.length > 0 && (
        <div className="field">
          <label>Tags</label>
          <div className="chips">
            {store.data.tags.map((t) => (
              <button type="button" key={t.id} className={`chip ${tags.includes(t.id) ? 'active' : ''}`} onClick={() => setTags((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}>
                <span className="tag-dot" style={{ background: t.color }} />{t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <label>{deck ? 'Lista do deck' : 'Colar lista (opcional)'}</label>
        <textarea className="textarea mono" style={{ minHeight: 180 }} value={list} onChange={(e) => setList(e.target.value)} placeholder={'1 Sol Ring (C21) 263\n4 Lightning Bolt\n1 Anel Solar\n\nSideboard\n2 Pyroblast'} />
        <span className="field-hint">
          Formato “Qtd Nome (SET) NUM”. Aceita Arena, Moxfield, LigaMagic e nomes em português. Seções: Commander, Deck, Sideboard, Maybeboard.
          {preview && ` · ${preview.entries.reduce((s, e) => s + e.quantity, 0)} cartas reconhecidas${preview.errors.length ? `, ${preview.errors.length} linha(s) ignorada(s)` : ''}`}
        </span>
      </div>
    </Modal>
  );
}
