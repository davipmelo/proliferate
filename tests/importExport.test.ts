import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeEntries, parseDeckList, parseLine } from '../src/services/importParser.ts';
import { exportCollection, exportDeck } from '../src/services/exporters.ts';
import { createBackup, mergeData, parseBackup } from '../src/services/backup.ts';
import { normalizeAppData, normalizeDeck } from '../src/services/normalize.ts';
import { detectPreset, expandQueue, paginate, PROXY_PRESETS, sheetLines, slotPosition, MARGIN_X, MARGIN_Y } from '../src/services/proxyLayout.ts';
import { DEFAULT_PROXY_SETTINGS } from '../src/services/storage.ts';

test('parseLine: quantidade, edição, número e foil', () => {
  assert.deepEqual(parseLine('1 Sol Ring (C21) 263'), { quantity: 1, name: 'Sol Ring', set: 'c21', number: '263', foil: undefined });
  assert.deepEqual(parseLine('4x Lightning Bolt'), { quantity: 4, name: 'Lightning Bolt', set: undefined, number: undefined, foil: undefined });
  assert.equal(parseLine('1 Sol Ring (C21) 263 *F*')?.foil, true);
  assert.equal(parseLine('2 Counterspell [MH2] 267')?.set, 'mh2');
  assert.equal(parseLine('Island')?.quantity, 1);
  assert.equal(parseLine('Island x10')?.quantity, 10);
  assert.equal(parseLine('1 Fire // Ice (MH2) 290')?.name, 'Fire // Ice');
  assert.equal(parseLine('1 Lightning Bolt (M11)')?.set, 'm11');
  assert.equal(parseLine('1 Anel Solar')?.name, 'Anel Solar');
  assert.equal(parseLine(''), null);
});

test('parseDeckList: Arena com seções e linha em branco', () => {
  const r = parseDeckList('Commander\n1 Atraxa, Praetors\' Voice (2XM) 190\n\nDeck\n1 Sol Ring\n4 Island\n\nSideboard\n2 Pyroblast');
  assert.equal(r.format, 'arena');
  assert.equal(r.entries.find((e) => e.name.startsWith('Atraxa'))?.section, 'commander');
  assert.equal(r.entries.find((e) => e.name === 'Island')?.section, 'main');
  assert.equal(r.entries.find((e) => e.name === 'Pyroblast')?.section, 'sideboard');
});

test('parseDeckList: MTGO (sideboard após linha em branco), Moxfield e LigaMagic', () => {
  const mtgo = parseDeckList('4 Lightning Bolt\n20 Mountain\n\n3 Pyroblast');
  assert.equal(mtgo.entries[2].section, 'sideboard');
  const mox = parseDeckList('1 Sol Ring (C21) 263\n\nSIDEBOARD:\n1 Duress (M19) 94');
  assert.equal(mox.format, 'moxfield');
  assert.equal(mox.entries[1].section, 'sideboard');
  const liga = parseDeckList('Comandante\n1 Atraxa\n\nPrincipal\n4 Contramágica\n1 Anel Solar');
  assert.equal(liga.entries[0].section, 'commander');
  assert.equal(liga.entries[1].section, 'main');
  assert.equal(parseDeckList('4 Relâmpago').format, 'ligamagic');
});

test('parseDeckList: CSV e mergeEntries', () => {
  const csv = parseDeckList('Quantidade,Nome,Edição,Número,Foil,Categoria\n2,"Sol Ring",C21,263,sim,main\n1,Duress,M19,94,,sideboard');
  assert.equal(csv.format, 'csv');
  assert.equal(csv.entries[0].foil, true);
  assert.equal(csv.entries[1].section, 'sideboard');
  const m = mergeEntries(parseDeckList('2 Island\n3 Island\n1 Island (M21) 264').entries);
  assert.equal(m.length, 2);
  assert.equal(m[0].quantity, 5);
});

const deck = normalizeDeck({
  id: 'd', name: 'Teste', format: 'commander',
  commander: { id: 'c', name: 'Atraxa, Praetors\' Voice', setCode: '2xm', collectorNumber: '190' },
  cards: [
    { card: { id: 's', name: 'Sol Ring', set: 'c21', collector_number: '263', priceUsd: 1.5 }, quantity: 1, isFoil: true },
    { card: { id: 'f', name: 'Delver of Secrets // Insectile Aberration', set: 'isd', collector_number: '51' }, quantity: 4 },
    { card: { id: 'p', name: 'Pyroblast', set: 'ice', collector_number: '213' }, quantity: 2, category: 'sideboard' },
  ],
});

