import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_SIZE, decodePayload, encodePayload, extractImages, gunzip, gzip, MAX_DOC_BYTES, restoreImages, sha256Hex } from '../src/services/cloudCodec.ts';
import { normalizeAppData, packAppData, unpackAppData } from '../src/services/normalize.ts';
import { stableJson } from '../src/services/sync.ts';

test('gzip ida e volta (com acentos)', async () => {
  const text = 'Coleção de cartas — Relâmpago '.repeat(200);
  const gz = await gzip(text);
  assert.ok(gz.length < text.length / 5);
  assert.equal(await gunzip(gz), text);
});

test('extração de imagens embutidas', async () => {
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
  const { value, images } = await extractImages({ a: [{ img }, { img }], small: 'data:image/png;base64,xx', url: 'https://x' });
  assert.equal(Object.keys(images).length, 1, 'mesma imagem guardada uma vez');
  const v = value as any;
  assert.match(v.a[0].img, /^cloudimg:/);
  assert.equal(v.small, 'data:image/png;base64,xx', 'imagens pequenas ficam inline');
  assert.deepEqual(restoreImages(value, images), { a: [{ img }, { img }], small: 'data:image/png;base64,xx', url: 'https://x' });
});

test('encode/decode: dados do app com imagem própria', async () => {
  const data = normalizeAppData({
    collection: [{ id: 'c1', card: { id: 'custom-1', name: 'Minha Carta', artSource: 'custom', images: { normal: 'data:image/jpeg;base64,' + 'B'.repeat(9000) } }, quantity: 1 }],
    decks: [{ id: 'd1', name: 'Deck', cards: [{ card: { id: 'sol', name: 'Sol Ring' }, quantity: 1 }] }],
  });
  const packed = packAppData(data);
  const enc = await encodePayload(packed);
  assert.ok(enc.data, 'cabe inline');
  assert.equal(Object.keys(enc.images).length, 1);
  assert.equal(enc.hash, await sha256Hex(JSON.stringify(packed)));
  const back = unpackAppData(await decodePayload(enc, enc.images));
  assert.deepEqual(back, data);
});

test('encode: divide em pedaços quando passa do limite e o hash detecta mudanças', async () => {
  // Texto pouco compressível para forçar vários pedaços.
  let seed = 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31).toString(36).slice(2);
  const big = { notes: Array.from({ length: 220000 }, rnd) };
  const enc = await encodePayload(big);
  assert.ok(!enc.data && enc.chunks && enc.chunks.length >= 2);
  assert.ok(enc.chunks!.every((c) => c.length <= CHUNK_SIZE));
  assert.ok(enc.gzBytes > MAX_DOC_BYTES);
  assert.deepEqual(await decodePayload({ chunks: enc.chunks }, {}), big);
  const enc2 = await encodePayload({ notes: [...big.notes.slice(0, -1), 'x'] });
  assert.notEqual(enc.hash, enc2.hash);
});

test('stableJson ignora a ordem das chaves', () => {
  assert.equal(stableJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } }), stableJson({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
});
