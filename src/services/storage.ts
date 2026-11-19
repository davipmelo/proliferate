// Persistência no localStorage (dados empacotados + preferências).
import type { AppData, Preferences, ProxySettings } from '../types/models.ts';
import { normalizeAppData, packAppData, unpackAppData } from './normalize.ts';
import { PROXY_PRESETS } from './proxyLayout.ts';

const DATA_KEY = 'proliferate:data:v2';
const PREFS_KEY = 'proliferate:prefs:v2';
const META_KEY = 'proliferate:meta:v2';
/** Chaves de versões antigas que tentamos migrar no primeiro uso. */
const LEGACY_KEYS = ['proliferate-data', 'mtg-manager-data', 'dms-mtg-data'];

/** Padrão = preset Guilhotina (rodapé ligado, sem recorte de sangria). */
export const DEFAULT_PROXY_SETTINGS: ProxySettings = { ...PROXY_PRESETS[0].values, footer: true, trimBleed: false };
/** Versão das configurações de proxy; ao subir, as preferências salvas voltam ao padrão. */
export const PROXY_SETTINGS_VERSION = 2;

export const DEFAULT_PREFS: Preferences = {
  decksView: 'list',
  collectionView: 'list',
  utilitiesView: 'grid',
  deckEditorView: 'list',
  gridSize: 170,
  showDetails: true,
  deckGroupMode: 'none',
  showFoil: true,
  proxySettings: DEFAULT_PROXY_SETTINGS,
  proxySettingsVersion: PROXY_SETTINGS_VERSION,
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
    // Configurações de proxy de uma versão anterior voltam ao novo padrão (Guilhotina).
    const fresh = (p.proxySettingsVersion ?? 0) < PROXY_SETTINGS_VERSION;
    return {
      ...DEFAULT_PREFS,
      ...p,
      proxySettings: fresh ? DEFAULT_PROXY_SETTINGS : { ...DEFAULT_PROXY_SETTINGS, ...(p.proxySettings ?? {}) },
      proxySettingsVersion: PROXY_SETTINGS_VERSION,
    };
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
