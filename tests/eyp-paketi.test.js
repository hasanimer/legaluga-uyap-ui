const test = require('node:test');
const assert = require('node:assert/strict');
const zip = require('../src/extension/durusma-paketi-zip.js');
const { zipYap } = require('./zip-yardimci.js');
const paket = entries => new Blob([zipYap(entries)]);
const pdf = '%PDF-1.7\nSentetik üst yazı\n%%EOF';

test('EYP üst yazısı dizin sırasından bağımsız seçilir; ekler ve Unicode adlar korunur', async () => {
  for (const sikistir of [false, true]) {
    const p = await zip.eyp(paket([
      { ad: '_rels/.rels', veri: '<Relationships/>' },
      { ad: 'Ekler/İşlem.pdf', veri: '%PDF-ek' },
      { ad: 'UstYazi/Yazı.pdf', veri: pdf, sikistir },
      { ad: 'UstVeri/UstVeri.xml', veri: '<metadata/>' },
      { ad: 'Imzalar/imza.p7s', veri: 'imza' }
    ]));
    assert.deepEqual(p.belgeler.map(x => x.ad), ['UstYazi/Yazı.pdf', 'Ekler/İşlem.pdf']);
    assert.equal(p.ilk, 0);
    const doc = await p.oku(p.ilk);
    assert.equal(doc.filename, 'Yazı.pdf');
    assert.equal(await doc.blob.text(), pdf);
    assert.deepEqual(doc.bas.slice(0, 4), [37, 80, 68, 70]);
  }
});
test('ÜstYazı yazımı ve Windows ayırıcıları tanınır; belirsiz üst yazı otomatik seçilmez', async () => {
  const p = await zip.eyp(paket([{ ad: 'ÜstYazı\\yazı.pdf', veri: pdf }]));
  assert.equal(p.ilk, 0);
  assert.equal(p.belgeler[0].ustYazi, true);
  for (const entries of [
    [{ ad: 'UstYazi/a.pdf', veri: pdf }, { ad: 'UstYazi/b.pdf', veri: pdf }],
    [{ ad: 'Ekler/a.pdf', veri: pdf }, { ad: 'Ekler/b.pdf', veri: pdf }]
  ]) assert.equal((await zip.eyp(paket(entries))).ilk, -1);
});
test('EYP bozuk CRC, şifreleme, geçersiz yollar, yinelenen adlar ve boyut sınırını reddeder', async () => {
  for (const ad of ['../x.pdf', '/x.pdf', 'C:/x.pdf', 'Ekler/../x.pdf', 'Ekler/./x.pdf'])
    await assert.rejects(zip.eyp(paket([{ ad, veri: pdf }])), /yolu geçersiz/);
  await assert.rejects(zip.eyp(paket([{ ad: 'x.pdf', veri: pdf }, { ad: 'x.pdf', veri: pdf }])), /yinelenen/);
  await assert.rejects(zip.eyp(new Blob(['bozuk'])), /dizini/);
  await assert.rejects(zip.eyp({ size: zip.SINIR.boyut + 1 }), /64 MiB/);
  await assert.rejects(zip.eyp(paket([{ ad: 'UstVeri.xml', veri: '<xml/>' }])), /üst yazı/);
  const bad = zipYap([{ ad: 'UstYazi/x.pdf', veri: pdf }]);
  bad[30 + Buffer.byteLength('UstYazi/x.pdf')] ^= 1;
  const p = await zip.eyp(new Blob([bad]));
  await assert.rejects(p.oku(0), /bütünlük/);
  const encrypted = zipYap([{ ad: 'x.pdf', veri: pdf }]);
  const view = new DataView(encrypted.buffer);
  const central = encrypted.findIndex((v, i) => v === 0x50 && encrypted[i + 1] === 0x4b && encrypted[i + 2] === 1 && encrypted[i + 3] === 2);
  view.setUint16(6, 0x801, true); view.setUint16(central + 8, 0x801, true);
  await assert.rejects((await zip.eyp(new Blob([encrypted]))).oku(0), /Şifreli/);
});
test('EYP açılması ve belge seçimi iptal edilebilir', async () => {
  const ac = new AbortController(); ac.abort();
  await assert.rejects(zip.eyp(paket([{ ad: 'x.pdf', veri: pdf }]), { signal: ac.signal }), { name: 'AbortError' });
  const p = await zip.eyp(paket([{ ad: 'x.pdf', veri: pdf }]));
  await assert.rejects(p.oku(0, { signal: ac.signal }), { name: 'AbortError' });
  await assert.rejects(p.oku(-1), /seçimi/);
});
