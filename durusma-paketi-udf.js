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
  const fontKey = s => s.kalin ? (s.italik ? 'boldItalic' : 'bold') : (s.italik ? 'italic' : 'regular');
  const validColor = c => c == null || (Array.isArray(c) && c.length === 3 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 255));
  function unsupportedWhitespace(value) {
    for (const ch of value) if ((ch !== ' ' && ch !== '\n' && /\p{White_Space}/u.test(ch)) ||
      ch === '\u200b' || ch === '\u2060' || ch === '\ufeff') return true;
    return false;
  }
  const styleOf = (piece, block, model) => ({ ...(model.taban || {}), ...(block.stil || {}), ...(piece?.stil || {}) });
  function validateStyle(s) {
    if (!Number.isFinite(s.punto) || s.punto < 4 || s.punto > 96 ||
      !['times new roman', 'liberation serif', 'serif'].includes(String(s.aile || 'Times New Roman').toLowerCase()) ||
      !validColor(s.renk) || s.zemin) reject('udf-profile', 'UDF yazı tipi, zemin rengi veya stili doğrulanmadı');
  }
  function validate(model, diagnostics) {
    if (!model || diagnostics?.complete !== true || model.paketTani?.complete === false ||
      model.kesildi || model.sayac?.resimReddi || model.sayac?.ofsetSorunu || model.sayac?.bilinmeyen)
      reject('udf-incomplete', 'UDF öğeleri veya içeriği eksik çözüldü');
    if (model.sablon || model.ust || model.alt || model.filigran || model.imza)
      reject('udf-profile', 'UDF şablon, üst/alt bilgi, filigran veya imza içeriyor');
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
          b.liste || b.duraklar?.length || ![b.sol, b.sag, b.ilk, b.once, b.sonra, b.aralik].every(v => Number.isFinite(v || 0)) ||
          (b.aralik || 0) < 0 || (b.aralik || 0) > 3 || (b.sol || 0) < 0 || (b.sag || 0) < 0 ||
          (b.once || 0) < 0 || (b.sonra || 0) < 0)
          reject('udf-profile', 'UDF paragraf düzeni doğrulanmadı');
        const width = p.en - p.sol - p.sag - (b.sol || 0) - (b.sag || 0);
        if (width < 24 || width - (b.ilk || 0) < 24) reject('udf-indent', 'UDF girintisi metin alanını kapatıyor');
        validateStyle(styleOf(null, b, model));
        for (const piece of b.parcalar) {
          if (piece.t !== 'metin' || typeof piece.yazi !== 'string' || unsupportedWhitespace(piece.yazi))
            reject('udf-profile', 'UDF paragrafında doğrulanmamış öğe var');
          validateStyle(styleOf(piece, b, model));
        }
      }
    }
  }
  const color = c => c ? PDF.rgb(c[0] / 255, c[1] / 255, c[2] / 255) : PDF.rgb(0, 0, 0);
  // Shared text geometry for wrapping, drawing and future table/header cell measurement.
  // Images/tables/headers remain unsupported until Editor reference checks exist.
  function lineMetrics(parts, faces, spacing = 0, explicitSpacing = false) {
    let ascent = 0, descent = 0, maxSize = 0, width = 0;
    for (const part of parts) {
      const face = faces[part.face], scale = part.style.punto / face.glyph.unitsPerEm;
      ascent = Math.max(ascent, face.glyph.ascent * scale);
      descent = Math.max(descent, -face.glyph.descent * scale);
      maxSize = Math.max(maxSize, part.style.punto);
      width += face.pdf.widthOfTextAtSize(part.text, part.style.punto);
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
      for (const ch of piece.yazi) {
        if (ch === '\n') { group = null; out.push({ newline: true }); continue; }
        const space = ch === ' ';
        if (!group || group.space !== space) { group = { space, runs: [] }; out.push(group); }
        const previous = group.runs.at(-1);
        if (previous?.style === style) previous.text += ch;
        else group.runs.push({ text: ch, style, face });
      }
      // The same word may cross a style span; keep the lexical group intact.
    }
    return out;
  }
  // esnek: HTML/XML/düz metinden kurulan model (durusma-paketi-metin.js). Fontta olmayan karakter "?" yazılır ve
  // satıra sığmayan sözcük harf harf bölünür; UDF'de ikisi de açık hatadır. uyarilar içindekilere yazılır.
  async function convert({ model, diagnostics, signal, limits = {}, fonts, esnek = false, uyarilar = null }) {
    validate(model, diagnostics); check(signal);
    const used = new Set();
    for (const section of model.bolumler) for (const block of section) {
      used.add(fontKey(styleOf(null, block, model)));
      for (const piece of block.parcalar) used.add(fontKey(styleOf(piece, block, model)));
    }
    for (const key of used) if (!fonts?.[key]) reject('udf-font', `UDF fontu eksik: ${key}`);
    const pdf = await PDF.PDFDocument.create(); pdf.registerFontkit(KIT);
    const faces = {};
    for (const key of used) faces[key] = { pdf: await pdf.embedFont(raw(fonts[key]), { subset: true }), glyph: KIT.create(raw(fonts[key])) };
    let yerine = 0;
    if (esnek) for (const section of model.bolumler) for (const block of section) for (const piece of block.parcalar) {
      const glyph = faces[fontKey(styleOf(piece, block, model))].glyph;
      piece.yazi = Array.from(piece.yazi, ch => (ch === '\n' || glyph.hasGlyphForCodePoint(ch.codePointAt(0)) ? ch : (yerine++, '?'))).join('');
    }
    const p = model.sayfa, top = p.boy - p.ust, bottom = p.alt;
    const maxPages = Math.min(limits.pages || 300, 300);
    let page, y;
    function newPage() {
      if (pdf.getPageCount() >= maxPages) reject('udf-page-limit', 'UDF sayfa sınırı aşıldı');
      page = pdf.addPage([p.en, p.boy]); y = top;
    }
    function drawLine(line, block, first, last, explicit) {
      const hasSpacing = block.aralikVar === true || (block.aralik || 0) > 0;
      const m = lineMetrics(line, faces, block.aralik || 0, hasSpacing);
      if (!line.length) {
        const s = styleOf(null, block, model), glyph = faces[fontKey(s)].glyph;
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
      const spaces = !last && !explicit && block.hiza === 'justify'
        ? line.reduce((n, part) => n + (part.text.match(/ /gu) || []).length, 0) : 0;
      const extra = spaces ? (available - m.width) / spaces : 0;
      const baseline = y - m.ascent;
      for (const part of line) {
        const face = faces[part.face].pdf, s = part.style;
        // Draw one segment per word/space so justified spacing is in the same measured coordinate system.
        for (const token of part.text.match(/[^ ]+| +/gu) || []) {
          if (!/^ +$/u.test(token)) page.drawText(token, { x, y: baseline, size: s.punto, font: face, color: color(s.renk) });
          x += face.widthOfTextAtSize(token, s.punto) + extra * (token.match(/ /gu) || []).length;
        }
        const width = face.widthOfTextAtSize(part.text, s.punto) + extra * (part.text.match(/ /gu) || []).length;
        const end = x;
        if (s.alti) page.drawLine({ start: { x: end - width, y: baseline - s.punto * 0.12 },
          end: { x: end, y: baseline - s.punto * 0.12 }, thickness: Math.max(0.5, s.punto / 16), color: color(s.renk) });
        if (s.ustu) page.drawLine({ start: { x: end - width, y: baseline + s.punto * 0.3 },
          end: { x: end, y: baseline + s.punto * 0.3 }, thickness: Math.max(0.5, s.punto / 16), color: color(s.renk) });
      }
      y -= m.height;
    }
    for (const section of model.bolumler) {
      check(signal); newPage();
      for (const block of section) {
        check(signal); y -= block.once || 0;
        let line = [], lineWidth = 0, first = true;
        const widthLimit = () => p.en - p.sol - p.sag - (block.sol || 0) - (block.sag || 0) - (first ? (block.ilk || 0) : 0);
        const flush = (last, explicit = false) => { drawLine(line, block, first, last, explicit); line = []; lineWidth = 0; first = false; };
        for (const token of tokenGroups(block, model)) {
          if (token.newline) { flush(false, true); continue; }
          let width = 0;
          for (const run of token.runs) {
            for (const ch of run.text) if (!faces[run.face].glyph.hasGlyphForCodePoint(ch.codePointAt(0)))
              reject('udf-glyph', `UDF karakteri fontta yok: U+${ch.codePointAt(0).toString(16)}`);
            width += faces[run.face].pdf.widthOfTextAtSize(run.text, run.style.punto);
          }
          if (lineWidth + width > widthLimit() && line.length) flush(false);
          if (width > widthLimit() && esnek) {
            // Sığmayan uzun sözcük (adres, kimlik, bitişik değer) harf harf bölünür.
            for (const run of token.runs) for (const ch of run.text) {
              const w = faces[run.face].pdf.widthOfTextAtSize(ch, run.style.punto);
              if (lineWidth + w > widthLimit() && line.length) flush(false);
              const previous = line.at(-1);
              if (previous?.style === run.style) previous.text += ch; else line.push({ text: ch, style: run.style, face: run.face });
              lineWidth += w;
            }
            continue;
          }
          if (width > widthLimit()) reject('udf-line', 'UDF sözcüğü metin alanına sığmıyor');
          if (!line.length && token.space) continue;
          line.push(...token.runs); lineWidth += width;
        }
        if (line.length || !block.parcalar.length) flush(true);
        y -= block.sonra || 0;
      }
    }
    check(signal);
    const bytes = await pdf.save();
    const warnings = esnek ? [...(uyarilar || []), yerine ? `${yerine} karakter yazı tipinde bulunmadığı için “?” olarak yazıldı` : null].filter(Boolean)
      : ['UDF sayfalaması UYAP Editör referans PDF ile henüz karşılaştırılmadı'];
    return { bytes, diagnostics: { complete: true, referenceVerified: false, warnings },
      sourcePages: pdf.getPageCount(), warnings };
  }
  globalThis.DurusmaPaketiUDF = Object.freeze({ convert, UdfExportError, lineMetrics });
})();
