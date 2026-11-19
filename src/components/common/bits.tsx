// Componentes pequenos reutilizados em todo o app.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LayoutGrid, List, Minus, Plus } from 'lucide-react';
import type { Card, ViewMode } from '../../types/models.ts';
import { backImage, COLOR_NAMES, frontImage, parseManaCost, type ColorFilterValue } from '../../types/cardRules.ts';
import { previewProps } from '../../state/ui.tsx';

export function ManaCost({ cost }: { cost?: string }) {
  const syms = parseManaCost(cost);
  if (!syms.length) return null;
  return (
    <span className="mana" aria-label={cost}>
      {syms.map((s, i) => {
        const cls = /^[WUBRG]$/.test(s) ? s : s.includes('/') ? 'hybrid' : '';
        const label = s.replace('/P', 'φ').replace(/\//g, '');
        return (
          <span key={i} className={`mana-sym ${cls}`}>
            {s.length > 2 ? label.slice(0, 2) : label}
          </span>
        );
      })}
    </span>
  );
}

export function ColorPips({ colors }: { colors: string[] }) {
  if (!colors?.length) return <span className="color-pip" style={{ background: 'var(--mana-c)' }} title="Incolor" />;
  return (
    <span className="row" style={{ gap: 2 }}>
      {colors.map((c) => (
        <span key={c} className="color-pip" style={{ background: `var(--mana-${c.toLowerCase()})` }} title={COLOR_NAMES[c as ColorFilterValue]} />
      ))}
    </span>
  );
}

/** Miniatura "small" do Scryfall com carregamento lazy e preview ao passar o mouse. */
export function CardThumb({ card, className = 'list-thumb', size = 'small' }: { card: Card; className?: string; size?: 'small' | 'normal' }) {
  const src = frontImage(card, size);
  return (
    <img
      className={className}
      src={src}
      loading="lazy"
      decoding="async"
      alt={card.name}
      {...previewProps(frontImage(card, 'normal'), backImage(card, 'normal'))}
    />
  );
}

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="btn-group" role="group" aria-label="Modo de visualização">
      <button className={`btn btn-ghost btn-icon ${value === 'list' ? 'active' : ''}`} onClick={() => onChange('list')} title="Lista" aria-pressed={value === 'list'}>
        <List size={16} />
      </button>
      <button className={`btn btn-ghost btn-icon ${value === 'grid' ? 'active' : ''}`} onClick={() => onChange('grid')} title="Grade" aria-pressed={value === 'grid'}>
        <LayoutGrid size={16} />
      </button>
    </div>
  );
}

export function QtyControl({ value, onChange, min = 0, label }: { value: number; onChange: (n: number) => void; min?: number; label?: string }) {
  return (
    <div className="qty-box" aria-label={label ?? 'Quantidade'}>
      <button className="btn btn-ghost btn-icon btn-xs" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Diminuir">
        <Minus size={13} />
      </button>
      <span>{value}</span>
      <button className="btn btn-ghost btn-icon btn-xs" onClick={() => onChange(value + 1)} aria-label="Aumentar">
        <Plus size={13} />
      </button>
    </div>
  );
}

export function Spinner({ large }: { large?: boolean }) {
  return <span className={`spinner ${large ? 'spinner-lg' : ''}`} aria-hidden />;
}

export function Loading({ text = 'Carregando…' }: { text?: string }) {
  return (
    <div className="loading">
      <Spinner /> {text}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

/** Menu suspenso simples (fecha ao clicar fora ou ESC). */
export function Dropdown({ trigger, children, align = 'right' }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div className="menu" style={align === 'left' ? { left: 0, right: 'auto' } : undefined}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function formatUsd(v?: number): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function rarityLabel(r?: string): string {
  return ({ common: 'Comum', uncommon: 'Incomum', rare: 'Rara', mythic: 'Mítica', special: 'Especial', bonus: 'Bônus' } as Record<string, string>)[r ?? ''] ?? (r || '—');
}

/** Hook de debounce de valor. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Hook de mídia (mobile). */
export function useIsMobile(): boolean {
  const q = '(max-width: 768px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
