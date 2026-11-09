/* UDF paragraf profili: aynı font ölçümü satır kırma ve PDF çiziminde kullanılır. */
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
  // Paragraf stili yalnız liste işaretinde ve boş satırda çizilir. Boş satır ancak metin boşsa, satır sonu içeriyorsa ya
  // da sekme dışı boşluk veya görünmez karakterle başlıyorsa (sarmada satır yalnız boşluktan kalabilir) oluşur; öteki
  // paragrafta stilin yüzü yüklenmez ve yaklaşık aile uyarısına girmez.
  function paragrafStiliCizilir(block) {
    if (block.liste) return true;
    const metin = block.parcalar.map(piece => piece.t === 'sekme' ? '\t' : piece.yazi).join(''), ilk = metin[0];
    return !ilk || /[\n\r\u2028\u2029]/u.test(metin) || (ilk !== '\t' && (/\s/u.test(ilk) || GORUNMEZ.test(ilk)));
  }
  // Worker modeli dışarıdan gelir; kaynak okuyucunun sayaçlarına güvenilmez.
  // Uzunluk/öğe denetimi karakter taraması ve font/token dizileri kurulmadan yapılır.
  function validateBudget(model) {
    if (!Array.isArray(model?.bolumler) || model.bolumler.length > 300)
      reject('udf-budget', 'UDF bölüm sınırı aşıldı');
    let characters = 0, nodes = 0;
    for (const section of model.bolumler) {
      if (!Array.isArray(section)) reject('udf-model', 'UDF bölüm listesi geçersiz');
      if ((nodes += 1 + section.length) > 100000) reject('udf-budget', 'UDF öğe sınırı aşıldı');
      for (const block of section) {
        if (!Array.isArray(block?.parcalar)) reject('udf-profile', 'UDF paragraf modeli geçersiz');
        if (block.parcalar.length > 4096 || (nodes += block.parcalar.length) > 100000)
          reject('udf-budget', 'UDF paragraf veya öğe sınırı aşıldı');
        let paragraphCharacters = 0;
        for (const piece of block.parcalar) {
          // Sekme parçası metin taşımaz, bir karakter sayılır.
          if (piece?.t !== 'sekme' && typeof piece?.yazi !== 'string') reject('udf-profile', 'UDF paragrafında doğrulanmamış öğe var');
          const n = piece.t === 'sekme' ? 1 : piece.yazi.length;
          paragraphCharacters += n; characters += n;
          if (paragraphCharacters > 128 * 1024 || characters > 2 * 1024 * 1024)
            reject('udf-budget', 'UDF genişletilmiş metin sınırı aşıldı');
        }
      }
    }
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
    for (const section of model.bolumler) for (const block of section) {
      if (paragrafStiliCizilir(block)) ekle(styleOf(null, block, model));
      for (const piece of block.parcalar) ekle(styleOf(piece, block, model));
    }
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
  function validate(model, diagnostics) {
    validateBudget(model);
    if (!model || diagnostics?.complete !== true || model.paketTani?.complete === false || model.kesildi ||
      model.sayac?.resimReddi || model.sayac?.ofsetSorunu || model.sayac?.bilinmeyen || model.sayac?.kapsanmayan)
      reject('udf-incomplete', 'UDF öğeleri veya içeriği eksik çözüldü');
    if (model.sablon || model.ust || model.alt || model.filigran)
      reject('udf-profile', 'UDF şablon, üst/alt bilgi veya filigran içeriyor');
    if (!Array.isArray(model.bolumler) || !model.bolumler.length || !model.sayfa)
      reject('udf-model', 'UDF sayfa modeli geçersiz');
    const p = model.sayfa;
    if (![p.en, p.boy, p.sol, p.sag, p.ust, p.alt].every(Number.isFinite) || p.en < 100 || p.boy < 100 ||
      p.sol < 0 || p.sag < 0 || p.ust < 0 || p.alt < 0 || p.sol + p.sag >= p.en || p.ust + p.alt >= p.boy)
      reject('udf-page', 'UDF sayfa ölçüleri geçersiz');
    for (const section of model.bolumler) {
      if (!Array.isArray(section)) reject('udf-model', 'UDF bölüm listesi geçersiz');
      for (const b of section) {
        if (b.t !== 'p') reject('udf-profile', 'UDF tablo veya resim içeriyor; referans doğrulaması gerekli');
        if (!Array.isArray(b.parcalar) || !['left', 'center', 'right', 'justify'].includes(b.hiza) ||
          !validList(b.liste) || !validTabs(b, p.en) || ![b.sol, b.sag, b.ilk, b.once, b.sonra, b.aralik].every(v => Number.isFinite(v || 0)) ||
          (b.aralik || 0) < 0 || (b.aralik || 0) > 3 || (b.sol || 0) < 0 || (b.sag || 0) < 0 ||
          (b.once || 0) < 0 || (b.sonra || 0) < 0)
          reject('udf-profile', 'UDF paragraf düzeni doğrulanmadı');
        const width = p.en - p.sol - p.sag - (b.sol || 0) - (b.sag || 0);
        if (width < 24 || width - (b.ilk || 0) < 24) reject('udf-indent', 'UDF girintisi metin alanını kapatıyor');
        validateStyle(styleOf(null, b, model));
        for (const piece of b.parcalar) {
          // Sekme parçası metin taşımaz; satır sonu ve sekme dışındaki denetim karakterleri metin değildir.
          if (piece.t === 'sekme') { validateStyle(styleOf(piece, b, model)); continue; }
          if (piece.t !== 'metin' || typeof piece.yazi !== 'string')
            reject('udf-profile', 'UDF paragrafında doğrulanmamış öğe var');
          if (DENETIM.test(piece.yazi)) reject('udf-control', 'UDF metninde denetim karakteri var');
          validateStyle(styleOf(piece, b, model));
        }
      }
    }
  }
  const color = c => c ? PDF.rgb(c[0] / 255, c[1] / 255, c[2] / 255) : PDF.rgb(0, 0, 0);
  // Shared text geometry for wrapping, drawing and future table/header cell measurement.
  // Images/tables/headers remain unsupported until Editor reference checks exist.
  function lineMetrics(parts, faces, spacing = 0, explicitSpacing = false,
    measure = (key, text, size) => faces[key].pdf.widthOfTextAtSize(text, size)) {
    let ascent = 0, descent = 0, maxSize = 0, width = 0;
    for (const part of parts) {
      const face = faces[part.face], scale = part.style.punto / face.glyph.unitsPerEm;
      ascent = Math.max(ascent, face.glyph.ascent * scale);
      descent = Math.max(descent, -face.glyph.descent * scale);
      maxSize = Math.max(maxSize, part.style.punto);
      // Sekme parçası glif taşımaz; genişliği durağa göre önceden hesaplanır.
      width += part.width ?? measure(part.face, part.text, part.style.punto);
    }
    // Editor FO reference: normal 1.2× point size; explicit LineSpacing v → (1+v)×.
    // Font ascent/descent still governs the baseline and bottom-content bound.
    return { ascent, descent, height: maxSize * (explicitSpacing ? 1 + spacing : 1.2), width };
  }
  function tokenGroups(block, model) {
    const out = [];
    let group = null;
    for (const piece of block.parcalar) {
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
    for (const section of model.bolumler) for (const block of section) {
      if (paragrafStiliCizilir(block)) kullan(styleOf(null, block, model));
      for (const piece of block.parcalar) kullan(styleOf(piece, block, model));
    }
    for (const key of used) if (!fonts?.[key]) reject('udf-font', `UDF fontu eksik: ${key}`);
    const pdf = await PDF.PDFDocument.create(); pdf.registerFontkit(KIT);
    const faces = {};
    for (const key of used) faces[key] = { pdf: await pdf.embedFont(raw(fonts[key]), { subset: true }), glyph: KIT.create(raw(fonts[key])) };
    let yerine = 0, bolunen = 0, sekme = 0, sekmeHizasi = 0, listeler = 0;
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
    const sections = model.bolumler.map(section => section.map(block => {
      if (block.liste) listeler++;
      const parcalar = block.liste ? [{ t: 'metin', yazi: block.liste.isaret + ' ', stil: block.stil }, ...block.parcalar] : block.parcalar;
      return { ...block, parcalar: parcalar.map(piece => {
        if (piece.t === 'sekme') return piece;
        const glyph = faces[fontKey(styleOf(piece, block, model))].glyph;
        const yazi = esnek ? Array.from(piece.yazi, ch => (ch === '\n' || glyph.hasGlyphForCodePoint(ch.codePointAt(0)) ? ch : (yerine++, '?'))).join('')
          : normalizeText(piece.yazi, glyph, karakter);
        return { ...piece, yazi };
      }) };
    }));
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
    const p = model.sayfa, top = p.boy - p.ust, bottom = p.alt;
    const maxPages = Math.min(limits.pages || 300, 300);
    let page, y, drawn = [];
    function newPage() {
      if (pdf.getPageCount() >= maxPages) reject('udf-page-limit', 'UDF sayfa sınırı aşıldı');
      page = pdf.addPage([p.en, p.boy]); y = top; pageKeys = new Map();
    }
    function drawLine(line, block, first, last, explicit) {
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
      if (Math.max(m.height, m.ascent + m.descent) > top - bottom)
        reject('udf-line-height', 'UDF satırı sayfaya sığmıyor');
      if (y - Math.max(m.height, m.ascent + m.descent) < bottom) newPage();
      const left = p.sol + (block.sol || 0) + (first ? (block.ilk || 0) : 0);
      const right = p.en - p.sag - (block.sag || 0), available = right - left;
      if (m.width > available + 0.01) reject('udf-overflow', 'UDF satırı metin alanından taşıyor');
      let x = left;
      if (block.hiza === 'center') x += (available - m.width) / 2;
      if (block.hiza === 'right') x += available - m.width;
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
      const extra = spaces ? (available - m.width) / spaces : 0;
      const baseline = y - m.ascent;
      // Parça tek sözcük parçası, tek boşluk grubu ya da sekmedir; yaslama aynı ölçü sisteminde dağıtılır.
      const placed = line.map((part, i) => {
        const width = (part.tab ? part.width : measure(part.face, part.text, part.style.punto)) + extra * expandable[i];
        const at = x; x += width;
        return { part, x: at, width };
      });
      // Zemin metinden önce çizilir ve parçanın yazı tipi yüksekliğini kaplar; beyaz zemin çizilmez (görüntüleyicideki
      // gibi). Aynı renkte bitişik parçalar tek dikdörtgen olur.
      let box = null;
      const flushBox = () => { if (box) drawBox(box); box = null; };
      for (const { part, x: at, width } of placed) {
        const z = part.style.zemin;
        if (!z || width <= 0 || z.every(v => v === 255)) { flushBox(); continue; }
        const glyph = faces[part.face].glyph, k = part.style.punto / glyph.unitsPerEm;
        const bottomY = baseline + glyph.descent * k, height = (glyph.ascent - glyph.descent) * k, key = z.join(',');
        if (box && box.key === key && box.y === bottomY && box.height === height && Math.abs(box.x + box.width - at) < 0.001) box.width += width;
        else { flushBox(); box = { key, color: z, x: at, y: bottomY, width, height }; }
      }
      flushBox();
      for (const { part, x: at, width } of placed) {
        const face = faces[part.face].pdf, s = part.style;
        // Sekme glif çizmez, yalnız x'i ilerletir; altı/üstü çizgisi sekme boyunca uzar (form doldurma çizgisi).
        if (!part.space && !part.tab) { drawToken(part.text, at, baseline, s.punto, face, fill(s.renk)); drawn.push(part.text); }
        // Boş satırda sığmayan durak sıfır genişliğe düşebilir; uzunluksuz çizgi çizilmez.
        if (s.alti && width > 0) page.drawLine({ start: { x: at, y: baseline - s.punto * 0.12 },
          end: { x: at + width, y: baseline - s.punto * 0.12 }, thickness: Math.max(0.5, s.punto / 16), color: color(s.renk) });
        if (s.ustu && width > 0) page.drawLine({ start: { x: at, y: baseline + s.punto * 0.3 },
          end: { x: at + width, y: baseline + s.punto * 0.3 }, thickness: Math.max(0.5, s.punto / 16), color: color(s.renk) });
      }
      y -= m.height;
    }
    for (const section of sections) {
      check(signal); newPage();
      for (const block of section) {
        check(signal); y -= block.once || 0; drawn = [];
        let line = [], lineWidth = 0, first = true, wrapped = false, full = false;
        const widthLimit = () => p.en - p.sol - p.sag - (block.sol || 0) - (block.sag || 0) - (first ? (block.ilk || 0) : 0);
        // wrap: satır genişlik nedeniyle bitti; sondaki boşluk grubu ölçüye, yaslamaya ve orta/sağ hizaya katılmaz.
        const flush = (last, explicit = false, wrap = false) => {
          if (wrap) while (line.at(-1)?.space) line.pop();
          drawLine(line, block, first, last, explicit); line = []; lineWidth = 0; first = false; wrapped = wrap; full = false;
        };
        for (const token of tokenGroups(block, model)) {
          if (token.newline) { flush(false, true); continue; }
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
            // olarak ölçülür; çizilen genişlik sarma kararındakiyle aynı kalır.
            bolunen++;
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
        // Sekme boşluk sayılır; yalnız boşluk dışı karakterler karşılaştırılır.
        assertTextIntegrity(block.parcalar.map(piece => piece.t === 'sekme' ? '\t' : piece.yazi).join(''), drawn.join(''));
        y -= block.sonra || 0;
      }
    }
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
        ...(model.imza ? ['Özgün UDF’deki e-imza PDF’e taşınmaz; bu PDF imzalı evrakın yerine geçmez.'] : [])];
    // yaklasik: metni koruyup görünümü değiştiren uygulamalar; karakter: normalleştirme sayıları (belge metni yok).
    const yaklasik = [...(aileler.length ? ['font-substitution'] : []), ...(esdeger ? ['glyph-substitution'] : []),
      ...(bolunen ? ['word-split'] : []), ...(sekme ? ['tab'] : []), ...(sekmeHizasi ? ['tab-alignment'] : []),
      ...(listeler ? ['list'] : [])];
    return { bytes, diagnostics: { complete: true, referenceVerified: false, warnings, yaklasik,
      karakter: { silinen: karakter.silinen, esdeger, bosluk: karakter.bosluk } },
      sourcePages: pdf.getPageCount(), warnings };
  }
  globalThis.DurusmaPaketiUDF = Object.freeze({ convert, UdfExportError, lineMetrics, assertTextIntegrity, fontDosyalari, VARSAYILAN_SEKME_PT });
})();
