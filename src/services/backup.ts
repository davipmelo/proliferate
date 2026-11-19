// Backup completo e restauração (substituir ou mesclar) — lógica pura.
import type { AppData, Backup, CollectionItem, Deck, DeckTag, Preferences, ProxyItem } from '../types/models.ts';
import { SCHEMA_VERSION } from '../types/models.ts';
import { sameArt } from '../types/cardRules.ts';
import { normalizeAppData, uid } from './normalize.ts';

export function createBackup(data: AppData, preferences?: Partial<Preferences>): Backup {
  return {
    app: 'proliferate',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...data,
    preferences,
  };
}

/** Lê e valida um backup (aceita também formatos antigos e arquivos só de deck/coleção). */
export function parseBackup(text: string): { data: AppData; preferences?: Partial<Preferences>; schemaVersion: number } {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Arquivo inválido: não é um JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('Arquivo de backup vazio.');
  if (raw.type === 'deck' && raw.deck) raw = { decks: [raw.deck] };
  else if (raw.type === 'collection' && raw.collection) raw = { collection: raw.collection };
  if (!['collection', 'decks', 'proxies', 'proxyQueue', 'tags', 'deckTags'].some((k) => Array.isArray(raw[k]))) {
    throw new Error('Este arquivo não parece ser um backup do Proliferate.');
  }
  return { data: normalizeAppData(raw), preferences: raw.preferences, schemaVersion: Number(raw.schemaVersion) || 1 };
}

const sameItem = (a: CollectionItem, b: CollectionItem) =>
  sameArt(a.card, b.card) && a.isFoil === b.isFoil && a.condition === b.condition && a.language === b.language;

/**
 * Mescla dados importados nos atuais: soma quantidades de itens iguais da coleção e da fila,
 * reaproveita tags com o mesmo nome e evita ids duplicados (remapeando vínculos).
 */
export function mergeData(current: AppData, incoming: AppData): AppData {
  // Tags
  const tags: DeckTag[] = current.tags.slice();
  const tagMap = new Map<string, string>();
  for (const t of incoming.tags) {
    const existing = tags.find((x) => x.name.toLowerCase() === t.name.toLowerCase());
    if (existing) tagMap.set(t.id, existing.id);
    else {
      const id = tags.some((x) => x.id === t.id) ? uid('tag') : t.id;
      tags.push({ ...t, id });
      tagMap.set(t.id, id);
    }
  }

  // Coleção
  const collection: CollectionItem[] = current.collection.slice();
  const colMap = new Map<string, string>();
  for (const it of incoming.collection) {
    const idx = collection.findIndex((c) => sameItem(c, it));
    if (idx >= 0) {
      collection[idx] = { ...collection[idx], quantity: collection[idx].quantity + it.quantity, tags: [...new Set([...collection[idx].tags, ...it.tags])] };
      colMap.set(it.id, collection[idx].id);
    } else {
      const id = collection.some((c) => c.id === it.id) ? uid('col') : it.id;
      collection.push({ ...it, id });
      colMap.set(it.id, id);
    }
  }

  // Decks
  const decks: Deck[] = current.decks.slice();
  for (const d of incoming.decks) {
    const same = decks.find((x) => x.id === d.id);
    if (same && same.updatedAt === d.updatedAt) continue; // já existe idêntico
    const id = same ? uid('deck') : d.id;
    decks.push({
      ...d,
      id,
      tags: d.tags.map((t) => tagMap.get(t) ?? t),
      cards: d.cards.map((c) => ({ ...c, collectionItemId: c.collectionItemId ? colMap.get(c.collectionItemId) ?? c.collectionItemId : undefined })),
    });
  }

  // Fila de proxies
  const proxies: ProxyItem[] = current.proxies.slice();
  for (const p of incoming.proxies) {
    const idx = proxies.findIndex((x) => sameArt(x.card, p.card));
    if (idx >= 0) proxies[idx] = { ...proxies[idx], quantity: proxies[idx].quantity + p.quantity };
    else proxies.push({ ...p, id: proxies.some((x) => x.id === p.id) ? uid('px') : p.id });
  }

  return { collection, decks, proxies, tags };
}

export function backupSummary(d: AppData): string {
  const cards = d.collection.reduce((s, i) => s + i.quantity, 0);
  return `${cards} carta(s) na coleção (${d.collection.length} itens), ${d.decks.length} deck(s), ${d.proxies.length} item(ns) na fila e ${d.tags.length} tag(s)`;
}
