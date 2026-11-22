import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canBeCommander, hasPartner } from '../src/types/cardRules.ts';
import { assignCommanders, buildDeckCards, canPair, detectCommanderFromList } from '../src/components/decks/deckBuild.ts';
import { parseDeckList } from '../src/services/importParser.ts';

const card = (name: string, typeLine: string, oracleText = '') => ({ id: name, name, typeLine, oracleText, cmc: 0, colors: [], colorIdentity: [], images: {} });
const entry = (c: ReturnType<typeof card>, quantity = 1, section = 'main') => ({ card: c, entry: { name: c.name, quantity, section, line: 1 } }) as any;

test('canBeCommander e hasPartner', () => {
  assert.ok(canBeCommander(card('Atraxa', 'Legendary Creature — Phyrexian Angel Horror')));
  assert.ok(canBeCommander(card('Teferi', 'Legendary Planeswalker — Teferi', 'Teferi, Temporal Archmage can be your commander.')));
  assert.ok(!canBeCommander(card('Sol Ring', 'Artifact')));
  assert.ok(!canBeCommander(card('Elspeth', 'Legendary Planeswalker — Elspeth')));
  assert.ok(hasPartner(card('Thrasios', 'Legendary Creature', 'Partner (You can have two commanders if both have partner.)')));
});

test('detectCommanderFromList usa a primeira carta quando possível', () => {
  const atraxa = card('Atraxa', 'Legendary Creature — Angel');
  const sol = card('Sol Ring', 'Artifact');
  assert.equal(detectCommanderFromList([entry(atraxa), entry(sol)]).commander?.name, 'Atraxa');
  assert.equal(detectCommanderFromList([entry(sol), entry(atraxa)]).commander, undefined);
  assert.equal(detectCommanderFromList([entry(atraxa, 2)]).commander, undefined, 'mais de uma cópia não é comandante');
  assert.equal(detectCommanderFromList([entry(atraxa, 1, 'commander'), entry(sol)]).consumed, 0, 'lista já tem seção Commander');
  const t = card('Thrasios', 'Legendary Creature — Merfolk', 'Partner');
  const v = card('Vial Smasher', 'Legendary Creature — Goblin', 'Partner');
  const r = detectCommanderFromList([entry(t), entry(v), entry(sol)]);
  assert.equal(r.partner?.name, 'Vial Smasher');
  assert.equal(r.consumed, 2);
});

test('assignCommanders deduz comandante e parceiro sem seção Commander', () => {
  const sol = card('Sol Ring', 'Artifact');
  const atraxa = card('Atraxa', 'Legendary Creature — Angel');
  const t = card('Thrasios', 'Legendary Creature — Merfolk', 'Partner (You can have two commanders if both have partner.)');
  const v = card('Vial Smasher', 'Legendary Creature — Goblin', 'Partner (You can have two commanders if both have partner.)');
  // Primeira carta
  let r = assignCommanders([entry(atraxa), entry(sol)], { hasCommander: true });
  assert.equal(r.commander?.name, 'Atraxa');
  assert.equal(r.rest.length, 1);
  assert.ok(r.detected.commander);
  // Última carta (lista com o comandante no fim)
  r = assignCommanders([entry(sol), entry(atraxa)], { hasCommander: true });
  assert.equal(r.commander?.name, 'Atraxa');
  // Sideboard de 1–2 cartas (MTGO)
  r = assignCommanders([entry(sol), entry(card('Island', 'Basic Land — Island')), entry(t, 1, 'sideboard'), entry(v, 1, 'sideboard')], { hasCommander: true });
  assert.equal(r.commander?.name, 'Thrasios');
  assert.equal(r.partner?.name, 'Vial Smasher');
  assert.equal(r.rest.length, 2);
  // Parceiro no fim da lista com comandante no início
  r = assignCommanders([entry(t), entry(sol), entry(v)], { hasCommander: true });
  assert.equal(r.partner?.name, 'Vial Smasher');
  // Comandante escolhido no campo sai da lista e o parceiro é achado na lista
  r = assignCommanders([entry(sol), entry(t), entry(v)], { hasCommander: true, commander: t });
  assert.equal(r.commander?.name, 'Thrasios');
  assert.equal(r.partner?.name, 'Vial Smasher');
  assert.deepEqual(r.rest.map((x) => x.card.name), ['Sol Ring']);
  // Seção Commander com duas cartas: a segunda vira parceiro
  r = assignCommanders([entry(t, 1, 'commander'), entry(v, 1, 'commander'), entry(sol)], { hasCommander: true });
  assert.equal(r.commander?.name, 'Thrasios');
  assert.equal(r.partner?.name, 'Vial Smasher');
  assert.ok(!r.detected.commander);
  // Formato sem comandante: não deduz
  r = assignCommanders([entry(atraxa), entry(sol)], { hasCommander: false });
  assert.equal(r.commander, undefined);
});

