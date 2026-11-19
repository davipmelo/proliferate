import { useMemo } from 'react';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, type ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { Deck } from '../../types/models.ts';
import { isLand, mainType, TYPE_LABELS, TYPE_ORDER } from '../../types/cardRules.ts';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

// Lê os tokens do CSS para os gráficos seguirem o tema.
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function baseOptions(horizontal = false): ChartOptions<'bar'> {
  const text2 = css('--text-2');
  const border = css('--border');
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    animation: { duration: 250 },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: css('--surface-3'), titleColor: css('--text'), bodyColor: css('--text-2'), borderColor: css('--border-strong'), borderWidth: 1, padding: 8, displayColors: false },
    },
    scales: {
      x: { grid: { display: horizontal, color: border }, ticks: { color: text2, font: { size: 11 }, precision: 0 }, border: { display: false } },
      y: { grid: { display: !horizontal, color: border }, ticks: { color: text2, font: { size: 11 }, precision: 0 }, border: { display: false }, beginAtZero: true },
    },
  };
}

const COLOR_KEYS = [
  ['W', 'Branco', '--mana-w'],
  ['U', 'Azul', '--mana-u'],
  ['B', 'Preto', '--mana-b'],
  ['R', 'Vermelho', '--mana-r'],
  ['G', 'Verde', '--mana-g'],
  ['C', 'Incolor', '--mana-c'],
] as const;

export default function DeckCharts({ deck }: { deck: Deck }) {
  const stats = useMemo(() => {
    const cards = deck.cards.filter((c) => c.category !== 'sideboard' && c.category !== 'maybeboard');
    const curve = new Array(8).fill(0);
    const colors: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const types: Record<string, number> = {};
    let cmcSum = 0;
    let nonLand = 0;
    for (const c of cards) {
      const t = mainType(c.card.typeLine);
      types[t] = (types[t] ?? 0) + c.quantity;
      if (isLand(c.card)) continue;
      curve[Math.min(7, Math.floor(c.card.cmc))] += c.quantity;
      cmcSum += c.card.cmc * c.quantity;
      nonLand += c.quantity;
      const cols = c.card.colors?.length ? c.card.colors : ['C'];
      for (const col of cols) colors[col] = (colors[col] ?? 0) + c.quantity;
    }
    return { curve, colors, types, avg: nonLand ? cmcSum / nonLand : 0 };
  }, [deck.cards]);

  const accent = css('--accent');
  const typeKeys = TYPE_ORDER.filter((t) => stats.types[t]);
  const colorKeys = COLOR_KEYS.filter(([k]) => stats.colors[k]);

  return (
    <>
      <div className="section">
        <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}>Curva de mana <span className="count">média {stats.avg.toFixed(2)} (sem terrenos)</span></div>
        <div className="chart-box">
          <Bar
            options={baseOptions()}
            data={{
              labels: ['0', '1', '2', '3', '4', '5', '6', '7+'],
              datasets: [{ label: 'Cartas', data: stats.curve, backgroundColor: accent, borderRadius: 4, maxBarThickness: 26 }],
            }}
            aria-label="Gráfico da curva de mana"
          />
        </div>
      </div>
      <div className="section">
        <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}>Cores <span className="count">símbolos por cor (cartas não terreno)</span></div>
        {colorKeys.length ? (
          <div className="chart-box-sm">
            <Bar
              options={baseOptions(true)}
              data={{
                labels: colorKeys.map(([, l]) => l),
                datasets: [{ label: 'Cartas', data: colorKeys.map(([k]) => stats.colors[k]), backgroundColor: colorKeys.map(([, , v]) => css(v)), borderRadius: 4, maxBarThickness: 18 }],
              }}
              aria-label="Distribuição de cores"
            />
          </div>
        ) : <p className="small subtle">Sem dados.</p>}
      </div>
      <div className="section">
        <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}>Tipos de carta</div>
        {typeKeys.length ? (
          <div className="chart-box" style={{ height: Math.max(110, typeKeys.length * 28) }}>
            <Bar
              options={baseOptions(true)}
              data={{
                labels: typeKeys.map((t) => TYPE_LABELS[t]),
                datasets: [{ label: 'Cartas', data: typeKeys.map((t) => stats.types[t]), backgroundColor: css('--text-3'), borderRadius: 4, maxBarThickness: 18 }],
              }}
              aria-label="Tipos de carta"
            />
          </div>
        ) : <p className="small subtle">Sem dados.</p>}
      </div>
    </>
  );
}
