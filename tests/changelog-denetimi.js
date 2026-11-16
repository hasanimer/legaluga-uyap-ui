// CHANGELOG biçimi: "## x.y.z" başlıkları en yeni üstte; en üst başlık güncel sürüm, her başlığın notu yazılmış (HTML yorumu,
// örneğin bump-version'ın boş not şablonu, not sayılmaz). README sürüm notu paragrafı taşımaz, CHANGELOG'a bağlanır.
// Açık test ui/CHANGELOG.md'yi, özel depo testi kökteki CHANGELOG.md'yi bu tek denetimle sınar.
const assert = require('node:assert/strict');

const sayi = v => v.split('.').map(Number);
const buyuk = (a, b) => { const x = sayi(a), y = sayi(b), i = x.findIndex((n, j) => n !== y[j]); return i >= 0 && x[i] > y[i]; };

function changelogDenetle({ changelog, readme, surum }) {
  const bolumler = changelog.split(/^## /m).slice(1).map(bolum => {
    const [baslik, ...govde] = bolum.split('\n');
    return { baslik, not: govde.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim() };
  });
  assert.equal(bolumler[0]?.baslik, surum, 'en üst başlık');
  for (const [i, { baslik, not }] of bolumler.entries()) {
    assert.match(baslik, /^\d+\.\d+\.\d+$/);
    assert.ok(not, baslik + ': sürüm notu yazılmalı (yorum şablonu not sayılmaz)');
    if (i) assert.ok(buyuk(bolumler[i - 1].baslik, baslik), bolumler[i - 1].baslik + ' > ' + baslik);
  }
  assert.deepEqual(readme.match(/^\*\*\d+\.\d+\.\d+:\*\*/gm), null, 'README sürüm notu paragrafı taşımaz');
  assert.match(readme, /\[CHANGELOG\.md\]\(CHANGELOG\.md\)/);
  return bolumler;
}

module.exports = { changelogDenetle };
