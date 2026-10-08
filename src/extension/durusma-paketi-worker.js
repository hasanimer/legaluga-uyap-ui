/* Yerel uzantı worker'ı. Evrak baytları yalnız INIT ile gelir; ağdan dava verisi istemez. */
// Yerel pdf.js mesaj/akış işleyicileri Promise.try kullanır. Eski worker çalışma ortamlarında
// geri dönüş vendor yüklenmeden kurulur; yerleşik API varsa korunur. Çağrı hemen yapılır, hata reddedilir.
if (typeof Promise.try !== 'function') Object.defineProperty(Promise, 'try', {
  configurable: true, writable: true,
  value: function (callback, ...args) {
    return new this((resolve, reject) => {
      try { resolve(callback(...args)); } catch (error) { reject(error); }
    });
  }
});
importScripts('vendor/pdf-lib.min.js', 'vendor/fontkit.umd.js', 'vendor/pdfjs-reader.js', 'durusma-paketi-pdf.js');

let session = null;
let controller = null;
const post = (data, transfer) => self.postMessage(data, transfer || []);
const sameRun = runId => session && session.runId === runId;
const fault = (runId, error) => {
  const issues = error?.issues || [{ id: error?.id || null, code: error?.code || 'unexpected',
    message: error?.message || 'Paket oluşturulamadı' }];
  post({ type: 'FAILED', runId, issues });
};
// İçeriğin biçimi ilk baytlardan; UYAP'ın bildirdiği tür yanlış olabilir (dosya ekranı da önce baytlara bakar).
function kind(item) {
  const b = new Uint8Array(item.bytes || []);
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'pdf';
  if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a))) return 'tiff';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4) return 'zip';
  if (!globalThis.DurusmaPaketiMetin) importScripts('durusma-paketi-metin.js');
  return globalThis.DurusmaPaketiMetin ? globalThis.DurusmaPaketiMetin.tur(b) : 'unknown';
}
const unsupported = (item, message) => Object.assign(new Error(`${item.title || item.id}: ${message}`), { code: 'format-unsupported', id: item.id });
// PNG/JPEG başlığı çözülmeden okunur: sıkıştırılmış küçük dosya dev bir RGBA tamponuna dönüşmesin.
function imageSize(item, detected) {
  const b = new Uint8Array(item.bytes), dv = new DataView(item.bytes);
  const bad = () => { throw Object.assign(new Error(`${item.title || item.id}: resim başlığı geçersiz`), { code: 'image-load', id: item.id }); };
  let width = 0, height = 0;
  if (detected === 'png') {
    if (b.length < 33 || dv.getUint32(8) !== 13 || dv.getUint32(12) !== 0x49484452) bad();
    width = dv.getUint32(16); height = dv.getUint32(20);
    let p = 8, ended = false;
    while (p + 12 <= b.length) {
      const n = dv.getUint32(p), tag = dv.getUint32(p + 4);
      if (p + 12 + n > b.length || (p !== 8 && tag === 0x49484452)) bad();
      p += 12 + n;
      if (tag === 0x49454e44) { if (n !== 0 || p !== b.length) bad(); ended = true; break; }
    }
    if (!ended) bad();
  } else {
    const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let p = 2;
    while (p < b.length) {
      if (b[p++] !== 0xff) bad();
      while (b[p] === 0xff) p++;
      const marker = b[p++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > b.length) bad();
      const n = dv.getUint16(p);
      if (n < 2 || p + n > b.length) bad();
      if (frames.has(marker)) {
        if (n < 8 || width) bad();
        height = dv.getUint16(p + 3); width = dv.getUint16(p + 5);
      }
      p += n;
    }
  }
  if (!width || !height) bad();
  const limits = session?.limits || {};
  const positive = (n, fallback) => Number.isSafeInteger(n) && n > 0 ? Math.min(n, fallback) : fallback;
  const pixels = width * height;
  if (width > 32768 || height > 32768 || pixels > positive(limits.maxImagePixels, 16 * 1024 * 1024) ||
    pixels * 16 > positive(limits.maxWorkingBytes, 256 * 1024 * 1024))
    throw Object.assign(new Error(`${item.title || item.id}: resim çözünürlüğü veya çalışma belleği sınırı aşıldı`), { code: 'image-limit', id: item.id });
  return { width, height };
}
// JPEG ve PNG resim tek sayfaya, kenar boşluğuyla ve oranı korunarak yerleştirilir (yatay resim yatay sayfa).
async function imagePdf(item, detected) {
  const size = imageSize(item, detected);
  const PDF = globalThis.PDFLib;
  const pdf = await PDF.PDFDocument.create();
  let image;
  try { image = detected === 'jpg' ? await pdf.embedJpg(new Uint8Array(item.bytes)) : await pdf.embedPng(new Uint8Array(item.bytes)); }
  catch { throw Object.assign(new Error(`${item.title || item.id}: resim açılamadı veya bozuk`), { code: 'image-load', id: item.id }); }
  if (image.width !== size.width || image.height !== size.height)
    throw Object.assign(new Error(`${item.title || item.id}: resim ölçüleri başlığıyla uyuşmuyor`), { code: 'image-load', id: item.id });
  const wide = image.width > image.height;
  const [w, h] = wide ? [841.89, 595.28] : [595.28, 841.89];
  const margin = 28.35;
  const scale = Math.min((w - 2 * margin) / image.width, (h - 2 * margin) / image.height, 1.5);
  const iw = image.width * scale, ih = image.height * scale;
  pdf.addPage([w, h]).drawImage(image, { x: (w - iw) / 2, y: (h - ih) / 2, width: iw, height: ih });
  return pdf.save();
}
async function fontFile(file) {
  const url = new URL(`vendor/fonts/${file}`, self.location.href);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yerel font yüklenemedi: ${file}`);
  return new Uint8Array(await res.arrayBuffer());
}
async function hash(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
async function prepare(item, fonts, signal, onPage) {
  const detected = kind(item);
  const declared = String(item.format || '').toLowerCase();
  const name = globalThis.DurusmaPaketiMetin?.AD || {};
  if (detected === 'zip' && declared !== 'udf')
    throw unsupported(item, `${declared && declared !== 'bin' ? declared.toUpperCase() : 'ZIP'} paketi PDF paketine eklenemiyor; özgün evrakı indirin`);
  if (!['pdf', 'tiff', 'zip', 'html', 'xml', 'text', 'jpg', 'png'].includes(detected))
    throw unsupported(item, `${name[detected] || 'tanınmayan'} biçimindeki evrak PDF paketine eklenemiyor${declared && !['bin', 'bilinmiyor'].includes(declared) ? ` (UYAP türü: ${declared.toUpperCase()})` : ''}; özgün evrakı indirin`);
  const originalSha256 = await hash(item.bytes);
  if (detected === 'pdf') return { ...item, format: 'pdf', originalSha256, sourceFormat: 'pdf' };
  if (detected === 'jpg' || detected === 'png') {
    return { ...item, bytes: await imagePdf(item, detected), format: 'pdf', sourceFormat: detected, originalSha256, sourcePages: 1, warnings: [] };
  }
  if (detected === 'html' || detected === 'xml' || detected === 'text') {
    // Metin evrakı okunur sayfalara çevrilir (UDF paragraf çizicisiyle); görünüm özgün evraktan farklıdır.
    let made;
    try {
      const { model, uyarilar } = globalThis.DurusmaPaketiMetin.model(item.bytes, { mime: item.mime, tur: detected });
      if (!globalThis.DurusmaPaketiUDF) importScripts('durusma-paketi-udf.js');
      made = await globalThis.DurusmaPaketiUDF.convert({ model, diagnostics: { complete: true }, signal, limits: session.limits, fonts, esnek: true, uyarilar });
    } catch (error) {
      if (signal.aborted || error?.code === 'cancelled') throw error;
      throw Object.assign(new Error(`${item.title || item.id}: ${error?.code === 'metin-bos' ? error.message : `${name[detected]} evrak PDF’e çevrilemedi`}`),
        { code: error?.code || 'text-convert', id: item.id });
    }
    return { ...item, bytes: made.bytes, format: 'pdf', sourceFormat: detected === 'text' ? 'txt' : detected, originalSha256,
      sourcePages: made.sourcePages, warnings: made.warnings || [] };
  }
  if (detected === 'tiff') {
    if (!globalThis.DurusmaPaketiTIFF) importScripts('durusma-paketi-tiff.js');
    const made = await globalThis.DurusmaPaketiTIFF.convert({ bytes: item.bytes, signal, limits: session.limits, onPage });
    if (made.diagnostics?.complete !== true) throw Object.assign(new Error('TIFF sayfaları eksiksiz dönüştürülemedi'),
      { code: 'tiff-incomplete', id: item.id });
    return { ...item, bytes: made.bytes, format: 'pdf', sourceFormat: 'tiff', originalSha256,
      sourcePages: made.sourcePages, warnings: made.warnings || [] };
  }
  if (!globalThis.DurusmaPaketiUDF) importScripts('durusma-paketi-udf.js');
  // Yalnız belgede kullanılan eğik yüz yüklenir; PDF/TIFF ve düz UDF ek font istemez.
  const extraFaces = new Set();
  for (const section of item.udfModel?.bolumler || []) for (const block of section) {
    const base = { ...item.udfModel.taban, ...block.stil };
    if (base.italik) extraFaces.add(base.kalin ? 'boldItalic' : 'italic');
    for (const piece of block.parcalar || []) {
      const style = { ...base, ...piece.stil };
      if (style.italik) extraFaces.add(style.kalin ? 'boldItalic' : 'italic');
    }
  }
  for (const face of extraFaces) if (!fonts[face]) {
    fonts[face] = await fontFile(face === 'boldItalic' ? 'LiberationSerif-BoldItalic.ttf' : 'LiberationSerif-Italic.ttf');
  }
  const made = await globalThis.DurusmaPaketiUDF.convert({ bytes: item.bytes, model: item.udfModel,
    diagnostics: item.udfDiagnostics, signal, limits: session.limits, fonts });
  if (made.diagnostics?.complete !== true) throw Object.assign(new Error('UDF eksiksiz dönüştürülemedi'),
    { code: 'udf-incomplete', id: item.id });
  return { ...item, bytes: made.bytes, format: 'pdf', sourceFormat: 'udf', originalSha256,
    sourcePages: made.sourcePages, warnings: made.warnings || [] };
}
async function start(message) {
  const { runId } = message;
  if (!sameRun(runId) || controller) return;
  controller = new AbortController();
  const signal = controller.signal;
  try {
    if (!Array.isArray(session.items) || session.items.length > 100 ||
      session.items.some(item => typeof item.id !== 'string' || !item.id ||
        !(item.bytes instanceof ArrayBuffer) || item.bytes.byteLength > 64 * 1024 * 1024))
      throw Object.assign(new Error('Paket evrak sınırı veya byte girişi geçersiz'), { code: 'input-limit' });
    if (session.items.reduce((n, item) => n + item.bytes.byteLength, 0) > 64 * 1024 * 1024)
      throw Object.assign(new Error('Paket kaynak boyutu 64 MiB sınırını aşıyor'), { code: 'source-limit' });
    const byId = new Map(session.items.map(item => [item.id, item]));
    if (byId.size !== session.items.length) throw Object.assign(new Error('Yinelenen evrak kimliği'), { code: 'selection' });
    const orderedIds = message.orderedIds || session.items.map(item => item.id);
    if (!Array.isArray(orderedIds) || orderedIds.length > 100 || new Set(orderedIds).size !== orderedIds.length ||
      orderedIds.some(id => !byId.has(id)))
      throw Object.assign(new Error('Sıralı evrak seçimi geçersiz'), { code: 'selection' });
    const fonts = { regular: await fontFile('LiberationSerif-Regular.ttf'),
      bold: await fontFile('LiberationSerif-Bold.ttf') };
    const items = [], conversionIssues = [];
    for (const id of orderedIds) {
      if (signal.aborted) throw Object.assign(new Error('Durduruldu'), { code: 'cancelled' });
      const item = byId.get(id);
      try {
        if (!item) throw Object.assign(new Error('Seçilen evrak bulunamadı'), { code: 'selection', id });
        const message = `${items.length + conversionIssues.length + 1}/${orderedIds.length} evrak hazırlanıyor · ${item.title || 'Evrak'}`;
        post({ type: 'PROGRESS', runId, phase: 'convert', itemId: id, message });
        // Çok sayfalı TIFF'te her sayfa bildirilir; panel ilerleyen işi süre sınırıyla kesmez.
        items.push(await prepare(item, fonts, signal, (page, total) =>
          post({ type: 'PROGRESS', runId, phase: 'convert', itemId: id, message: `${message} · sayfa ${page}/${total}` })));
      } catch (error) {
        if (signal.aborted) throw error;
        conversionIssues.push({ id, code: error?.code || 'convert',
          message: error?.message || 'Evrak dönüştürülemedi' });
      }
    }
    if (conversionIssues.length && !items.length) throw { issues: conversionIssues };
    const reason = issue => {
      const title = byId.get(issue.id)?.title || issue.id;
      return String(issue.message || '').startsWith(`${title}: `) ? issue.message.slice(title.length + 2) : issue.message;
    };
    const skip = issues => issues.map(issue => ({ id: issue.id, title: byId.get(issue.id)?.title || 'Evrak', reason: reason(issue) }));
    let excluded = [...(session.excluded || []), ...skip(conversionIssues)];
    let kept = items;
    const build = () => globalThis.DurusmaPaketiPDF.build({ items: kept, orderedIds: orderedIds.filter(id => kept.some(item => item.id === id)),
      excluded, fontRegular: fonts.regular, fontBold: fonts.bold,
      signal, limits: session.limits, onProgress: e => post({ type: 'PROGRESS', runId, ...e }) });
    let result;
    try { result = await build(); }
    catch (error) {
      // Ön denetimde reddedilen PDF'ler (şifreli, form, bozuk) bir kez daha atlanarak denenir; hepsi reddedildiyse hata.
      const bad = (error?.issues || []).filter(issue => issue?.id && kept.some(item => item.id === issue.id));
      if (signal.aborted || !bad.length || bad.length !== (error.issues || []).length || bad.length >= kept.length) throw error;
      kept = kept.filter(item => !bad.some(issue => issue.id === item.id));
      excluded = [...excluded, ...skip(bad)];
      result = await build();
    }
    if (signal.aborted || !sameRun(runId)) return;
    const output = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength);
    post({ type: 'READY', runId, bytes: output, pageCount: result.pageCount,
      entries: result.entries, incomplete: result.incomplete, excluded }, [output]);
  } catch (error) {
    if (signal.aborted || error?.code === 'cancelled') post({ type: 'CANCELLED', runId });
    else fault(runId, error);
  } finally { if (sameRun(runId)) controller = null; }
}
// Banka cevapları (89/1): seçilen evrakların metni. PDF'in metni pdf.js ile, UYAP'ın KEP/e-yazışma eklerini açtığı ZIP'in
// içindeki PDF ve HTML'ler, HTML'in görünen metni. Metin yalnız dosya ekranına döner; saklanmaz.
const METIN_SINIR = 400000;
const METIN_BYTE_SINIR = 64 * 1024 * 1024;
const METIN_TOPLAM_SINIR = 2 * 1024 * 1024;
// pdf.js metin okumasının ortak ayarları (banka cevabı ve Atıflar): betik, eval, WASM, yazı tipi/CMap indirme kapalı.
const PDF_OKUMA = Object.freeze({ isEvalSupported: false, enableScripting: false, useWasm: false,
  disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, disableAutoFetch: true,
  cMapUrl: null, standardFontDataUrl: null, wasmUrl: null, isOffscreenCanvasSupported: false,
  isImageDecoderSupported: false, verbosity: 0 });
let textBusy = false;
const textError = (message, code = 'text-incomplete') => Object.assign(new Error(message), { code });
function textCap(text) {
  if (text.length > METIN_SINIR) throw textError('Evrak metin sınırını aşıyor; tamamı okunamadı.', 'text-limit');
  return text;
}
async function metinCikar(bytes, budget, derinlik = 0, progress = () => {}, sources = [], yol = []) {
  const b = new Uint8Array(bytes);
  const kaynak = (type, metin) => {
    // ZIP sırası ve tam yol birlikte tutulur: aynı ada sahip iki ek birbirine karışmaz.
    sources.push({ yol, type, metin, bytes: b.slice().buffer });
    return metin;
  };
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    const pdfjs = globalThis.DurusmaPaketiPDFJS;
    const task = pdfjs.getDocument({ data: b.slice(), ...PDF_OKUMA });
    try {
      const doc = await task.promise;
      if (!Number.isSafeInteger(doc.numPages) || !doc.numPages) throw textError('PDF sayfa sayısı geçersiz.', 'pdf-text');
      if (doc.numPages > 30) throw textError('PDF 30 sayfa metin okuma sınırını aşıyor; tamamı okunamadı.', 'text-limit');
      let s = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        try {
          const items = (await page.getTextContent()).items;
          if (!Array.isArray(items)) throw textError('PDF metni eksik çözüldü.', 'pdf-text');
          let pageText = '';
          for (const it of items) {
            if (typeof it.str !== 'string') continue;
            pageText = textCap(pageText + it.str + (it.hasEOL ? '\n' : ' '));
          }
          if (!pageText.trim()) throw textError('PDF sayfasında okunabilir metin yok; taranmış evrakı özgün haliyle inceleyin.', 'text-ocr');
          s = textCap(s + pageText + '\n');
          progress();
        } finally { page.cleanup(); }
      }
      return kaynak('application/pdf', s);
    } catch (error) {
      if (error?.code) throw error;
      throw textError('PDF açılamadı veya metni eksiksiz okunamadı.', 'pdf-text');
    } finally { await task.destroy(); }
  }
  if (b[0] === 0x50 && b[1] === 0x4b) {
    if (derinlik >= 2) throw textError('İç içe ZIP okuma sınırı aşıldı; tamamı okunamadı.', 'text-limit');
    if (!globalThis.DurusmaPaketiZip) importScripts('durusma-paketi-zip.js');
    const zip = globalThis.DurusmaPaketiZip.girdiler(b);
    let s = '';
    for (const [indis, g] of zip.liste.entries()) {
      // UYAP dosya dökümü talep ve taraf bilgileri taşır; banka cevabı değildir.
      if (/(^|[\\/])dosyabilgileriv2\.xml$/i.test(g.ad) || /[\\/]$/.test(g.ad)) continue;
      if (/\.(docx?|odt|rtf|eml|msg|xlsx?|pptx?)$/i.test(g.ad))
        throw textError('ZIP içinde metni okunamayan evrak var; paketin tamamı okunamadı.', 'text-unsupported');
      if (!/\.(pdf|html?|txt|xml|zip|eyp|udf|jpe?g|png|tiff?)$/i.test(g.ad)) continue;
      if (++budget.entries > 200) throw textError('ZIP toplam girdi sınırı aşıldı; tamamı okunamadı.', 'text-limit');
      const opened = await globalThis.DurusmaPaketiZip.ac(zip, g, { maxBytes: METIN_BYTE_SINIR - budget.expanded });
      budget.expanded += opened.byteLength;
      s = textCap(s + '\n' + await metinCikar(opened, budget, derinlik + 1, progress, sources, [...yol, { indis, ad: g.ad }]));
      progress();
    }
    if (!s.trim()) throw textError('ZIP paketinde okunabilir evrak metni bulunamadı.', 'text-empty');
    return s;
  }
  if (!globalThis.DurusmaPaketiMetin) importScripts('durusma-paketi-metin.js');
  const tur = globalThis.DurusmaPaketiMetin.tur(b);
  if (tur !== 'html' && tur !== 'text' && tur !== 'xml') throw textError('Evrak biçiminden metin çıkarılamıyor; özgün evrakı inceleyin.', 'text-unsupported');
  if (b.byteLength > 4 * 1024 * 1024) throw textError('Metin kaynak boyutu sınırı aşıldı; tamamı okunamadı.', 'text-limit');
  if (tur === 'text') return kaynak('text/plain', textCap(globalThis.DurusmaPaketiMetin.coz(b, '')));
  const { model, uyarilar } = globalThis.DurusmaPaketiMetin.model(b, { tur });
  if (model.kesildi || model.paketTani?.complete === false || uyarilar.some(x => /çok uzun|sonu aktarılmadı|kesildi|eksik/i.test(x)))
    throw textError('Evrak metni eksik çözüldü.', 'text-limit');
  return kaynak(tur === 'html' ? 'text/html' : 'application/xml',
    textCap(model.bolumler.flat().map(block => block.parcalar.map(part => part.yazi).join('')).join('\n')));
}
// Önizleme için yalnız özgün dosyaları çıkarır: metin, muhatap veya cevap sonucu okunmaz.
async function kaynaklariAc(bytes, budget, sources, yol = []) {
  const b = new Uint8Array(bytes), name = yol.at(-1)?.ad || '';
  if (b[0] === 0x50 && b[1] === 0x4b && !/\.(udf|usf|docx|xlsx|pptx|odt)$/i.test(name)) {
    if (yol.length >= 2) throw textError('İç içe ZIP okuma sınırı aşıldı.', 'source-limit');
    if (!globalThis.DurusmaPaketiZip) importScripts('durusma-paketi-zip.js');
    const zip = globalThis.DurusmaPaketiZip.girdiler(b);
    for (const [indis, entry] of zip.liste.entries()) {
      if (/[\\/]$/.test(entry.ad) || /(^|[\\/])dosyabilgileriv2\.xml$/i.test(entry.ad)) continue;
      if (++budget.entries > 200) throw textError('ZIP toplam girdi sınırı aşıldı.', 'source-limit');
      const opened = await globalThis.DurusmaPaketiZip.ac(zip, entry, { maxBytes: METIN_BYTE_SINIR - budget.expanded });
      budget.expanded += opened.byteLength;
      await kaynaklariAc(opened, budget, sources, [...yol, { indis, ad: entry.ad }]);
    }
    return;
  }
  if (!b.byteLength || sources.length >= 200) throw textError('Özgün belge kaynağı sınırı geçersiz.', 'source-limit');
  // MIME yalnız özgün ad ve biçim imzasından gelir. Etkin HTML içerik sayfa önizlemesinde temizlenir.
  let type = 'application/octet-stream';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) type = 'application/pdf';
  else if (/\.html?$/i.test(name)) type = 'text/html';
  else if (/\.txt$/i.test(name)) type = 'text/plain';
  else if (/\.xml$/i.test(name)) type = 'application/xml';
  else if (/\.(udf|usf)$/i.test(name)) type = 'text/udf';
  else if (b[0] === 0xff && b[1] === 0xd8) type = 'image/jpeg';
  else if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) type = 'image/png';
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) type = 'image/gif';
  else if (b[0] === 0x42 && b[1] === 0x4d) type = 'image/bmp';
  else if (b[0] === 0x49 && b[1] === 0x49 || b[0] === 0x4d && b[1] === 0x4d) type = 'image/tiff';
  sources.push({ yol, type, bytes: b.slice().buffer });
}
async function metinler(data) {
  if (textBusy) { post({ type: 'TEXT_READY', runId: data.runId, texts: [], error: 'Metin işçisi başka bir evrakı okuyor.' }); return; }
  const items = data.items;
  if (!Array.isArray(items) || !items.length || items.length > 200 ||
    items.some(x => typeof x?.id !== 'string' || !x.id || x.id.length > 512 || !(x.bytes instanceof ArrayBuffer) || !x.bytes.byteLength) ||
    new Set(items.map(x => x.id)).size !== items.length || items.reduce((n, x) => n + x.bytes.byteLength, 0) > METIN_BYTE_SINIR) {
    post({ type: 'TEXT_READY', runId: data.runId, texts: [], error: 'Metin evrak seçimi veya 64 MiB kaynak sınırı geçersiz.' }); return;
  }
  textBusy = true;
  const out = [];
  const budget = { entries: 0, expanded: 0, characters: 0 };
  try {
    for (const item of items) {
      try {
        const sources = [];
        if (data.sourcesOnly === true) {
          await kaynaklariAc(item.bytes, budget, sources);
          if (!sources.length) throw textError('Pakette özgün belge bulunamadı.', 'source-empty');
          out.push({ id: item.id, complete: true, sources });
          continue;
        }
        const metin = await metinCikar(item.bytes, budget, 0,
          () => post({ type: 'TEXT_PROGRESS', runId: data.runId, itemId: item.id }), sources);
        if (!metin.trim()) throw textError('Evrakta okunabilir metin bulunamadı.', 'text-empty');
        if (budget.characters + metin.length > METIN_TOPLAM_SINIR) throw textError('Toplam metin sınırı aşıldı; tamamı okunamadı.', 'text-limit');
        budget.characters += metin.length;
        out.push({ id: item.id, metin, complete: true, sources });
      } catch (error) {
        out.push({ id: item.id, metin: '', complete: false, code: error?.code || 'text-incomplete',
          hata: error?.code ? error.message : 'Metin eksiksiz çıkarılamadı; özgün evrakı inceleyin.' });
      }
    }
    post({ type: 'TEXT_READY', runId: data.runId, texts: out }, out.flatMap(x => (x.sources || []).map(s => s.bytes)));
  } finally {
    textBusy = false;
  }
}
// Atıflar (1.19.47): dosya ekranında açık tek PDF'in sayfa sayfa metni. Metni olmayan ve okunamayan sayfalar ayrı sayılır;
// yalnız okunamayan sayfalardan oluşan sonuç hata verir. Sayfa ve karakter sınırından sonrası okunmaz (kesildi). pdf.js'in
// hata iletisi evrak bilgisi taşıyabileceği için yalnız kod döner. Metin yalnız dosya ekranına gider, saklanmaz.
const PDF_SAYFA_SINIR = 300;
const PDF_METIN_SINIR = 2 * 1024 * 1024;
async function pdfSayfalari(data) {
  const b = data.bytes instanceof ArrayBuffer ? new Uint8Array(data.bytes) : null;
  const sinir = Number.isSafeInteger(data.sayfaSiniri) && data.sayfaSiniri > 0 ? Math.min(data.sayfaSiniri, PDF_SAYFA_SINIR) : PDF_SAYFA_SINIR;
  const sayfalar = [];
  let sonuc, task = null, bosSayfa = 0, hataSayfa = 0, karakter = 0;
  if (!b || b.byteLength < 5 || b.byteLength > METIN_BYTE_SINIR || b[0] !== 0x25 || b[1] !== 0x50 || b[2] !== 0x44 || b[3] !== 0x46) sonuc = { code: 'pdf-invalid' };
  else {
    try {
      task = globalThis.DurusmaPaketiPDFJS.getDocument({ data: b.slice(), ...PDF_OKUMA });
      const doc = await task.promise;
      const toplamSayfa = doc.numPages;
      if (!Number.isSafeInteger(toplamSayfa) || toplamSayfa < 1) throw textError('PDF sayfa sayısı geçersiz.', 'pdf-text');
      const son = Math.min(toplamSayfa, sinir);
      let kesildi = toplamSayfa > son;
      for (let no = 1; no <= son; no++) {
        // Sayfalar arasına "\n" konur; sınıra ulaşıldıysa kalan sayfalar okunmaz.
        if (karakter >= PDF_METIN_SINIR) { kesildi = true; break; }
        let metin = '';
        try {
          const page = await doc.getPage(no);
          try {
            const items = (await page.getTextContent()).items;
            if (!Array.isArray(items)) throw textError('PDF sayfası okunamadı.', 'pdf-text');
            for (const it of items) {
              if (typeof it?.str !== 'string') continue;
              metin += it.str + (it.hasEOL ? '\n' : ' ');
              if (karakter + metin.length > PDF_METIN_SINIR) break;
            }
          } finally { page.cleanup(); }
        } catch { hataSayfa++; continue; }
        if (!metin.trim()) { bosSayfa++; continue; }
        if (karakter + metin.length > PDF_METIN_SINIR) { metin = metin.slice(0, PDF_METIN_SINIR - karakter); kesildi = true; }
        sayfalar.push({ no, metin });
        karakter += metin.length + 1;
      }
      sonuc = { sayfalar, toplamSayfa, bosSayfa, kesildi,
        ...(hataSayfa ? { hataSayfa } : {}), ...(!sayfalar.length && hataSayfa ? { code: 'pdf-text' } : {}) };
    } catch {
      sonuc = { code: 'pdf-text' };
    } finally {
      try { await task?.destroy(); } catch { /* işçi iş bitince kapatılır */ }
    }
  }
  post({ type: 'PDF_TEXT_READY', runId: data.runId, sayfalar: [], toplamSayfa: 0, bosSayfa: 0, kesildi: false, ...sonuc });
}
self.onmessage = ({ data }) => {
  if (!data || typeof data.runId !== 'string') return;
  if (data.type === 'TEXT') { void metinler(data); return; }
  if (data.type === 'PDF_TEXT') { void pdfSayfalari(data); return; }
  if (data.type === 'INIT') {
    controller?.abort();
    session = { runId: data.runId, items: data.items || [], excluded: data.excluded || [], limits: data.limits || {} };
    return;
  }
  if (data.type === 'CANCEL') {
    if (sameRun(data.runId)) controller?.abort();
    return;
  }
  if (data.type === 'START') void start(data);
};
