import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCollection, entryKey, mapEntryInDecks, summarize } from '../src/services/collection.ts';
import { normalizeAppData } from '../src/services/normalize.ts';

const data = normalizeAppData({
  decks: [
    {
      id: 'd1', name: 'Atraxa', format: 'commander',
      commander: { id: 'atx', name: 'Atraxa', priceUsd: 10 },
      cards: [
        { card: { id: 'sol', name: 'Sol Ring', priceUsd: 2 }, quantity: 1 },
        { card: { id: 'isl', name: 'Island' }, quantity: 8 },
        { card: { id: 'cs', name: 'Counterspell' }, quantity: 1, category: 'maybeboard' },
        { card: { id: 'mpc-1', name: 'Sol Ring', artSource: 'mpcfill', images: { normal: 'https://lh3.googleusercontent.com/d/abc=w1000' } }, quantity: 1, category: 'sideboard' },
      ],
    },
    {
      id: 'd2', name: 'Burn', format: 'modern',
      cards: [
        { card: { id: 'sol', name: 'Sol Ring', priceUsd: 2 }, quantity: 2 },
        { card: { id: 'sol', name: 'Sol Ring', priceUsd: 2 }, quantity: 1, isFoil: true },
        { card: { id: 'mpc-2', name: 'Sol Ring', artSource: 'mpcfill', images: { normal: 'https://lh3.googleusercontent.com/d/abc=w400' } }, quantity: 1 },
      ],
    },
  ],
});

test('deriveCollection agrupa a mesma arte entre decks e ignora o "Talvez"', () => {
  const col = deriveCollection(data.decks);
  const sol = col.find((e) => e.key === entryKey(data.decks[0].cards.find((c) => c.card.id === 'sol')!.card, false))!;
  assert.equal(sol.quantity, 3);
  assert.deepEqual(sol.decks.map((d) => [d.deckName, d.quantity]), [['Atraxa', 1], ['Burn', 2]]);
  assert.ok(col.some((e) => e.isFoil && e.card.id === 'sol' && e.quantity === 1), 'foil é um item separado');
  const mpc = col.filter((e) => e.card.artSource === 'mpcfill');
  assert.equal(mpc.length, 1, 'artes MPCFill iguais (mesma URL) se juntam');
  assert.equal(mpc[0].quantity, 2);
  assert.ok(!col.some((e) => e.card.name === 'Counterspell'));
  assert.ok(col.some((e) => e.card.name === 'Atraxa'), 'comandante entra na coleção');
  const sum = summarize(col);
  assert.equal(sum.total, 1 + 1 + 8 + 1 + 2 + 1 + 1);
  assert.equal(sum.foil, 1);
});

test('mapEntryInDecks troca a arte ou remove de todos os decks', () => {
  const key = entryKey(data.decks[1].cards.find((c) => c.card.id === 'sol' && !c.isFoil)!.card, false);
  const swapped = mapEntryInDecks(data.decks, key, (c) => ({ ...c, id: 'sol-new' }));
  assert.equal(swapped[0].cards.find((c) => c.card.name === 'Sol Ring' && c.category === 'main')?.card.id, 'sol-new');
  assert.equal(swapped[1].cards.filter((c) => c.card.id === 'sol-new').length, 1);
  assert.ok(swapped[1].cards.some((c) => c.card.id === 'sol' && c.isFoil), 'foil não é afetado');
  const removed = mapEntryInDecks(data.decks, key, () => null);
  assert.equal(deriveCollection(removed).find((e) => e.key === key), undefined);
  const cmdKey = entryKey(data.decks[0].commander!, false);
  const noCmd = mapEntryInDecks(data.decks, cmdKey, () => null);
  assert.equal(noCmd[0].commander, undefined, 'remover o comandante atualiza o deck');
});

test('arte fica coerente entre coleção e decks nos dois sentidos', () => {
  // Coleção → decks: trocar a arte do comandante atualiza a carta e o campo commander do deck.
  const cmdKey = entryKey(data.decks[0].commander!, false);
  const viaCollection = mapEntryInDecks(data.decks, cmdKey, (c) => ({ ...c, id: 'atx-alt', images: { normal: 'alt.jpg' } }));
  assert.equal(viaCollection[0].commander?.id, 'atx-alt');
  assert.equal(viaCollection[0].cards.find((c) => c.category === 'commander')?.card.id, 'atx-alt');
  assert.ok(deriveCollection(viaCollection).some((e) => e.card.id === 'atx-alt'));
  assert.ok(!deriveCollection(viaCollection).some((e) => e.card.id === 'atx'));
  // Deck → coleção: trocar a arte de uma cópia em um deck aparece na coleção como essa arte.
  const decks = data.decks.map((d) => (d.id !== 'd2' ? d : { ...d, cards: d.cards.map((c) => (c.card.id === 'sol' && !c.isFoil ? { ...c, card: { ...c.card, id: 'sol-alt' } } : c)) }));
  const col = deriveCollection(decks);
  const alt = col.find((e) => e.card.id === 'sol-alt')!;
  assert.deepEqual(alt.decks.map((d) => [d.deckName, d.quantity]), [['Burn', 2]]);
  assert.equal(col.find((e) => e.card.id === 'sol' && !e.isFoil)?.quantity, 1, 'a cópia do outro deck mantém a arte dela');
});
