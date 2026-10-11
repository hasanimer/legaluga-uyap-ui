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

  function tokenDuzelt(raw) {
    const govde = raw.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').trim();
    if (/^\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}$/.test(govde)) return '';
    if (/^(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}$/.test(govde)) return '';
    const slash = /^((?:19|20)\d{2})\s*([/\\.-])\s*((?:\d{1,2}-)?\d{1,7})$/.exec(govde);
    if (slash) {
      const ayirac = slash[2], kalan = slash[3];
      if ((ayirac === '-' || ayirac === '.') && kalan.includes('-')) return '';
      return `${slash[1]}/${kalan}`;
    }
    const bosluk = /^((?:19|20)\d{2})\s+((?:\d{1,2}-)?\d{1,7})$/.exec(govde);
    if (bosluk) return `${bosluk[1]}/${bosluk[2]}`;
    if (!/\s/.test(govde) && /^[0-9]+$/.test(govde)) {
      const bitisik = /^((?:19|20)\d{2})(\d{1,7})$/.exec(govde);
      if (bitisik) return `${bitisik[1]}/${bitisik[2]}`;
    }
    return '';
  }

  function yakinMi(metin, bas, son) {
    return YAKIN.test(metin.slice(Math.max(0, bas - 48), Math.min(metin.length, son + 48)));
  }

  // O/0, l/1 ve eksik eğik çizgi yalnız esas/karar yakınıdaki numarada düzeltilir. Tarih ve düz metin kalır.
  function duzelt(metin) {
    if (typeof metin !== 'string' || !metin) return typeof metin === 'string' ? metin : '';
    return metin.replace(TOKEN, (raw, offset) => {
      if (!yakinMi(metin, offset, offset + raw.length)) return raw;
      return tokenDuzelt(raw) || raw;
    });
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
