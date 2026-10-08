// TIFF evrak görüntüleyicisi. UYAP'taki taranmış evrakın çoğu tek ya da çok sayfalı TIFF'tir (CCITT G4, LZW, JPEG…).
// Sayfa yapısı (IFD zinciri) burada, sınırlı ve döngüye dayanıklı biçimde okunur; UTIF'in kendi IFD okuyucusu
// (alt IFD, EXIF ve üretici notlarına iner, sayaçlara güvenir) hiç çağrılmaz. Görüntü verisinin çözümü
// vendor/UTIF.js'e (photopea, MIT) bırakılır; ona yalnız burada denetlenmiş sayfa bilgisi verilir.
// Sayfalar görünür alana yaklaştıkça tek tek çözülüp çizilir; uzaklaşan sayfaların tuvali boşaltılır.
// Ağ isteği yapılmaz; sayfalar yalnız <canvas> ile gösterilir.
(() => {
  if (!globalThis.UHD || globalThis.UHD.tiff) return;

  const MiB = 1024 * 1024;
  const SINIR = Object.freeze({
    paket: 80 * MiB,          // UYAP'tan gelen dosya
    sayfa: 500,               // gösterilen sayfa
    ifdSay: 100000,           // sayfa sayısını bildirmek için sayılan IFD
    ifdGirdi: 1000,           // bir IFD'deki alan
    kenar: 30000,             // sayfa eni ya da boyu (piksel)
    piksel1bit: 72e6,         // siyah-beyaz sayfa (A4, 1000 dpi'ya dek)
    piksel: 30e6,             // gri ya da renkli sayfa
    cozulmusBayt: 128 * MiB,  // UTIF'in ayırdığı ham sayfa belleği
    cozumBellek: 256 * MiB,   // şerit kopyaları ve UTIF döşeme belleği dahil çözüm tepe belleği
    serit: 100000,            // sayfa başına şerit ya da döşeme
    doseme: 4096,             // döşeme kenarı
    jpegTablo: 64 * 1024,
    jpegTarama: 32,           // bir JPEG şeridindeki tarama (SOS)
    tuvalPiksel: 6e6,         // bir sayfa tuvalinin piksel sayısı
    cizili: 8,                // aynı anda çizili tutulan sayfa
    cozumSure: 4000           // bir sayfanın UTIF'te çözülme süresi (ms)
  });

  const ILETI = {
    'tiff-degil': 'Evrak açılamadı: dosya TIFF değil ya da bozuk.',
    bozuk: 'Evrak açılamadı: TIFF dosyası bozuk.',
    bigtiff: 'Bu TIFF türü (BigTIFF) görüntüleyicide desteklenmiyor; indirip açın.',
    desteklenmiyor: 'Bu TIFF’in sıkıştırma ya da renk biçimi görüntüleyicide desteklenmiyor; indirip açın.',
    boyut: 'Evrak görüntüleyicinin sınırından büyük; indirip açın.',
    cozucu: 'TIFF çözücüsü yüklenemedi; sayfayı yenileyip tekrar deneyin.'
  };
  const SAYFA_ILETI = {
    bozuk: 'Bu sayfa bozuk; gösterilemedi.',
    desteklenmiyor: 'Bu sayfanın sıkıştırma ya da renk biçimi desteklenmiyor.',
    boyut: 'Bu sayfa görüntüleyicinin sınırından büyük; indirip açın.',
    cozulemedi: 'Bu sayfa çözülemedi; dosya bozuk olabilir.'
  };

  class TiffHatasi extends Error {
    constructor(kod, ayrinti = '') {
      super(ILETI[kod] || ILETI.bozuk);
      this.name = 'TiffHatasi';
      this.kod = kod;
      this.ayrinti = ayrinti;
    }
  }
  const hata = (kod, ayrinti) => new TiffHatasi(kod, ayrinti);
  const iptalMi = signal => !!(signal && signal.aborted);
  const iptalDenetle = signal => { if (iptalMi(signal)) throw new DOMException('Evrak okuma iptal edildi.', 'AbortError'); };
  const bekle = () => new Promise(r => setTimeout(r, 0));
  const kistir = (v, a, b) => Math.min(b, Math.max(a, v));
  const tamSayi = n => Number.isSafeInteger(n) && n >= 0;
  const guvenliTopla = (...values) => {
    let total = 0;
    for (const value of values) {
      if (!tamSayi(value) || !tamSayi(total + value)) throw hata('boyut', 'bellek hesabı');
      total += value;
    }
    return total;
  };
  const guvenliCarp = (...values) => {
    let total = 1;
    for (const value of values) {
      if (!tamSayi(value) || !tamSayi(total * value)) throw hata('boyut', 'bellek hesabı');
      total *= value;
    }
    return total;
  };

  // Kenardaki döşemeler de tam tw × th çözülür. Küçük görünen bir sayfa, çok büyük döşeme
  // tamponları isteyebilir; bütün sıkıştırmalar için bu kapasite çözümden önce denetlenir.
  // Deflate'in kısa sonuçlarının subarray'leri de beklenen boyuttaki backing buffer'ı tutar.
  // Tahmin planlı çözücü tamponlarını sayar; tarayıcının toplam JS/native heap garantisi değildir.
  function allocationEstimate(s) {
    for (const value of [s.g, s.y, s.bps, s.spp, s.rps])
      if (!tamSayi(value) || value < 1) throw hata('bozuk', 'sayfa boyutu');
    if (s.g > SINIR.kenar || s.y > SINIR.kenar) throw hata('boyut', 'sayfa boyutu');
    const samples = s.c === 7 ? 3 : s.spp; // UTIF, 8 bit JPEG'i RGB örneklerine çözer.
    const bits = guvenliCarp(s.bps, samples);
    const rawBytes = guvenliCarp(s.y, Math.ceil(guvenliCarp(s.g, bits) / 8));
    let segmentBytes, decodedCapacity, count, scratchBytes;
    if (s.dosemeli) {
      if (![s.tw, s.th].every(v => tamSayi(v) && v >= 16 && v <= SINIR.doseme && v % 16 === 0))
        throw hata('bozuk', 'döşeme boyutu');
      count = guvenliCarp(Math.ceil(s.g / s.tw), Math.ceil(s.y / s.th));
      segmentBytes = guvenliCarp(Math.ceil(guvenliCarp(s.tw, bits) / 8), s.th);
      decodedCapacity = guvenliCarp(count, segmentBytes);
      scratchBytes = segmentBytes; // UTIF.decodeImage: tam sayfa + yeniden kullanılan tbuff.
    } else {
      const planes = s.pc === 2 ? s.spp : 1;
      const rowBytes = Math.ceil(guvenliCarp(s.g, s.bps, s.pc === 2 ? 1 : samples) / 8);
      count = guvenliCarp(Math.ceil(s.y / s.rps), planes);
      segmentBytes = guvenliCarp(Math.min(s.rps, s.y), rowBytes);
      decodedCapacity = guvenliCarp(s.y, rowBytes, planes);
      scratchBytes = s.pc === 2 ? segmentBytes : 0;
    }
    if (count > SINIR.serit || rawBytes > SINIR.cozulmusBayt || decodedCapacity > SINIR.cozulmusBayt)
      throw hata('boyut', 'döşeme/şerit kapasitesi');
    if (!Array.isArray(s.ofs) || !Array.isArray(s.say) || s.ofs.length !== count || s.say.length !== count ||
        s.ofs.some((v, i) => !tamSayi(v) || !tamSayi(v + s.say[i])) || s.say.some(v => !tamSayi(v) || v < 1))
      throw hata('bozuk', 'döşeme/şerit uzunluğu');
    const deflate = s.c === 8 || s.c === 32946;
    const retainedBytes = deflate ? decodedCapacity : 0;
    const aggregateBytes = deflate ? Math.max(1, decodedCapacity) : 0;
    // LZW'nin üç sabit sözlük tamponu 16 KiB; CCITT'nin sınırlı satır/değişim dizileri
    // için dört sayısal dizi kapasitesi ayrılır. Bunlar sayfa/döşeme tamponuna eklenir.
    const codecBytes = s.c === 5 ? 16384 : s.c === 3 || s.c === 4
      ? guvenliCarp(guvenliTopla(s.dosemeli ? s.tw : s.g, 64), 32) : 0;
    const peakBytes = guvenliTopla(rawBytes, scratchBytes, retainedBytes, aggregateBytes, codecBytes);
    if (peakBytes > SINIR.cozumBellek) throw hata('boyut', 'çözüm tepe belleği');
    return Object.freeze({ rawBytes, segmentBytes, decodedCapacity, scratchBytes, retainedBytes, aggregateBytes, codecBytes, peakBytes });
  }

  // UTIF çözerken tanı iletilerini console.log'a yazar; UYAP sekmesinin konsolu kirlenmesin diye susturulur.
  function sessiz(fn) {
    const c = console.log;
    console.log = () => {};
    try { return fn(); } finally { console.log = c; }
  }

  // ---------------------------------------------------------------- IFD
  const TUR_BOYU = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];   // TIFF alan türlerinin bayt boyu (1–13)

  function baslik(u8) {
    if (u8.length < 8) throw hata(u8.length ? 'tiff-degil' : 'bozuk', 'kısa');
    const le = u8[0] === 0x49 && u8[1] === 0x49, be = u8[0] === 0x4d && u8[1] === 0x4d;
    if (!le && !be) throw hata('tiff-degil', 'imza');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const surum = dv.getUint16(2, le);
    if (surum === 43) throw hata('bigtiff');
    if (surum !== 42) throw hata('tiff-degil', 'sürüm');
    return { dv, le, ilk: dv.getUint32(4, le) };
  }

  function ifdOku(dv, le, off, boy) {
    if (off < 8 || off + 2 > boy) return null;
    const n = dv.getUint16(off, le);
    if (n === 0 || n > SINIR.ifdGirdi || off + 2 + n * 12 + 4 > boy) return null;
    const alanlar = new Map();
    for (let i = 0; i < n; i++) {
      const p = off + 2 + i * 12;
      const etiket = dv.getUint16(p, le), tur = dv.getUint16(p + 2, le), sayi = dv.getUint32(p + 4, le);
      const tb = TUR_BOYU[tur] || 0;
      if (!tb || alanlar.has(etiket)) continue;
      const uz = tb * sayi;
      const yer = uz <= 4 ? p + 8 : dv.getUint32(p + 8, le);
      alanlar.set(etiket, { tur, sayi, yer, tasiyor: yer + uz > boy });
    }
    return { alanlar, sonraki: dv.getUint32(off + 2 + n * 12, le) };
  }

  // Alan değerleri; sayı sınırı aşılır ya da veri dosya dışına taşarsa null.
  function degerler(dv, le, a, enCok) {
    if (!a || a.sayi < 1 || a.sayi > enCok || a.tasiyor) return null;
    const out = new Array(a.sayi);
    const b = TUR_BOYU[a.tur];
    for (let i = 0; i < a.sayi; i++) {
      const p = a.yer + i * b;
      switch (a.tur) {
        case 1: case 7: out[i] = dv.getUint8(p); break;
        case 3: out[i] = dv.getUint16(p, le); break;
        case 4: case 13: out[i] = dv.getUint32(p, le); break;
        case 5: { const d = dv.getUint32(p + 4, le); out[i] = d ? dv.getUint32(p, le) / d : 0; break; }
        case 6: out[i] = dv.getInt8(p); break;
        case 8: out[i] = dv.getInt16(p, le); break;
        case 9: out[i] = dv.getInt32(p, le); break;
        case 10: { const d = dv.getInt32(p + 4, le); out[i] = d ? dv.getInt32(p, le) / d : 0; break; }
        default: return null;
      }
    }
    return out;
  }

  // Desteklenen sıkıştırmalar: yok, CCITT G3 ve G4, LZW, JPEG, Deflate (8 ve eski 32946), PackBits.
  // CCITT RLE (2) çözücüsünün döngüsü sınırlanamadığı için desteklenmez.
  const SIKISTIRMA = new Set([1, 3, 4, 5, 7, 8, 32773, 32946]);

  // ---------------------------------------------------------------- UTIF çözücülerinin sınırlanması
  // UTIF'in CCITT çözücüleri her bit için önceki satırı baştan tarar ve satırı sınırsız uzatabilir; LZW çözücüsü
  // bozuk veride sonsuz döngüye girebilir (sınamada rastgele LZW verisi sekmeyi kilitledi). Satıcı dosyası
  // değiştirilmeden, çözücülerin çağırdığı yardımcılar burada sınırlı sürümlerle değiştirilir: satır uzunluğu ve
  // süre denetlenir, önceki satır ikili aramayla taranır, LZW ise burada yazılmış çözücüyle açılır.
  const koruma = { bitis: 0, satir: 0, sayac: 0 };
  const korumaDenetle = () => {
    if ((++koruma.sayac & 1023) === 0 && performance.now() > koruma.bitis) throw new Error('çözüm süresi aşıldı');
  };

  // TIFF LZW: 9–12 bitlik, yüksek bit önce gelen kodlar; 256 temizle, 257 son; kod genişliği bir kod erken artar.
  function lzwCoz(data, off, len, tgt, toff) {
    const onek = new Int16Array(4096), karakter = new Uint8Array(4096), yigin = new Uint8Array(4096);
    for (let i = 0; i < 256; i++) { onek[i] = -1; karakter[i] = i; }
    const bitSon = Math.min(data.length, off + len) * 8;
    let bit = off * 8, genislik = 9, sonraki = 258, onceki = -1, cik = toff;
    const cikSon = tgt.length;
    const yaz = kod => {
      let n = 0;
      for (let k = kod; k >= 0 && n < 4096; k = onek[k]) yigin[n++] = karakter[k];
      for (let i = n - 1; i >= 0 && cik < cikSon; i--) tgt[cik++] = yigin[i];
      return yigin[n - 1];
    };
    while (bit + genislik <= bitSon && cik < cikSon) {
      korumaDenetle();
      const b = bit >>> 3;
      const v = (data[b] << 16) | ((data[b + 1] || 0) << 8) | (data[b + 2] || 0);
      const kod = (v >>> (24 - (bit & 7) - genislik)) & ((1 << genislik) - 1);
      bit += genislik;
      if (kod === 257) break;
      if (kod === 256) { genislik = 9; sonraki = 258; onceki = -1; continue; }
      if (onceki < 0) {
        if (kod > 255) break;
        tgt[cik++] = kod;
        onceki = kod;
        continue;
      }
      let ilk;
      if (kod < sonraki) ilk = yaz(kod);
      else if (kod === sonraki) { ilk = yaz(onceki); if (cik < cikSon) tgt[cik++] = ilk; }
      else break;   // tanımsız kod: bozuk veri
      if (sonraki < 4096) { onek[sonraki] = onceki; karakter[sonraki] = ilk; sonraki++; }
      if (sonraki >= (1 << genislik) - 1 && genislik < 12) genislik++;
      onceki = kod;
    }
    return cik - toff;
  }

  (function korumaKur() {
    const D = globalThis.UTIF && globalThis.UTIF.decode;
    if (!D || D.__legalugaKoruma) return;
    // Değişim listesi [konum, renk, …] konuma göre sıralıdır: ilk uygun konum ikili aramayla bulunur.
    D._findDiff = function (line, x, clr) {
      korumaDenetle();
      if (!(x <= line[line.length - 2])) return undefined;
      let a = 0, b = (line.length >> 1) - 1;
      while (a < b) { const m = (a + b) >> 1; if (line[2 * m] >= x) b = m; else a = m + 1; }
      for (let i = 2 * a; i < line.length; i += 2) if (line[i] >= x && line[i + 1] === clr) return line[i];
      return undefined;
    };
    D._addNtimes = function (arr, n, val) {
      if (!(n > 0)) return;
      if (arr.length + n > koruma.satir) throw new Error('satır sınırı aşıldı');
      for (let i = 0; i < n; i++) arr.push(val);
    };
    D._decodeLZW = lzwCoz;
    D.__legalugaKoruma = true;
  })();

  // Bir IFD'den çizilebilir sayfa tanımı. UTIF'e verilecek alanlar burada denetlenir; sorunlu sayfa { sorun } taşır.
  function sayfaKur(A, dv, le, boy) {
    const tek = t => { const v = degerler(dv, le, A.get(t), 1); return v ? v[0] : undefined; };
    const g = tek(256), y = tek(257);
    const sorun = kod => ({ sorun: kod, g, y, yon: 1, oran: 1.4142, taban: 794 });
    if (!tamSayi(g) || !tamSayi(y) || g < 1 || y < 1) return sorun('bozuk');
    if (g > SINIR.kenar || y > SINIR.kenar) return sorun('boyut');
    for (const tag of [277, 259, 284, 262, 317, 322, 323, 278])
      if (A.has(tag) && tek(tag) === undefined) return sorun('bozuk');
    const spp = tek(277) ?? 1;
    const bpsDizi = A.has(258) ? degerler(dv, le, A.get(258), 8) : [1];
    if (!bpsDizi) return sorun('bozuk');
    const bps = bpsDizi[0];
    const c = tek(259) ?? 1;
    const pc = tek(284) ?? 1;
    let p = tek(262);
    if (p === undefined) p = bps === 1 ? 0 : spp >= 3 ? 2 : 1;
    if (!tamSayi(spp) || !(spp >= 1 && spp <= 5) || bpsDizi.some(v => v !== bps) || !SIKISTIRMA.has(c)) return sorun('desteklenmiyor');
    // UTIF'in doğru çevirdiği birleşimler.
    const uygun = p === 0 ? spp === 1 && [1, 4, 8, 16].includes(bps)
      : p === 1 ? (spp === 1 && [1, 2, 8, 16].includes(bps)) || (spp === 2 && bps === 8)
        : p === 2 ? (spp === 3 || spp === 4) && (bps === 8 || bps === 16)
          : p === 3 ? spp === 1 && [1, 2, 4, 8].includes(bps)
            : p === 5 ? (spp === 4 || spp === 5) && bps === 8
              : p === 6 ? c === 7 && spp === 3 && bps === 8 : false;
    if (!uygun) return sorun('desteklenmiyor');
    if ((c === 3 || c === 4) && !(bps === 1 && spp === 1)) return sorun('desteklenmiyor');
    if (c === 7 && bps !== 8) return sorun('desteklenmiyor');
    if (!(pc === 1 || (pc === 2 && spp === 3 && bps === 8))) return sorun('desteklenmiyor');
    const pred = tek(317) ?? 1;
    if (pred !== 1 && pred !== 2) return sorun('desteklenmiyor');
    const sf = degerler(dv, le, A.get(339), 8);
    if (sf && sf.some(v => v !== 1)) return sorun('desteklenmiyor');
    const birBit = bps === 1 && spp === 1 && (p === 0 || p === 1);
    if (g * y > (birBit ? SINIR.piksel1bit : SINIR.piksel) || y * Math.ceil(g * bps * spp / 8) > SINIR.cozulmusBayt) return sorun('boyut');

    let harita = null;
    if (p === 3) {
      harita = degerler(dv, le, A.get(320), 3 * 256);
      if (!harita || harita.length !== 3 * (1 << bps)) return sorun('bozuk');
    }
    const tw = tek(322), th = tek(323);
    const dosemeli = A.has(322) || A.has(323) || A.has(324);
    let ofs, say, rps = y;
    if (dosemeli) {
      if (pc === 2) return sorun('desteklenmiyor');
      if (!(tw >= 16 && th >= 16 && tw <= SINIR.doseme && th <= SINIR.doseme && tw % 16 === 0 && th % 16 === 0)) return sorun('bozuk');
      const n = Math.ceil(g / tw) * Math.ceil(y / th);
      if (n > SINIR.serit) return sorun('boyut');
      ofs = degerler(dv, le, A.get(324), n);
      say = degerler(dv, le, A.get(325), n);
      if (!ofs || !say || ofs.length !== n || say.length !== n) return sorun('bozuk');
    } else {
      const rows = A.has(278) ? tek(278) : y;
      if (!tamSayi(rows) || rows < 1) return sorun('bozuk');
      rps = Math.min(rows, y);
      ofs = degerler(dv, le, A.get(273), SINIR.serit);
      say = degerler(dv, le, A.get(279), SINIR.serit);
      if (!ofs) return sorun('bozuk');
      if (!A.has(279) && c === 1 && ofs.length === 1) say = [y * Math.ceil(g * bps * spp / 8)];
      if (!say || say.length !== ofs.length) return sorun('bozuk');
    }
    let truncatedStrip = false;
    for (let i = 0; i < ofs.length; i++) {
      if (!tamSayi(ofs[i]) || !tamSayi(say[i]) || say[i] < 1 || !tamSayi(ofs[i] + say[i])) return sorun('bozuk');
      if (ofs[i] >= boy) return sorun('bozuk');   // şerit dosya dışında
      if (ofs[i] + say[i] > boy) { truncatedStrip = true; say[i] = boy - ofs[i]; }
    }
    if (c === 1 && !dosemeli && say.reduce((sum, n) => sum + n, 0) < y * Math.ceil(g * bps * spp / 8))
      truncatedStrip = true;
    let allocation;
    try { allocation = allocationEstimate({ g, y, bps, spp, c, pc, dosemeli, tw, th, rps, ofs, say }); }
    catch (error) {
      if (error instanceof TiffHatasi) return sorun(error.kod);
      throw error;
    }
    let jpegTablo = null;
    if (c === 7 && A.has(347)) {
      const a = A.get(347);
      if (a.tasiyor || a.sayi > SINIR.jpegTablo || (a.tur !== 1 && a.tur !== 7)) return sorun('bozuk');
      jpegTablo = new Uint8Array(dv.buffer, dv.byteOffset + a.yer, a.sayi);
    }

    // Görünüm: yön (Orientation) ve piksel oranı (faks 204×98 dpi gibi) çizimde uygulanır.
    const rawYon = tek(274) ?? 1;
    const yon = kistir(rawYon, 1, 8);
    const birim = tek(296) ?? 2;
    const rawDx = tek(282), rawDy = tek(283);
    let dx = rawDx, dy = rawDy;
    if (!(dx > 0)) dx = 0;
    if (!(dy > 0)) dy = 0;
    if (birim === 3) { dx *= 2.54; dy *= 2.54; }
    if (birim === 1 || !dx || !dy) dx = dy = dx || dy || 200;
    const oranKat = kistir(dx / dy, 0.25, 4);           // dikey uzatma katsayısı
    const dpi = kistir(dx, 50, 2400);
    let en = g, boyu = y * oranKat;                       // görünen oran (döndürmeden önce)
    if (yon >= 5) [en, boyu] = [boyu, en];
    const tabanEn = kistir(Math.round((yon >= 5 ? y * oranKat : g) / dpi * 96), 200, 3000);

    const fo = tek(266) === 2 ? 2 : 1;
    const t4 = tek(292);
    const ek = degerler(dv, le, A.get(338), 4);
    // UTIF sayfa nesnesini değiştirdiği için her çözümde yeni kopya kurulur.
    const tanim = () => {
      const img = {
        t256: [g], t257: [y], t258: new Array(spp).fill(bps), t259: [c], t262: [p], t266: [fo], t277: [spp], t284: [pc], t317: [pred]
      };
      if (dosemeli) { img.t322 = [tw]; img.t323 = [th]; img.t324 = ofs.slice(); img.t325 = say.slice(); }
      else { img.t273 = ofs.slice(); img.t279 = say.slice(); img.t278 = [rps]; }
      if (harita) img.t320 = harita;
      if (jpegTablo) img.t347 = jpegTablo;
      if (t4 !== undefined) img.t292 = [t4];
      if (ek) img.t338 = ek;
      return img;
    };
    return {
      g, y, bps, spp, c, p, pc, birBit, dosemeli, tw, th, rps, ofs, say, yon, rawYon, rawDx, rawDy, birim,
      truncatedStrip, allocation, oran: boyu / en, taban: tabanEn, tanim,
      satirBayt: Math.ceil(g * bps * (pc === 2 ? 1 : spp) / 8)
    };
  }
  // Dosyayı okur, IFD zincirini dolaşır ve sayfa tanımlarını döndürür. Döngüde ya da dosya dışına düşen IFD'de
  // durulur; o ana dek okunan sayfalar gösterilir.
  async function ac(blob, { signal } = {}) {
    const UTIF = globalThis.UTIF;
    if (!UTIF || typeof UTIF.decodeImage !== 'function' || typeof UTIF.toRGBA8 !== 'function') throw hata('cozucu');
    if (!blob || !blob.size) throw hata('bozuk', 'boş');
    if (blob.size > SINIR.paket) throw hata('boyut', 'paket');
    const buffer = await blob.arrayBuffer();
    iptalDenetle(signal);
    const u8 = new Uint8Array(buffer);
    const { dv, le, ilk } = baslik(u8);
    const sayfalar = [], gorulen = new Set();
    let off = ilk, kesik = false, toplam = 0, dongu = false, limitReached = false;
    while (off) {
      if (gorulen.has(off)) { dongu = true; break; }
      gorulen.add(off);
      const ifd = ifdOku(dv, le, off, u8.length);
      if (!ifd) { kesik = true; break; }
      const kucuk = ((degerler(dv, le, ifd.alanlar.get(254), 1) || [0])[0] & 1) === 1;   // küçük önizleme
      if (!kucuk) {
        toplam++;
        if (sayfalar.length < SINIR.sayfa) sayfalar.push(sayfaKur(ifd.alanlar, dv, le, u8.length));
      }
      if (gorulen.size >= SINIR.ifdSay) { limitReached = !!ifd.sonraki; break; }
      off = ifd.sonraki;
      if ((gorulen.size & 1023) === 0) { await bekle(); iptalDenetle(signal); }
    }
    if (!sayfalar.length) throw hata('bozuk', kesik ? 'IFD dosya dışında' : 'sayfa yok');
    // Hiçbir sayfa çizilemiyorsa belge bütünüyle reddedilir; kullanıcı indirme ekranını görür.
    if (sayfalar.every(s => s.sorun)) throw hata(sayfalar[0].sorun, 'tüm sayfalar');
    return { buffer, u8, sayfalar, toplam, kesik, dongu, limitReached,
      complete: !kesik && !dongu && !limitReached && toplam === sayfalar.length && sayfalar.every(s => !s.sorun && !s.truncatedStrip && Number.isInteger(s.rawYon) && s.rawYon >= 1 && s.rawYon <= 8) };
  }

  // ---------------------------------------------------------------- sayfa çözümü
  // Deflate şeritleri önce tarayıcının kendi açıcısıyla, beklenen boyutta kesilerek açılır (sıkıştırma bombası);
  // UTIF'e sıkıştırılmamış sayfa olarak verilir.
  async function deflateAc(u8, s, signal) {
    const allocation = allocationEstimate(s); // Hiçbir stream/tampon kurulmadan tam kapasite denetlenir.
    const parcalar = [];
    let toplam = 0;
    const serit = i => {
      if (s.dosemeli) return Math.ceil(s.tw * s.bps * s.spp / 8) * s.th;
      const duzlem = s.pc === 2 ? Math.ceil(s.y / s.rps) : Infinity;
      const k = s.pc === 2 ? i % duzlem : i;
      return Math.max(0, Math.min(s.rps, s.y - k * s.rps)) * s.satirBayt;
    };
    for (let i = 0; i < s.ofs.length; i++) {
      iptalDenetle(signal);
      const beklenen = serit(i);
      if (!tamSayi(beklenen) || beklenen > allocation.segmentBytes) throw hata('bozuk', 'şerit boyutu');
      const ham = u8.subarray(s.ofs[i], s.ofs[i] + s.say[i]);
      const zlib = ham.length > 2 && (ham[0] & 0x0f) === 8 && ((ham[0] << 8) | ham[1]) % 31 === 0;
      const okuyucu = new Blob([ham]).stream().pipeThrough(new DecompressionStream(zlib ? 'deflate' : 'deflate-raw')).getReader();
      const cikti = new Uint8Array(beklenen);
      let n = 0;
      try {
        for (;;) {
          const { done, value } = await okuyucu.read();
          if (done) break;
          const kalan = beklenen - n;
          cikti.set(value.subarray(0, Math.max(0, kalan)), n);
          n += Math.min(value.length, Math.max(0, kalan));
          if (value.length >= kalan) { okuyucu.cancel().catch(() => {}); break; }
        }
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        throw new Error('deflate', { cause: e });
      }
      parcalar.push(cikti.subarray(0, n));
      toplam = guvenliTopla(toplam, n);
      if (toplam > allocation.decodedCapacity) throw hata('boyut', 'şerit toplamı');
    }
    const buffer = new ArrayBuffer(Math.max(1, toplam));
    const hepsi = new Uint8Array(buffer);
    const ofs = [], say = [];
    let o = 0;
    for (const p of parcalar) { hepsi.set(p, o); ofs.push(o); say.push(p.length); o += p.length; }
    return { buffer, ofs, say };
  }

  // JPEG şeridinin kendi başlığındaki boyut şeride uymalı: UTIF'in JPEG çözücüsü belleği o başlığa göre ayırır.
  function jpegDenetle(u8, s) {
    const enCok = s.dosemeli ? [s.tw, s.th] : [s.g, s.rps];
    for (let i = 0; i < s.ofs.length; i++) {
      const b = u8.subarray(s.ofs[i], s.ofs[i] + Math.min(s.say[i], 65536));
      let o = 2, bulundu = false;
      if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('jpeg');
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) { o++; continue; }
        const m = b[o + 1];
        if (m === 0xff) { o++; continue; }
        if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          const h = (b[o + 5] << 8) | b[o + 6], w = (b[o + 7] << 8) | b[o + 8];
          if (!w || !h || w > enCok[0] + 16 || h > enCok[1] + 16) throw new Error('jpeg boyut');
          bulundu = true;
          break;
        }
        o += 2 + ((b[o + 2] << 8) | b[o + 3]);
      }
      if (!bulundu) throw new Error('jpeg başlık');
      // Her tarama (SOS) bütün bloklardan yeniden geçer; aşamalı JPEG'de makul sayı 10 kadardır. Sıkıştırılmış veride
      // FF baytı FF 00 olarak yazıldığından FF DA yalnız tarama başıdır.
      const serit = u8.subarray(s.ofs[i], s.ofs[i] + s.say[i]);
      let tarama = 0;
      for (let k = 0; k + 1 < serit.length; k++) if (serit[k] === 0xff && serit[k + 1] === 0xda && ++tarama > SINIR.jpegTarama) throw new Error('jpeg tarama');
    }
  }

  // Siyah-beyaz sayfa tam boy RGBA'ya çevrilmeden, bitler kutu ortalamasıyla hedef boyuta indirilir.
  function birBitKucult(veri, g, y, beyazSifir, tg, ty) {
    const bpl = Math.ceil(g / 8);
    const cikti = new Uint8ClampedArray(tg * ty * 4);
    const hedef = new Uint32Array(g), sutunSay = new Uint32Array(tg), toplam = new Uint32Array(tg);
    for (let x = 0; x < g; x++) { const t = Math.min(tg - 1, Math.floor(x * tg / g)); hedef[x] = t; sutunSay[t]++; }
    let sy = 0;
    for (let yy = 0; yy < ty; yy++) {
      const bitis = yy === ty - 1 ? y : Math.floor((yy + 1) * y / ty);
      const satir = Math.max(1, bitis - sy);
      toplam.fill(0);
      for (; sy < bitis; sy++) {
        const o = sy * bpl;
        for (let k = 0; k < bpl; k++) {
          const bayt = veri[o + k];
          if (!bayt) continue;
          const x0 = k << 3;
          for (let b = 0; b < 8; b++) if ((bayt >> (7 - b)) & 1 && x0 + b < g) toplam[hedef[x0 + b]]++;
        }
      }
      for (let t = 0; t < tg; t++) {
        const oran = toplam[t] / (satir * sutunSay[t]);
        const gri = Math.round(255 * (beyazSifir ? 1 - oran : oran));
        const q = (yy * tg + t) << 2;
        cikti[q] = cikti[q + 1] = cikti[q + 2] = gri;
        cikti[q + 3] = 255;
      }
    }
    return cikti;
  }

  // Sayfayı UTIF ile tam çözünürlükte çözer; ham örnekler dönen UTIF sayfa nesnesinin data alanındadır.
  async function sayfaCoz(belge, s, signal) {
    const UTIF = globalThis.UTIF;
    allocationEstimate(s); // Sıkıştırmasız, LZW, CCITT ve JPEG dahil bütün çözüm yolları.
    let buffer = belge.buffer;
    const img = s.tanim();
    if (s.c === 8 || s.c === 32946) {
      const a = await deflateAc(belge.u8, s, signal);
      buffer = a.buffer;
      img.t259 = [1];
      if (s.dosemeli) { img.t324 = a.ofs; img.t325 = a.say; } else { img.t273 = a.ofs; img.t279 = a.say; }
    }
    if (s.c === 7) jpegDenetle(belge.u8, s);
    iptalDenetle(signal);
    koruma.bitis = performance.now() + SINIR.cozumSure;
    koruma.satir = Math.max(s.g, s.tw || 0) + 64;
    sessiz(() => UTIF.decodeImage(buffer, img, [img]));
    if (!img.data || !img.data.length) throw new Error('boş');
    return img;
  }

  // Çözülmüş gri ya da renkli sayfanın tam boy RGBA örnekleri (s.g × s.y × 4); ham örnekler bırakılır.
  function rgba8(s, img) {
    const rgba = sessiz(() => globalThis.UTIF.toRGBA8(img));
    img.data = null;
    return new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, s.g * s.y * 4);
  }

  // Sayfayı çözüp istenen genişlikte (kaynak piksel ekseninde) ImageBitmap döndürür.
  async function sayfaBitmap(belge, s, hedefEn, signal) {
    const img = await sayfaCoz(belge, s, signal);
    const tg = Math.max(1, Math.min(s.g, Math.round(hedefEn)));
    const ty = Math.max(1, Math.min(s.y, Math.round(tg * s.y / s.g)));
    if (s.birBit) {
      const resim = new ImageData(birBitKucult(img.data, s.g, s.y, s.p === 0, tg, ty), tg, ty);
      img.data = null;
      return createImageBitmap(resim);
    }
    const resim = new ImageData(rgba8(s, img), s.g, s.y);
    return createImageBitmap(resim, tg === s.g && ty === s.y ? {} : { resizeWidth: tg, resizeHeight: ty, resizeQuality: 'high' });
  }

  // TIFF yönleri (Orientation 1–8): kaynak görüntü (ig × iy) tuvale bu dönüşümle çizilir.
  function yonDonusumu(ctx, yon, ig, iy) {
    switch (yon) {
      case 2: ctx.transform(-1, 0, 0, 1, ig, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, ig, iy); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, iy); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform(0, 1, -1, 0, iy, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, iy, ig); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, ig); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- görünüm
  function ciz(belge, { signal, kaydirma } = {}) {
    const E = (etiket, sinif) => { const e = document.createElement(etiket); if (sinif) e.className = sinif; return e; };
    const kok = E('div', 'tiff');
    kok.setAttribute('role', 'document');
    kok.setAttribute('aria-label', 'TIFF evrakı');
    const n = belge.sayfalar.length;
    let olcek = 1, birakildi = false, calisiyor = false, sayac = 0;
    const gorunen = new Set();

    const sayfalar = belge.sayfalar.map((s, i) => {
      const kutu = E('div', 'tiff-sayfa');
      const yazi = E('span', 'tiff-yer');
      yazi.textContent = s.sorun ? SAYFA_ILETI[s.sorun] || SAYFA_ILETI.cozulemedi : `Sayfa ${i + 1} hazırlanıyor…`;
      kutu.append(yazi);
      if (s.sorun) kutu.classList.add('hata');
      const etiket = E('div', 'tiff-etiket');
      etiket.textContent = `Sayfa ${i + 1} / ${belge.toplam}`;
      kok.append(kutu, etiket);
      return { s, i, kutu, yazi, tuval: null, durum: s.sorun ? 'hata' : 'bos', cizilenEn: 0, zaman: 0 };
    });
    if (belge.toplam > n || belge.kesik || belge.dongu) {
      const not = E('div', 'tiff-not');
      not.textContent = belge.toplam > n
        ? `Evrak ${belge.toplam} sayfa; ilk ${n} sayfa gösteriliyor. Tamamı için indirin ya da UYAP’ta açın.`
        : 'Dosyanın sonu eksik ya da bozuk; okunabilen sayfalar gösteriliyor. Tamamı için indirin ya da UYAP’ta açın.';
      kok.append(not);
    }

    function boyutla() {
      for (const x of sayfalar) {
        const en = Math.max(40, Math.round(x.s.taban * olcek));
        x.kutu.style.setProperty('width', `${en}px`);
        x.kutu.style.setProperty('height', `${Math.max(40, Math.round(en * x.s.oran))}px`);
      }
    }

    function bosalt(x) {
      if (!x.tuval) return;
      x.tuval.width = 0; x.tuval.height = 0;
      x.tuval.remove();
      x.tuval = null;
      x.durum = 'bos';
      x.cizilenEn = 0;
      x.yazi.textContent = `Sayfa ${x.i + 1} hazırlanıyor…`;
    }

    async function sayfaCiz(x) {
      const { s } = x;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const gEn = Math.max(1, x.kutu.clientWidth), gBoy = Math.max(1, x.kutu.clientHeight);
      let cw = Math.round(gEn * dpr), ch = Math.round(gBoy * dpr);
      const k = Math.min(1, Math.sqrt(SINIR.tuvalPiksel / (cw * ch)));
      cw = Math.max(1, Math.floor(cw * k)); ch = Math.max(1, Math.floor(ch * k));
      const dondu = s.yon >= 5;
      const ig = dondu ? ch : cw, iy = dondu ? cw : ch;   // kaynak eksenindeki çizim boyutu
      x.durum = 'ciziliyor';
      let bmp = null;
      try {
        bmp = await sayfaBitmap(belge, s, ig, signal);
        if (birakildi || iptalMi(signal)) return;
        const tuval = x.tuval || E('canvas');
        tuval.width = cw; tuval.height = ch;
        tuval.setAttribute('role', 'img');
        tuval.setAttribute('aria-label', `Sayfa ${x.i + 1}`);
        const ctx = tuval.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cw, ch);
        yonDonusumu(ctx, s.yon, ig, iy);
        ctx.drawImage(bmp, 0, 0, ig, iy);
        if (!x.tuval) { x.tuval = tuval; x.kutu.append(tuval); }
        x.durum = 'cizili';
        x.cizilenEn = gEn;
        x.zaman = ++sayac;
        x.yazi.textContent = '';
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        bosalt(x);
        x.durum = 'hata';
        x.kutu.classList.add('hata');
        x.yazi.textContent = SAYFA_ILETI.cozulemedi;
      } finally { if (bmp) bmp.close(); }
    }

    // Çizili sayfa sınırı aşılınca görünür alandan uzak ve en eski çizilenler boşaltılır.
    function temizle() {
      const cizili = sayfalar.filter(x => x.durum === 'cizili');
      if (cizili.length <= SINIR.cizili) return;
      cizili.filter(x => !gorunen.has(x)).sort((a, b) => a.zaman - b.zaman)
        .slice(0, cizili.length - SINIR.cizili).forEach(bosalt);
    }

    const gerekli = x => x.durum === 'bos' || (x.durum === 'cizili' && x.kutu.clientWidth > x.cizilenEn * 1.25);
    async function isle() {
      if (calisiyor) return;
      calisiyor = true;
      try {
        for (;;) {
          if (birakildi || iptalMi(signal)) return;
          const x = [...gorunen].filter(gerekli).sort((a, b) => a.i - b.i)[0];
          if (!x) return;
          await sayfaCiz(x);
          temizle();
          await bekle();
        }
      } finally { calisiyor = false; }
    }

    const gozlemci = typeof IntersectionObserver === 'function' ? new IntersectionObserver(girdiler => {
      for (const g of girdiler) {
        const x = sayfalar.find(y => y.kutu === g.target);
        if (!x) continue;
        if (g.isIntersecting) gorunen.add(x); else gorunen.delete(x);
      }
      isle();
    }, { root: kaydirma || null, rootMargin: '1200px 0px' }) : null;
    for (const x of sayfalar) if (x.durum !== 'hata') {
      if (gozlemci) gozlemci.observe(x.kutu); else if (x.i < 3) gorunen.add(x);
    }
    boyutla();
    if (!gozlemci) isle();

    const tabanEn = Math.max(...belge.sayfalar.map(s => s.taban));
    return {
      kok,
      bitti: Promise.resolve(true),
      dogalEn: tabanEn + 16,
      olcekle(z) { olcek = z; boyutla(); isle(); },
      birak() {
        birakildi = true;
        if (gozlemci) gozlemci.disconnect();
        gorunen.clear();
        for (const x of sayfalar) bosalt(x);
      },
      durum: () => sayfalar.map(x => x.durum),
      ozet: { tur: 'TIFF', sayfa: n, toplam: belge.toplam, kesik: belge.kesik || belge.dongu, sorunlu: belge.sayfalar.filter(s => s.sorun).length }
    };
  }

  const CSS = `
.viewer .tiff{display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 8px 24px;width:max-content;min-width:100%;box-sizing:border-box}
.viewer .tiff-sayfa{position:relative;flex:none;display:flex;align-items:center;justify-content:center;background:#fff;box-shadow:0 1px 4px rgba(16,24,40,.25);color:#667085;font:12px/1.4 "Segoe UI",system-ui,sans-serif;text-align:center;overflow:hidden}
.viewer .tiff-sayfa canvas{position:absolute;inset:0;width:100%;height:100%;background:#fff}
.viewer .tiff-sayfa.hata{background:var(--shell-bg);color:var(--shell-text);border:1px dashed var(--shell-muted);box-shadow:none;padding:12px;box-sizing:border-box}
.viewer .tiff-etiket{color:var(--shell-muted);font-size:11px;margin-bottom:12px}
.viewer .tiff-not{max-width:600px;padding:10px 12px;border-radius:8px;background:var(--shell-warn-bg);color:var(--shell-warn-text);font:12px/1.45 "Segoe UI",system-ui,sans-serif}
`;

  globalThis.UHD.tiff = { ac, ciz, sayfaBitmap, sayfaCoz, rgba8, allocationEstimate, yonDonusumu, TiffHatasi, SINIR, CSS, ILETI };
})();
