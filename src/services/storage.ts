// Persistência no localStorage (dados empacotados + preferências).
import type { AppData, Preferences, ProxySettings } from '../types/models.ts';
import { normalizeAppData, packAppData, unpackAppData } from './normalize.ts';

const DATA_KEY = 'proliferate:data:v2';
const PREFS_KEY = 'proliferate:prefs:v2';
const META_KEY = 'proliferate:meta:v2';
/** Chaves de versões antigas que tentamos migrar no primeiro uso. */
const LEGACY_KEYS = ['proliferate-data', 'mtg-manager-data', 'dms-mtg-data'];

export const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  cutLines: true,
  cutLineColor: '#9a9a9a',
  cutLineWidth: 0.2,
  cutLineStyle: 'solid',
  cropMarks: true,
  cropMarkColor: '#000000',
  cropMarkWidth: 0.25,
  cropMarkLength: 8,
  rulers: false,
  cornerCrosses: false,
  cornerFill: 'black',
  footer: true,
  trimBleed: true,
};

export const DEFAULT_PREFS: Preferences = {
  decksView: 'list',
  collectionView: 'list',
  utilitiesView: 'grid',
  deckEditorView: 'list',
  gridSize: 170,
  showDetails: true,
  deckGroupBy: 'type',
  proxySettings: DEFAULT_PROXY_SETTINGS,
  lastTab: 'decks',
};

export function emptyData(): AppData {
  return { collection: [], decks: [], proxies: [], tags: [] };
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadData(): AppData {
  const raw = safeGet(DATA_KEY);
  if (raw) {
    try {
      return unpackAppData(JSON.parse(raw));
    } catch (e) {
      console.error('Dados locais corrompidos', e);
    }
  }
  for (const k of LEGACY_KEYS) {
    const legacy = safeGet(k);
    if (!legacy) continue;
    try {
      return normalizeAppData(JSON.parse(legacy));
    } catch {
      /* ignora */
    }
  }
  return emptyData();
}

export class QuotaError extends Error {}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(packAppData(data)));
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError' || /quota/i.test(String(e?.message))) {
      throw new QuotaError('Espaço do navegador esgotado. Faça um backup e remova imagens próprias grandes.');
    }
    throw e;
  }
}

export function loadPrefs(): Preferences {
  try {
    const p = JSON.parse(safeGet(PREFS_KEY) || '{}');
    return { ...DEFAULT_PREFS, ...p, proxySettings: { ...DEFAULT_PROXY_SETTINGS, ...(p.proxySettings ?? {}) } };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Preferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignora */
  }
}

/** Metadados de sincronização (revisão local, atualização). */
export interface SyncMeta {
  revision: number;
  updatedAt: number;
  lastSyncedHash?: string;
  lastSyncedRevision?: number;
  /** Conta (uid) com a qual os dados locais foram sincronizados pela última vez. */
  uid?: string;
  prefsSyncedAt?: number;
}

export function loadMeta(): SyncMeta {
  try {
    return { revision: 0, updatedAt: 0, ...JSON.parse(safeGet(META_KEY) || '{}') };
  } catch {
    return { revision: 0, updatedAt: 0 };
  }
}

export function saveMeta(m: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignora */
  }
}

/** Preferência genérica por chave (tamanho de grade de uma aba, etc.). */
export function getLocal<T>(key: string, fallback: T): T {
  try {
    const v = safeGet('proliferate:' + key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function setLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem('proliferate:' + key, JSON.stringify(value));
  } catch {
    /* ignora */
  }
}
