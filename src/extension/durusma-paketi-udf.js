/* UDF çizicisi: paragraf, tablo, resim ve üst/alt bilgi; aynı font ölçümü satır kırma ve PDF çiziminde kullanılır. */
(() => {
  'use strict';
  const PDF = globalThis.PDFLib, KIT = globalThis.fontkit;
  if (!PDF || !KIT) throw new Error('UDF PDF bağımlılıkları yok');
  class UdfExportError extends Error {
    constructor(code, message) { super(message); this.name = 'UdfExportError'; this.code = code; }
  }
  const reject = (code, message) => { throw new UdfExportError(code, message); };
  const check = signal => { if (signal?.aborted) reject('cancelled', 'UDF dönüşümü durduruldu'); };
  const raw = b => b instanceof Uint8Array ? b : new Uint8Array(b);
  const yuz = s => s.kalin ? (s.italik ? 'boldItalic' : 'bold') : (s.italik ? 'italic' : 'regular');
  // Aileler paketteki Liberation yüzlerine eşlenir. Times/Arial/Courier ve Java mantıksal adları metrik uyumludur,
  // uyarı vermez; öteki bilinen adlar yaklaşık eşlenir ve uyarı verir, bilinmeyen ad Serif'e gider. Simge ailesi
  // reddedilir: Wingdings'teki "ü" onay işaretidir; aileyi değiştirmek anlamı sessizce değiştirir.
  const LIBERATION = Object.freeze({ serif: 'Liberation Serif', sans: 'Liberation Sans', mono: 'Liberation Mono' });
  const DOSYA = Object.freeze({ serif: 'LiberationSerif', sans: 'LiberationSans', mono: 'LiberationMono' });
  const YUZ_DOSYA = Object.freeze({ regular: 'Regular', bold: 'Bold', italic: 'Italic', boldItalic: 'BoldItalic' });
  const AILE = new Map();
  for (const [grup, yaklasik, adlar] of [
    ['serif', false, ['Times New Roman', 'Times', 'Serif', 'Liberation Serif', 'Tinos']],
    ['sans', false, ['Arial', 'Helvetica', 'Liberation Sans', 'Arimo', 'SansSerif', 'Dialog']],
    ['mono', false, ['Courier New', 'Courier', 'Liberation Mono', 'Cousine', 'Monospaced', 'DialogInput']],
    ['sans', true, ['Calibri', 'Tahoma', 'Verdana', 'Segoe UI', 'Trebuchet MS', 'Century Gothic', 'Lucida Sans', 'Microsoft Sans Serif']],
    ['mono', true, ['Consolas', 'Lucida Console']]
  ]) for (const ad of adlar) AILE.set(ad.toLowerCase(), Object.freeze({ grup, yaklasik, ad }));
  const SIMGE = /symbol|wingding|webding|dingbat|marlett|mt extra/iu;
  // Uyarıda yalnız paket fontuyla çizilebilen kısa adlar gösterilir; öteki adlar genel adla anılır.
  const GORUNUR_AD = /^[A-Za-z0-9ÇĞİÖŞÜçğıöşü][A-Za-z0-9ÇĞİÖŞÜçğıöşü ._-]{0,39}$/u;
  function aileGrubu(aile) {
    // Uzunluk ad işlenmeden denetlenir (validateStyle ile aynı sınır); uzun ad her parçada yeniden taranmasın.
    if (String(aile ?? '').length > 128) reject('udf-profile', 'UDF yazı tipi adı doğrulanmadı');
    const ad = String(aile ?? '').trim().replace(/\s+/gu, ' ');
    if (!ad) return AILE.get('times new roman');
    if (SIMGE.test(ad)) return { grup: 'symbol', yaklasik: false, ad };
    return AILE.get(ad.toLowerCase()) || { grup: 'serif', yaklasik: true, ad: GORUNUR_AD.test(ad) ? ad : 'tanınmayan yazı tipi' };
  }
  // Serif anahtarları geri uyumludur (regular, bold, italic, boldItalic); öteki gruplar "sans-bold" biçimindedir.
  const fontKey = s => { const { grup } = aileGrubu(s.aile); return grup === 'serif' ? yuz(s) : `${grup}-${yuz(s)}`; };
  const liste = adlar => adlar.length > 1 ? `${adlar.slice(0, -1).join(', ')} ve ${adlar.at(-1)}` : adlar[0];
  const validColor = c => c == null || (Array.isArray(c) && c.length === 3 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 255));
  // Satır kırılabilen boşluklar; iki yana yaslamada yalnız ' ' genişler. U+00A0, U+2007 ve U+202F sözcüğün parçasıdır.
  const BOSLUK = /[ \u2000-\u2006\u2008-\u200a]/u;
  // eslint-disable-next-line no-control-regex -- satır sonu ve sekme dışındaki C0/C1 denetim karakterleri
  const DENETIM = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
  // Durak yoksa sekmenin gittiği varsayılan ızgara (pt); görüntüleyicideki (udf.js) değerle aynı tutulur.
  const VARSAYILAN_SEKME_PT = 36;
  // Görünmez biçim karakterleri ve görünüm seçicileri (U+FE00-FE0F, ör. onay işaretinin emoji biçimi) atılır;
  // çizilirlerse fontkit boşluk genişliği verir.
  const GORUNMEZ = /[\ufe00-\ufe0f\u200b-\u200d\u2060\ufeff\u00ad]/u;
  // Yalnız yüzde glif yoksa uygulanan, anlamı koruyan eşlemeler; sayılı uyarıyla bildirilir.
  const ESDEGER = Object.freeze({ '\u20ba': 'TL', '\u2011': '\u2010', '\u2713': '\u221a', '\u2714': '\u221a',
    '\u2717': 'X', '\u2718': 'X', '\u2610': '[\u00a0]', '\u2611': '[\u221a]', '\u2612': '[X]' });
  const kodNoktasi = ch => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  // UDF metni çizileceği yüze göre normalleştirilir. Eşlemesi olmayan glifsiz karakter "?" yazılmaz, reddedilir.
  function normalizeText(text, glyph, n) {
    const has = ch => glyph.hasGlyphForCodePoint(ch.codePointAt(0));
    let out = '';
    for (const ch of text.replace(/\r\n?|[\u2028\u2029]/gu, '\n')) {
      if (GORUNMEZ.test(ch)) { n.silinen++; continue; }
      // Sekme glif değildir; çizici onu durağa giden boşluk olarak yerleştirir.
      if (ch === '\n' || ch === '\t' || has(ch)) { out += ch; continue; }
      const esdeger = Object.hasOwn(ESDEGER, ch) ? ESDEGER[ch] : null;
      if (esdeger && Array.from(esdeger).every(has)) {
        out += esdeger; n.esdeger.set(ch, (n.esdeger.get(ch) || 0) + 1); continue;
      }
      // Yüzde glifi olmayan boşluk türüne göre düşer: satır kırılabilen boşluk ' ', bölünmez boşluk NBSP olur;
      // yalnız düzeni etkiler.
      if (/\p{White_Space}/u.test(ch)) {
        const yedek = BOSLUK.test(ch) ? ' ' : '\u00a0';
        if (has(yedek)) { out += yedek; n.bosluk++; continue; }
      }
      reject('udf-glyph', `UDF karakteri fontta yok: ${kodNoktasi(ch)}`);
    }
    return out;
  }
  const styleOf = (piece, block, model) => ({ ...(model.taban || {}), ...(block.stil || {}), ...(piece?.stil || {}) });
  // Paragrafın karşılaştırılan metni: sekme boşluk sayılır, resim nesne yer tutucusudur (boşluk gibi karşılaştırma dışı).
  const parcaMetni = piece => piece.t === 'sekme' ? '\t' : piece.t === 'resim' ? '' : piece.yazi;
  // Paragraf stili yalnız liste işaretinde ve boş satırda çizilir. Boş satır ancak metin boşsa, satır sonu içeriyorsa ya
  // da sekme dışı boşluk veya görünmez karakterle başlıyorsa (sarmada satır yalnız boşluktan kalabilir) oluşur; öteki
  // paragrafta stilin yüzü yüklenmez ve yaklaşık aile uyarısına girmez.
  function paragrafStiliCizilir(block) {
    if (block.liste) return true;
    const metin = block.parcalar.map(parcaMetni).join(''), ilk = metin[0];
    return !ilk || /[\n\r\u2028\u2029]/u.test(metin) || (ilk !== '\t' && (/\s/u.test(ilk) || GORUNMEZ.test(ilk)));
  }
  // Gövde, üst/alt bilgi ve tablo hücrelerindeki bloklar. Yapı validateBudget ile doğrulandıktan sonra gezilir.
  function bloklar(model, fn) {
    const walk = list => {
      for (const b of list) {
        fn(b);
        if (b.t === 'tablo') for (const row of b.satirlar) for (const cell of row) walk(cell.bloklar);
      }
    };
    for (const section of model.bolumler) walk(section);
    for (const ek of [model.ust, model.alt]) if (ek) walk(ek);
  }
  const paragraflar = (model, fn) => bloklar(model, b => { if (b.t !== 'tablo' && b.t !== 'resim') fn(b); });
  // Worker modeli dışarıdan gelir; kaynak okuyucunun sayaçlarına güvenilmez.
  // Uzunluk/öğe denetimi karakter taraması ve font/token dizileri kurulmadan yapılır.
  function validateBudget(model) {
    if (!Array.isArray(model?.bolumler) || model.bolumler.length > 300)
      reject('udf-budget', 'UDF bölüm sınırı aşıldı');
    let characters = 0, nodes = 0;
    const say = n => { if ((nodes += n) > 100000) reject('udf-budget', 'UDF öğe sınırı aşıldı'); };
    const walk = (list, depth) => {
      if (!Array.isArray(list)) reject('udf-model', 'UDF bölüm listesi geçersiz');
      if (depth > 32) reject('udf-budget', 'UDF iç içe tablo sınırı aşıldı');
      say(1 + list.length);
      for (const block of list) {
        if (block?.t === 'resim') continue;
        if (block?.t === 'tablo') {
          if (!Array.isArray(block.satirlar)) reject('udf-profile', 'UDF tablo modeli geçersiz');
          say(block.satirlar.length);
          for (const row of block.satirlar) {
            if (!Array.isArray(row)) reject('udf-profile', 'UDF tablo modeli geçersiz');
            say(row.length);
            for (const cell of row) walk(cell?.bloklar, depth + 1);
          }
          continue;
        }
        if (!Array.isArray(block?.parcalar)) reject('udf-profile', 'UDF paragraf modeli geçersiz');
        if (block.parcalar.length > 4096) reject('udf-budget', 'UDF paragraf veya öğe sınırı aşıldı');
        say(block.parcalar.length);
        let paragraphCharacters = 0;
        for (const piece of block.parcalar) {
          // Sekme ve resim parçası metin taşımaz, bir karakter sayılır.
          if (piece?.t !== 'sekme' && piece?.t !== 'resim' && typeof piece?.yazi !== 'string')
            reject('udf-profile', 'UDF paragrafında doğrulanmamış öğe var');
          const n = typeof piece.yazi === 'string' && piece.t !== 'sekme' && piece.t !== 'resim' ? piece.yazi.length : 1;
          paragraphCharacters += n; characters += n;
          if (paragraphCharacters > 128 * 1024 || characters > 2 * 1024 * 1024)
            reject('udf-budget', 'UDF genişletilmiş metin sınırı aşıldı');
        }
      }
    };
    for (const section of model.bolumler) walk(section, 0);
    for (const ek of [model.ust, model.alt]) if (ek != null) walk(ek, 0);
  }
  // Belgede kullanılan yüzlerin paket dosyaları: { anahtar: 'LiberationSans-Bold.ttf' }. Worker yalnız bunları yükler.
  // Simge ailesi dosya istemez; çizici onu reddeder. Model dışarıdan geldiği için önce bütçe denetlenir.
  function fontDosyalari(model) {
    validateBudget(model);
    const out = {};
    const ekle = s => {
      const { grup } = aileGrubu(s.aile);
      if (grup !== 'symbol') out[fontKey(s)] ??= `${DOSYA[grup]}-${YUZ_DOSYA[yuz(s)]}.ttf`;
    };
    paragraflar(model, block => {
      if (paragrafStiliCizilir(block)) ekle(styleOf(null, block, model));
      for (const piece of block.parcalar) if (piece.t !== 'resim') ekle(styleOf(piece, block, model));
    });
    return out;
  }
  function validateStyle(s) {
    if (!Number.isFinite(s.punto) || s.punto < 4 || s.punto > 96 || (s.aile != null && typeof s.aile !== 'string') ||
      String(s.aile ?? '').length > 128 || !validColor(s.renk) || !validColor(s.zemin))
      reject('udf-profile', 'UDF yazı tipi, yazı rengi, zemin rengi veya stili doğrulanmadı');
    if (aileGrubu(s.aile).grup === 'symbol') reject('udf-font-symbol', 'UDF simge yazı tipi içeriyor; simgeler harf olarak basılabilir');
  }
  // Liste işareti okuyucunun ürettiği kısa metindir (ör. "1.", "a)", "•"); dışarıdan geldiği için denetlenir.
  const validList = l => l == null || (typeof l === 'object' && ['madde', 'numara'].includes(l.tur) &&
    Number.isInteger(l.duzey) && l.duzey >= 0 && l.duzey <= 8 && typeof l.isaret === 'string' &&
    l.isaret.length >= 1 && l.isaret.length <= 32 && !/\s/u.test(l.isaret) && !DENETIM.test(l.isaret));
  // Duraklar dışarıdan gelir: en çok 32, sıralı ve sayfa içinde; ayrıntı yalnız konum, hiza ve dolgu taşır.
  function validTabs(b, pageWidth) {
    const stops = b.duraklar ?? [], detail = b.duraklarAyrinti ?? [];
    return Array.isArray(stops) && Array.isArray(detail) && stops.length <= 32 && detail.length <= 32 &&
      stops.every((v, i) => Number.isFinite(v) && v > 0 && v <= pageWidth && (i === 0 || v >= stops[i - 1])) &&
      detail.every(d => Number.isFinite(d?.konum) && Number.isInteger(d.hiza) && Number.isInteger(d.dolgu));
  }
  // Resim okuyucunun çözdüğü raster baytlarıdır; çözülemeyen resim (red) eksik içerik sayılır.
  const RESIM_TURU = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp']);
  function validateImage(x) {
    const r = x?.r;
    if (r?.red) reject('udf-incomplete', 'UDF içinde çözülemeyen resim var');
    if (!r || !ArrayBuffer.isView(r.bayt) || !r.bayt.byteLength || !RESIM_TURU.has(r.tur) || !Number.isInteger(r.g) || !Number.isInteger(r.y) ||
      r.g < 1 || r.y < 1 || !Number.isFinite(x.en) || !Number.isFinite(x.boy) || x.en <= 0 || x.boy <= 0)
      reject('udf-profile', 'UDF resim modeli geçersiz');
  }
  function validate(model, diagnostics) {
    validateBudget(model);
    if (!model || diagnostics?.complete !== true || model.paketTani?.complete === false || model.kesildi ||
      model.sayac?.resimReddi || model.sayac?.ofsetSorunu || model.sayac?.bilinmeyen || model.sayac?.kapsanmayan)
      reject('udf-incomplete', 'UDF öğeleri veya içeriği eksik çözüldü');
    if (!Array.isArray(model.bolumler) || !model.bolumler.length || !model.sayfa)
      reject('udf-model', 'UDF sayfa modeli geçersiz');
    const p = model.sayfa;
    if (![p.en, p.boy, p.sol, p.sag, p.ust, p.alt].every(Number.isFinite) || p.en < 100 || p.boy < 100 ||
      p.sol < 0 || p.sag < 0 || p.ust < 0 || p.alt < 0 || p.sol + p.sag >= p.en || p.ust + p.alt >= p.boy)
      reject('udf-page', 'UDF sayfa ölçüleri geçersiz');
    if (model.filigran != null) validateImage({ r: model.filigran, en: 1, boy: 1 });
    // hucre: tablo hücresindeki paragrafın girintisi dar sütunda çizimde sıfırlanır; reddedilmez.
    const walk = (list, hucre) => {
      for (const b of list) {
        if (b.t === 'resim') { validateImage(b); continue; }
        if (b.t === 'tablo') {
          if (!Number.isInteger(b.sutun) || b.sutun < 1 || b.sutun > 64 || !Array.isArray(b.agirlik) || b.agirlik.length > 64 ||
            !b.agirlik.every(v => Number.isFinite(v) && v > 0))
            reject('udf-profile', 'UDF tablo düzeni doğrulanmadı');
          for (const row of b.satirlar) for (const cell of row) {
            if (!Number.isInteger(cell.cs) || cell.cs < 1 || cell.cs > 64 || !Number.isInteger(cell.rs) || cell.rs < 1 || cell.rs > 64 ||
              !validColor(cell.zemin) || !['top', 'middle', 'bottom'].includes(cell.dikey ?? 'top'))
              reject('udf-profile', 'UDF tablo hücresi doğrulanmadı');
            walk(cell.bloklar, true);
          }
          continue;
        }
        if (b.t !== 'p') reject('udf-profile', 'UDF tanınmayan bir blok içeriyor');
        if (!Array.isArray(b.parcalar) || !['left', 'center', 'right', 'justify'].includes(b.hiza) ||
          !validList(b.liste) || !validTabs(b, p.en) || ![b.sol, b.sag, b.ilk, b.once, b.sonra, b.aralik].every(v => Number.isFinite(v || 0)) ||
          (b.aralik || 0) < 0 || (b.aralik || 0) > 3 || (b.sol || 0) < 0 || (b.sag || 0) < 0 ||
          (b.once || 0) < 0 || (b.sonra || 0) < 0)
          reject('udf-profile', 'UDF paragraf düzeni doğrulanmadı');
        const width = p.en - p.sol - p.sag - (b.sol || 0) - (b.sag || 0);
        if (!hucre && (width < 24 || width - (b.ilk || 0) < 24)) reject('udf-indent', 'UDF girintisi metin alanını kapatıyor');
        validateStyle(styleOf(null, b, model));
        for (const piece of b.parcalar) {
          // Sekme parçası metin taşımaz; satır sonu ve sekme dışındaki denetim karakterleri metin değildir.
          if (piece.t === 'sekme') { validateStyle(styleOf(piece, b, model)); continue; }
          if (piece.t === 'resim') { validateImage(piece); continue; }
          if (piece.t !== 'metin' || typeof piece.yazi !== 'string')
            reject('udf-profile', 'UDF paragrafında doğrulanmamış öğe var');
          if (DENETIM.test(piece.yazi)) reject('udf-control', 'UDF metninde denetim karakteri var');
          validateStyle(styleOf(piece, b, model));
        }
      }
    };
    for (const section of model.bolumler) walk(section, false);
    for (const ek of [model.ust, model.alt]) if (ek) walk(ek, false);
  }
  const color = c => c ? PDF.rgb(c[0] / 255, c[1] / 255, c[2] / 255) : PDF.rgb(0, 0, 0);
  // Satır kırma, çizim ve tablo/üst bilgi ölçümünün ortak metin geometrisi. Satır içi resim taban çizgisine oturur.
  function lineMetrics(parts, faces, spacing = 0, explicitSpacing = false,
    measure = (key, text, size) => faces[key].pdf.widthOfTextAtSize(text, size)) {
    let ascent = 0, descent = 0, maxSize = 0, width = 0, image = 0;
    for (const part of parts) {
      if (part.image) { image = Math.max(image, part.height); width += part.width; continue; }
      const face = faces[part.face], scale = part.style.punto / face.glyph.unitsPerEm;
      ascent = Math.max(ascent, face.glyph.ascent * scale);
      descent = Math.max(descent, -face.glyph.descent * scale);
      maxSize = Math.max(maxSize, part.style.punto);
      // Sekme parçası glif taşımaz; genişliği durağa göre önceden hesaplanır.
      width += part.width ?? measure(part.face, part.text, part.style.punto);
    }
    // Editor FO reference: normal 1.2× point size; explicit LineSpacing v → (1+v)×.
    // Font ascent/descent still governs the baseline and bottom-content bound.
    return { ascent: Math.max(ascent, image), descent, height: Math.max(maxSize * (explicitSpacing ? 1 + spacing : 1.2), image ? image + descent : 0), width };
  }
  function tokenGroups(block, model) {
    const out = [];
    let group = null;
    for (const piece of block.parcalar) {
      // Resim bölünmez bir sözcük gibi yerleşir.
      if (piece.t === 'resim') { group = null; out.push({ image: true, piece }); continue; }
      const style = styleOf(piece, block, model), face = fontKey(style);
      // Sekme öğesi ve metindeki sekme karakteri aynı biçimde durağa gider; sözcük grubunu böler.
      if (piece.t === 'sekme') { group = null; out.push({ tab: true, style, face }); continue; }
      for (const ch of piece.yazi) {
        if (ch === '\n') { group = null; out.push({ newline: true }); continue; }
        if (ch === '\t') { group = null; out.push({ tab: true, style, face }); continue; }
        const space = BOSLUK.test(ch);
        if (!group || group.space !== space) { group = { space, runs: [] }; out.push(group); }
        const previous = group.runs.at(-1);
        if (previous?.style === style) previous.text += ch;
        else group.runs.push({ text: ch, style, face, space });
      }
      // The same word may cross a style span; keep the lexical group intact.
    }
    return out;
  }
  // Sekme konumu paragrafın sol kenarına göre ölçülür (Swing tabBase); ilk satırda ilk satır girintisi de sayılır.
  // Durak, konumdan büyük ilk TabSet durağıdır; yoksa görüntüleyicideki gibi varsayılan ızgara kullanılır. Sola
  // hizalı olmayan ya da dolgulu durak şimdilik sola hizalı gibi yerleşir; yaklasik bunu bildirir.
  function tabStop(block, offset) {
    const stops = block.duraklar || [], at = stops.findIndex(v => v > offset + 0.01);
    if (at < 0) return { width: (Math.floor(offset / VARSAYILAN_SEKME_PT) + 1) * VARSAYILAN_SEKME_PT - offset, yaklasik: false };
    const detail = (block.duraklarAyrinti || []).find(d => d.konum === stops[at]);
    return { width: stops[at] - offset, yaklasik: !!detail && (detail.hiza !== 0 || detail.dolgu !== 0) };
  }
  // Bütünlük güvencesi: normalleştirilmiş beklenen metnin boşluk dışı karakterleri çizilenlerle birebir aynı olmalı.
  function assertTextIntegrity(expected, drawn) {
    const strip = s => String(s).replace(/\s+/gu, '');
    if (strip(expected) !== strip(drawn)) reject('udf-text-loss', 'UDF metni PDF’e eksiksiz aktarılamadı');
  }
  // Resim PDF'e PNG ya da JPEG olarak gömülür. GIF/BMP, çok büyük PNG ve pdf-lib'in açamadığı resim tarayıcının
  // çözücüsüyle PNG'ye çevrilir; çevrilemezse belge eksik basılmaz, udf-image ile reddedilir.
  async function rasterize(r, maxPixels) {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null;
    const k = Math.min(1, Math.sqrt(maxPixels / (r.g * r.y)));
    const w = Math.max(1, Math.floor(r.g * k)), h = Math.max(1, Math.floor(r.y * k));
    let bmp = null;
    try {
      bmp = await createImageBitmap(new Blob([r.bayt], { type: r.tur }), k < 1 ? { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' } : undefined);
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    } catch { return null; } finally { bmp?.close?.(); }
  }
  async function embedImages(pdf, model, limits, signal) {
    const images = new Map(), byHash = new Map(), list = [];
    const ekle = r => { if (r && !images.has(r)) { images.set(r, null); list.push(r); } };
    bloklar(model, b => {
      if (b.t === 'resim') ekle(b.r);
      else if (b.t !== 'tablo') for (const piece of b.parcalar) if (piece.t === 'resim') ekle(piece.r);
    });
    ekle(model.filigran);
    const maxPixels = Math.min(limits.maxImagePixels || 16 * 1024 * 1024, 16 * 1024 * 1024);
    for (const r of list) {
      check(signal);
      // Aynı resim (ör. her satırda yinelenen logo) bir kez gömülür.
      let key = null;
      try {
        const d = await globalThis.crypto?.subtle?.digest('SHA-256', r.bayt);
        if (d) key = r.tur + Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
      } catch { key = null; }
      if (key && byHash.has(key)) { images.set(r, byHash.get(key)); continue; }
      let image = null;
      try {
        if (r.tur === 'image/jpeg') image = await pdf.embedJpg(r.bayt);
        else if (r.tur === 'image/png' && r.g * r.y <= maxPixels) image = await pdf.embedPng(r.bayt);
      } catch { image = null; }
      if (!image) {
        const png = await rasterize(r, maxPixels);
        try { if (png) image = await pdf.embedPng(png); } catch { image = null; }
      }
      if (!image) reject('udf-image', 'UDF’deki resim PDF’e aktarılamadı');
      images.set(r, image); if (key) byHash.set(key, image);
    }
    return images;
  }
  // esnek: HTML/XML/düz metinden kurulan model (durusma-paketi-metin.js); fontta olmayan karakter "?" yazılır.
  // UDF'de yalnız anlamı koruyan eşlemeler uygulanır, kalan glifsiz karakter reddedilir. Satıra sığmayan sözcük
  // iki yolda da harf harf bölünür; UDF'de sayılı uyarı verilir. uyarilar içindekilere yazılır.
  async function convert({ model, diagnostics, signal, limits = {}, fonts, esnek = false, uyarilar = null }) {
    validate(model, diagnostics); check(signal);
    // Yaklaşık eşlenen aileler uyarıda en çok üç adla anılır; metrik uyumlu eşleme uyarı vermez.
    const used = new Set(), yerineAile = new Map();
    const kullan = s => {
      used.add(fontKey(s));
      const aile = aileGrubu(s.aile);
      if (aile.yaklasik && !yerineAile.has(aile.ad.toLowerCase()))
        yerineAile.set(aile.ad.toLowerCase(), `${aile.ad} yerine ${LIBERATION[aile.grup]}`);
    };
    paragraflar(model, block => {
      if (paragrafStiliCizilir(block)) kullan(styleOf(null, block, model));
      for (const piece of block.parcalar) if (piece.t !== 'resim') kullan(styleOf(piece, block, model));
    });
    for (const key of used) if (!fonts?.[key]) reject('udf-font', `UDF fontu eksik: ${key}`);
    const pdf = await PDF.PDFDocument.create(); pdf.registerFontkit(KIT);
    const faces = {};
    for (const key of used) faces[key] = { pdf: await pdf.embedFont(raw(fonts[key]), { subset: true }), glyph: KIT.create(raw(fonts[key])) };
    const images = await embedImages(pdf, model, limits, signal);
    let yerine = 0, bolunen = 0, sekme = 0, sekmeHizasi = 0, listeler = 0, tablolar = 0;
    const karakter = { silinen: 0, bosluk: 0, esdeger: new Map() };
    // Genişlik (yüz, punto, metin) için saftır; her sözcük kırma ve çizimde tekrar ölçüldüğünden belge başına önbelleklenir.
    const widths = new Map();
    const measure = (key, text, size) => {
      const k = key + '\u0000' + size + '\u0000' + text;
      let w = widths.get(k);
      if (w === undefined) { w = faces[key].pdf.widthOfTextAtSize(text, size); if (widths.size >= 200000) widths.clear(); widths.set(k, w); }
      return w;
    };
    // Metin kopyada normalleştirilir; gelen model değişmez, yeniden denemede uyarılar yine sayılır. Liste işareti
    // görüntüleyicideki gibi ilk satırın başına paragraf stiliyle yazılır; bütünlük denetimine de girer.
    const hazirla = block => {
      if (block.t === 'resim') return block;
      if (block.t === 'tablo') {
        tablolar++;
        return { ...block, satirlar: block.satirlar.map(row => row.map(cell => ({ ...cell, bloklar: cell.bloklar.map(hazirla) }))) };
      }
      if (block.liste) listeler++;
      const parcalar = block.liste ? [{ t: 'metin', yazi: block.liste.isaret + ' ', stil: block.stil }, ...block.parcalar] : block.parcalar;
      return { ...block, parcalar: parcalar.map(piece => {
        if (piece.t === 'sekme' || piece.t === 'resim') return piece;
        const glyph = faces[fontKey(styleOf(piece, block, model))].glyph;
        const yazi = esnek ? Array.from(piece.yazi, ch => (ch === '\n' || glyph.hasGlyphForCodePoint(ch.codePointAt(0)) ? ch : (yerine++, '?'))).join('')
          : normalizeText(piece.yazi, glyph, karakter);
        return { ...piece, yazi };
      }) };
    };
    const sections = model.bolumler.map(section => section.map(hazirla));
    const ustBilgi = (model.ust || []).map(hazirla), altBilgi = (model.alt || []).map(hazirla);
    // BAŞARIM: pdf-lib page.drawText her çağrıda sayfanın /Font sözlüğüne aynı font için YENİ rastgele anahtar
    // ekler; sözcük başına çağrıldığından sayfada yüzlerce yinelenen kayıt oluşur, anahtar üretimi tüm kayıtları
    // tarar ve dosya şişer. Anahtar (sayfa, font) başına bir kez üretilir, kodlanmış metin önbelleklenir ve
    // drawText'in tek satır/döndürmesiz çiziminin operatörleri (q BT rg Tf Tm Tj ET Q) doğrudan yazılır.
    // drawText'in cleanText/satır bölme ile dönüştürdüğü denetim karakterlerinde pdf-lib yoluna düşülür.
    // eslint-disable-next-line no-control-regex -- drawText ile birebir aynı denetim karakterleri
    const OZEL = /[\n\r\f\t\u000b\b\u0085\u2028\u2029]/u;
    const encoded = new Map(), colors = new Map();
    let pageKeys = null;
    const fill = c => { const k = c ? c.join(',') : ''; let v = colors.get(k); if (!v) colors.set(k, v = color(c)); return v; };
    const drawToken = (text, x, y, size, font, rgb) => {
      if (OZEL.test(text)) { page.drawText(text, { x, y, size, font, color: rgb }); return; }
      let key = pageKeys.get(font);
      if (!key) pageKeys.set(font, key = page.node.newFontDictionary(font.name, font.ref));
      const ek = font.name + '\u0000' + text;
      let hex = encoded.get(ek);
      if (!hex) { hex = font.encodeText(text); if (encoded.size >= 200000) encoded.clear(); encoded.set(ek, hex); }
      page.pushOperators(PDF.pushGraphicsState(), PDF.beginText(), PDF.setFillingColor(rgb), PDF.setFontAndSize(key, size),
        PDF.setTextMatrix(1, 0, 0, 1, x, y), PDF.showText(hex), PDF.endText(), PDF.popGraphicsState());
    };
    const drawBox = b => page.pushOperators(PDF.pushGraphicsState(), PDF.setFillingColor(fill(b.color)),
      PDF.rectangle(b.x, b.y, b.width, b.height), PDF.fill(), PDF.popGraphicsState());
    // Tablo kenarlıkları: [x1, y1, x2, y2] doğru parçaları tek yolda çizilir.
    const KENAR = 0.5, DOLGU = 2;
    const drawEdges = edges => {
      if (edges.length) page.pushOperators(PDF.pushGraphicsState(), PDF.setStrokingColor(fill(null)), PDF.setLineWidth(KENAR),
        ...edges.flatMap(([x1, y1, x2, y2]) => [PDF.moveTo(x1, y1), PDF.lineTo(x2, y2)]), PDF.stroke(), PDF.popGraphicsState());
    };
    const p = model.sayfa, textWidth = p.en - p.sol - p.sag, fullTop = p.boy - p.ust, fullBottom = p.alt;
    const maxPages = Math.min(limits.pages || 300, 300);
    // top/bottom gövde alanıdır; yinelenen üst/alt bilgi bu alanı daraltır.
    let page, y, top = fullTop, bottom = fullBottom;
    // Bütünlük kaydı: her paragrafın beklenen metni ile sayfaya gerçekten çizilen sözcükleri. Üst/alt bilgi her
    // sayfada çizilir ama yalnız ilk sayfadaki çizim kayda girer.
    let kayit = true;
    const kayitlar = [];
    const dogrula = liste => { for (const k of liste.splice(0)) assertTextIntegrity(k.expected, k.drawn.join('')); };
    const yukseklik = atom => Math.max(atom.need, atom.advance);
    const bosluk = v => ({ need: 0, advance: v, draw() {} });
    // Atom: bölünmeden çizilen yatay şerit (satır, resim, tablo satırı). need sayfada gereken yükseklik, advance
    // sonraki atomun başladığı uzaklıktır; draw(x0, yTop) şeridi sol üst köşesinden çizer.
    // ctx: { width, maxH, hucre }. hucre: dar sütunda girinti sıfırlanır ve taşan glif reddedilmez.
    function lineAtom(line, block, first, last, explicit, ctx, rec) {
      const hasSpacing = block.aralikVar === true || (block.aralik || 0) > 0;
      const m = lineMetrics(line, faces, block.aralik || 0, hasSpacing, measure);
      if (!line.length) {
        const s = styleOf(null, block, model), face = faces[fontKey(s)];
        if (!face) reject('udf-font', `UDF fontu eksik: ${fontKey(s)}`);
        const glyph = face.glyph;
        m.ascent = glyph.ascent * s.punto / glyph.unitsPerEm;
        m.descent = -glyph.descent * s.punto / glyph.unitsPerEm;
        m.height = s.punto * (hasSpacing ? 1 + (block.aralik || 0) : 1.2);
      }
      const need = Math.max(m.height, m.ascent + m.descent);
      if (need > ctx.maxH) reject('udf-line-height', 'UDF satırı sayfaya sığmıyor');
      const left = (block.sol || 0) + (first ? (block.ilk || 0) : 0);
      const available = ctx.width - (block.sag || 0) - left;
      if (m.width > available + 0.01 && !ctx.hucre) reject('udf-overflow', 'UDF satırı metin alanından taşıyor');
      let x = left;
      if (block.hiza === 'center') x += Math.max(0, available - m.width) / 2;
      if (block.hiza === 'right') x += Math.max(0, available - m.width);
      // Yalnız sözcükler arasındaki ' ' genişler; satır başı girintisi, ince boşluk ve NBSP genişlemez.
      // Sarılan satırın sondaki boşluğu flush'ta çıkarıldığı için genişliğe ve hizaya katılmaz.
      // Sekmeli satırda yalnız son sekmeden sonraki aralıklar genişler; sekme genişliği sabit kalır.
      const lastTab = line.findLastIndex(part => part.tab);
      let word = false;
      const expandable = line.map((part, i) => {
        if (i <= lastTab) return 0;
        if (!part.space) { word = true; return 0; }
        return word ? (part.text.match(/ /gu) || []).length : 0;
      });
      const spaces = !last && !explicit && block.hiza === 'justify' ? expandable.reduce((a, b) => a + b, 0) : 0;
      const extra = spaces ? Math.max(0, available - m.width) / spaces : 0;
      // Parça tek sözcük parçası, tek boşluk grubu, sekme ya da resimdir; yaslama aynı ölçü sisteminde dağıtılır.
      const placed = line.map((part, i) => {
        const width = (part.width ?? measure(part.face, part.text, part.style.punto)) + extra * expandable[i];
        const at = x; x += width;
        return { part, x: at, width };
      });
      return { need, advance: m.height, draw(x0, yTop) {
        const baseline = yTop - m.ascent;
        // Zemin metinden önce çizilir ve parçanın yazı tipi yüksekliğini kaplar; beyaz zemin çizilmez (görüntüleyicideki
        // gibi). Aynı renkte bitişik parçalar tek dikdörtgen olur.
        let box = null;
        const flushBox = () => { if (box) drawBox(box); box = null; };
        for (const { part, x: rel, width } of placed) {
          const z = part.image ? null : part.style.zemin, at = x0 + rel;
          if (!z || width <= 0 || z.every(v => v === 255)) { flushBox(); continue; }
          const glyph = faces[part.face].glyph, k = part.style.punto / glyph.unitsPerEm;
          const bottomY = baseline + glyph.descent * k, height = (glyph.ascent - glyph.descent) * k, key = z.join(',');
          if (box && box.key === key && box.y === bottomY && box.height === height && Math.abs(box.x + box.width - at) < 0.001) box.width += width;
          else { flushBox(); box = { key, color: z, x: at, y: bottomY, width, height }; }
        }
        flushBox();
        for (const { part, x: rel, width } of placed) {
          const at = x0 + rel;
          if (part.image) { page.drawImage(part.image, { x: at, y: baseline, width: part.width, height: part.height }); continue; }
          const face = faces[part.face].pdf, s = part.style;
          // Sekme glif çizmez, yalnız x'i ilerletir; altı/üstü çizgisi sekme boyunca uzar (form doldurma çizgisi).
          if (!part.space && !part.tab) { drawToken(part.text, at, baseline, s.punto, face, fill(s.renk)); if (kayit) rec.drawn.push(part.text); }
          // Boş satırda sığmayan durak sıfır genişliğe düşebilir; uzunluksuz çizgi çizilmez.
          if (s.alti && width > 0) page.drawLine({ start: { x: at, y: baseline - s.punto * 0.12 },
            end: { x: at + width, y: baseline - s.punto * 0.12 }, thickness: Math.max(0.5, s.punto / 16), color: color(s.renk) });
          if (s.ustu && width > 0) page.drawLine({ start: { x: at, y: baseline + s.punto * 0.3 },
            end: { x: at + width, y: baseline + s.punto * 0.3 }, thickness: Math.max(0.5, s.punto / 16), color: color(s.renk) });
        }
      } };
    }
    function paragraphAtoms(kaynak, ctx) {
      let block = kaynak;
      if (ctx.hucre) {
        const w = ctx.width - (block.sol || 0) - (block.sag || 0);
        if (w < 24 || w - (block.ilk || 0) < 24) block = { ...block, sol: 0, sag: 0, ilk: 0 };
      }
      // Sekme boşluk sayılır; yalnız boşluk dışı karakterler karşılaştırılır.
      const rec = { expected: block.parcalar.map(parcaMetni).join(''), drawn: [] };
      kayitlar.push(rec);
      const atoms = [];
      if (block.once) atoms.push(bosluk(Math.min(block.once, ctx.maxH)));
      let line = [], lineWidth = 0, first = true, wrapped = false, full = false;
      const widthLimit = () => ctx.width - (block.sol || 0) - (block.sag || 0) - (first ? (block.ilk || 0) : 0);
      // wrap: satır genişlik nedeniyle bitti; sondaki boşluk grubu ölçüye, yaslamaya ve orta/sağ hizaya katılmaz.
      const flush = (last, explicit = false, wrap = false) => {
        if (wrap) while (line.at(-1)?.space) line.pop();
        atoms.push(lineAtom(line, block, first, last, explicit, ctx, rec)); line = []; lineWidth = 0; first = false; wrapped = wrap; full = false;
      };
      for (const token of tokenGroups(block, model)) {
        if (token.newline) { flush(false, true); continue; }
        if (token.image) {
          // Resim satıra ve sayfaya sığacak kadar küçülür, oranı korunur; satırda yer yoksa yeni satıra geçer.
          const k = Math.min(1, Math.max(1, ctx.width - (block.sol || 0) - (block.sag || 0)) / token.piece.en, ctx.maxH / token.piece.boy);
          const width = token.piece.en * k, height = token.piece.boy * k;
          if ((full || lineWidth + width > widthLimit() + 0.01) && line.length) flush(false, false, true);
          line.push({ image: images.get(token.piece.r), width: Math.min(width, Math.max(1, widthLimit())), height, space: false });
          lineWidth += line.at(-1).width;
          continue;
        }
        if (token.tab) {
          // Sekme bir kırılma fırsatıdır: durak satırı aşarsa satır sarılır, sekme yeni satırda baştan hesaplanır.
          let stop = tabStop(block, (first ? (block.ilk || 0) : 0) + lineWidth);
          if ((full || lineWidth + stop.width > widthLimit()) && line.length) {
            flush(false, false, true); stop = tabStop(block, lineWidth);
          }
          // Boş satırda da sığmayan durak satır sonunda biter.
          const width = Math.max(0, Math.min(stop.width, widthLimit() - lineWidth));
          sekme++; if (stop.yaklasik) sekmeHizasi++;
          line.push({ text: '', style: token.style, face: token.face, space: false, tab: true, width }); lineWidth += width;
          continue;
        }
        let width = 0;
        for (const run of token.runs) width += measure(run.face, run.text, run.style.punto);
        if (token.space) {
          // Satır başı boşluğu paragraf başında ve açık satır sonundan sonra korunur; yalnız sarılan satırda atlanır.
          // Sığmayan boşluk grubu satır sonunda asılı kalır: çizilmez, sonraki sözcük yeni satıra geçer.
          if (!line.length && wrapped) continue;
          if (lineWidth + width > widthLimit()) { full = line.length > 0; continue; }
          line.push(...token.runs); lineWidth += width; continue;
        }
        if ((full || lineWidth + width > widthLimit()) && line.length) flush(false, false, true);
        if (width > widthLimit()) {
          // Sığmayan uzun sözcük (adres, kimlik, alt çizgili doldurma alanı) harf harf bölünür. Satırdaki parça bütün
          // olarak ölçülür; çizilen genişlik sarma kararındakiyle aynı kalır. Dar tablo sütunu olağandır, sayılmaz.
          if (!ctx.hucre) bolunen++;
          for (const run of token.runs) {
            let part = null, partWidth = 0;
            for (const ch of run.text) {
              let text = part ? part.text + ch : ch, w = measure(run.face, text, run.style.punto);
              if (lineWidth - partWidth + w > widthLimit() && line.length) {
                flush(false, false, true); part = null; partWidth = 0;
                text = ch; w = measure(run.face, ch, run.style.punto);
              }
              if (part) part.text = text; else line.push(part = { text, style: run.style, face: run.face, space: false });
              lineWidth += w - partWidth; partWidth = w;
            }
          }
          continue;
        }
        line.push(...token.runs); lineWidth += width;
      }
      if (line.length || !block.parcalar.length) flush(true);
      if (block.sonra) atoms.push(bosluk(Math.min(block.sonra, ctx.maxH)));
      return atoms;
    }
    function imageAtoms(block, ctx) {
      const k = Math.min(1, ctx.width / block.en, ctx.maxH / block.boy);
      const width = block.en * k, height = block.boy * k, image = images.get(block.r);
      return [{ need: height, advance: height, draw(x0, yTop) { page.drawImage(image, { x: x0, y: yTop - height, width, height }); } }];
    }
    // Tablo görüntüleyicideki gibi yerleşir: sütunlar ağırlıkla bölünür, hücre içi DOLGU kadar boşluk bırakır. Satır
    // sayfaya sığıyorsa bölünmez; sayfadan uzun satır hücre içeriğinin atom sınırlarından dilimlenir. Birden çok satırı
    // kaplayan hücrenin içeriği ilk satırında durur, alttaki satırlarda sütunu boş ve arası çizgisiz kalır.
    function tableAtoms(t, ctx) {
      const n = t.sutun, ort = t.agirlik.length ? t.agirlik.reduce((a, b) => a + b, 0) / t.agirlik.length : 1;
      const agirlik = Array.from({ length: n }, (_, i) => t.agirlik[i] || ort), toplam = agirlik.reduce((a, b) => a + b, 0) || 1;
      const xs = [0];
      for (const w of agirlik) xs.push(xs.at(-1) + ctx.width * w / toplam);
      const hucreMaxH = ctx.maxH - 2 * DOLGU;
      if (hucreMaxH < 8) reject('udf-line-height', 'UDF tablosu sayfaya sığmıyor');
      const kaplayan = new Array(n).fill(null);   // üst satırdan sarkan hücre: { kalan, cs, zemin }
      const atoms = [];
      const satirAtomu = (cells, height) => ({ need: height, advance: height, draw(x0, yTop) {
        for (const c of cells) if (c.zemin && !c.zemin.every(v => v === 255))
          drawBox({ color: c.zemin, x: x0 + c.x, y: yTop - height, width: c.w, height });
        for (const c of cells) {
          const bos = height - 2 * DOLGU - c.h;
          let cy = yTop - DOLGU - (c.dikey === 'middle' ? bos / 2 : c.dikey === 'bottom' ? bos : 0);
          for (const a of c.list) { a.draw(x0 + c.x + DOLGU, cy); cy -= a.advance; }
        }
        if (!t.kenar) return;
        const edges = [];
        for (const c of cells) {
          const l = x0 + c.x, r = l + c.w, b = yTop - height;
          edges.push([l, yTop, l, b], [r, yTop, r, b]);
          if (!c.surer) edges.push([l, yTop, r, yTop]);
          if (!c.acik) edges.push([l, b, r, b]);
        }
        drawEdges(edges);
      } });
      t.satirlar.forEach((row, ri) => {
        check(signal);
        const sonSatir = ri === t.satirlar.length - 1;
        let k = 0, tur = 0;
        // Sütun sayısını aşan hücreler düşmez; aynı satırın devamı olarak alta yazılır.
        do {
          const cells = [];
          let col = 0;
          const once = k;
          while (col < n) {
            const o = kaplayan[col];
            if (o && o.kalan > 0) {
              o.kalan--;
              cells.push({ x: xs[col], w: xs[col + o.cs] - xs[col], list: [], h: 0, zemin: o.zemin, surer: true, acik: o.kalan > 0 && !sonSatir });
              col += o.cs; continue;
            }
            kaplayan[col] = null;
            const cell = row[k];
            // Hücresi eksik sütun boş kalır; sağındaki sarkan hücreler yine işlenir.
            if (!cell) { col++; continue; }
            k++;
            let cs = Math.min(cell.cs, n - col);
            for (let j = col + 1; j < col + cs; j++) if (kaplayan[j]?.kalan > 0) { cs = j - col; break; }
            const w = xs[col + cs] - xs[col];
            const hctx = { width: Math.max(1, w - 2 * DOLGU), maxH: hucreMaxH, hucre: true };
            const list = cell.bloklar.flatMap(b => blockAtoms(b, hctx));
            cells.push({ x: xs[col], w, list, h: 0, zemin: cell.zemin, dikey: cell.dikey, surer: false, acik: cell.rs > 1 && !sonSatir });
            if (cell.rs > 1) kaplayan[col] = { kalan: cell.rs - 1, cs, zemin: cell.zemin };
            col += cs;
          }
          if (!cells.length || (k === once && ++tur > 64)) break;
          for (const c of cells) c.h = c.list.reduce((a, b) => a + yukseklik(b), 0);
          const height = Math.max(...cells.map(c => c.h)) + 2 * DOLGU;
          if (height <= ctx.maxH) { atoms.push(satirAtomu(cells, height)); continue; }
          // Sayfadan uzun satır: her dilimde hücreler sığdığı kadar atom alır.
          const at = cells.map(() => 0);
          for (;;) {
            const dilim = cells.map((c, i) => {
              let h = 0, j = at[i];
              while (j < c.list.length && h + yukseklik(c.list[j]) <= hucreMaxH + 1e-6) h += yukseklik(c.list[j++]);
              const list = c.list.slice(at[i], j); at[i] = j;
              return { ...c, list, h, dikey: 'top' };
            });
            if (!dilim.some(c => c.list.length)) break;
            atoms.push(satirAtomu(dilim, Math.max(...dilim.map(c => c.h)) + 2 * DOLGU));
          }
          if (cells.some((c, i) => at[i] < c.list.length)) reject('udf-line-height', 'UDF tablo satırı sayfaya sığmıyor');
        } while (k < row.length);
      });
      return atoms;
    }
    const blockAtoms = (block, ctx) => block.t === 'tablo' ? tableAtoms(block, ctx) : block.t === 'resim' ? imageAtoms(block, ctx) : paragraphAtoms(block, ctx);
    // Üst ve alt bilgi her sayfada yinelenir; birlikte sayfanın yarısını aşarlarsa yinelenmez, belgenin başına ve
    // sonuna bir kez yazılır (metin düşmez).
    const tamCtx = { width: textWidth, maxH: fullTop - fullBottom, hucre: false };
    let ustAtomlar = ustBilgi.flatMap(b => blockAtoms(b, tamCtx)), altAtomlar = altBilgi.flatMap(b => blockAtoms(b, tamCtx));
    const ekKayitlar = kayitlar.splice(0);
    const ARA = 6, toplamH = atoms => atoms.reduce((a, b) => a + yukseklik(b), 0);
    const ustH = toplamH(ustAtomlar), altH = toplamH(altAtomlar);
    const ekBilgi = ustAtomlar.length > 0 || altAtomlar.length > 0;
    let bas = [], son = [], ekYinelenir = ekBilgi;
    if (ustH + altH + 2 * ARA > tamCtx.maxH / 2) { bas = ustAtomlar; son = altAtomlar; ustAtomlar = []; altAtomlar = []; ekYinelenir = false; }
    else { top = fullTop - (ustH ? ustH + ARA : 0); bottom = fullBottom + (altH ? altH + ARA : 0); }
    const govdeCtx = { width: textWidth, maxH: top - bottom, hucre: false };
    const filigran = model.filigran ? images.get(model.filigran) : null;
    function newPage() {
      if (pdf.getPageCount() >= maxPages) reject('udf-page-limit', 'UDF sayfa sınırı aşıldı');
      page = pdf.addPage([p.en, p.boy]); pageKeys = new Map();
      if (filigran) {
        // Görüntüleyicideki gibi metin alanına ortalanır, oranı korunur ve soluk basılır.
        const k = Math.min(textWidth / filigran.width, (fullTop - fullBottom) / filigran.height);
        const w = filigran.width * k, h = filigran.height * k;
        page.drawImage(filigran, { x: p.sol + (textWidth - w) / 2, y: fullBottom + (fullTop - fullBottom - h) / 2, width: w, height: h, opacity: 0.15 });
      }
      kayit = pdf.getPageCount() === 1;
      let ey = fullTop;
      for (const a of ustAtomlar) { a.draw(p.sol, ey); ey -= a.advance; }
      ey = fullBottom + altH;
      for (const a of altAtomlar) { a.draw(p.sol, ey); ey -= a.advance; }
      kayit = true;
      y = top;
    }
    const ak = atoms => {
      for (const a of atoms) {
        if (a.need > 0 && y - a.need < bottom - 1e-6) newPage();
        a.draw(p.sol, y); y -= a.advance;
      }
    };
    sections.forEach((section, i) => {
      check(signal); newPage();
      if (i === 0) ak(bas);
      for (const block of section) { check(signal); ak(blockAtoms(block, govdeCtx)); dogrula(kayitlar); }
      if (i === sections.length - 1) ak(son);
    });
    dogrula(ekKayitlar);
    check(signal);
    const bytes = await pdf.save();
    const esdeger = [...karakter.esdeger.values()].reduce((a, b) => a + b, 0);
    // Uyarı paket raporunda Serif ile yazılır; özgün karakter fontta olmadığı için kod noktasıyla anılır.
    const esdegerler = [...karakter.esdeger.keys()].map(ch => `${kodNoktasi(ch)} → ${ESDEGER[ch].replace('\u00a0', ' ')}`).join(', ');
    const aileler = [...yerineAile.values()];
    const aileCumlesi = aileler.length ? `${liste([...aileler.slice(0, 3), ...(aileler.length > 3 ? [`${aileler.length - 3} yazı tipi daha yerine benzeri`] : [])])} kullanıldı; satır ve sayfa kırılmaları özgünden farklı olabilir.` : '';
    const warnings = esnek ? [...(uyarilar || []), yerine ? `${yerine} karakter yazı tipinde bulunmadığı için “?” olarak yazıldı` : null].filter(Boolean)
      : ['Sayfa düzeni UYAP Editör çıktısından küçük farklar gösterebilir.',
        ...(aileCumlesi ? [aileCumlesi[0].toLocaleUpperCase('tr') + aileCumlesi.slice(1)] : []),
        ...(esdeger ? [`Yazı tipinde bulunmayan ${esdeger} karakter eşdeğeriyle yazıldı: ${esdegerler}.`] : []),
        ...(bolunen ? [`Satıra sığmayan ${bolunen} uzun sözcük bölünerek yazıldı.`] : []),
        ...(sekme ? ['Sekme konumları yaklaşık; UYAP Editör görünümünden farklı olabilir.'] : []),
        ...(sekmeHizasi ? [`Sola hizalı olmayan ya da dolgulu durağa denk gelen ${sekmeHizasi} sekme, sola hizalı durak gibi yerleştirildi.`] : []),
        ...(listeler ? ['Liste işaretleri ve numaraları yeniden üretildi; girinti yaklaşık.'] : []),
        ...(tablolar ? ['Tablo sütun genişlikleri ve satır yükseklikleri yaklaşık.'] : []),
        ...(ekBilgi ? [ekYinelenir ? 'Üst ve alt bilgi her sayfada yinelendi; konumu yaklaşık.'
          : 'Üst ve alt bilgi sayfaya sığmadığı için yalnız belgenin başına ve sonuna yazıldı.'] : []),
        ...(model.paketTani?.yaklasik > 0 ? [`Belgedeki ${model.paketTani.yaklasik} biçim özelliği tanınmadı; görünüm özgünden farklı olabilir.`] : []),
        ...(model.imza ? ['Özgün UDF’deki e-imza PDF’e taşınmaz; bu PDF imzalı evrakın yerine geçmez.'] : [])];
    // yaklasik: metni koruyup görünümü değiştiren uygulamalar; karakter: normalleştirme sayıları (belge metni yok).
    const yaklasik = [...(aileler.length ? ['font-substitution'] : []), ...(esdeger ? ['glyph-substitution'] : []),
      ...(bolunen ? ['word-split'] : []), ...(sekme ? ['tab'] : []), ...(sekmeHizasi ? ['tab-alignment'] : []),
      ...(listeler ? ['list'] : []), ...(tablolar ? ['table'] : []), ...(ekBilgi ? ['header-footer'] : []),
      ...(images.size ? ['image'] : []), ...(model.paketTani?.yaklasik > 0 ? ['attribute'] : [])];
    return { bytes, diagnostics: { complete: true, referenceVerified: false, warnings, yaklasik,
      karakter: { silinen: karakter.silinen, esdeger, bosluk: karakter.bosluk } },
      sourcePages: pdf.getPageCount(), warnings };
  }
  globalThis.DurusmaPaketiUDF = Object.freeze({ convert, UdfExportError, lineMetrics, assertTextIntegrity, fontDosyalari, VARSAYILAN_SEKME_PT });
})();
