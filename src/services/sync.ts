// Motor de sincronização com o Firestore (carregado sob demanda).
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, runTransaction, setDoc, writeBatch, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import type { AppData, Preferences } from '../types/models.ts';
import { SCHEMA_VERSION } from '../types/models.ts';
import { decodePayload, encodePayload, sha256Hex } from './cloudCodec.ts';
import { packAppData, unpackAppData, type PackedData } from './normalize.ts';
import { loadMeta, saveMeta } from './storage.ts';
import { mergeData } from './backup.ts';
import { setAccount, getAccount } from '../state/syncStatus.ts';

export const DEBOUNCE_MS = 2000;
export const MAX_WAIT_MS = 10000;

/** Id desta sessão do cliente (evita reagir às próprias gravações). */
const CLIENT_ID = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface RemoteMeta {
  revision: number;
  clientId: string;
  updatedAt: number;
  hash: string;
  data?: string;
  chunkSet?: string;
  chunkCount?: number;
  imageHashes?: string[];
  prefs?: Partial<Preferences>;
  prefsUpdatedAt?: number;
  schemaVersion?: number;
}

export interface SyncHost {
  getData: () => AppData;
  getPrefs: () => Preferences;
  apply: (data: AppData, revision: number, prefs?: Partial<Preferences>) => void;
  applyPrefs: (prefs: Partial<Preferences>) => void;
  /** Pergunta ao usuário como resolver o primeiro sync com dados nos dois lados. */
  askFirstSync: () => Promise<'merge' | 'cloud' | 'local'>;
  notify: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}

/** JSON com chaves ordenadas (comparação estável de preferências). */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** Preferências que não fazem sentido sincronizar. */
function syncablePrefs(p: Preferences): Partial<Preferences> {
  const { lastTab, ...rest } = p;
  void lastTab;
  return rest;
}

export class SyncEngine {
  private db: Firestore;
  private uid: string;
  private host: SyncHost;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPending = 0;
  private running: Promise<void> | null = null;
  private again = false;
  private unsub: Unsubscribe | null = null;
  private retries = 0;
  private prefsDirty = false;
  private disposed = false;
  private lastPrefsJson = '';

  constructor(db: Firestore, uid: string, host: SyncHost) {
    this.db = db;
    this.uid = uid;
    this.host = host;
  }

  private metaRef() {
    return doc(this.db, 'userData', this.uid);
  }

  async start(): Promise<void> {
    this.lastPrefsJson = stableJson(syncablePrefs(this.host.getPrefs()));
    await this.syncNow(true);
    this.unsub = onSnapshot(
      this.metaRef(),
      (snap) => {
        if (!snap.exists() || snap.metadata.hasPendingWrites) return;
        const m = snap.data() as RemoteMeta;
        if (m.clientId === CLIENT_ID) return;
        const meta = loadMeta();
        if (m.prefs && (m.prefsUpdatedAt ?? 0) > (meta.prefsSyncedAt ?? 0)) {
          meta.prefsSyncedAt = m.prefsUpdatedAt;
          saveMeta(meta);
          this.lastPrefsJson = stableJson(m.prefs);
          this.host.applyPrefs(m.prefs);
        }
        if (m.revision > (meta.lastSyncedRevision ?? 0) && m.hash !== meta.lastSyncedHash) this.schedule(0);
      },
      () => setAccount({ sync: navigator.onLine ? 'error' : 'offline' }),
    );
    window.addEventListener('focus', this.onWake);
    window.addEventListener('online', this.onWake);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  dispose(): void {
    this.disposed = true;
    this.unsub?.();
    if (this.timer) clearTimeout(this.timer);
    window.removeEventListener('focus', this.onWake);
    window.removeEventListener('online', this.onWake);
    window.removeEventListener('offline', this.onOffline);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private onWake = () => {
    if (navigator.onLine) this.schedule(300);
  };
  private onOffline = () => setAccount({ sync: 'offline' });
  private onVisible = () => {
    if (document.visibilityState === 'visible') this.onWake();
  };

  /** Mudança local: debounce de 2 s, no máximo 10 s em edição contínua. */
  localChanged(prefsOnly = false, prefs?: Preferences): void {
    if (prefsOnly) {
      const json = stableJson(syncablePrefs(prefs ?? this.host.getPrefs()));
      if (json === this.lastPrefsJson) return;
      this.prefsDirty = true;
    }
    this.schedule(DEBOUNCE_MS);
  }

  private schedule(delay: number): void {
    if (this.disposed) return;
    const now = Date.now();
    if (!this.firstPending) this.firstPending = now;
    const wait = Math.max(0, Math.min(delay, this.firstPending + MAX_WAIT_MS - now));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.firstPending = 0;
      this.syncNow().catch(() => undefined);
    }, wait);
  }

