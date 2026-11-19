import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  headerExtra?: ReactNode;
  tabs?: ReactNode;
  /** Desativa o fechamento com ESC (quando o modal trata o ESC sozinho). */
  noEscape?: boolean;
  bodyClassName?: string;
}

let openCount = 0;

export function Modal({ title, onClose, children, footer, size = 'md', headerExtra, tabs, noEscape, bodyClassName }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    openCount++;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[autofocus], input, select, textarea');
    (first ?? ref.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || noEscape) return;
      // Só o modal do topo fecha.
      const all = document.querySelectorAll('.modal');
      if (all[all.length - 1] === ref.current) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openCount--;
      if (openCount <= 0) document.body.style.overflow = '';
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [noEscape]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className={`modal modal-${size}`} role="dialog" aria-modal="true">
        <div className="sheet-handle only-mobile" />
        <div className="modal-header">
          <h2>{title}</h2>
          {headerExtra}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {tabs}
        <div className={`modal-body ${bodyClassName ?? ''}`}>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
