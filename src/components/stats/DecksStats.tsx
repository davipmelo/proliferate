import { useMemo } from 'react';
import { useStore } from '../../state/store.tsx';
import { computeCardStats, computeDecksExtras } from '../../services/stats.ts';
import { TYPE_LABELS, type MainType } from '../../types/cardRules.ts';
import { openDeck } from '../../state/nav.ts';
import { formatUsd } from '../common/bits.tsx';
import { BarList, Columns, Kpi, MANA_COLORS, RARITY_COLORS, Stacked, VizCard } from './viz.tsx';

const CURVE_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

export default function DecksStats() {
  const { data } = useStore();
  const entries = useMemo(
    () => data.decks.flatMap((d) => d.cards.filter((c) => c.category !== 'sideboard' && c.category !== 'maybeboard').map((c) => ({ card: c.card, quantity: c.quantity }))),
    [data.decks],
  );
  const s = useMemo(() => computeCardStats(entries), [entries]);
  const x = useMemo(
    () => computeDecksExtras(data.decks, new Set(data.collection.map((i) => i.card.id)), new Set(data.collection.map((i) => i.card.name))),
    [data.decks, data.collection],
  );
  if (!data.decks.length) return <p className="viz-empty">Crie decks para ver as estatísticas.</p>;

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Decks" value={x.decks} hint={`${x.complete} completo(s) na meta`} />
        <Kpi label="Cartas nos decks" value={s.total.toLocaleString('pt-BR')} hint={`${s.unique} cartas diferentes`} />
        <Kpi label="Valor total" value={formatUsd(s.value)} hint={`média ${formatUsd(x.avgValue)} por deck`} accent />
        <Kpi label="Da coleção" value={`${Math.round(x.ownedPct * 100)}%`} hint="das cartas você já possui" />
        <Kpi label="Custo médio" value={s.avgCmc.toFixed(2)} hint="sem terrenos" />
        <Kpi label="Terrenos" value={s.total ? `${Math.round((s.lands / s.total) * 100)}%` : '—'} hint={`${s.lands} no total`} />
      </div>
      <div className="viz-grid">
        <VizCard title="Formatos">
          <BarList items={x.formats} color={() => 'var(--accent)'} />
        </VizCard>
        <VizCard title="Identidade dos decks">
          <BarList items={x.identities} color={() => 'var(--mana-m)'} />
        </VizCard>
        <VizCard title="Cores" hint="cartas não terreno de todos os decks">
          <BarList items={(['W', 'U', 'B', 'R', 'G', 'M', 'C'] as const).map((k) => ({ key: k, label: MANA_COLORS[k].label, value: s.colors[k] })).filter((i) => i.value)} color={(r) => MANA_COLORS[r.key].color} />
        </VizCard>
        <VizCard title="Curva de mana combinada">
          <Columns values={s.curve} labels={CURVE_LABELS} color="var(--accent)" />
        </VizCard>
        <VizCard title="Tipos de carta">
          <BarList items={s.types.map((t) => ({ ...t, label: TYPE_LABELS[t.key as MainType] }))} color={() => 'var(--text-3)'} />
        </VizCard>
        <VizCard title="Raridade">
          <Stacked parts={s.rarity.map((r) => ({ label: r.label, value: r.value, color: RARITY_COLORS[r.key] ?? RARITY_COLORS.unknown }))} />
        </VizCard>
        <VizCard title="Decks mais valiosos" wide>
          <ul className="bar-list">
            {x.priciest.map((d) => {
              const max = x.priciest[0]?.value || 1;
              return (
                <li key={d.key}>
                  <button className="bar-row as-link" onClick={() => openDeck(d.key)}>
                    <div className="bar-label"><span className="ellipsis">{d.label}</span><span className="bar-value"><em>{d.extra}</em>{formatUsd(d.value)}</span></div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: 'var(--accent)' }} /></div>
                  </button>
                </li>
              );
            })}
          </ul>
        </VizCard>
        <VizCard title="Staples" hint="cartas em mais de um deck">
          <BarList items={x.staples} card format={(n) => `${n} decks`} color={() => 'var(--info)'} empty="Nenhuma carta repetida entre decks." />
        </VizCard>
        <VizCard title="Cartas mais caras usadas" hint="preço unitário">
          <BarList items={s.topValue} card format={(n) => formatUsd(n)} color={() => 'var(--accent)'} />
        </VizCard>
        <VizCard title="Tribos">
          <BarList items={s.tribes} color={() => 'var(--success)'} empty="Nenhuma criatura." />
        </VizCard>
        <VizCard title="Habilidades em destaque">
          <BarList items={s.keywords} color={() => 'var(--info)'} />
        </VizCard>
        {x.commanders.length > 0 && (
          <VizCard title="Comandantes">
            <BarList items={x.commanders} card color={() => 'var(--mana-m)'} />
          </VizCard>
        )}
      </div>
    </>
  );
}