  /** Executa um ciclo de sincronização (enfileira se já houver um em andamento). */
  async syncNow(initial = false): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        if (!navigator.onLine) {
          setAccount({ sync: 'offline' });
          return;
        }
        setAccount({ sync: 'syncing', error: undefined });
        await this.cycle(initial);
        this.retries = 0;
        setAccount({ sync: 'synced', lastSyncedAt: Date.now() });
      } catch (e: any) {
        if (e?.code === 'stale') {
          setAccount({ sync: 'syncing' });
          return;
        }
        console.error('Sync', e);
        const msg = e?.code === 'permission-denied' ? 'Permissão negada pelo Firestore (verifique o firestore.rules).' : e?.message ?? 'Falha na sincronização.';
        setAccount({ sync: navigator.onLine ? 'error' : 'offline', error: msg });
        // Nova tentativa com espera exponencial.
        if (this.retries < 5) {
          const delay = Math.min(60000, 2000 * 2 ** this.retries++);
          setTimeout(() => !this.disposed && this.syncNow().catch(() => undefined), delay);
        }
        throw e;
      } finally {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.schedule(200);
        }
      }
    })();
    return this.running;
  }

  private async cycle(initial: boolean): Promise<void> {
    const meta = loadMeta();
    const sameAccount = meta.uid === this.uid;
    const data = this.host.getData();
    const packed = packAppData(data);
    const localHash = await sha256Hex(JSON.stringify(packed));
    const snap = await getDoc(this.metaRef());
    const remote = snap.exists() ? (snap.data() as RemoteMeta) : null;
    const localDirty = !sameAccount || localHash !== meta.lastSyncedHash;
    const isEmpty = !data.collection.length && !data.decks.length && !data.proxies.length;

    if (!remote) {
      if (!isEmpty || this.prefsDirty || initial) await this.push(packed, localHash, null);
      return;
    }

    const remoteChanged = !sameAccount || remote.revision > (meta.lastSyncedRevision ?? -1) || remote.hash !== meta.lastSyncedHash;

    // Primeiro sync desta conta neste dispositivo com dados nos dois lados.
    if (!sameAccount && !isEmpty && remote.hash !== localHash) {
      const choice = await this.host.askFirstSync();
      if (choice === 'cloud') return this.pull(remote);
      if (choice === 'local') return this.push(packed, localHash, remote);
      const remoteData = await this.download(remote);
      const merged = mergeData(remoteData, data);
      this.host.apply(merged, remote.revision);
      const mp = packAppData(merged);
      return this.push(mp, await sha256Hex(JSON.stringify(mp)), remote);
    }

    if (remoteChanged && remote.hash !== localHash) {
      if (!localDirty || isEmpty) return this.pull(remote);
      // Conflito: os dois lados mudaram. O mais novo vence; o outro vira backup local.
      if ((remote.updatedAt ?? 0) > (meta.updatedAt ?? 0)) {
        try {
          localStorage.setItem('proliferate:conflict-backup', JSON.stringify({ savedAt: Date.now(), data: packed }));
        } catch {
          /* sem espaço */
        }
        this.host.notify('A nuvem tinha alterações mais novas. Sua versão local foi guardada como backup de conflito.', 'info');
        return this.pull(remote);
      }
      return this.push(packed, localHash, remote);
    }

    if (localDirty || this.prefsDirty) await this.push(packed, localHash, remote);
    else saveMeta({ ...meta, lastSyncedRevision: remote.revision, lastSyncedHash: remote.hash, uid: this.uid });
  }

  private async download(remote: RemoteMeta): Promise<AppData> {
    let chunks: string[] | undefined;
    if (!remote.data && remote.chunkSet) {
      const docs = await Promise.all(
        Array.from({ length: remote.chunkCount ?? 0 }, (_, i) => getDoc(doc(this.db, 'userData', this.uid, 'chunks', `${remote.chunkSet}_${i}`))),
      );
      chunks = docs.map((d) => {
        if (!d.exists()) throw new Error('Pedaço de dados ausente na nuvem; tente novamente.');
        return (d.data() as { data: string }).data;
      });
    }
    const images: Record<string, string> = {};
    await Promise.all(
      (remote.imageHashes ?? []).map(async (h) => {
        const d = await getDoc(doc(this.db, 'userData', this.uid, 'images', h));
        if (d.exists()) images[h] = (d.data() as { data: string }).data;
      }),
    );
    const packed = await decodePayload<PackedData>({ data: remote.data, chunks }, images);
    return unpackAppData(packed);
  }

  private async pull(remote: RemoteMeta): Promise<void> {
    const data = await this.download(remote);
    const packed = packAppData(data);
    const hash = await sha256Hex(JSON.stringify(packed));
    this.host.apply(data, remote.revision, remote.prefs);
    if (remote.prefs) this.lastPrefsJson = stableJson(remote.prefs);
    saveMeta({ ...loadMeta(), revision: remote.revision, lastSyncedRevision: remote.revision, lastSyncedHash: hash, uid: this.uid, prefsSyncedAt: remote.prefsUpdatedAt ?? 0 });
  }

  private async push(packed: PackedData, hash: string, remote: RemoteMeta | null): Promise<void> {
    const enc = await encodePayload(packed);
    const meta = loadMeta();
    const imageHashes = Object.keys(enc.images);
    // 1) Imagens novas (cada uma num documento próprio).
    const existing = new Set(remote?.imageHashes ?? []);
    for (const h of imageHashes) {
      if (existing.has(h)) continue;
      const data = enc.images[h];
      if (data && data.length < 1_000_000) await setDoc(doc(this.db, 'userData', this.uid, 'images', h), { data });
    }
    // 2) Pedaços (quando não cabe num documento só).
    let chunkSet: string | undefined;
    if (enc.chunks) {
      chunkSet = `s${Date.now().toString(36)}`;
      for (let i = 0; i < enc.chunks.length; i += 8) {
        const batch = writeBatch(this.db);
        enc.chunks.slice(i, i + 8).forEach((c, j) => batch.set(doc(this.db, 'userData', this.uid, 'chunks', `${chunkSet}_${i + j}`), { data: c }));
        await batch.commit();
      }
    }
    // 3) Documento principal em transação: nunca sobrescreve uma revisão mais nova.
    const prefs = syncablePrefs(this.host.getPrefs());
    const prefsUpdatedAt = Date.now();
    let newRev = 0;
    await runTransaction(this.db, async (tx) => {
      const cur = await tx.get(this.metaRef());
      const curMeta = cur.exists() ? (cur.data() as RemoteMeta) : null;
      if (curMeta && remote && curMeta.revision !== remote.revision && curMeta.clientId !== CLIENT_ID) {
        throw Object.assign(new Error('A nuvem mudou durante o envio; sincronizando novamente.'), { code: 'stale' });
      }
      if (curMeta && !remote) throw Object.assign(new Error('Dados criados em outro dispositivo; sincronizando novamente.'), { code: 'stale' });
      newRev = Math.max(meta.revision, (curMeta?.revision ?? 0) + 1);
      const next: RemoteMeta = {
        revision: newRev,
        clientId: CLIENT_ID,
        updatedAt: Date.now(),
        hash,
        chunkCount: enc.chunks?.length ?? 0,
        imageHashes,
        prefs,
        prefsUpdatedAt,
        schemaVersion: SCHEMA_VERSION,
      };
      if (enc.data) next.data = enc.data;
      if (chunkSet) next.chunkSet = chunkSet;
      tx.set(this.metaRef(), next);
    }).catch((e) => {
      if (e?.code === 'stale') this.again = true;
      throw e;
    });
    this.prefsDirty = false;
    this.lastPrefsJson = stableJson(prefs);
    saveMeta({ ...loadMeta(), revision: newRev, lastSyncedRevision: newRev, lastSyncedHash: hash, uid: this.uid, prefsSyncedAt: prefsUpdatedAt });
    // 4) Limpeza de pedaços antigos (melhor esforço).
    this.cleanupChunks(chunkSet).catch(() => undefined);
  }

  private async cleanupChunks(keep?: string): Promise<void> {
    const all = await getDocs(collection(this.db, 'userData', this.uid, 'chunks'));
    await Promise.all(all.docs.filter((d) => !keep || !d.id.startsWith(keep + '_')).map((d) => deleteDoc(d.ref)));
  }
}

export function currentUid(): string | undefined {
  return getAccount().user?.uid;
}
