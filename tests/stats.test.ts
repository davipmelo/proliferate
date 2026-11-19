import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCardStats, computeDecksExtras, identityName } from '../src/services/stats.ts';
import { normalizeAppData } from '../src/services/normalize.ts';

const c = (p: Record<string, unknown>) => ({ id: String(p.name), cmc: 0, typeLine: '', colors: [], colorIdentity: [], images: {}, ...p }) as any;

test('identityName independe da ordem', () => {
  assert.equal(identityName(['U', 'W']), 'Azorius');
  assert.equal(identityName(['G', 'W']), 'Selesnya');
  assert.equal(identityName(['G', 'B', 'R']), 'Jund');
  assert.equal(identityName([]), 'Incolor');
  assert.equal(identityName(['W', 'U', 'B', 'R', 'G']), 'Cinco cores');
});

test('computeCardStats: cores, curva, tipos, tribos, palavras-chave e preço', () => {
  const s = computeCardStats([
    { card: c({ name: 'Llanowar Elves', cmc: 1, typeLine: 'Creature — Elf Druid', colors: ['G'], colorIdentity: ['G'], rarity: 'common', priceUsd: 0.3, setName: 'Dominaria', setCode: 'dom' }), quantity: 4 },
    { card: c({ name: 'Baneslayer Angel', cmc: 5, typeLine: 'Creature — Angel', colors: ['W'], colorIdentity: ['W'], rarity: 'mythic', priceUsd: 3, oracleText: 'Flying, first strike, lifelink' }), quantity: 1 },
    { card: c({ name: 'Fire // Ice', cmc: 4, typeLine: 'Instant // Instant', colors: ['U', 'R'], colorIdentity: ['U', 'R'], rarity: 'uncommon', priceUsd: 60 }), quantity: 1 },
    { card: c({ name: 'Sol Ring', cmc: 1, typeLine: 'Artifact', rarity: 'uncommon', priceUsd: 1.5 }), quantity: 2 },
    { card: c({ name: 'Forest', typeLine: 'Basic Land — Forest', rarity: 'common' }), quantity: 10 },
  ]);
  assert.equal(s.total, 18);
  assert.equal(s.unique, 5);
  assert.equal(s.lands, 10);
  assert.deepEqual(s.colors, { W: 1, U: 0, B: 0, R: 0, G: 4, C: 2, M: 1 });
  assert.equal(s.curve[1], 6);
  assert.equal(s.curve[5], 1);
  assert.equal(s.avgCmc, (4 + 5 + 4 + 2) / 8);
  assert.equal(s.types.find((t) => t.key === 'Creature')?.value, 5);
  assert.equal(s.tribes.find((t) => t.label === 'Elf')?.value, 4);
  assert.ok(s.keywords.some((k) => k.key === 'Flying'));
  assert.equal(s.topValue[0].label, 'Fire // Ice');
  assert.equal(s.priceBands.find((b) => b.key === '$50+')?.value, 1);
  assert.equal(s.identities.find((i) => i.label === 'Izzet')?.value, 1);
  assert.equal(s.rarity[0].key, 'mythic');
  assert.ok(!s.mostCopies.some((m) => m.label === 'Forest'));
});

test('extras dos decks', () => {
  const data = normalizeAppData({
    decks: [
      { id: 'd1', name: 'A', format: 'commander', commander: { id: 'x', name: 'Atraxa', color_identity: ['W', 'U', 'B', 'G'] }, cards: [{ card: { id: 'sol', name: 'Sol Ring', priceUsd: 2 }, quantity: 1 }] },
      { id: 'd2', name: 'B', format: 'modern', cards: [{ card: { id: 'sol2', name: 'Sol Ring', priceUsd: 2 }, quantity: 1 }, { card: { id: 'bolt', name: 'Bolt', color_identity: ['R'] }, quantity: 59 }] },
    ],
  });
  const d = computeDecksExtras(data.decks);
  assert.equal(d.decks, 2);
  assert.equal(d.complete, 1);
  assert.equal(d.staples[0].label, 'Sol Ring');
  assert.equal(d.staples[0].value, 2);
  assert.equal(d.identities.find((i) => i.label === 'Sem vermelho')?.value, 1);
  assert.equal(d.commanders[0].label, 'Atraxa');
  assert.deepEqual(d.sizes.map((x) => x.value), [60, 2]);
});
