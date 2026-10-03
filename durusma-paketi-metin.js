/* HTML, XML ve düz metin evrakı okunur paragraf modeline çevirir (UDF paragraf modeliyle aynı biçim; PDF'e
   durusma-paketi-udf.js çizer). Ağa ya da DOM'a dokunmaz; betik çalıştırmaz, dış kaynak yüklemez. */
(() => {
  'use strict';
  const A4 = { en: 595.28, boy: 841.89, sol: 56.69, sag: 56.69, ust: 56.69, alt: 56.69 };
  const TABAN = { aile: 'Times New Roman', punto: 11, kalin: false, italik: false, alti: false, ustu: false, renk: null, zemin: null };
  const KALIN = { ...TABAN, kalin: true };
  const SINIR = { paragraf: 20000, karakter: 2 * 1024 * 1024 };
  const AD = { pdf: 'PDF', tiff: 'TIFF', zip: 'ZIP paketi (EYP, Word vb.)', html: 'HTML', xml: 'XML', text: 'düz metin',
    jpg: 'JPEG resim', png: 'PNG resim', gif: 'GIF resim', bmp: 'BMP resim', ole: 'eski Word/Office', rtf: 'RTF', unknown: 'tanınmayan' };

  const raw = b => (b instanceof Uint8Array ? b : new Uint8Array(b || []));
  const bas = (b, n) => { let s = ''; for (let i = 0; i < Math.min(b.length, n); i++) s += String.fromCharCode(b[i]); return s; };

  // İçeriğin biçimi, UYAP'ın bildirdiği türden bağımsız olarak ilk baytlardan.
  function tur(bytes) {
    const b = raw(bytes);
    const m = (...x) => x.every((v, i) => b[i] === v);
    if (m(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf';
    if (m(0x49, 0x49, 0x2a, 0) || m(0x4d, 0x4d, 0, 0x2a)) return 'tiff';
    if (m(0x50, 0x4b, 3, 4)) return 'zip';
    if (m(0xff, 0xd8, 0xff)) return 'jpg';
    if (m(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
    if (m(0x47, 0x49, 0x46, 0x38)) return 'gif';
    if (m(0x42, 0x4d) && b.length > 26) return 'bmp';
    if (m(0xd0, 0xcf, 0x11, 0xe0)) return 'ole';
    if (/^\{\\rtf/.test(bas(b, 5))) return 'rtf';
    let i = 0;
    if (m(0xef, 0xbb, 0xbf)) i = 3;
    const utf16 = m(0xff, 0xfe) || m(0xfe, 0xff);
    const ornek = utf16 ? new TextDecoder(m(0xff, 0xfe) ? 'utf-16le' : 'utf-16be').decode(b.subarray(2, 4098)) : bas(b.subarray(i), 4096);
    if (!ornek.trim()) return 'unknown';
    const t = ornek.replace(/^\s+/, '');
    if (/^<\?xml\b/i.test(t)) return /<(html|xhtml)\b/i.test(t.slice(0, 2048)) ? 'html' : 'xml';
    if (/^(<!--[\s\S]*?-->\s*)*<!doctype\s+html\b/i.test(t) || /^<(html|head|body|table|div|p|span|font|center|h[1-6])\b/i.test(t)) return 'html';
    if (/^<[A-Za-z_][\w:.-]*[\s>/]/.test(t)) return 'xml';
    // Düz metin: NUL yok, denetim karakterleri seyrek.
    let denetim = 0;
    for (let k = 0; k < ornek.length; k++) {
      const c = ornek.charCodeAt(k);
      if (c === 0) return 'unknown';
      if (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) denetim++;
    }
    return denetim / ornek.length < 0.01 ? 'text' : 'unknown';
  }

  // Kodlama: bayt sırası işareti, Content-Type, belgedeki beyan; yoksa UTF-8 denenir, olmazsa Windows-1254 (Türkçe).
  function coz(bytes, mime) {
    const b = raw(bytes);
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
    if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
    const gecerli = ad => { try { const k = new TextDecoder(ad).encoding; return /^utf-16|^x-user-defined$|^replacement$/.test(k) ? null : k; } catch { return null; } };
    const basKisim = bas(b, 1024).replace(/<!--[\s\S]*?(-->|$)/g, '');
    const beyan = /charset\s*=\s*["']?([\w.:-]{1,40})/i.exec(String(mime || '')) || /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]{1,40})/i.exec(basKisim) ||
      /<\?xml[^>]*encoding\s*=\s*["']([\w.:-]{1,40})/i.exec(basKisim);
    const kod = beyan && gecerli(beyan[1]);
    if (kod) return new TextDecoder(kod).decode(b);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
    catch { return new TextDecoder('windows-1254').decode(b); }
  }

  const VARLIK = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', ndash: '–', mdash: '—', hellip: '…',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•', middot: '·', deg: '°', copy: '©', reg: '®',
    euro: '€', sect: '§', para: '¶', times: '×', divide: '÷', ccedil: 'ç', Ccedil: 'Ç', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü',
    acirc: 'â', Acirc: 'Â', icirc: 'î', Icirc: 'Î', ucirc: 'û', Ucirc: 'Û', scedil: 'ş', Scedil: 'Ş', gbreve: 'ğ', Gbreve: 'Ğ',
    inodot: 'ı', imath: 'ı', Idot: 'İ', ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '', zwj: '' };
  const varlik = s => s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,15});/gi, (all, k) => {
    if (k[0] === '#') {
      const n = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    return Object.hasOwn(VARLIK, k) ? VARLIK[k] : all;
  });
  // Yazı tipinin ve UDF çizicisinin beklediği sade metin: sekme ve özel boşluklar boşluk, görünmez karakterler atılır, ₺ "TL" olur.
  const sade = s => s.replace(/\u20ba/g, 'TL').replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, ' ').replace(/[^\S\n]/gu, ' ');

  // Paragraf: [{ yazi, kalin }] parçaları ve girinti (pt).
  function paragraflar() {
    const out = [];
    let parca = [], toplam = 0, kesildi = false;
    return {
      ekle(yazi, kalin) {
        if (!yazi) return;
        const son = parca.at(-1);
        if (son && son.kalin === kalin) son.yazi += yazi; else parca.push({ yazi, kalin });
      },
      bitir(sol = 0) {
        const temiz = [];
        for (const p of parca) {
          let y = p.yazi.replace(/ {2,}/g, ' ');
          if (!temiz.length) y = y.replace(/^ +/, '');
          if (y) temiz.push({ yazi: y, kalin: p.kalin });
        }
        while (temiz.length && !temiz.at(-1).yazi.replace(/ +$/, '')) temiz.pop();
        if (temiz.length) temiz.at(-1).yazi = temiz.at(-1).yazi.replace(/ +$/, '');
        parca = [];
        if (!temiz.length) return;
        const n = temiz.reduce((k, p) => k + p.yazi.length, 0);
        if (out.length >= SINIR.paragraf || toplam + n > SINIR.karakter) { kesildi = true; return; }
        toplam += n;
        out.push({ parcalar: temiz, sol });
      },
      sonuc: () => ({ paragraflar: out, kesildi })
    };
  }

  const BLOK = new Set(['p', 'div', 'br', 'tr', 'li', 'ul', 'ol', 'table', 'tbody', 'thead', 'tfoot', 'section', 'article', 'header',
    'footer', 'blockquote', 'pre', 'hr', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'center', 'form', 'fieldset', 'address',
    'caption', 'figure', 'figcaption', 'main', 'nav', 'aside', 'title']);
  const KALINLAR = new Set(['b', 'strong', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'caption', 'dt']);

  // HTML: görünen metin, blok öğeleri paragraf, tablo satırı tek paragraf (hücreler " | " ile), kalın yazı korunur.
  function html(metin) {
    const p = paragraflar();
    const govde = metin.replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|object|iframe|svg|math)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<head\b[\s\S]*?<\/head\s*>/i, ' ');
    let kalin = 0, pre = 0, liste = 0, hucre = false;
    const re = /<\/?([a-zA-Z][\w:-]*)\b[^>]*>|<![^>]*>|<\?[^>]*>|([^<]+)|</g;
    let m;
    while ((m = re.exec(govde))) {
      if (m[2] != null || m[0] === '<') {
        let t = varlik(m[2] != null ? m[2] : '<');
        t = pre ? t : t.replace(/\s+/g, ' ');
        if (pre && t.includes('\n')) {
          const satirlar = t.split(/\r?\n/);
          satirlar.forEach((s, i) => { if (i) p.bitir(); p.ekle(sade(s), kalin > 0); });
        } else p.ekle(sade(t), kalin > 0);
        continue;
      }
      if (!m[1]) continue;
      const ad = m[1].toLowerCase(), kapanis = m[0][1] === '/';
      const tek = /\/\s*>$/.test(m[0]);
      if (ad === 'td' || ad === 'th') {
        if (!kapanis) { if (hucre) p.ekle(' | ', false); hucre = true; }
        if (ad === 'th') kalin += kapanis ? -1 : (tek ? 0 : 1);
        continue;
      }
      if (KALINLAR.has(ad) && !tek) kalin = Math.max(0, kalin + (kapanis ? -1 : 1));
      if (ad === 'pre' && !tek) pre = Math.max(0, pre + (kapanis ? -1 : 1));
      if ((ad === 'ul' || ad === 'ol') && !tek) liste = Math.max(0, liste + (kapanis ? -1 : 1));
      if (BLOK.has(ad)) {
        p.bitir(Math.min(liste, 6) * 14);
        if (ad === 'tr') hucre = false;
        if (ad === 'li' && !kapanis) p.ekle('• ', false);
      }
    }
    p.bitir();
    return p.sonuc();
  }

  // XML: öğe ağacı girintili "ad: değer" satırlarıyla; öznitelikler öğenin altında. Ad kalın yazılır.
  function xml(metin) {
    const kok = { ad: '', oz: [], cocuk: [], yazi: '' };
    const yigin = [kok];
    const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!(?:DOCTYPE)\b(?:[^>[]|\[[\s\S]*?\])*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|</g;
    let m;
    while ((m = re.exec(metin))) {
      const ust = yigin.at(-1);
      if (m[1] != null) { ust.yazi += m[1]; continue; }
      if (m[6] != null) { ust.yazi += varlik(m[6]); continue; }
      if (m[2] != null) { if (yigin.length > 1) yigin.pop(); continue; }
      if (m[3] != null) {
        const oz = [...m[4].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
          .filter(x => !/^xmlns(:|$)/.test(x[1]) && !/^xsi:/.test(x[1])).map(x => [x[1], varlik(x[2] != null ? x[2] : x[3])]);
        const dugum = { ad: m[3], oz, cocuk: [], yazi: '' };
        ust.cocuk.push(dugum);
        if (!m[5]) yigin.push(dugum);
        continue;
      }
      if (m[0] === '<') ust.yazi += '<';
    }
    const p = paragraflar();
    const ad = s => s.replace(/^[^:]+:/, '');
    // Altında hiç değer ya da öznitelik olmayan öğe (boş iskelet) yazılmaz.
    const dolu = d => !!d.yazi.trim() || d.oz.some(([, v]) => v.trim()) || d.cocuk.some(dolu);
    const yaz = (d, derinlik) => {
      if (!dolu(d)) return;
      const sol = Math.min(derinlik, 8) * 12;
      const deger = sade(d.yazi).replace(/\s+/g, ' ').trim();
      if (!d.cocuk.length && !d.oz.length) {
        if (!deger) return;
        p.ekle(`${ad(d.ad)}: `, true); p.ekle(deger, false); p.bitir(sol); return;
      }
      p.ekle(ad(d.ad), true);
      if (deger && !d.cocuk.length) { p.ekle(': ', true); p.ekle(deger, false); }
      p.bitir(sol);
      for (const [k, v] of d.oz) { const t = sade(v).replace(/\s+/g, ' ').trim(); if (t) { p.ekle(`${ad(k)}: `, true); p.ekle(t, false); p.bitir(sol + 12); } }
      if (deger && d.cocuk.length) { p.ekle(deger, false); p.bitir(sol + 12); }
      for (const c of d.cocuk) yaz(c, derinlik + 1);
    };
    for (const c of kok.cocuk) yaz(c, 0);
    return p.sonuc();
  }

  function duz(metin) {
    const p = paragraflar();
    for (const satir of metin.split(/\r\n|\r|\n|\f/)) {
      p.ekle(sade(satir).replace(/\s+$/, ''), false);
      p.bitir();
    }
    return p.sonuc();
  }

  // Modeli kurar. tur: 'html' | 'xml' | 'text'. Dönüş: { model, uyarilar }; metin yoksa açık hata.
  function model(bytes, { mime = '', tur: t } = {}) {
    const metin = coz(bytes, mime);
    const r = t === 'html' ? html(metin) : t === 'xml' ? xml(metin) : duz(metin);
    if (!r.paragraflar.length) {
      throw Object.assign(new Error(`${AD[t] || 'Metin'} evrakında aktarılacak metin yok`), { code: 'metin-bos' });
    }
    const bloklar = r.paragraflar.map(x => ({ t: 'p', hiza: 'left', sol: x.sol, sag: 0, ilk: 0, once: 0, sonra: t === 'text' ? 0 : 3,
      aralik: 0, duraklar: [], liste: null, stil: TABAN,
      parcalar: x.parcalar.map(y => ({ t: 'metin', yazi: y.yazi, stil: y.kalin ? KALIN : TABAN })) }));
    const uyarilar = [t === 'html' ? 'HTML evrakın metni aktarıldı; tablo, resim ve biçim özgün görünümden farklıdır'
      : t === 'xml' ? 'XML evrakın alanları girintili liste olarak aktarıldı' : 'Düz metin evrak aktarıldı'];
    if (r.kesildi) uyarilar.push('Metin çok uzun olduğu için sonu aktarılmadı; özgün evrakı ayrıca inceleyin');
    return {
      model: { sayfa: A4, taban: TABAN, bolumler: [bloklar], sayac: { bilinmeyen: 0, resimReddi: 0, ofsetSorunu: 0 },
        kesildi: null, sablon: false, ust: null, alt: null, filigran: null, imza: false, paketTani: { complete: true } },
      uyarilar
    };
  }

  globalThis.DurusmaPaketiMetin = Object.freeze({ tur, coz, model, AD });
})();
