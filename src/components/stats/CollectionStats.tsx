import { useMemo } from 'react';
import { useStore } from '../../state/store.tsx';
import { computeCardStats, type Ranked } from '../../services/stats.ts';
import { TYPE_LABELS, type MainType } from '../../types/cardRules.ts';
import { formatUsd } from '../common/bits.tsx';
import { BarList, Columns, Kpi, MANA_COLORS, RARITY_COLORS, Stacked, VizCard } from './viz.tsx';

const CURVE_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

export default function CollectionStats() {
  const { collection } = useStore();
  const s = useMemo(() => computeCardStats(collection.map((e) => ({ card: e.card, quantity: e.quantity }))), [collection]);
  // Cartas presentes em mais decks (por nome, somando artes diferentes).
  const shared = useMemo<Ranked[]>(() => {
    const byName = new Map<string, { decks: Set<string>; card: (typeof collection)[number]['card'] }>();
    for (const e of collection) {
      if (/\bBasic\b/i.test(e.card.typeLine)) continue;
      const cur = byName.get(e.card.name) ?? { decks: new Set<string>(), card: e.card };
      e.decks.forEach((d) => cur.decks.add(d.deckId));
      byName.set(e.card.name, cur);
    }
    return [...byName.entries()]
      .filter(([, v]) => v.decks.size > 1)
      .sort((a, b) => b[1].decks.size - a[1].decks.size || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([name, v]) => ({ key: name, label: name, value: v.decks.size, card: v.card }));
  }, [collection]);
  if (!s.total) return <p className="viz-empty">Adicione cartas aos seus decks para ver as estatísticas.</p>;
  const pct = (n: number) => `${Math.round((n / s.total) * 100)}%`;

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Cartas diferentes" value={s.unique.toLocaleString('pt-BR')} hint={`em ${s.total.toLocaleString('pt-BR')} cópias`} />
        <Kpi label="Preço médio" value={formatUsd(s.avgPrice)} hint="por cópia com preço" accent />
        <Kpi label="Custo médio" value={s.avgCmc.toFixed(2)} hint="sem terrenos" />
        <Kpi label="Terrenos" value={pct(s.lands)} hint={`${s.lands} cópias`} />
        <Kpi label="Lendárias" value={s.legendary} hint={pct(s.legendary)} />
        <Kpi label="Dupla face" value={s.doubleFaced} hint="frente + verso na impressão" />
      </div>
      <div className="viz-grid">
        <VizCard title="Cores" hint="cartas não terreno">
          <BarList items={(['W', 'U', 'B', 'R', 'G', 'M', 'C'] as const).map((k) => ({ key: k, label: MANA_COLORS[k].label, value: s.colors[k] })).filter((i) => i.value)} color={(r) => MANA_COLORS[r.key].color} />
        </VizCard>
        <VizCard title="Curva de mana" hint="custo convertido">
          <Columns values={s.curve} labels={CURVE_LABELS} color="var(--accent)" />
        </VizCard>
        <VizCard title="Tipos de carta">
          <BarList items={s.types.map((t) => ({ ...t, label: TYPE_LABELS[t.key as MainType] }))} color={() => 'var(--text-3)'} />
        </VizCard>
        <VizCard title="Identidade de cor" hint="guildas e clãs">
          <BarList items={s.identities} color={() => 'var(--accent)'} />
        </VizCard>
        <VizCard title="Raridade">
          <Stacked parts={s.rarity.map((r) => ({ label: r.label, value: r.value, color: RARITY_COLORS[r.key] ?? RARITY_COLORS.unknown }))} />
        </VizCard>
        <VizCard title="Mais valiosas" hint="preço unitário (USD)">
          <BarList items={s.topValue} format={(n) => formatUsd(n)} card color={() => 'var(--accent)'} />
        </VizCard>
        <VizCard title="Faixas de preço">
          <Columns values={s.priceBands.map((b) => b.value)} labels={s.priceBands.map((b) => b.label)} color="var(--info)" />
        </VizCard>
        <VizCard title="Em mais decks" hint="cartas compartilhadas">
          <BarList items={shared} card format={(n) => `${n} decks`} color={() => 'var(--info)'} empty="Nenhuma carta aparece em mais de um deck." />
        </VizCard>
        <VizCard title="Edições mais presentes">
          <BarList items={s.sets} color={() => 'var(--text-3)'} />
        </VizCard>
        <VizCard title="Tribos" hint="tipos de criatura">
          <BarList items={s.tribes} color={() => 'var(--success)'} empty="Nenhuma criatura." />
        </VizCard>
        <VizCard title="Habilidades em destaque">
          <BarList items={s.keywords} color={() => 'var(--info)'} empty="Sem texto de regras." />
        </VizCard>
        <VizCard title="Mais cópias">
          <BarList items={s.mostCopies} card color={() => 'var(--accent)'} />
        </VizCard>
        <VizCard title="Artistas favoritos">
          <BarList items={s.artists} color={() => 'var(--mana-m)'} />
        </VizCard>
      </div>
    </>
  );
}
