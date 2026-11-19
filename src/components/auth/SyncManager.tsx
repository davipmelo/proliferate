import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, HardDrive, Merge } from 'lucide-react';
import { onLocalChange, useStore } from '../../state/store.tsx';
import { openModal, toast } from '../../state/ui.tsx';
import { setAccount, syncActions } from '../../state/syncStatus.ts';
import { getFirebaseConfig } from '../../services/firebaseConfig.ts';

/**
 * Liga a sincronização com o Firebase quando há configuração.
 * O SDK do Firebase só é baixado se configurado — o app funciona 100% sem login.
 */
export function SyncManager() {
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const boot = async () => {
      cleanup?.();
      cleanup = null;
      const cfg = getFirebaseConfig();
      setAccount({ configured: !!cfg, ready: !cfg, user: null, sync: 'disabled' });
      if (!cfg) return;
      try {
        const fb = await import('../../services/firebase.ts');
        const { SyncEngine } = await import('../../services/sync.ts');
        if (disposed) return;
        let engine: InstanceType<typeof SyncEngine> | null = null;
        let offLocal: (() => void) | null = null;
        const offAuth = fb.watchAuth(async (user) => {
          engine?.dispose();
          offLocal?.();
          engine = null;
          if (!user) {
            setAccount({ user: null, sync: 'disabled', ready: true });
            syncActions.syncNow = undefined;
            syncActions.logout = undefined;
            return;
          }
          setAccount({ user: { uid: user.uid, email: user.email, username: user.displayName }, sync: 'idle', ready: true });
          engine = new SyncEngine(fb.initFirebase().db, user.uid, {
            getData: () => storeRef.current.data,
            getPrefs: () => storeRef.current.prefs,
            apply: (data, revision, prefs) => storeRef.current.replaceAll(data, { remote: true, revision, prefs }),
            applyPrefs: (prefs) => storeRef.current.replaceAll(storeRef.current.data, { remote: true, prefs }),
            askFirstSync,
            notify: (m, k) => toast(m, k, 7000),
          });
          const eng = engine;
          offLocal = onLocalChange((_d, prefs, rev) => eng.localChanged(rev === -1, prefs));
          syncActions.syncNow = () => eng.syncNow();
          syncActions.logout = async () => {
            await fb.logout();
            toast('Você saiu. Os dados continuam salvos neste navegador.', 'info');
          };
          eng.start().catch(() => undefined);
        });
        cleanup = () => {
          offAuth();
          engine?.dispose();
          offLocal?.();
        };
      } catch (e: any) {
        setAccount({ sync: 'error', error: e?.message ?? 'Falha ao iniciar o Firebase.', ready: true });
      }
    };

    boot();
    const onCfg = async () => {
      const fb = await import('../../services/firebase.ts').catch(() => null);
      cleanup?.();
      cleanup = null;
      await fb?.resetFirebase();
      boot();
    };
    window.addEventListener('proliferate:firebase-config', onCfg);
    return () => {
      disposed = true;
      cleanup?.();
      window.removeEventListener('proliferate:firebase-config', onCfg);
    };
  }, []);

  return null;
}

/** Primeiro sync com dados locais e na nuvem: pergunta o que fazer. */
function askFirstSync(): Promise<'merge' | 'cloud' | 'local'> {
  return new Promise((resolve) => {
    openModal((close) => {
      const pick = (v: 'merge' | 'cloud' | 'local') => {
        close();
        resolve(v);
      };
      return createPortal(
        <div className="modal-backdrop">
          <div className="modal modal-sm" role="dialog" aria-modal="true">
            <div className="modal-header"><h2>Dados no dispositivo e na nuvem</h2></div>
            <div className="modal-body">
              <p className="small muted">Esta conta já tem dados na nuvem e este navegador também tem dados. Como deseja continuar?</p>
              <button className="preset" onClick={() => pick('merge')}><b className="row"><Merge size={16} /> Mesclar os dois</b><small>Soma as coleções e junta decks e fila (recomendado).</small></button>
              <button className="preset" onClick={() => pick('cloud')}><b className="row"><Cloud size={16} /> Usar os dados da nuvem</b><small>Substitui os dados deste navegador.</small></button>
              <button className="preset" onClick={() => pick('local')}><b className="row"><HardDrive size={16} /> Enviar os dados deste navegador</b><small>Substitui os dados da nuvem.</small></button>
            </div>
          </div>
        </div>,
        document.body,
      );
    });
  });
}
