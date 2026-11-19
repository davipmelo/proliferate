// Estado de sincronização/conta (leve, sem importar o Firebase).
import { useSyncExternalStore } from 'react';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'disabled';

export interface AccountState {
  user: { uid: string; email?: string | null; username?: string | null } | null;
  sync: SyncState;
  lastSyncedAt?: number;
  error?: string;
  configured: boolean;
  ready: boolean;
}

let state: AccountState = { user: null, sync: 'disabled', configured: false, ready: false };
const subs = new Set<() => void>();

export function getAccount(): AccountState {
  return state;
}

export function setAccount(patch: Partial<AccountState>): void {
  state = { ...state, ...patch };
  subs.forEach((s) => s());
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => state,
  );
}

export const SYNC_LABELS: Record<SyncState, string> = {
  idle: 'Ocioso',
  syncing: 'Sincronizando…',
  synced: 'Sincronizado',
  error: 'Erro na sincronização',
  offline: 'Offline',
  disabled: 'Somente neste dispositivo',
};

/** Ações registradas pelo módulo de sincronização (carregado sob demanda). */
export const syncActions: {
  syncNow?: () => Promise<void>;
  logout?: () => Promise<void>;
} = {};
