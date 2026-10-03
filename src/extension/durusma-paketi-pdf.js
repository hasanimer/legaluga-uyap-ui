/* Duruşma paketi PDF motoru. Yerel worker içinde, yalnız byte girişiyle çalışır. */
(() => {
  'use strict';
  const PDF = globalThis.PDFLib;
  const KIT = globalThis.fontkit;
  if (!PDF || !KIT) throw new Error('PDF motoru yerel vendor bağımlılıklarını bulamadı');
  const { PDFDocument, PDFName, PDFNumber, PDFArray, PDFDict, degrees, rgb,
    pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = PDF;
  const N = name => PDFName.of(name);
  const BAND_PT = 28;
  const PAGE = [595.28, 841.89];
  const LIMITS = { documents: 100, pages: 300, sourceBytes: 64 * 1024 * 1024,
    outputBytes: 128 * 1024 * 1024, maxWorkingBytes: 256 * 1024 * 1024 };

  class PackageError extends Error {
    constructor(code, message, id) { super(message); this.name = 'PackageError'; this.code = code; this.id = id; }
  }
  const fail = (code, message, id) => { throw new PackageError(code, message, id); };
  const signalCheck = signal => { if (signal?.aborted) fail('cancelled', 'Paket oluşturma durduruldu'); };
  const str = v => String(v ?? '');
  const size = v => v instanceof ArrayBuffer ? v.byteLength : v?.byteLength || 0;
  const bytesOf = v => v instanceof Uint8Array ? v : new Uint8Array(v);
  async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', bytesOf(value));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  function covered(fontkitFont, value, id) {
    for (const ch of str(value)) {
      if (!fontkitFont.hasGlyphForCodePoint(ch.codePointAt(0)))
        fail('font-glyph', `Türkçe paket fontu U+${ch.codePointAt(0).toString(16).toUpperCase()} karakterini içermiyor`, id);
    }
  }

  function object(doc, dict, key) {
    const value = dict?.get(N(key));
    return value ? doc.context.lookup(value) : null;
  }
  function number(value, fallback) { return value instanceof PDFNumber ? value.asNumber() : fallback; }
  function name(value) { return value instanceof PDFName ? value.asString() : ''; }
  function pageUnit(doc, page, id) {
    const unit = number(object(doc, page.node, 'UserUnit'), 1);
    if (!Number.isFinite(unit) || unit <= 0 || unit > 75_000) fail('user-unit', 'PDF UserUnit geçersiz', id);
    return unit;
  }
  function effectiveCrop(page, id) {
    const crop = page.getCropBox(), media = page.getMediaBox();
    const x = Math.max(crop.x, media.x), y = Math.max(crop.y, media.y);
    const right = Math.min(crop.x + crop.width, media.x + media.width);
    const top = Math.min(crop.y + crop.height, media.y + media.height);
    if (![x, y, right, top].every(Number.isFinite) || right <= x || top <= y)
      fail('page-box', 'PDF görünür sayfa kutusu geçersiz', id);
    return { x, y, width: right - x, height: top - y };
  }
  function rotation(page, id) {
    const angle = page.getRotation().angle;
    if (![0, 90, 180, 270].includes(angle)) fail('rotation', 'PDF sayfa döndürmesi desteklenmiyor', id);
    return angle;
  }
  function inspectFeatures(doc, id) {
    const cat = doc.catalog;
    if (!cat || !cat.get) fail('pdf-structure', 'PDF katalogu eksik veya bozuk', id);
    for (const key of ['AcroForm', 'OpenAction', 'AA']) {
      if (cat.get(N(key))) fail(key.toLowerCase(), `PDF ${key} özelliği güvenli biçimde paketlenemiyor`, id);
    }
    const names = object(doc, cat, 'Names');
    if (names instanceof PDFDict && (names.get(N('JavaScript')) || names.get(N('EmbeddedFiles'))))
      fail('embedded-action', 'PDF etkin kod veya ekli dosya içeriyor', id);
    let pages;
    try { pages = doc.getPages(); } catch { fail('pdf-structure', 'PDF sayfa ağacı bozuk', id); }
    if (!pages.length) fail('pdf-structure', 'PDF sayfası yok', id);
    for (const page of pages) {
      rotation(page, id); const unit = pageUnit(doc, page, id);
      if (page.node.get(N('AA'))) fail('page-action', 'PDF sayfa eylemi içeriyor', id);
      const crop = effectiveCrop(page, id);
      if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width <= 0 || crop.height <= 0)
        fail('page-box', 'PDF sayfa kutusu geçersiz', id);
      if (crop.width * unit > 14400 || crop.height * unit > 14400)
        fail('page-box', 'PDF fiziksel sayfa ölçüsü sınırı aşıyor', id);
    }
  }
  function annotations(doc, page, id) {
    const array = page.node.Annots();
    if (!array) return [];
    const result = [];
    for (let i = 0; i < array.size(); i++) {
      const dict = doc.context.lookup(array.get(i));
      if (!(dict instanceof PDFDict)) fail('annotation', 'PDF açıklaması çözülemedi', id);
      const subtype = name(object(doc, dict, 'Subtype'));
      if (!['/Link', '/Text', '/Highlight', '/Underline', '/StrikeOut'].includes(subtype))
        fail('annotation', `PDF açıklama türü desteklenmiyor: ${subtype}`, id);
      if (dict.get(N('AA')) || dict.get(N('JS'))) fail('annotation-action', 'PDF açıklaması etkin kod içeriyor', id);
      if (subtype !== '/Link' && (dict.get(N('A')) || dict.get(N('Dest'))))
        fail('annotation-action', 'PDF açıklama eylemi güvenli biçimde taşınamıyor', id);
      let target = null;
      if (subtype === '/Link') {
        const action = object(doc, dict, 'A');
        if (action) {
          if (!(action instanceof PDFDict) || name(object(doc, action, 'S')) !== '/GoTo')
            fail('link-action', 'PDF bağlantı eylemi güvenli biçimde aktarılamıyor', id);
          target = object(doc, action, 'D');
        } else target = object(doc, dict, 'Dest');
        if (!(target instanceof PDFArray) || target.size() < 2)
          fail('link-target', 'PDF bağlantı hedefi çözülemiyor', id);
      }
      result.push({ dict, target, subtype });
    }
    return result;
  }
  function rectArray(doc, rect) {
    if (!(rect instanceof PDFArray) || rect.size() !== 4) return null;
    const a = [0, 1, 2, 3].map(i => number(doc.context.lookup(rect.get(i)), NaN));
    return a.every(Number.isFinite) ? a : null;
  }
  function clampAnnotations(doc, page, originalCrop, id) {
    const ann = page.node.Annots();
    if (!ann) return;
    const list = annotations(doc, page, id);
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i].dict;
      const r = rectArray(doc, object(doc, d, 'Rect'));
      if (!r) fail('annotation-rect', 'PDF açıklama alanı çözülemedi', id);
      const x0 = Math.max(r[0], originalCrop.x), y0 = Math.max(r[1], originalCrop.y);
      const x1 = Math.min(r[2], originalCrop.x + originalCrop.width);
      const y1 = Math.min(r[3], originalCrop.y + originalCrop.height);
      if (x0 >= x1 || y0 >= y1) { ann.remove(i); continue; }
      d.set(N('Rect'), doc.context.obj([x0, y0, x1, y1]));
      // QuadPoints/appearance beyond CropBox need a separate geometry transform.
      if (d.get(N('QuadPoints')) && (x0 !== r[0] || y0 !== r[1] || x1 !== r[2] || y1 !== r[3]))
        fail('annotation-clip', 'Kırpılan PDF açıklaması güvenli taşınamıyor', id);
      if (d.get(N('AP')) && (x0 !== r[0] || y0 !== r[1] || x1 !== r[2] || y1 !== r[3]))
        fail('annotation-clip', 'Kırpılan PDF görünümü güvenli taşınamıyor', id);
    }
  }
  function clipOriginal(page, crop) {
    page.node.normalize();
    page.getContentStream(); // Blank source pages still need a stream to wrap.
    const a = page.createContentStream(pushGraphicsState(), rectangle(crop.x, crop.y, crop.width, crop.height), clip(), endPath());
    const b = page.createContentStream(popGraphicsState());
    if (!page.node.wrapContentStreams(page.doc.context.register(a), page.doc.context.register(b)))
      fail('content', 'PDF sayfa içeriği sarılamadı');
  }
  function extendBox(page, crop, angle, unit) {
    const band = BAND_PT / unit;
    const box = { ...crop };
    if (angle === 0) { box.y -= band; box.height += band; }
    if (angle === 90) box.width += band;
    if (angle === 180) box.height += band;
    if (angle === 270) { box.x -= band; box.width += band; }
    const media = page.getMediaBox();
    const x = Math.min(media.x, box.x), y = Math.min(media.y, box.y);
    const right = Math.max(media.x + media.width, box.x + box.width);
    const top = Math.max(media.y + media.height, box.y + box.height);
    page.setMediaBox(x, y, right - x, top - y);
    page.setCropBox(box.x, box.y, box.width, box.height);
  }
  function footer(page, font, n, total, crop, angle, unit, id) {
    const band = BAND_PT / unit, margin = 8 / unit;
    const label = `Paket sayfası ${n} / ${total}`;
    const run = (angle === 0 || angle === 180 ? crop.width : crop.height) - 2 * margin;
    const nominal = font.widthOfTextAtSize(label, 10 / unit);
    const pointSize = Math.min(10 / unit, 10 / unit * run / nominal);
    if (!Number.isFinite(pointSize) || pointSize < 5 / unit)
      fail('footer-fit', 'Paket numarası kaynak sayfa genişliğine sığmıyor', id);
    let x, y;
    if (angle === 0) { x = crop.x + margin; y = crop.y - band + margin; }
    if (angle === 90) { x = crop.x + crop.width + band - margin; y = crop.y + margin; }
    if (angle === 180) { x = crop.x + crop.width - margin; y = crop.y + crop.height + band - margin; }
    if (angle === 270) { x = crop.x - band + margin; y = crop.y + crop.height - margin; }
    page.drawText(label, { x, y, size: pointSize,
      rotate: degrees(angle), font, color: rgb(0, 0, 0) });
  }
  function sourceTarget(doc, dest, id) {
    const ref = dest.get(0);
    const index = doc.getPages().findIndex(p => p.ref.toString() === ref?.toString());
    if (index < 0) fail('link-target', 'PDF iç bağlantısı sayfaya eşlenemedi', id);
    return index;
  }
  function relink(doc, out, sourcePages, copiedPages, id) {
    sourcePages.forEach((srcPage, pi) => {
      const src = annotations(doc, srcPage, id);
      const dstArray = copiedPages[pi].node.Annots();
      if ((dstArray?.size() || 0) !== src.length) fail('annotation-copy', 'PDF açıklamaları taşınamadı', id);
      for (let i = 0; i < src.length; i++) {
        if (src[i].subtype !== '/Link') continue;
        const index = sourceTarget(doc, src[i].target, id);
        const targetRef = copiedPages[index].ref;
        const originalDest = src[i].target;
        const dest = out.context.obj([targetRef, ...Array.from({ length: originalDest.size() - 1 }, (_, j) =>
          out.context.lookup(originalDest.get(j + 1)))]);
        const dict = out.context.lookup(dstArray.get(i));
        dict.delete(N('Dest'));
        dict.set(N('A'), out.context.obj({ S: 'GoTo', D: dest }));
      }
    });
  }

  function wrapLines(font, value, width, size) {
      let words = str(value).split(/\s+/);
      const lines = [];
      let line = '';
      while (words.length) {
        const word = words.shift();
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
        if (line) { lines.push(line); line = ''; words.unshift(word); continue; }
        let part = '';
        for (const char of word) {
          if (font.widthOfTextAtSize(part + char, size) > width && part) { lines.push(part); part = ''; }
          part += char;
        }
        line = part;
      }
      if (line) lines.push(line);
      return lines;
  }
  function measureRows(font, entries) {
    const rows = [];
    for (const entry of entries) {
      const lines = wrapLines(font, `${entry.title || entry.id} — ${entry.date || 'Tarih belirtilmemiş'}`, 430, 11);
      const detail = [str(entry.sourceFormat).toUpperCase(), entry.relationship,
        entry.dateSource === 'parent' ? 'Tarih ana evraktan alındı' : ''].filter(Boolean).join(' · ');
      lines.push(...wrapLines(font, detail, 430, 11));
      for (const warning of entry.warnings) lines.push(...wrapLines(font, `Uyarı: ${warning}`, 430, 11));
      if (lines.length * 15 + 8 > 645)
        fail('toc-layout', `${entry.title || entry.id}: içindekiler kaydı bir sayfaya sığmıyor`, entry.id);
      rows.push({ entry, lines, height: Math.max(26, lines.length * 15 + 8) });
    }
    const pages = [[]]; let y = 700;
    for (const row of rows) {
      if (y - row.height < 55) { pages.push([]); y = 700; }
      pages.at(-1).push({ ...row, y }); y -= row.height;
    }
    return pages;
  }
  function measureReport(font, excluded) {
    if (!excluded.length) return [];
    const pages = [[]]; let y = 740;
    for (const entry of excluded) {
      const lines = wrapLines(font, `${entry.title || entry.id}: ${entry.reason || 'Neden belirtilmedi'}`, 500, 10);
      const height = lines.length * 14 + 10;
      if (height > 680) fail('report-layout', 'Eksik paket raporu kaydı bir sayfaya sığmıyor', entry.id);
      if (y - height < 55) { pages.push([]); y = 740; }
      pages.at(-1).push({ lines, y }); y -= height;
    }
    return pages;
  }
  // Vurgu yalnız çerçeve (H /O): Acrobat'ın varsayılan ters çevirmesi tıklanan satırı siyaha boyuyordu.
  function addGoTo(doc, page, rect, targetPage) {
    const annot = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, H: 'O',
      Border: [0, 0, 0], A: { S: 'GoTo', D: [targetPage.ref, 'Fit'] } });
    page.node.addAnnot(doc.context.register(annot));
  }
  async function extractedTexts(pdfjs, bytes) {
    const task = pdfjs.getDocument({ data: new Uint8Array(bytesOf(bytes)), isEvalSupported: false,
      enableScripting: false, useWasm: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
    try {
      const doc = await task.promise;
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map(it => it.str).filter(s => s && s.trim()));
        page.cleanup();
      }
      return pages;
    } finally { await task.destroy(); }
  }

  async function build({ items, orderedIds, excluded = [], fontRegular, fontBold, signal,
    limits = {}, onProgress = () => {}, pdfjs = globalThis.DurusmaPaketiPDFJS }) {
    const cap = Object.fromEntries(Object.entries(LIMITS).map(([key, value]) =>
      [key, Number.isFinite(limits[key]) && limits[key] >= 0 ? Math.min(value, limits[key]) : value]));
    if (!pdfjs?.getDocument) fail('text-audit-unavailable', 'PDF metin denetimi yerel olarak yüklenemedi');
    if (!fontRegular || !fontBold) fail('font', 'Türkçe paket fontları yüklenemedi');
    const glyphRegular = KIT.create(bytesOf(fontRegular));
    const glyphBold = KIT.create(bytesOf(fontBold));
    covered(glyphBold, 'Duruşma Paketi — İçindekiler Eksik paket — dışarıda bırakılan evraklar');
    covered(glyphRegular, 'Paket sayfası / Tarih belirtilmemiş');
    signalCheck(signal);
    if (!Array.isArray(items) || !Array.isArray(orderedIds) || !Array.isArray(excluded))
      fail('selection', 'Paket seçimi geçersiz');
    const byId = new Map(items.map(item => [item.id, item]));
    if (byId.size !== items.length || !orderedIds.length || orderedIds.length !== new Set(orderedIds).size || orderedIds.length > cap.documents)
      fail('selection', 'Paket seçimi veya evrak sayısı sınırı geçersiz');
    const ordered = orderedIds.map(id => byId.get(id));
    if (ordered.some(v => !v)) fail('selection', 'Seçilen evrak baytları eksik');
    const inputSize = ordered.reduce((n, it) => n + size(it.bytes), 0);
    if (inputSize > cap.sourceBytes) fail('source-limit', 'Kaynak boyutu sınırı aşıldı');
    if (inputSize * 4 + size(fontRegular) + size(fontBold) > cap.maxWorkingBytes)
      fail('memory-limit', 'Paket çalışma belleği tahmini sınırı aşıyor; daha küçük bir paket seçin');
    for (const it of ordered) {
      if (str(it.title).length > 2000 || str(it.date).length > 100 || str(it.relationship).length > 500)
        fail('metadata-limit', 'Evrak adı veya açıklaması çok uzun', it.id);
      covered(glyphRegular, `${it.title || it.id} — ${it.date || 'Tarih belirtilmemiş'}`, it.id);
      covered(glyphRegular, str(it.relationship), it.id);
      if (!Array.isArray(it.warnings || []) || (it.warnings || []).length > 300 ||
          (it.warnings || []).some(w => typeof w !== 'string' || w.length > 2000))
        fail('metadata-limit', 'Evrak dönüşüm uyarıları geçersiz', it.id);
      for (const warning of it.warnings || []) covered(glyphRegular, warning, it.id);
    }
    for (const ex of excluded) {
      if (str(ex.title).length > 2000 || str(ex.reason).length > 4000)
        fail('report-layout', 'Eksik paket raporu kaydı çok uzun', ex.id);
      covered(glyphRegular, `${ex.title || ex.id}: ${ex.reason || 'Neden belirtilmedi'}`, ex.id);
    }
    const docs = [], sourceTexts = [], issues = []; let inspectedPages = 0;
    for (const it of ordered) {
      signalCheck(signal);
      try {
        if (str(it.format).toLowerCase() !== 'pdf') fail('format', `${it.title || it.id}: PDF dönüştürücüsü bekleniyor`, it.id);
        let doc;
        try { doc = await PDFDocument.load(bytesOf(it.bytes), { throwOnInvalidObject: true, updateMetadata: false }); }
        catch { fail('pdf-load', `${it.title || it.id}: PDF açılamadı veya şifreli`, it.id); }
        inspectFeatures(doc, it.id);
        const pages = doc.getPages();
        inspectedPages += pages.length;
        if (inspectedPages > cap.pages) fail('page-limit', 'Kaynak sayfa sayısı sınırı aşıldı', it.id);
        for (const page of pages) annotations(doc, page, it.id);
        const texts = await extractedTexts(pdfjs, it.bytes);
        if (texts.length !== pages.length) fail('pdf-text', 'PDF metin denetimi sayfa sayısı uyuşmuyor', it.id);
        docs.push({ item: it, doc, pages }); sourceTexts.push(texts);
        onProgress({ phase: 'inspect', itemId: it.id,
          message: `${docs.length}/${ordered.length} evrak kontrol edildi · ${it.title || 'Evrak'}` });
      } catch (error) {
        if (error?.code === 'cancelled') throw error;
        issues.push({ id: it.id, code: error?.code || 'pdf-structure',
          message: error?.code ? error.message : `${it.title || it.id}: PDF yapısı çözülemedi` });
      }
    }
    if (issues.length) {
      const error = new PackageError('preflight', `${issues.length} evrak hazırlanamadı`);
      error.issues = issues; throw error;
    }
    const sourceCount = docs.reduce((n, d) => n + d.pages.length, 0);
    if (!sourceCount || sourceCount > cap.pages) fail('page-limit', 'Paket sayfa sınırı aşıldı');
    const out = await PDFDocument.create(); out.registerFontkit(KIT);
    const regular = await out.embedFont(bytesOf(fontRegular), { subset: true });
    const bold = await out.embedFont(bytesOf(fontBold), { subset: true });
    let entries = await Promise.all(docs.map(async d => ({ id: d.item.id, title: d.item.title,
      date: d.item.date || null, dateSource: d.item.dateSource || null,
      relationship: d.item.relationship || null,
      sourceFormat: d.item.sourceFormat || d.item.format,
      sha256: d.item.originalSha256 || await sha256(d.item.bytes),
      warnings: d.item.warnings || [], sourcePages: d.item.sourcePages || d.pages.length,
      pageCount: d.pages.length, startPage: 0, endPage: 0 })));
    const tocLayout = measureRows(regular, entries);
    const reportLayout = measureReport(regular, excluded);
    const reportCount = reportLayout.length;
    let nextPage = tocLayout.length + reportCount + 1;
    entries = entries.map(e => ({ ...e, startPage: nextPage, endPage: (nextPage += e.pageCount) - 1 }));
    const tocPages = tocLayout.map(() => out.addPage(PAGE));
    const reportPages = Array.from({ length: reportCount }, () => out.addPage(PAGE));
    const copied = [];
    for (const d of docs) {
      signalCheck(signal);
      const pages = await out.copyPages(d.doc, d.pages.map((_, i) => i));
      for (const page of pages) out.addPage(page);
      relink(d.doc, out, d.pages, pages, d.item.id);
      pages.forEach(page => {
        const crop = effectiveCrop(page, d.item.id), angle = rotation(page, d.item.id), unit = pageUnit(out, page, d.item.id);
        clampAnnotations(out, page, crop, d.item.id);
        clipOriginal(page, crop);
        extendBox(page, crop, angle, unit);
        copied.push({ page, crop, angle, unit, id: d.item.id });
      });
      onProgress({ phase: 'copy', itemId: d.item.id,
        message: `Sayfalar birleştiriliyor · ${d.item.title || 'Evrak'}` });
    }
    const total = out.getPageCount();
    if (total > cap.pages) fail('page-limit', 'İçindekiler dahil sayfa sınırı aşıldı');
    tocLayout.forEach((rows, pi) => {
      const pg = tocPages[pi];
      pg.drawText(`Duruşma Paketi — İçindekiler ${pi + 1}`, { x: 44, y: 790, size: 19, font: bold });
      pg.drawText('Okuma kopyasıdır. Özgün evrak ve elektronik imza doğrulamasının yerine geçmez.',
        { x: 44, y: 765, size: 10, font: regular });
      pg.drawText('Paket numaraları bu PDF içindir; kaynak evrakın sayfa numaraları farklı olabilir.',
        { x: 44, y: 750, size: 10, font: regular });
      rows.forEach(row => {
        const entry = entries.find(e => e.id === row.entry.id);
        row.lines.forEach((line, li) => pg.drawText(line, { x: 48, y: row.y - li * 15, size: 11, font: regular }));
        pg.drawText(`${entry.startPage}–${entry.endPage}`, { x: 485, y: row.y, size: 11, font: regular });
        // Bağlantı alanı yalnız bu kaydın satırlarını kaplar (ilk satırın üstünden son satırın altına); bir sonraki
        // kaydın yazısının üstüne binmez.
        addGoTo(out, pg, [44, row.y - (row.lines.length - 1) * 15 - 4, 550, row.y + 11], out.getPage(entry.startPage - 1));
      });
    });
    out.setTitle('Duruşma Paketi' + (excluded.length ? ' — Eksik paket' : ''));
    out.setCreator('Legaluga UYAP Asistanı');
    out.setSubject(JSON.stringify({ schema: 'legaluga-hearing-package/1', pageCount: total,
      incomplete: excluded.length > 0, entries, excluded }));
    reportPages.forEach((pg, pi) => {
      pg.drawText('Eksik paket — dışarıda bırakılan evraklar', { x: 44, y: 790, size: 17, font: bold });
      reportLayout[pi].forEach(row => row.lines.forEach((line, i) =>
        pg.drawText(line, { x: 46, y: row.y - i * 14, size: 10, font: regular })));
    });
    out.getPages().forEach((page, i) => {
      const source = copied[i - tocPages.length - reportPages.length];
      const crop = source?.crop || page.getCropBox();
      const angle = source?.angle || 0, unit = source?.unit || 1;
      if (!source) { clipOriginal(page, crop); extendBox(page, crop, 0, 1); }
      footer(page, regular, i + 1, total, crop, angle, unit, source?.id);
    });
    signalCheck(signal);
    const output = await out.save();
    if (output.byteLength > cap.outputBytes) fail('output-limit', 'Paket dosyası boyut sınırı aşıldı');
    const text = await extractedTexts(pdfjs, output);
    let index = tocPages.length + reportPages.length;
    for (let di = 0; di < docs.length; di++) {
      for (let pi = 0; pi < docs[di].pages.length; pi++, index++) {
        const actual = [...text[index]];
        const footerIndex = actual.lastIndexOf(`Paket sayfası ${index + 1} / ${total}`);
        if (footerIndex < 0) fail('footer-text', 'Paket sayfa numarası metin katmanında yok', docs[di].item.id);
        actual.splice(footerIndex, 1);
        const expected = sourceTexts[di][pi];
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          fail('crop-text-exposure', `${docs[di].item.title || docs[di].item.id}: kaynak metin görünümü değişti`, docs[di].item.id);
      }
    }
    return { bytes: output, pageCount: total, entries, incomplete: excluded.length > 0 };
  }
  globalThis.DurusmaPaketiPDF = Object.freeze({ build, PackageError });
})();
