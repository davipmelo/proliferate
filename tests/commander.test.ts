import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canBeCommander, hasPartner } from '../src/types/cardRules.ts';
import { detectCommanderFromList } from '../src/components/decks/deckBuild.ts';

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
