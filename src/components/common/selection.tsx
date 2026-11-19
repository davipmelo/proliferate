import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';

/** Seleção múltipla com suporte a Shift (intervalo) e Ctrl/Cmd. */
export function useSelection(orderedIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);

  const toggle = useCallback(
    (id: string, e?: { shiftKey?: boolean }) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (e?.shiftKey && anchor.current && orderedIds.includes(anchor.current)) {
          const a = orderedIds.indexOf(anchor.current);
          const b = orderedIds.indexOf(id);
          const [s, t] = a < b ? [a, b] : [b, a];
          for (let i = s; i <= t; i++) next.add(orderedIds[i]);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
    },
    [orderedIds],
  );

  // Remove ids que sumiram da lista.
  const visibleSelected = useMemo(() => new Set([...selected].filter((id) => orderedIds.includes(id))), [selected, orderedIds]);

  return {
    selected: visibleSelected,
    isSelected: (id: string) => visibleSelected.has(id),
    toggle,
    selectAll: () => setSelected(new Set(orderedIds)),
    clear: () => setSelected(new Set()),
    count: visibleSelected.size,
  };
}

export function SelectBox({ checked, onClick, className = '' }: { checked: boolean; onClick: (e: React.MouseEvent) => void; className?: string }) {
  return (
    <button
      className={`select-box ${checked ? 'checked' : ''} ${className}`}
      aria-pressed={checked}
      aria-label={checked ? 'Desmarcar' : 'Selecionar'}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      {checked && <Check size={14} strokeWidth={3} />}
    </button>
  );
}

/** Controles da grade: tamanho da carta e mostrar/ocultar detalhes. */
export function GridControls({ size, onSize, details, onDetails }: { size: number; onSize: (n: number) => void; details: boolean; onDetails: (b: boolean) => void }) {
  return (
    <div className="row grid-controls">
      <input type="range" min={110} max={300} step={10} value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Tamanho da carta" style={{ width: 110 }} />
      <button className={`btn btn-ghost btn-icon btn-sm ${details ? 'active' : ''}`} onClick={() => onDetails(!details)} title={details ? 'Ocultar detalhes' : 'Mostrar detalhes'}>
        {details ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
    </div>
  );
}
