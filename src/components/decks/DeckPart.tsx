import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Seção principal do editor de deck (Comandante, Deck principal, Fichas), retrátil. */
export function DeckPart({ title, count, extra, actions, closed, onToggle, children }: {
  title: string;
  count?: ReactNode;
  extra?: ReactNode;
  actions?: ReactNode;
  closed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`deck-part ${closed ? 'closed' : ''}`}>
      <header className="part-header">
        <button className="part-toggle" onClick={onToggle} aria-expanded={!closed}>
          <ChevronDown size={18} className="part-chev" />
          <span className="part-title">{title}</span>
          {count != null && <span className="part-count">{count}</span>}
          {extra && <span className="part-extra">{extra}</span>}
        </button>
        {actions && !closed && <div className="part-actions">{actions}</div>}
      </header>
      {!closed && <div className="part-body">{children}</div>}
    </section>
  );
}
