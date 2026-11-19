import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Painel suspenso preso a um gatilho, renderizado no <body> (não é cortado por modais ou listas
 * com overflow). Abre para cima quando não há espaço embaixo. Fecha ao clicar fora ou com Esc.
 */
export function Popover({ trigger, children, align = 'left', width = 280, className = '' }: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const el = anchor.current?.firstElementChild ?? anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - 16);
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    if (below >= 260 || below >= above) setPos({ top: r.bottom + 6, left, maxHeight: Math.max(160, below - 6) });
    else setPos({ bottom: vh - r.top + 6, left, maxHeight: Math.max(160, above - 6) });
  }, [align, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // não fecha o modal por trás
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place]);

  return (
    <>
      <span ref={anchor} className="popover-anchor">{trigger(open, () => setOpen((o) => !o))}</span>
      {open && pos &&
        createPortal(
          <div
            ref={panel}
            className={`popover ${className}`}
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: Math.min(width, window.innerWidth - 16), maxHeight: pos.maxHeight }}
            // Eventos do portal sobem pela árvore do React: não deixam chegar ao card/linha por trás.
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}
