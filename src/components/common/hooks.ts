import { useEffect, useRef, useState } from 'react';
import { getLocal, setLocal } from '../../services/storage.ts';

/** Renderiza listas longas aos poucos (mais itens ao rolar até o fim). */
export function useProgressive<T>(list: T[], step = 120) {
  const [limit, setLimit] = useState(step);
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => setLimit(step), [list.length, step]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= list.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + step);
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, list.length, step]);
  return { visible: list.slice(0, limit), sentinel, hasMore: limit < list.length };
}

/** Estado persistido no localStorage (preferências locais de uma tela). */
export function usePersistent<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => getLocal(key, initial));
  return [
    v,
    (n: T) => {
      setV(n);
      setLocal(key, n);
    },
  ];
}
