/* global module */
// Yerel ZIP okuyucu: merkezi dizin, stored/deflate girdileri. Açılan akış belleğe alınmadan önce sınırlandırılır.
(() => {
  'use strict';
  const SINIR = { girdi: 200, boyut: 64 * 1024 * 1024 };
  function hata(mesaj) { return Object.assign(new Error(mesaj), { code: 'zip' }); }
  const crcTable = new Uint32Array(256).map((_, n) => {
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const b of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  }
  function girdiler(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length > SINIR.boyut) throw hata('ZIP kaynak boyutu sınırı aşıldı');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50 && i + 22 + dv.getUint16(i + 20, true) === u8.length) { eocd = i; break; }
    }
    if (eocd < 0) throw hata('ZIP dizini bulunamadı');
    const sayi = dv.getUint16(eocd + 10, true), dizin = dv.getUint32(eocd + 16, true), dizinBoyut = dv.getUint32(eocd + 12, true);
    if (dv.getUint16(eocd + 4, true) || dv.getUint16(eocd + 6, true) || dv.getUint16(eocd + 8, true) !== sayi ||
      sayi === 65535 || dizin === 0xffffffff || dizinBoyut === 0xffffffff) throw hata('Bölünmüş veya ZIP64 paket desteklenmiyor');
    if (sayi > SINIR.girdi) throw hata('ZIP girdi sayısı sınırı aşıldı');
    if (dizin + dizinBoyut !== eocd) throw hata('ZIP dizin boyutu veya konumu bozuk');
    const out = [];
    let p = dizin;
    for (let i = 0; i < sayi; i++) {
      if (p + 46 > eocd || dv.getUint32(p, true) !== 0x02014b50) throw hata('ZIP dizini bozuk');
      const yontem = dv.getUint16(p + 10, true), sikisik = dv.getUint32(p + 20, true), acik = dv.getUint32(p + 24, true);
      const adUz = dv.getUint16(p + 28, true), ekUz = dv.getUint16(p + 30, true), notUz = dv.getUint16(p + 32, true);
      const bayrak = dv.getUint16(p + 8, true), yerel = dv.getUint32(p + 42, true), crc = dv.getUint32(p + 16, true);
      const son = p + 46 + adUz + ekUz + notUz;
      if (!adUz || son > eocd || dv.getUint16(p + 34, true) || yerel >= dizin ||
        acik === 0xffffffff || sikisik === 0xffffffff) throw hata('ZIP girdisi veya dosya adı bozuk');
      const adB = u8.subarray(p + 46, p + 46 + adUz);
      const ad = new TextDecoder(bayrak & 0x800 ? 'utf-8' : 'windows-1254').decode(adB);
      out.push({ ad, adB, yontem, sikisik, acik, yerel, bayrak, crc });
      p = son;
    }
    if (p !== eocd) throw hata('ZIP dizini eksik veya tutarsız');
    return { u8, dv, liste: out, dizin };
  }
  async function ac(zip, g, { maxBytes = SINIR.boyut, signal } = {}) {
    const { u8, dv, dizin } = zip;
    const cap = Math.min(SINIR.boyut, Number.isSafeInteger(maxBytes) && maxBytes >= 0 ? maxBytes : 0);
    if (signal?.aborted) throw hata('ZIP okuma durduruldu');
    if (g.acik > cap) throw hata('ZIP girdisi açılmış boyut sınırını aşıyor');
    if (g.bayrak & (1 | 64)) throw hata('Şifreli ZIP girdisi desteklenmiyor');
    if (g.yontem !== 0 && g.yontem !== 8) throw hata('ZIP sıkıştırma yöntemi desteklenmiyor');
    if (g.yerel + 30 > dizin || dv.getUint32(g.yerel, true) !== 0x04034b50) throw hata('ZIP girdisi bozuk');
    const adUz = dv.getUint16(g.yerel + 26, true), ekUz = dv.getUint16(g.yerel + 28, true);
    const bas = g.yerel + 30 + adUz + ekUz;
    if (bas + g.sikisik > dizin || adUz !== g.adB.length ||
      g.adB.some((b, i) => u8[g.yerel + 30 + i] !== b) ||
      dv.getUint16(g.yerel + 6, true) !== g.bayrak || dv.getUint16(g.yerel + 8, true) !== g.yontem)
      throw hata('ZIP yerel ve merkezi girdileri uyuşmuyor');
    if (!(g.bayrak & 8) && (dv.getUint32(g.yerel + 14, true) !== g.crc ||
      dv.getUint32(g.yerel + 18, true) !== g.sikisik || dv.getUint32(g.yerel + 22, true) !== g.acik))
      throw hata('ZIP yerel ve merkezi boyutları uyuşmuyor');
    const veri = u8.subarray(bas, bas + g.sikisik);
    let sonuc;
    if (g.yontem === 0) {
      if (g.sikisik !== g.acik) throw hata('ZIP açılmış boyutu uyuşmuyor');
      sonuc = veri.slice();
    } else {
      const reader = new Blob([veri]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks = []; let toplam = 0;
      const stop = () => { void reader.cancel().catch(() => {}); };
      signal?.addEventListener('abort', stop, { once: true });
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (signal?.aborted) throw hata('ZIP okuma durduruldu');
          if (done) break;
          toplam += value.byteLength;
          if (toplam > cap || toplam > g.acik) {
            await reader.cancel();
            throw hata('ZIP akışı açılmış boyut sınırını aşıyor');
          }
          chunks.push(value);
        }
        if (toplam !== g.acik) throw hata('ZIP açılmış boyutu uyuşmuyor');
        sonuc = new Uint8Array(toplam);
        let ofs = 0;
        for (const chunk of chunks) { sonuc.set(chunk, ofs); ofs += chunk.byteLength; }
      } finally {
        signal?.removeEventListener('abort', stop);
        reader.releaseLock();
      }
    }
    if (crc32(sonuc) !== g.crc) throw hata('ZIP girdisinin bütünlük denetimi başarısız');
    return sonuc;
  }
  const api = { girdiler, ac, SINIR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.DurusmaPaketiZip = api;
})();
