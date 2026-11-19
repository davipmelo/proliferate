import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEnrichment, collectIncomplete, mergeOfficial, needsEnrichment } from '../src/services/enrich.ts';
import { normalizeAppData } from '../src/services/normalize.ts';
import { mainType } from '../src/types/cardRules.ts';

test('cartas do MPCFill do v1 são completadas mantendo a arte', () => {
  const data = normalizeAppData({
    decks: [{ id: 'd', name: 'Burn', cards: [
      { card: { id: 'mpc-alter-abc', name: 'Impact Tremors', typeLine: 'Proxy Alter MPCFill', imageUrl: 'https://lh3.googleusercontent.com/d/abc=w1000' }, quantity: 1 },
      { card: { id: 'x', name: 'Card Back', typeLine: 'Verso de Carta MTG' }, quantity: 1 },
      { card: { id: 'ok', name: 'Sol Ring', typeLine: 'Artifact' }, quantity: 1 },
    ] }],
  });
  assert.deepEqual(collectIncomplete(data), ['Impact Tremors']);
  const official = normalizeAppData({ collection: [{ card: { id: 'off', oracle_id: 'o1', name: 'Impact Tremors', type_line: 'Enchantment', mana_cost: '{1}{R}', cmc: 2, colors: ['R'], color_identity: ['R'], rarity: 'common', image_uris: { normal: 'official.jpg' } } }] }).collection[0].card;
  const fixed = applyEnrichment(data, new Map([['impact tremors', official]]));
  const c = fixed.decks[0].cards[0].card;
  assert.equal(mainType(c.typeLine), 'Enchantment');
  assert.equal(c.cmc, 2);
  assert.deepEqual(c.colors, ['R']);
  assert.equal(c.images.normal, 'https://lh3.googleusercontent.com/d/abc=w1000');
  assert.equal(c.id, 'mpc-alter-abc');
  assert.equal(c.artSource, 'mpcfill');
  assert.ok(!needsEnrichment(c));
  assert.equal(mergeOfficial({ ...c, id: 'plain', artSource: undefined }, official).images.normal, c.images.normal);
});
