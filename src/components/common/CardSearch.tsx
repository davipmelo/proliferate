import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { autocomplete } from '../../services/scryfall.ts';
import { Spinner, useDebounced } from './bits.tsx';

interface Props {
  placeholder?: string;
  onSelect: (name: string) => void;
  autoFocus?: boolean;
  includeExtras?: boolean;
  initial?: string;
  /** Limpa o campo depois de selecionar. */
  clearOnSelect?: boolean;
}

/** Campo com autocomplete de nomes do Scryfall. */
export function CardSearch({ placeholder = 'Nome da carta (em inglês)…', onSelect, autoFocus, includeExtras, initial = '', clearOnSelect }: Props) {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const dq = useDebounced(q, 250);
  const skip = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    let alive = true;
    if (dq.trim().length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    autocomplete(dq, includeExtras)
      .then((r) => {
        if (!alive) return;
        setItems(r.slice(0, 12));
        setActive(0);
        setOpen(true);
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, includeExtras]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && !(e.target as HTMLElement)?.closest?.('.ac-list') && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // A lista fica num portal com posição fixa para não ser cortada por modais.
  const [rect, setRect] = useState<DOMRect | null>(null);
  const showList = open && items.length > 0;
  useLayoutEffect(() => {
    if (!showList) return;
    const upd = () => wrap.current && setRect(wrap.current.getBoundingClientRect());
    upd();
    window.addEventListener('resize', upd);
    window.addEventListener('scroll', upd, true);
    return () => {
      window.removeEventListener('resize', upd);
      window.removeEventListener('scroll', upd, true);
    };
  }, [showList]);

  const choose = (name: string) => {
    skip.current = true;
    setQ(clearOnSelect ? '' : name);
    setOpen(false);
    setItems([]);
    onSelect(name);
  };

  return (
    <div className="ac" ref={wrap}>
      <div className="input-icon">
        <Search size={16} />
        <input
          className="input"
          value={q}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (open && items[active]) choose(items[active]);
              else if (q.trim()) choose(q.trim());
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {loading && (
          <span style={{ position: 'absolute', right: 10, top: 9 }}>
            <Spinner />
          </span>
        )}
      </div>
      {showList && rect && createPortal(
        <div className="ac-list" role="listbox" style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, right: 'auto', zIndex: 150 }}>
          {items.map((n, i) => (
            <div
              key={n}
              role="option"
              aria-selected={i === active}
              className={`ac-item ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(n);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {n}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
