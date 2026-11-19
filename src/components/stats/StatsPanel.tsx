import { lazy, Suspense, type ReactNode } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import { usePersistent } from '../common/hooks.ts';
import { Loading } from '../common/bits.tsx';

const CollectionStats = lazy(() => import('./CollectionStats.tsx'));
const DecksStats = lazy(() => import('./DecksStats.tsx'));

/** Seção retrátil de estatísticas (estado lembrado; conteúdo carregado só quando aberto). */
export function StatsPanel({ kind, teaser }: { kind: 'collection' | 'decks'; teaser?: ReactNode }) {
  const [open, setOpen] = usePersistent<boolean>(`stats-open-${kind}`, false);
  return (
    <section className={`stats-panel ${open ? 'open' : ''}`}>
      <button className="stats-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="stats-icon"><BarChart3 size={17} /></span>
        <span className="stats-title">Estatísticas</span>
        {!open && teaser && <span className="stats-teaser">{teaser}</span>}
        <span className="spacer" />
        <span className="stats-hint">{open ? 'Recolher' : 'Expandir'}</span>
        <ChevronDown size={18} className="stats-chev" />
      </button>
      {open && (
        <div className="stats-body">
          <Suspense fallback={<Loading text="Calculando…" />}>{kind === 'collection' ? <CollectionStats /> : <DecksStats />}</Suspense>
        </div>
      )}
    </section>
  );
}