test('canPair cobre Background e Partner with', () => {
  const wilson = card('Wilson, Refined Grizzly', 'Legendary Creature — Bear Warrior', 'Choose a Background (You can have a Background as a second commander.)');
  const bg = card('Raised by Giants', 'Legendary Enchantment — Background');
  assert.ok(canPair(wilson, bg));
  const pir = card('Pir, Imaginative Rascal', 'Legendary Creature — Human', 'Partner with Toothy, Imaginary Friend');
  const toothy = card('Toothy, Imaginary Friend', 'Legendary Creature — Illusion', 'Partner with Pir, Imaginative Rascal');
  assert.ok(canPair(pir, toothy));
  assert.ok(!canPair(pir, card('Atraxa', 'Legendary Creature — Angel')));
});

test('parseDeckList reconhece marcas *CMDR* e [Commander]', () => {
  const p = parseDeckList('1 Sol Ring\n1 Atraxa, Praetors\' Voice *CMDR*\n1 Thrasios [Commander{top}]');
  assert.deepEqual(p.entries.map((e) => [e.name, e.section]), [['Sol Ring', 'main'], ["Atraxa, Praetors' Voice", 'commander'], ['Thrasios', 'commander']]);
});

test('buildDeckCards mantém as artes já escolhidas, cópia a cópia', () => {
  const art = (id: string, name: string) => ({ ...card(name, 'Basic Land'), id });
  const existing = [
    { instanceId: 'f1', card: art('forest-a', 'Forest'), quantity: 1, category: 'main' },
    { instanceId: 'f2', card: art('forest-b', 'Forest'), quantity: 1, category: 'main' },
    { instanceId: 's1', card: art('sol-mpc', 'Sol Ring'), quantity: 1, category: 'main', isFoil: true },
  ] as any[];
  const listed = (c: ReturnType<typeof card>, quantity: number, set?: string) => ({ card: c, entry: { name: c.name, quantity, section: 'main', line: 1, set } }) as any;
  const resolved = [listed(art('forest-new', 'Forest'), 3), listed(art('sol-c21', 'Sol Ring'), 1, 'c21'), listed(art('bolt', 'Lightning Bolt'), 1)];

  const kept = buildDeckCards(resolved, existing, { keepArts: true });
  assert.ok(kept.every((c) => c.quantity === 1));
  assert.deepEqual(kept.filter((c) => c.card.name === 'Forest').map((c) => c.card.id), ['forest-a', 'forest-b', 'forest-b'], 'cópia extra sem edição usa uma arte existente');
  assert.deepEqual(kept.filter((c) => c.card.name === 'Forest').slice(0, 2).map((c) => c.instanceId), ['f1', 'f2']);
  const sol = kept.find((c) => c.card.name === 'Sol Ring')!;
  assert.equal(sol.card.id, 'sol-mpc', 'mantém a arte mesmo com edição na lista');
  assert.equal(sol.isFoil, true);
  assert.equal(kept.find((c) => c.card.name === 'Lightning Bolt')?.card.id, 'bolt');

  const fresh = buildDeckCards(resolved, existing, { keepArts: false });
  assert.deepEqual([...new Set(fresh.map((c) => c.card.id))], ['forest-new', 'sol-c21', 'bolt']);
  assert.equal(fresh.length, 5);
});
