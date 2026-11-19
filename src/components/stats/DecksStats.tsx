import { useMemo } from 'react';
import { useStore } from '../../state/store.tsx';
import { computeDecksExtras, type Ranked } from '../../services/stats.ts';
import { TYPE_LABELS, type MainType } from '../../types/cardRules.ts';
import { openDeck } from '../../state/nav.ts';
import { formatUsd } from '../common/bits.tsx';
import { BarList, Columns, Kpi, MANA_COLORS, VizCard } from './viz.tsx';
import { deckCount, deckTarget } from '../decks/deckUtils.ts';

const COLOR_COUNT_LABELS = ['Incolor', 'Mono', '2 cores', '3 cores', '4 cores', '5 cores'];
const ACTIVITY_LABELS = ['7 dias', '30 dias', '90 dias', '1 ano', 'Mais'];
const open = (r: Ranked) => openDeck(r.key);
const dec = (n: number, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Estatísticas sobre os decks como um todo (não sobre cartas individuais). */
export default function DecksStats() {
  const { data } = useStore();
  const tagNames = useMemo(() => new Map(data.tags.map((t) => [t.id, t.name])), [data.tags]);
  const x = useMemo(() => computeDecksExtras(data.decks, tagNames), [data.decks, tagNames]);
  if (!data.decks.length) return <p className="viz-empty">Crie decks para ver as estatísticas.</p>;

  const tagColor = new Map(data.tags.map((t) => [t.id, t.color]));
  const pctComplete = Math.round((x.complete / x.decks) * 100);
  // Progresso relativo à meta de cada formato (100% = completo).
  const progress: Ranked[] = data.decks
    .map((d) => {
      const n = deckCount(d);
      const t = deckTarget(d);
      return { key: d.id, label: d.name, value: Math.round((n / t) * 100), extra: `${n}/${t}` };
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Decks" value={x.decks} hint={`${x.complete} completo(s) · ${pctComplete}%`} />
        <Kpi label="Valor total" value={formatUsd(x.avgValue * x.decks)} hint={`média ${formatUsd(x.avgValue)} por deck`} accent />
        <Kpi label="Custo médio" value={dec(x.avgCmc, 2)} hint="média entre os decks" />
        <Kpi label="Terrenos" value={dec(x.avgLands)} hint="por deck, em média" />
        <Kpi label="Cores" value={dec(x.avgColors)} hint="por deck, em média" />
        <Kpi label="Fichas" value={dec(x.avgTokens)} hint="por deck, em média" />
      </div>
      <div className="viz-grid">
        <VizCard title="Decks mais valiosos" hint="clique para abrir" wide>
          <BarList items={x.priciest} format={(n) => formatUsd(n)} color={() => 'var(--accent)'} onSelect={open} />
        </VizCard>
        <VizCard title="Formatos">
          <BarList items={x.formats} color={() => 'var(--accent)'} />
        </VizCard>
        <VizCard title="Identidade dos decks" hint="guildas e clãs">
          <BarList items={x.identities} color={() => 'var(--mana-m)'} />
        </VizCard>
        <VizCard title="Cores mais jogadas" hint="decks que usam cada cor">
          <BarList items={x.colorPresence} color={(r) => MANA_COLORS[r.key].color} format={(n) => `${n} deck${n === 1 ? '' : 's'}`} max={x.decks} />
        </VizCard>
        <VizCard title="Número de cores">
          <Columns values={x.colorCount} labels={COLOR_COUNT_LABELS} color="var(--mana-m)" />
        </VizCard>
        <VizCard title="Progresso" hint="em relação à meta do formato">
          <BarList items={progress} max={100} format={(n) => `${n}%`} color={(r) => (r.value === 100 ? 'var(--success)' : r.value > 100 ? 'var(--warning)' : 'var(--accent)')} onSelect={open} />
        </VizCard>
        <VizCard title="Custo médio por deck" hint="sem terrenos">
          <BarList items={x.avgCmcByDeck} format={(n) => dec(n, 2)} color={() => 'var(--info)'} onSelect={open} />
        </VizCard>
        <VizCard title="Terrenos por deck">
          <BarList items={x.landsByDeck} color={() => 'var(--success)'} onSelect={open} />
        </VizCard>
        <VizCard title="Deck médio" hint="cartas por tipo, em média">
          <BarList items={x.composition.map((t) => ({ ...t, label: TYPE_LABELS[t.key as MainType] }))} format={(n) => dec(n)} color={() => 'var(--text-3)'} />
        </VizCard>
        {x.commanders.length > 0 && (
          <VizCard title="Comandantes">
            <BarList items={x.commanders} card color={() => 'var(--mana-m)'} />
          </VizCard>
        )}
        {x.tags.length > 0 && (
          <VizCard title="Tags">
            <BarList items={x.tags} color={(r) => tagColor.get(r.key) ?? 'var(--text-3)'} />
          </VizCard>
        )}
        <VizCard title="Atividade" hint="última edição">
          <Columns values={x.activity} labels={ACTIVITY_LABELS} color="var(--accent)" />
        </VizCard>
      </div>
    </>
  );
}
