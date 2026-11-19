import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driveIdFromUrl, mpcCardName, mpcNameMatches, mpcOrderEntries, normalizeImageUrl, parseMpcDate, parseMpcXml } from '../src/services/mpcfill.ts';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<order>
  <details><quantity>4</quantity><bracket>18</bracket><stock>(S30) Standard Smooth</stock><foil>false</foil></details>
  <fronts>
    <card><id>1O6s0C_XyLXsrGQEhg04kSPnWhjqMMBCE</id><slots>0,1</slots><name>Sol Ring (Dom).png</name><query>sol ring</query></card>
    <card><id>1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</id><slots>2</slots><name>Delver of Secrets.png</name><query>delver of secrets</query></card>
    <card><id>1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb</id><slots>3</slots><name>Tom &amp; Jerry.png</name><query></query></card>
  </fronts>
  <backs>
    <card><id>1ccccccccccccccccccccccccccccccc</id><slots>2</slots><name>Insectile Aberration.png</name><query>insectile aberration</query></card>
  </backs>
  <cardback>1ddddddddddddddddddddddddddddddd</cardback>
</order>`;

test('parseMpcXml lê frentes, versos e verso padrão', () => {
  const o = parseMpcXml(XML);
  assert.equal(o.quantity, 4);
  assert.equal(o.fronts.length, 3);
  assert.deepEqual(o.fronts[0].slots, [0, 1]);
  assert.equal(o.fronts[2].name, 'Tom & Jerry.png');
  assert.equal(o.backs.length, 1);
  assert.equal(o.cardback, '1ddddddddddddddddddddddddddddddd');
  assert.throws(() => parseMpcXml('<html></html>'));
});

test('mpcOrderEntries agrupa por arte e liga verso por slot', () => {
  const e = mpcOrderEntries(parseMpcXml(XML));
  assert.equal(e.length, 3);
  assert.equal(e[0].quantity, 2);
  assert.equal(e[1].back?.name, 'Insectile Aberration.png');
  assert.equal(mpcCardName(e[2].front), 'Tom & Jerry');
  assert.equal(mpcCardName(e[0].front), 'sol ring');
});

test('nomes e URLs do MPCFill / Google Drive', () => {
  assert.ok(mpcNameMatches('Sol Ring (Dom).png', 'Sol Ring'));
  assert.ok(!mpcNameMatches('Horn of Greed.png', 'Greed'));
  assert.ok(mpcNameMatches('Delver of Secrets [Borderless].jpg', 'Delver of Secrets // Insectile Aberration'));
  assert.equal(driveIdFromUrl('https://drive.google.com/file/d/1O6s0C_XyLXsrGQEhg04kSPnWhjqMMBCE/view?usp=sharing'), '1O6s0C_XyLXsrGQEhg04kSPnWhjqMMBCE');
  assert.equal(normalizeImageUrl('https://drive.google.com/open?id=1O6s0C_XyLXsrGQEhg04kSPnWhjqMMBCE'), 'https://lh3.googleusercontent.com/d/1O6s0C_XyLXsrGQEhg04kSPnWhjqMMBCE=w1000');
  assert.equal(normalizeImageUrl(' https://x.com/a.png '), 'https://x.com/a.png');
  assert.equal(parseMpcDate('20th February, 2023'), '2023-02-20');
});
