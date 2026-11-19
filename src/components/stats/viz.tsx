// Peças visuais leves (CSS) para o painel de estatísticas.
import type { ReactNode } from 'react';
import type { Card } from '../../types/models.ts';
import type { Ranked } from '../../services/stats.ts';
import { frontImage } from '../../types/cardRules.ts';
import { previewProps } from '../../state/ui.tsx';

export function VizCard({ title, hint, children, wide }: { title: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`viz-card ${wide ? 'wide' : ''}`}>
      <header>
        <h3>{title}</h3>
        {hint && <span>{hint}</span>}
      </header>
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${accent ? 'accent' : ''}`}>{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('pt-BR');

/** Lista ordenada com barra proporcional e valor visível. */
export function BarList({ items, format = fmt, color, empty = 'Sem dados.', card }: { items: Ranked[]; format?: (n: number) => string; color?: (r: Ranked) => string; empty?: string; card?: boolean }) {
  if (!items.length) return <p className="viz-empty">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="bar-list">
      {items.map((i) => (
        <li key={i.key} title={`${i.label}: ${format(i.value)}`}>
          {card && i.card && <CardChip card={i.card} />}
          <div className="bar-row">
            <div className="bar-label">
              <span className="ellipsis">{i.label}</span>
              <span className="bar-value">{i.extra && <em>{i.extra}</em>}{format(i.value)}</span>
            </div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(i.value / max) * 100}%`, background: color?.(i) }} /></div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CardChip({ card }: { card: Card }) {
  return <img className="bar-thumb" src={card.images.art_crop || frontImage(card, 'small')} alt="" loading="lazy" {...previewProps(frontImage(card, 'normal'))} />;
}

/** Colunas verticais (curva de mana). */
export function Columns({ values, labels, color }: { values: number[]; labels: string[]; color?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="columns">
      {values.map((v, i) => (
        <div key={i} className="col-item" title={`${labels[i]}: ${fmt(v)}`}>
          <span className="col-value">{v || ''}</span>
          <div className="col-track"><div className="col-fill" style={{ height: `${(v / max) * 100}%`, background: color }} /></div>
          <span className="col-label">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/** Barra empilhada única com legenda (proporções). */
export function Stacked({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="stacked">
      <div className="stacked-bar">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${fmt(p.value)} (${Math.round((p.value / total) * 100)}%)`} />
        ))}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.label}><span className="swatch" style={{ background: p.color }} />{p.label}<b>{fmt(p.value)}</b><small>{Math.round((p.value / total) * 100)}%</small></li>
        ))}
      </ul>
    </div>
  );
}

export const MANA_COLORS: Record<string, { label: string; color: string }> = {
  W: { label: 'Branco', color: 'var(--mana-w)' },
  U: { label: 'Azul', color: 'var(--mana-u)' },
  B: { label: 'Preto', color: 'var(--mana-b)' },
  R: { label: 'Vermelho', color: 'var(--mana-r)' },
  G: { label: 'Verde', color: 'var(--mana-g)' },
  M: { label: 'Multicolor', color: 'var(--mana-m)' },
  C: { label: 'Incolor', color: 'var(--mana-c)' },
};

export const RARITY_COLORS: Record<string, string> = {
  mythic: '#f0745a', rare: '#e3c36b', uncommon: '#a9c2d6', common: '#85847f', special: '#a78bfa', bonus: '#a78bfa', unknown: '#5c5b57',
};
