'use strict';
/* global module */
// Taranmış evrak metnini künye ayıklayıcısına vermeden önce düzeltir. Yalnız esas/karar yakınıdaki
// numara benzeri parçalara dokunur; doğuştan metin bu modülden geçmez. Ağ, depolama ve DOM yoktur.
(() => {
  'use strict';
  if (globalThis.UHDAtifOcr) return;

  const SAYFA = 12;
  const KENAR = 1800;
  const TOKEN = /[0-9OoIl|][0-9OoIl|\s./\\-]{2,18}[0-9OoIl|]/g;
  const YAKIN = /esas|karar|(?<![A-Za-zÇĞİÖŞÜçğıöşü])[eEkK]\./iu;
  const SONRA = /^\s*(?:[EK]\.|esas|karar)/iu;
  // Etiket ile numara arasında yalnız boşluk, nokta ya da iki nokta olabilir: "Esas 2018 123", "E.: …", "K.No: …".
  const ONCE = /(?<![A-Za-zÇĞİÖŞÜçğıöşü])(?:(?:esas|karar)(?:\s*(?:no|numarası|sayısı))?|[EK](?:\.(?:\s*no)?|\s*no))\s*[.:]?\s*$/iu;

  // Bitişik ("201812345") ve boşluklu ("2018 12345") biçim tutar, tarih ya da sayı çiftiyle karışır; bu ikisi yalnız
  // numaranın hemen yanında esas/karar işareti varken (isaretli) düzeltilir. Bitişik numara sıfırla başlamaz.
  function tokenDuzelt(raw, isaretli) {
    const govde = raw.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').trim();
    if (/^\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}$/.test(govde)) return '';
    if (/^(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}$/.test(govde)) return '';
    const slash = /^((?:19|20)\d{2})\s*([/\\.-])\s*((?:\d{1,2}-)?\d{1,7})$/.exec(govde);
    if (slash) {
      const ayirac = slash[2], kalan = slash[3];
      if ((ayirac === '-' || ayirac === '.') && kalan.includes('-')) return '';
      return `${slash[1]}/${kalan}`;
    }
    if (!isaretli) return '';
    const bosluk = /^((?:19|20)\d{2})\s+((?:\d{1,2}-)?\d{1,7})$/.exec(govde);
    if (bosluk) return `${bosluk[1]}/${bosluk[2]}`;
    const bitisik = /^((?:19|20)\d{2})([1-9]\d{0,6})$/.exec(govde);
    if (bitisik) return `${bitisik[1]}/${bitisik[2]}`;
    return '';
  }

  function yakinMi(metin, bas, son) {
    return YAKIN.test(metin.slice(Math.max(0, bas - 48), Math.min(metin.length, son + 48)));
  }
  function isaretliMi(metin, bas, son) {
    return SONRA.test(metin.slice(son, son + 12)) || ONCE.test(metin.slice(Math.max(0, bas - 24), bas));
  }
  function parcaDuzelt(metin, bas, son) {
    if (!yakinMi(metin, bas, son)) return '';
    return tokenDuzelt(metin.slice(bas, son), isaretliMi(metin, bas, son));
  }

  // O/0, l/1 ve eksik eğik çizgi yalnız esas/karar yakınıdaki numarada düzeltilir. Tarih ve düz metin kalır.
  // Açgözlü parça numarayı izleyen tarihe ya da sözcüğün ilk harfine uzanabilir: bütünü numara değilse boşlukta biten
  // en uzun ön eki denenir; o da değilse ilk sözcük olduğu gibi geçilir ve tarama kalanından sürer.
  function duzelt(metin) {
    if (typeof metin !== 'string' || !metin) return typeof metin === 'string' ? metin : '';
    const desen = new RegExp(TOKEN.source, 'g');
    let cikti = '', yazilan = 0, m;
    while ((m = desen.exec(metin))) {
      const raw = m[0], bas = m.index;
      const kesimler = [raw.length];
      for (const b of raw.matchAll(/\s+/g)) kesimler.push(b.index);
      kesimler.sort((a, b) => b - a);
      let son = bas + raw.length, yeni = '';
      for (const kesim of kesimler) {
        yeni = parcaDuzelt(metin, bas, bas + kesim);
        if (yeni) { son = bas + kesim; break; }
      }
      if (!yeni && kesimler.length > 1) son = bas + kesimler.at(-1);
      cikti += metin.slice(yazilan, bas) + (yeni || metin.slice(bas, son));
      yazilan = son;
      desen.lastIndex = son;
    }
    return cikti + metin.slice(yazilan);
  }

  // Sayfa görünümü belleğindeki önbellek anahtarı. Kriptografik değildir; evrakı tanımaz, diske yazılmaz.
  function imza(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
    if (!u8) return '';
    let h = 2166136261;
    const n = u8.length;
    const adim = n > 4096 ? Math.floor(n / 4096) || 1 : 1;
    for (let i = 0; i < n; i += adim) h = Math.imul(h ^ u8[i], 16777619) >>> 0;
    h = Math.imul(h ^ (n & 255), 16777619) >>> 0;
    return `${n.toString(16)}:${h.toString(16)}`;
  }

  const api = Object.freeze({ SAYFA, KENAR, duzelt, imza });
  globalThis.UHDAtifOcr = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
