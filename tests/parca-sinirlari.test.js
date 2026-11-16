const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DERLENMEZ, SATIR_SONU_YOK, ihlaller, karsilastir, ACIK_ISTISNALAR } = require('./parca-sinirlari');

// Kural ve açık istisnalar tests/parca-sinirlari.js içindedir; açık parçaların listesi publication/FRAGMENTS.json'dan okunur.
const root = path.join(__dirname, '..');

test('parça sınırı kuralı: tek başına ya da fonksiyon gövdesi olarak derlenmeyen ya da satır sonuyla bitmeyen parça ayrılır', () => {
  assert.deepEqual(ihlaller('a();\n'), []);
  assert.deepEqual(ihlaller('return a();\n'), [], 'fonksiyon gövdesi olarak derlenir');
  assert.deepEqual(ihlaller('await a();\n'), [], 'async fonksiyon gövdesi olarak derlenir');
  assert.deepEqual(ihlaller('a(1,\n'), [DERLENMEZ]);
  assert.deepEqual(ihlaller('a(); // son'), [SATIR_SONU_YOK]);
  assert.deepEqual(ihlaller('  }'), [DERLENMEZ, SATIR_SONU_YOK]);
  // Bir geri çağrıyı kapatıp ötekini açan parça ifade sarmalıyla derlenir; bildirim sarmalı onu ayırır.
  for (const ara of ["  });\n  x.on('y', function () {\n", '}).catch(() => {\n', '}, 1);\nsetTimeout(() => {\n']) {
    assert.deepEqual(ihlaller(ara), [DERLENMEZ], ara);
  }
  assert.deepEqual(karsilastir({ a: [DERLENMEZ] }, {}), { yeni: ['a: derlenmez'], fazla: [] });
  assert.deepEqual(karsilastir({ a: [DERLENMEZ] }, { a: [DERLENMEZ, SATIR_SONU_YOK], b: [DERLENMEZ] }),
    { yeni: [], fazla: ['a: satır sonu yok', 'b: derlenmez'] });
});

test('açık parçalar derlenir ve satır sonuyla biter; bugünkü istisnalar yalnız kısalır', () => {
  const { fragments } = JSON.parse(fs.readFileSync(path.join(root, 'publication/FRAGMENTS.json'), 'utf8'));
  assert.deepEqual([...new Set(fragments.map(f => f.source))].sort(), ['background.js', 'common.js', 'content.js']);
  const bulunan = {};
  for (const { path: yol } of fragments) {
    const turler = ihlaller(fs.readFileSync(path.join(root, yol), 'utf8'));
    if (turler.length) bulunan[yol] = turler;
  }
  const { yeni, fazla } = karsilastir(bulunan, ACIK_ISTISNALAR);
  assert.deepEqual(yeni, [], 'parça sınırını iki tam deyimin arasına, bir satır sonunun ardına alın');
  assert.deepEqual(fazla, [], 'artık kurala uyan ya da bulunmayan parçayı tests/parca-sinirlari.js istisnalarından çıkarın');
});
