// Resolve entradas de listas em cartas do Scryfall (inclui tradução de nomes em português).
import type { Card } from '../types/models.ts';
import { namesMatch } from '../types/cardRules.ts';
import type { ParsedEntry } from './importParser.ts';
import { getCardByName, getCollection, translatePtName, type Identifier } from './scryfall.ts';

export interface ResolvedEntry {
  entry: ParsedEntry;
  card: Card;
  translatedFrom?: string;
}

export interface ResolveResult {
  resolved: ResolvedEntry[];
  unresolved: ParsedEntry[];
}

export async function resolveEntries(entries: ParsedEntry[], onProgress?: (msg: string, pct: number) => void): Promise<ResolveResult> {
  const resolved: (ResolvedEntry | null)[] = entries.map(() => null);

  // 1) Lote por edição+número (quando informado) ou por nome.
  const ids: Identifier[] = entries.map((e) =>
    e.set && e.number ? { set: e.set, collector_number: e.number } : e.set ? { name: e.name.split(' // ')[0], set: e.set } : { name: e.name.split(' // ')[0] },
  );
  // Remove duplicados para economizar requisições.
  const uniqKey = (id: Identifier) => JSON.stringify(id).toLowerCase();
  const uniq = [...new Map(ids.map((id) => [uniqKey(id), id])).values()];
  onProgress?.('Consultando o Scryfall…', 5);
  const { found } = await getCollection(uniq, (d, t) => onProgress?.(`Consultando o Scryfall… ${d}/${t}`, 5 + (d / t) * 55));

  const match = (e: ParsedEntry): Card | undefined => {
    if (e.set && e.number) {
      const c = found.find((f) => f.setCode === e.set && f.collectorNumber?.toLowerCase() === e.number!.toLowerCase());
      if (c) return c;
    }
    if (e.set) {
      const c = found.find((f) => f.setCode === e.set && namesMatch(f.name, e.name));
      if (c) return c;
    }
    return found.find((f) => namesMatch(f.name, e.name));
  };
  entries.forEach((e, i) => {
    const c = match(e);
    if (c) resolved[i] = { entry: e, card: c };
  });

  // 2) Pendentes: tenta pelo nome (fuzzy) e depois traduz do português.
  const pending = entries.map((_e, i) => (resolved[i] ? -1 : i)).filter((i) => i >= 0);
  const cache = new Map<string, { card: Card | null; from?: string }>();
  let n = 0;
  for (const i of pending) {
    const e = entries[i];
    n++;
    onProgress?.(`Procurando “${e.name}”… (${n}/${pending.length})`, 60 + (n / pending.length) * 38);
    const key = e.name.toLowerCase();
    let hit = cache.get(key);
    if (!hit) {
      let card: Card | null = null;
      let from: string | undefined;
      const looksPt = /[ãõçáéíóúâêôà]/i.test(e.name) || /\b(de|do|da|dos|das|o|a)\b/i.test(e.name);
      if (!looksPt) card = await getCardByName(e.name, undefined).catch(() => null);
      if (!card) {
        const en = await translatePtName(e.name).catch(() => null);
        if (en) {
          card = await getCardByName(en).catch(() => null);
          from = e.name;
        }
      }
      if (!card && looksPt) card = await getCardByName(e.name).catch(() => null);
      hit = { card, from };
      cache.set(key, hit);
    }
    if (hit.card) resolved[i] = { entry: e, card: hit.card, translatedFrom: hit.from };
  }
  onProgress?.('Concluído', 100);
  return {
    resolved: resolved.filter((r): r is ResolvedEntry => !!r),
    unresolved: entries.filter((_, i) => !resolved[i]),
  };
}
