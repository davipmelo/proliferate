import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExploreQuery, EMPTY_FILTERS } from '../src/services/explore.ts';
import { COMMANDER_BASE, NO_BACKGROUNDS, THEMES, TRIBES } from '../src/data/exploreThemes.ts';

const t = (query: string) => ({ query });

test('buildExploreQuery: base, temas combinados e Backgrounds', () => {
  assert.equal(buildExploreQuery([t('o:food')], EMPTY_FILTERS), `${COMMANDER_BASE} ${NO_BACKGROUNDS} (o:food)`);
  const q = buildExploreQuery([t('o:food'), t('o:clue')], { ...EMPTY_FILTERS, backgrounds: true });
  assert.ok(!q.includes(NO_BACKGROUNDS));
  assert.ok(q.endsWith('(o:food) (o:clue)'));
});

test('buildExploreQuery: filtros', () => {
  const now = new Date('2026-06-01');
  const f = { ...EMPTY_FILTERS, colors: ['G', 'W'] as const, cmc: '7', maxPrice: '5', era: 'recent', partner: true, extra: 't:elf' };
  const q = buildExploreQuery([t('o:x')], { ...f, colors: [...f.colors] }, now);
  for (const part of ['id<=wg', 'cmc>=7', 'usd<=5', 'year>=2025', 'keyword:partner', '(t:elf)']) assert.ok(q.includes(part), part);
  assert.ok(buildExploreQuery([], { ...EMPTY_FILTERS, colors: ['U'], identity: 'exact' }).includes('id=u'));
  assert.ok(buildExploreQuery([], { ...EMPTY_FILTERS, colors: ['C'] }).includes('id<=c'));
  assert.ok(buildExploreQuery([], { ...EMPTY_FILTERS, cmc: '3', era: '2015' }).includes('cmc=3 year>=2015'));
});

test('temas e tribos: slugs únicos e não vazios', () => {
  const all = [...THEMES, ...TRIBES];
  const slugs = all.map((x) => x.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(slugs.every((s) => /^[a-z0-9-]+$/.test(s)));
  assert.equal(THEMES.find((x) => x.name === '+1/+1 Counters')?.slug, 'plus-1-counters');
});
