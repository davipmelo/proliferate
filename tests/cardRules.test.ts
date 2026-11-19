import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDoubleFaced, matchesColorFilter, namesMatch, sameArt, mainType, parseManaCost, frontName } from '../src/types/cardRules.ts';
import type { Card } from '../src/types/models.ts';

const card = (p: Partial<Card>): Card => ({ id: 'x', name: 'X', cmc: 0, typeLine: '', colors: [], colorIdentity: [], images: {}, ...p });

test('namesMatch: tolerante a "//", "/" e só a frente', () => {
  assert.ok(namesMatch('Delver of Secrets // Insectile Aberration', 'Delver of Secrets'));
  assert.ok(namesMatch('Fire / Ice', 'Fire // Ice'));
  assert.ok(namesMatch('fire', 'Fire // Ice'));
  assert.ok(namesMatch('Lim-Dûl the Necromancer', 'Lim-Dul the Necromancer'));
  assert.ok(!namesMatch('Sol Ring', 'Sol Talisman'));
  assert.equal(frontName('Wear // Tear'), 'wear');
});

test('isDoubleFaced: layouts de dupla face real', () => {
  const faces = [{ name: 'A', images: { normal: 'a' } }, { name: 'B', images: { normal: 'b' } }];
  assert.ok(isDoubleFaced(card({ layout: 'transform', cardFaces: faces })));
  assert.ok(isDoubleFaced(card({ layout: 'modal_dfc', cardFaces: faces })));
  assert.ok(isDoubleFaced(card({ layout: 'double_faced_token', cardFaces: faces })));
  assert.ok(isDoubleFaced(card({ layout: 'meld' })));
  for (const layout of ['split', 'adventure', 'flip', 'aftermath', 'saga', 'class', 'case', 'prototype', 'normal']) {
    assert.ok(!isDoubleFaced(card({ layout, cardFaces: [{ name: 'A' }, { name: 'B' }] })), layout);
  }
  assert.ok(isDoubleFaced(card({ layout: 'normal', backImage: 'data:x' })));
});

test('sameArt: oficiais por id, customizadas pela URL', () => {
  assert.ok(sameArt(card({ id: 'a' }), card({ id: 'a' })));
  assert.ok(!sameArt(card({ id: 'a' }), card({ id: 'b' })));
  const m1 = card({ id: 'mpc-1', artSource: 'mpcfill', images: { normal: 'https://lh3.googleusercontent.com/d/abc=w1000' } });
  const m2 = card({ id: 'mpc-2', artSource: 'mpcfill', images: { normal: 'https://lh3.googleusercontent.com/d/abc=w400' } });
  const m3 = card({ id: 'mpc-1', artSource: 'mpcfill', images: { normal: 'https://lh3.googleusercontent.com/d/zzz=w1000' } });
  assert.ok(sameArt(m1, m2));
  assert.ok(!sameArt(m1, m3));
  assert.ok(!sameArt(m1, card({ id: 'mpc-1' })));
});

test('matchesColorFilter: exato e identidade', () => {
  const azorius = card({ colors: ['W', 'U'], colorIdentity: ['W', 'U'] });
  const mono = card({ colors: ['U'], colorIdentity: ['U'] });
  const artifact = card({ colors: [], colorIdentity: [] });
  assert.ok(matchesColorFilter(azorius, ['W', 'U'], 'exact'));
  assert.ok(!matchesColorFilter(mono, ['W', 'U'], 'exact'));
  assert.ok(matchesColorFilter(mono, ['W', 'U'], 'identity'));
  assert.ok(matchesColorFilter(artifact, ['W', 'U'], 'identity'));
  assert.ok(!matchesColorFilter(artifact, ['W', 'U'], 'exact'));
  assert.ok(matchesColorFilter(artifact, ['C'], 'exact'));
  assert.ok(matchesColorFilter(azorius, ['M'], 'exact'));
  assert.ok(!matchesColorFilter(mono, ['M'], 'exact'));
  assert.ok(matchesColorFilter(azorius, [], 'exact'));
});

test('mainType e parseManaCost', () => {
  assert.equal(mainType('Artifact Creature — Golem'), 'Creature');
  assert.equal(mainType('Legendary Land'), 'Land');
  assert.equal(mainType('Instant // Sorcery'), 'Instant');
  assert.deepEqual(parseManaCost('{2}{W}{U/P}'), ['2', 'W', 'U/P']);
});

test('mainType reconhece tipos em português e Kindred/Tribal', () => {
  assert.equal(mainType('Enchantment'), 'Enchantment');
  assert.equal(mainType('Encantamento'), 'Enchantment');
  assert.equal(mainType('Criatura — Elfo'), 'Creature');
  assert.equal(mainType('Mágica Instantânea'), 'Instant');
  assert.equal(mainType('Kindred Enchantment — Elf'), 'Enchantment');
  assert.equal(mainType('Proxy Alter MPCFill'), 'Other');
});
