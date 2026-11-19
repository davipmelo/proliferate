import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppData, normalizeCard, normalizeDeck, packAppData, unpackAppData } from '../src/services/normalize.ts';
import { computeUsage, summarizeCollection } from '../src/services/usage.ts';

test('normalizeCard aceita formato antigo e JSON cru do Scryfall', () => {
  const old = normalizeCard({ id: 'a', name: 'Sol Ring', imageUrl: 'https://img/n.jpg', set: 'C21', price: '1.5', type_line: 'Artifact' });
  assert.equal(old.images.normal, 'https://img/n.jpg');
  assert.equal(old.setCode, 'c21');
  assert.equal(old.priceUsd, 1.5);
  assert.equal(old.typeLine, 'Artifact');
  const raw = normalizeCard({
    id: 'b', name: 'A // B', layout: 'transform', cmc: 3,
    card_faces: [{ name: 'A', mana_cost: '{2}{G}', type_line: 'Creature', colors: ['G'], image_uris: { normal: 'f.jpg', small: 'fs.jpg' } }, { name: 'B', image_uris: { normal: 'b.jpg' } }],
  });
  assert.equal(raw.images.normal, 'f.jpg');
  assert.equal(raw.manaCost, '{2}{G}');
  assert.deepEqual(raw.colors, ['G']);
  assert.equal(raw.cardFaces?.[1].images?.normal, 'b.jpg');
});

test('normalizeDeck: junta cópias, coloca comandante e limita capa', () => {
  const deck = normalizeDeck({
    name: '  Meu deck ',
    format: 'commander',
    commander: { id: 'c1', name: 'Atraxa' },
    cards: [
      { card: { id: 'x', name: 'Sol Ring' }, quantity: 1 },
      { card: { id: 'x', name: 'Sol Ring' }, quantity: 2 },
      { card: { id: 'c1', name: 'Atraxa' }, quantity: 1, category: 'main' },
      { card: { id: 'y', name: 'Island' }, quantity: 1, board: 'side' },
    ],
    cover: { zoom: 9, positionY: -4 },
    format_unknown: true,
  });
  assert.equal(deck.name, 'Meu deck');
  const sol = deck.cards.filter((c) => c.card.id === 'x');
  assert.equal(sol.length, 1);
  assert.equal(sol[0].quantity, 3);
  assert.equal(deck.cards.find((c) => c.category === 'commander')?.card.name, 'Atraxa');
  assert.equal(deck.cards.filter((c) => c.card.name === 'Atraxa').length, 1);
  assert.equal(deck.cards.find((c) => c.card.id === 'y')?.category, 'sideboard');
  assert.equal(deck.cover.zoom, 3);
  assert.equal(deck.cover.positionY, 0);
  assert.equal(normalizeDeck({ format: 'xyz' }).format, 'casual');
});

test('normalizeAppData remove ids duplicados', () => {
  const d = normalizeAppData({ collection: [{ id: 'a', card: { id: '1', name: 'X' } }, { id: 'a', card: { id: '2', name: 'Y' } }] });
  assert.equal(d.collection.length, 2);
  assert.notEqual(d.collection[0].id, d.collection[1].id);
});

test('pack/unpack preserva dados e deduplica cartas', () => {
  const card = { id: 'sol', name: 'Sol Ring', images: { normal: 'n' } };
  const data = normalizeAppData({
    collection: [{ id: 'c1', card, quantity: 2 }],
    decks: [{ id: 'd1', name: 'D', cards: [{ instanceId: 'i1', card, quantity: 1, collectionItemId: 'c1' }] }],
    proxies: [{ id: 'p1', card: { ...card, utilityType: 'token' }, quantity: 3 }],
  });
  const packed = packAppData(data);
  assert.equal(Object.keys(packed.cards).length, 1);
  const back = unpackAppData(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(back.collection, data.collection);
  assert.deepEqual(back.decks, data.decks);
  assert.equal((back.proxies[0].card as any).utilityType, 'token');
});

test('computeUsage: em uso, disponível e decks por impressão', () => {
  const data = normalizeAppData({
    collection: [{ id: 'c1', card: { id: 'sol', name: 'Sol Ring' }, quantity: 2 }, { id: 'c2', card: { id: 'isl', name: 'Island' }, quantity: 10 }],
    decks: [
      { id: 'd1', name: 'A', cards: [{ card: { id: 'sol', name: 'Sol Ring' }, quantity: 1 }, { card: { id: 'isl', name: 'Island' }, quantity: 4, collectionItemId: 'c2' }] },
      { id: 'd2', name: 'B', cards: [{ card: { id: 'sol', name: 'Sol Ring' }, quantity: 2 }, { card: { id: 'isl', name: 'Island' }, quantity: 9, category: 'maybeboard' }] },
    ],
  });
  const u = computeUsage(data.collection, data.decks);
  assert.equal(u.get('c1')!.inUse, 3);
  assert.equal(u.get('c1')!.available, 0);
  assert.equal(u.get('c1')!.decks.length, 2);
  assert.equal(u.get('c2')!.inUse, 4);
  assert.equal(u.get('c2')!.available, 6);
  const s = summarizeCollection(data.collection, u);
  assert.equal(s.total, 12);
  assert.equal(s.inUse, 6);
  assert.equal(s.available, 6);
});
