import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPath, colorsFromParam, colorsToParam, listFromParam, parsePath, relativePath } from '../src/services/routes.ts';

test('relativePath: remove a base do site', () => {
  assert.equal(relativePath('/proliferate/', '/proliferate/'), '');
  assert.equal(relativePath('/proliferate', '/proliferate/'), '');
  assert.equal(relativePath('/proliferate/decks/abc/', '/proliferate/'), 'decks/abc');
  assert.equal(relativePath('/collection', '/'), 'collection');
});

test('parsePath: aba, segmentos e padrão', () => {
  assert.deepEqual(parsePath(''), { tab: 'decks', rest: [] });
  assert.deepEqual(parsePath('nada'), { tab: 'decks', rest: [] });
  assert.deepEqual(parsePath('collection'), { tab: 'collection', rest: [] });
  assert.deepEqual(parsePath('decks/a%20b'), { tab: 'decks', rest: ['a b'] });
  assert.deepEqual(parsePath(buildPath('decks', 'x/y')), { tab: 'decks', rest: ['x/y'] });
});

test('cores e listas na URL', () => {
  assert.equal(colorsToParam(['G', 'W', 'U']), 'wug');
  assert.deepEqual(colorsFromParam('gwx'), ['W', 'G']);
  assert.deepEqual(listFromParam(''), []);
  assert.deepEqual(listFromParam('a,,b'), ['a', 'b']);
});
