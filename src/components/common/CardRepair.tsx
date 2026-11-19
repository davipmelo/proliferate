import { useEffect, useRef } from 'react';
import type { Card } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { toast } from '../../state/ui.tsx';
import { applyEnrichment, collectIncomplete } from '../../services/enrich.ts';
import { frontName, normalizeName } from '../../types/cardRules.ts';

/** Completa em segundo plano cartas sem dados de regras (tipo, custo, cores), mantendo a arte. */
export function CardRepair() {
  const store = useStore();
  const tried = useRef(new Set<string>());
  const running = useRef(false);

  useEffect(() => {
    const pending = collectIncomplete(store.data).filter((n) => !tried.current.has(n));
    if (!pending.length || running.current) return;
    running.current = true;
    const t = setTimeout(async () => {
      try {
        const { getCollection } = await import('../../services/scryfall.ts');
        pending.forEach((n) => tried.current.add(n));
        const { found } = await getCollection(pending.map((name) => ({ name: name.split(' // ')[0] })));
        if (!found.length) return;
        const map = new Map<string, Card>();
        for (const c of found) {
          map.set(normalizeName(c.name), c);
          map.set(frontName(c.name), c);
        }
        store.update((d) => applyEnrichment(d, map));
        toast(`${found.length} carta(s) tiveram tipo, custo e cores completados pelo Scryfall.`, 'info', 5000);
      } catch {
        /* tenta de novo na próxima sessão */
      } finally {
        running.current = false;
      }
    }, 1500);
    return () => {
      clearTimeout(t);
      running.current = false;
    };
  }, [store.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
