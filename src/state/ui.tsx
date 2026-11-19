// Infra de interface global: toasts, pilha de modais e preview ampliado da carta.
import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (next: T | ((p: T) => T)) => {
      state = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      subs.forEach((s) => s());
    },
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

// ---------- Toasts ----------
type ToastKind = 'success' | 'error' | 'info';
interface ToastMsg {
  id: number;
  text: string;
  kind: ToastKind;
  count: number;
}
const toasts = createStore<ToastMsg[]>([]);
let toastId = 0;

const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function toast(text: string, kind: ToastKind = 'success', ms = 3200): void {
  // Mensagens iguais em sequência viram um único toast com contador.
  const same = toasts.get().find((t) => t.text === text && t.kind === kind);
  const id = same?.id ?? ++toastId;
  if (same) toasts.set((t) => t.map((x) => (x.id === id ? { ...x, count: x.count + 1 } : x)));
  else toasts.set((t) => [...t.slice(-3), { id, text, kind, count: 1 }]);
  clearTimeout(toastTimers.get(id));
  toastTimers.set(id, setTimeout(() => {
    toastTimers.delete(id);
    toasts.set((t) => t.filter((x) => x.id !== id));
  }, ms));
}

function Toasts() {
  const list = useSyncExternalStore(toasts.subscribe, toasts.get);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.kind === 'success' ? <CheckCircle2 size={16} /> : t.kind === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
          <span>{t.text}</span>
          {t.count > 1 && <b className="toast-count">×{t.count}</b>}
          <button className="btn btn-ghost btn-icon btn-xs" aria-label="Fechar" onClick={() => toasts.set((x) => x.filter((m) => m.id !== t.id))}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Modais ----------
type ModalRender = (close: () => void) => ReactNode;
const modals = createStore<{ id: number; render: ModalRender }[]>([]);
let modalId = 0;

/** Abre um modal em qualquer lugar do app. Retorna a função que o fecha. */
export function openModal(render: ModalRender): () => void {
  const id = ++modalId;
  const close = () => modals.set((m) => m.filter((x) => x.id !== id));
  modals.set((m) => [...m, { id, render }]);
  return close;
}

function ModalHost() {
  const list = useSyncExternalStore(modals.subscribe, modals.get);
  return (
    <>
      {list.map((m) => (
        <Fragment key={m.id}>{m.render(() => modals.set((x) => x.filter((y) => y.id !== m.id)))}</Fragment>
      ))}
    </>
  );
}

/** Confirmação simples baseada em modal (retorna Promise<boolean>). */
export function confirmDialog(opts: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    openModal((close) => (
      <ConfirmModal
        {...opts}
        onAnswer={(v) => {
          close();
          resolve(v);
        }}
      />
    ));
  });
}

function ConfirmModal(p: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onAnswer: (v: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onAnswer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onAnswer(false)}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label={p.title}>
        <div className="modal-header">
          <h2>{p.title}</h2>
        </div>
        <div className="modal-body">{p.message}</div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => p.onAnswer(false)}>
            Cancelar
          </button>
          <button className={`btn ${p.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus onClick={() => p.onAnswer(true)}>
            {p.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------- Preview ampliado ----------
interface PreviewState {
  url: string | null;
  back?: string;
  x: number;
  y: number;
}
const preview = createStore<PreviewState>({ url: null, x: 0, y: 0 });
const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export function showPreview(url: string | undefined, e: { clientX: number; clientY: number }, back?: string): void {
  if (!canHover || !url) return;
  preview.set({ url, back, x: e.clientX, y: e.clientY });
}
export function movePreview(e: { clientX: number; clientY: number }): void {
  if (!canHover || !preview.get().url) return;
  preview.set((p) => ({ ...p, x: e.clientX, y: e.clientY }));
}
export function hidePreview(): void {
  if (preview.get().url) preview.set({ url: null, x: 0, y: 0 });
}

/** Props prontas para ligar o preview a um elemento. */
export function previewProps(url: string | undefined, back?: string) {
  return {
    onMouseEnter: (e: React.MouseEvent) => showPreview(url, e, back),
    onMouseMove: movePreview,
    onMouseLeave: hidePreview,
  };
}

function PreviewLayer() {
  const p = useSyncExternalStore(preview.subscribe, preview.get);
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const r = () => setVw(window.innerWidth);
    window.addEventListener('resize', r);
    window.addEventListener('scroll', hidePreview, true);
    // Qualquer clique, troca de aba ou tecla fecha o preview (a linha sob o mouse pode ter sumido).
    window.addEventListener('pointerdown', hidePreview, true);
    window.addEventListener('keydown', hidePreview, true);
    window.addEventListener('proliferate:tab', hidePreview);
    return () => {
      window.removeEventListener('resize', r);
      window.removeEventListener('scroll', hidePreview, true);
      window.removeEventListener('pointerdown', hidePreview, true);
      window.removeEventListener('keydown', hidePreview, true);
      window.removeEventListener('proliferate:tab', hidePreview);
    };
  }, []);
  if (!p.url) return null;
  const w = p.back ? 656 : 324;
  const h = 452;
  const left = p.x + 24 + w > vw ? p.x - w - 24 : p.x + 24;
  const top = Math.max(8, Math.min(window.innerHeight - h - 8, p.y - h / 2));
  return (
    <div className="card-preview" style={{ left: Math.max(8, left), top }}>
      <img src={p.url} alt="" />
      {p.back && <img src={p.back} alt="" />}
    </div>
  );
}

export function UiLayer() {
  return (
    <>
      <ModalHost />
      <Toasts />
      <PreviewLayer />
    </>
  );
}
