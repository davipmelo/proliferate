import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, Card, Deck, DeckCard, DeckCategory, DeckTag, Preferences, ProxyItem, TokenCard } from '../types/models.ts';
import { sameArt } from '../types/cardRules.ts';
import { deriveCollection, mapEntryInDecks, type CollectionEntry } from '../services/collection.ts';
import { DEFAULT_PREFS, PROXY_SETTINGS_VERSION, loadData, loadMeta, loadPrefs, QuotaError, saveData, saveMeta, savePrefs } from '../services/storage.ts';
import { normalizeDeck, uid } from '../services/normalize.ts';
import { toast } from './ui.tsx';

type Updater<T> = (prev: T) => T;

export interface Store {
  data: AppData;
  prefs: Preferences;
  /** Coleção derivada dos decks (cartas dos decks agrupadas pela mesma arte). */
  collection: CollectionEntry[];
  /** Incrementado a cada alteração local (usado pela sincronização). */
  revision: number;
  update: (fn: Updater<AppData>) => void;
  /** Substitui tudo (restauração/sincronização) sem gerar nova revisão local se `remote`. */
  replaceAll: (data: AppData, opts?: { remote?: boolean; revision?: number; prefs?: Partial<Preferences> }) => void;
  setPrefs: (p: Partial<Preferences>) => void;
  // Coleção (age sobre todas as cópias nos decks)
  replaceEntryCard: (key: string, card: Card) => void;
  removeEntries: (keys: string[]) => void;
  // Decks
  createDeck: (deck: Partial<Deck>) => Deck;
  updateDeck: (id: string, fn: Updater<Deck>) => void;
  deleteDeck: (id: string) => void;
  addCardToDeck: (deckId: string, card: Card, opts?: { quantity?: number; category?: DeckCategory; isFoil?: boolean }) => void;
  // Proxies
  addToProxies: (cards: { card: Card | TokenCard; quantity?: number }[]) => void;
  updateProxies: (fn: Updater<ProxyItem[]>) => void;
  // Tags
  setTags: (fn: Updater<DeckTag[]>) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider ausente');
  return s;
}

/** Ouvintes externos (sincronização) de mudanças locais. */
type Listener = (data: AppData, prefs: Preferences, revision: number) => void;
const listeners = new Set<Listener>();
export function onLocalChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData());
  const [prefs, setPrefsState] = useState<Preferences>(() => loadPrefs());
  const [revision, setRevision] = useState<number>(() => loadMeta().revision);
  const dataRef = useRef(data);
  dataRef.current = data;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const localChange = useRef(false);

  // Persistência com debounce curto.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        saveData(data);
      } catch (e) {
        toast(e instanceof QuotaError ? e.message : 'Falha ao salvar no navegador.', 'error');
      }
    }, 250);
    return () => clearTimeout(t);
  }, [data]);

  useEffect(() => savePrefs(prefs), [prefs]);

  // Revisão local: cada mudança feita pelo usuário incrementa e notifica a sincronização.
  useEffect(() => {
    if (!localChange.current) return;
    localChange.current = false;
    const meta = loadMeta();
    const rev = meta.revision + 1;
    setRevision(rev);
    saveMeta({ ...meta, revision: rev, updatedAt: Date.now() });
    listeners.forEach((l) => l(data, prefsRef.current, rev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const update = useCallback((fn: Updater<AppData>) => {
    localChange.current = true;
    setData((prev) => fn(prev));
  }, []);

  const replaceAll = useCallback<Store['replaceAll']>((next, opts) => {
    if (opts?.remote) {
      localChange.current = false;
      if (opts.revision != null) {
        setRevision(opts.revision);
        saveMeta({ ...loadMeta(), revision: opts.revision, updatedAt: Date.now() });
      }
    } else {
      localChange.current = true;
    }
    setData(next);
    if (opts?.prefs) {
      // Configurações de proxy remotas de versões antigas não sobrescrevem o novo padrão.
      const { proxySettings: remoteProxy, proxySettingsVersion: remoteVer, ...rest } = opts.prefs;
      const useRemote = (remoteVer ?? 0) >= PROXY_SETTINGS_VERSION;
      setPrefsState((p) => ({ ...p, ...rest, proxySettings: useRemote ? { ...p.proxySettings, ...(remoteProxy ?? {}) } : p.proxySettings }));
    }
  }, []);

  const setPrefs = useCallback((p: Partial<Preferences>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...p };
      // Preferências também sincronizam (sem alterar dados).
      queueMicrotask(() => listeners.forEach((l) => l(dataRef.current, next, -1)));
      return next;
    });
  }, []);

  const collection = useMemo(() => deriveCollection(data.decks), [data.decks]);

  const store = useMemo<Store>(() => {
    return {
      data,
      prefs,
      collection,
      revision,
      update,
      replaceAll,
      setPrefs,
      replaceEntryCard: (key, card) => update((d) => ({ ...d, decks: mapEntryInDecks(d.decks, key, (old) => ({ ...card, isFoil: old.isFoil })) })),
      removeEntries: (keys) => update((d) => ({ ...d, decks: keys.reduce((ds, k) => mapEntryInDecks(ds, k, () => null), d.decks) })),
      createDeck: (partial) => {
        const deck = normalizeDeck({ ...partial, id: uid('deck'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        update((d) => ({ ...d, decks: [deck, ...d.decks] }));
        return deck;
      },
      updateDeck: (id, fn) =>
        update((d) => ({
          ...d,
          decks: d.decks.map((dk) => (dk.id === id ? { ...fn(dk), updatedAt: new Date().toISOString() } : dk)),
        })),
      deleteDeck: (id) => update((d) => ({ ...d, decks: d.decks.filter((dk) => dk.id !== id) })),
      addCardToDeck: (deckId, card, opts = {}) => {
        const qty = opts.quantity ?? 1;
        const category = opts.category ?? 'main';
        update((d) => ({
          ...d,
          decks: d.decks.map((dk) => {
            if (dk.id !== deckId) return dk;
            const cards = dk.cards.slice();
            const idx = cards.findIndex((c) => c.category === category && sameArt(c.card, card) && !!c.isFoil === !!opts.isFoil);
            if (idx >= 0) cards[idx] = { ...cards[idx], quantity: cards[idx].quantity + qty };
            else cards.push({ instanceId: uid('dc'), card, quantity: qty, category, isFoil: opts.isFoil || undefined } as DeckCard);
            const patch: Partial<Deck> = {};
            if (category === 'commander') patch.commander = card;
            if (category === 'partner') patch.partner = card;
            return { ...dk, ...patch, cards, updatedAt: new Date().toISOString() };
          }),
        }));
      },
      addToProxies: (cards) =>
        update((d) => {
          const proxies = d.proxies.slice();
          for (const { card, quantity = 1 } of cards) {
            const idx = proxies.findIndex((p) => sameArt(p.card, card));
            if (idx >= 0) proxies[idx] = { ...proxies[idx], quantity: proxies[idx].quantity + quantity };
            else proxies.push({ id: uid('px'), card, quantity });
          }
          return { ...d, proxies };
        }),
      updateProxies: (fn) => update((d) => ({ ...d, proxies: fn(d.proxies) })),
      setTags: (fn) => update((d) => ({ ...d, tags: fn(d.tags) })),
    };
  }, [data, prefs, collection, revision, update, replaceAll, setPrefs]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export { DEFAULT_PREFS };