test('exportDeck: Arena, Moxfield, LigaMagic, CSV e JSON', () => {
  const arena = exportDeck(deck, 'arena');
  assert.match(arena, /^Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n/);
  assert.match(arena, /4 Delver of Secrets\n/);
  assert.match(arena, /Sideboard\n2 Pyroblast/);
  const mox = exportDeck(deck, 'moxfield');
  assert.match(mox, /1 Sol Ring \(C21\) 263 \*F\*/);
  assert.match(mox, /SIDEBOARD:\n2 Pyroblast \(ICE\) 213/);
  assert.match(exportDeck(deck, 'ligamagic'), /^Comandante\n/);
  const csv = exportDeck(deck, 'csv').split('\n');
  assert.equal(csv[0], 'Quantidade,Nome,Edição,Número,Foil,Categoria,Preço USD');
  assert.ok(csv.some((l) => l.startsWith('1,Sol Ring,C21,263,sim,main,1.50')));
  assert.equal(JSON.parse(exportDeck(deck, 'json')).deck.name, 'Teste');
  // Ida e volta: a exportação Moxfield é lida de novo pelo parser.
  const back = parseDeckList(mox).entries;
  assert.equal(back.find((e) => e.name === 'Sol Ring')?.number, '263');
  assert.equal(back.find((e) => e.name === 'Pyroblast')?.section, 'sideboard');
});

test('exportCollection', () => {
  const d = normalizeAppData({ collection: [{ card: { id: '1', name: 'Zur' }, quantity: 1 }, { card: { id: '2', name: 'Abzan', set: 'ktk', collector_number: '1' }, quantity: 3, isFoil: true }] });
  assert.equal(exportCollection(d.collection, 'moxfield'), '3 Abzan (KTK) 1 *F*\n1 Zur\n');
});

test('backup: criar, ler, mesclar sem duplicar ids e somando quantidades', () => {
  const a = normalizeAppData({
    collection: [{ id: 'c1', card: { id: 'sol', name: 'Sol Ring' }, quantity: 1 }],
    decks: [{ id: 'd1', name: 'A', updatedAt: '2024-01-01', tags: ['t1'] }],
    tags: [{ id: 't1', name: 'Casual' }],
    proxies: [{ id: 'p1', card: { id: 'sol', name: 'Sol Ring' }, quantity: 1 }],
  });
  const b = parseBackup(JSON.stringify(createBackup(normalizeAppData({
    collection: [{ id: 'c1', card: { id: 'sol', name: 'Sol Ring' }, quantity: 2 }, { id: 'c9', card: { id: 'isl', name: 'Island' }, quantity: 5 }],
    decks: [{ id: 'd1', name: 'A', updatedAt: '2024-01-01' }, { id: 'd1x', name: 'B', tags: ['tX'], cards: [{ card: { id: 'isl', name: 'Island' }, collectionItemId: 'c9' }] }],
    tags: [{ id: 'tX', name: 'casual' }],
    proxies: [{ id: 'p1', card: { id: 'sol', name: 'Sol Ring' }, quantity: 3 }],
  }))));
  assert.equal(b.schemaVersion, 2);
  const m = mergeData(a, b.data);
  assert.equal(m.collection.find((i) => i.card.id === 'sol')?.quantity, 3);
  assert.equal(m.collection.length, 2);
  assert.equal(m.decks.length, 2, 'deck idêntico é ignorado');
  assert.deepEqual(m.decks.find((d) => d.name === 'B')?.tags, ['t1'], 'tag com mesmo nome é reaproveitada');
  assert.equal(m.tags.length, 1);
  assert.equal(m.proxies[0].quantity, 4);
  assert.equal(new Set(m.collection.map((c) => c.id)).size, m.collection.length);
  assert.throws(() => parseBackup('{"foo":1}'));
  assert.throws(() => parseBackup('nope'));
});

test('proxyLayout: margens centralizadas, páginas sem sobras vazias e presets', () => {
  assert.equal(MARGIN_X, 10.5);
  assert.equal(MARGIN_Y, 16.5);
  assert.deepEqual(slotPosition(4), { x: 73.5, y: 104.5 });
  const items = [
    { id: 'a', quantity: 5, card: { id: 'a', name: 'A', cmc: 0, typeLine: '', colors: [], colorIdentity: [], images: { large: 'a' } } },
    { id: 'b', quantity: 2, card: { id: 'b', name: 'B', layout: 'transform', cmc: 0, typeLine: '', colors: [], colorIdentity: [], images: { large: 'b' }, cardFaces: [{ name: 'B1', images: { large: 'b1' } }, { name: 'B2', images: { large: 'b2', normal: 'b2' } }] } },
  ];
  const slots = expandQueue(items as any);
  assert.equal(slots.length, 9);
  assert.equal(slots[6].face, 'back');
  assert.equal(slots[6].image, 'b2');
  assert.equal(paginate(slots).length, 1);
  assert.equal(paginate([...slots, slots[0]]).length, 2);
  assert.equal(paginate([]).length, 0);
  assert.equal(detectPreset(DEFAULT_PROXY_SETTINGS), 'guillotine');
  for (const p of PROXY_PRESETS) assert.equal(detectPreset({ ...DEFAULT_PROXY_SETTINGS, ...p.values }), p.id);
  assert.equal(detectPreset({ ...DEFAULT_PROXY_SETTINGS, cutLineWidth: 0.55 }), null);
  const lines = sheetLines({ ...DEFAULT_PROXY_SETTINGS, cropMarks: false });
  assert.equal(lines.length, 8);
});
