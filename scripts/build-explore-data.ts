/**
 * Gera src/data/exploreMeta.json: para cada tema/tribo da aba Explorar, quantos commanders
 * a busca encontra no Scryfall e a arte do commander mais popular (capa do card).
 *
 *   node scripts/build-explore-data.ts           → gera o JSON
 *   node scripts/build-explore-data.ts --review  → também escreve explore-review.md (para revisar a lista)
 *   node scripts/build-explore-data.ts --only=tokens,bounce  → atualiza só esses itens
 *   node scripts/build-explore-data.ts --missing  → busca só os itens que ainda não estão no JSON
 *
 * Respeita o limite do Scryfall (~10 pedidos/s).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { THEMES, TRIBES, MIN_TRIBE_COMMANDERS, COMMANDER_BASE, NO_BACKGROUNDS, type ExploreTheme } from '../src/data/exploreThemes.ts';

interface Meta {
  count: number;
  art?: string;
  artCard?: string;
}

const HEADERS = { 'User-Agent': 'Proliferate/2.0 (explore data build)', Accept: 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchMeta(t: ExploreTheme): Promise<Meta | { error: string }> {
  const q = `${COMMANDER_BASE} ${NO_BACKGROUNDS} (${t.query})`;
  const url = `https://api.scryfall.com/cards/search?order=edhrec&q=${encodeURIComponent(q)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 429) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    const body: any = await res.json();
    if (res.status === 404) return { count: 0 };
    if (!res.ok) return { error: body?.details ?? `HTTP ${res.status}` };
    const top = body.data[0];
    const art = top.image_uris?.art_crop ?? top.card_faces?.[0]?.image_uris?.art_crop;
    return { count: body.total_cards, art, artCard: top.name };
  }
  return { error: 'rate limited' };
}

const META_URL = new URL('../src/data/exploreMeta.json', import.meta.url);
const previous: Record<string, Meta> = existsSync(META_URL) ? (JSON.parse(readFileSync(META_URL, 'utf8')).items ?? {}) : {};
const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const missing = process.argv.includes('--missing');
const everything = [...THEMES, ...TRIBES];
const all = everything.filter((t) => (onlyArg ? onlyArg.includes(t.slug) : missing ? !previous[t.slug] : true));
// Atualização parcial mantém o resto; a completa recomeça do zero (remove itens que saíram da lista).
const partial = !!onlyArg || missing;
const out: Record<string, Meta> = partial ? Object.fromEntries(everything.filter((t) => previous[t.slug]).map((t) => [t.slug, previous[t.slug]])) : {};
const problems: string[] = [];
for (const t of all) {
  const m = await fetchMeta(t);
  if ('error' in m) {
    problems.push(`${t.kind} ${t.name}: ${m.error}`);
    // Falhou: mantém o valor anterior em vez de apagar o item.
    if (previous[t.slug]) out[t.slug] = previous[t.slug];
  } else out[t.slug] = m;
  console.log(`${t.kind} ${t.name}: ${'error' in m ? 'ERRO ' + m.error : m.count}`);
  await sleep(120);
}
writeFileSync(META_URL, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), items: out }, null, 1) + '\n');
console.log(`${Object.keys(out).length} itens gravados.`);
if (problems.length) console.log('Problemas:\n' + problems.join('\n'));

if (process.argv.includes('--review')) {
  const row = (t: ExploreTheme) => {
    const m = out[t.slug];
    return `| ${t.name} | ${m?.count ?? '—'} | ${m?.artCard ?? '—'} | \`${t.query.replace(/\|/g, '\\|')}\` |`;
  };
  // Maior número de commanders primeiro.
  const byCount = (l: ExploreTheme[]) => [...l].sort((a, b) => (out[b.slug]?.count ?? -1) - (out[a.slug]?.count ?? -1) || a.name.localeCompare(b.name));
  const kept = TRIBES.filter((t) => (out[t.slug]?.count ?? 0) >= MIN_TRIBE_COMMANDERS);
  const dropped = TRIBES.filter((t) => (out[t.slug]?.count ?? 0) < MIN_TRIBE_COMMANDERS);
  const head = '| Nome | Commanders | Mais popular (capa) | Busca no Scryfall |\n|---|---:|---|---|';
  const md = [
    '# Explorar — revisão de temas e tribos',
    '',
    `Gerado em ${new Date().toISOString().slice(0, 10)}. A busca de cada item é aplicada sobre os commanders (banidos incluídos, Backgrounds fora).`,
    '',
    `## Temas (${THEMES.length})`,
    '',
    head,
    ...byCount(THEMES).map(row),
    '',
    `## Tribos na grade (${kept.length}, mínimo de ${MIN_TRIBE_COMMANDERS} commanders)`,
    '',
    head,
    ...byCount(kept).map(row),
    '',
    `## Tribos fora da grade (${dropped.length})`,
    '',
    head,
    ...byCount(dropped).map(row),
    '',
  ].join('\n');
  writeFileSync(new URL('../explore-review.md', import.meta.url), md);
  console.log('explore-review.md escrito.');
}
