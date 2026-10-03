/* global module, importScripts */
// Tam TIFF zincirini yerel worker'da, kaynak çözünürlüğü düşürmeden PDF'e dönüştürür. Sayfa tuvale çizilip PNG'ye
// çevrilmez: tek şeritli CCITT G4 sayfanın özgün faks akışı çözülmeden (/CCITTFaxDecode, kayıpsız), öteki siyah-beyaz
// sayfalar çözülüp 1 bitlik, gri ve renkli sayfalar 8 bitlik Flate görüntüsü olarak gömülür. Yön, PDF dönüşüm
// matrisiyle uygulanır.
(() => {
  const MiB = 1024 * 1024;
  const DEFAULT_DPI = 200;
  const OUTPUT_CAP = 128 * MiB;
  function fail(message, code = 'tiff-incomplete') {
    const error = new Error(message); error.code = code; throw error;
  }
  function physicalSize(page) {
    const valid = n => Number.isFinite(n) && n >= 20 && n <= 10000;
    let dx = page.rawDx, dy = page.rawDy;
    const warnings = [];
    if (page.birim === 3) { dx *= 2.54; dy *= 2.54; }
    if (page.birim === 1 || !valid(dx) || !valid(dy)) {
      dx = dy = DEFAULT_DPI;
      warnings.push('DPI eksik veya geçersiz; 200 DPI varsayıldı.');
    }
    const rotated = page.yon >= 5;
    const width = (rotated ? page.y / dy : page.g / dx) * 72;
    const height = (rotated ? page.g / dx : page.y / dy) * 72;
    if (!(width > 0 && height > 0 && width <= 14400 && height <= 14400))
      fail('TIFF fiziksel sayfa ölçüsü PDF sınırını aşıyor.', 'tiff-size');
    return { width, height, warnings, dpiX: dx, dpiY: dy };
  }
  function verifyDocument(document, limits = {}) {
    const maxPages = Math.min(300, Number.isInteger(limits.maxPages) ? limits.maxPages : 300);
    if (!document?.complete || document.kesik || document.dongu || document.limitReached ||
        document.toplam !== document.sayfalar?.length || !document.toplam)
      fail('TIFF IFD zinciri eksik, döngülü veya sayfa sınırında kesildi.');
    if (document.toplam > maxPages) fail(`TIFF ${maxPages} sayfa sınırını aşıyor.`, 'tiff-limit');
    for (const page of document.sayfalar) {
      if (page.sorun || page.truncatedStrip || !Number.isInteger(page.rawYon) || page.rawYon < 1 || page.rawYon > 8)
        fail('TIFF sayfalarından biri bozuk veya desteklenmiyor.');
      physicalSize(page);
    }
    return true;
  }
  // FillOrder=2: baytın en düşük biti önce gelir; PDF CCITT çözücüsü en yüksek biti önce okur.
  const REVERSED = new Uint8Array(256).map((_, b) => {
    let r = 0;
    for (let i = 0; i < 8; i++) r |= ((b >> i) & 1) << (7 - i);
    return r;
  });
  async function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  // Özgün faks akışı yalnız tek şeritli, döşemesiz G4 sayfada tam görüntüdür: her şerit kendi başvuru satırıyla
  // başladığı için çok şeritli sayfanın akışları art arda eklenemez; o sayfalar çözülür.
  const faxStream = page => page.c === 4 && page.birBit && !page.dosemeli && page.ofs.length === 1;
  // Sayfa başına çalışma belleği: çözülmüş örnekler, gri/renkli sayfada RGBA ve PDF'e yazılacak kopya.
  function workingBytes(page) {
    if (faxStream(page)) return page.say[0] * 2;
    const raw = page.y * Math.ceil(page.g * page.bps * page.spp / 8);
    const pixels = page.g * page.y;
    return page.birBit ? raw * 3 : raw * 2 + pixels * 4 + pixels * 3 * 2;
  }
  async function pageImage(tiff, document, page, index, signal) {
    if (faxStream(page)) {
      const strip = document.u8.subarray(page.ofs[0], page.ofs[0] + page.say[0]);
      const data = page.tanim().t266?.[0] === 2 ? strip.map(b => REVERSED[b]) : strip.slice();
      // TIFF'te beyaz koşu 0 bitidir; Photometric 1'de (siyah sıfır) bu bit siyah gösterilir.
      return { data, dict: { BitsPerComponent: 1, ColorSpace: 'DeviceGray', Filter: 'CCITTFaxDecode',
        DecodeParms: { K: -1, Columns: page.g, Rows: page.y, BlackIs1: page.p === 1 } } };
    }
    const img = await tiff.sayfaCoz(document, page, signal);
    if (page.birBit) {
      const size = Math.ceil(page.g / 8) * page.y;
      if (img.data.length < size) fail(`TIFF ${index + 1}. sayfa eksik çözüldü.`);
      const data = await deflate(img.data.subarray(0, size));
      img.data = null;
      // Photometric 0'da 0 biti beyazdır; PDF DeviceGray'de 0 siyah olduğundan değerler ters eşlenir.
      return { data, dict: { BitsPerComponent: 1, ColorSpace: 'DeviceGray', Filter: 'FlateDecode',
        ...(page.p === 0 ? { Decode: [1, 0] } : {}) } };
    }
    const rgba = tiff.rgba8(page, img);
    const pixels = page.g * page.y;
    let gray = true;
    for (let q = 0; q < rgba.length; q += 4) {
      const a = rgba[q + 3];
      if (a !== 255) {   // Saydam örnek, eski tuval çizimindeki gibi beyaz zemine karıştırılır.
        const k = 255 * (255 - a);
        rgba[q] = (rgba[q] * a + k) / 255; rgba[q + 1] = (rgba[q + 1] * a + k) / 255; rgba[q + 2] = (rgba[q + 2] * a + k) / 255;
      }
      if (gray && (rgba[q] !== rgba[q + 1] || rgba[q] !== rgba[q + 2])) gray = false;
    }
    const samples = new Uint8Array(gray ? pixels : pixels * 3);
    if (gray) for (let i = 0; i < pixels; i++) samples[i] = rgba[i * 4];
    else for (let i = 0, o = 0; i < pixels; i++) {
      const q = i * 4;
      samples[o++] = rgba[q]; samples[o++] = rgba[q + 1]; samples[o++] = rgba[q + 2];
    }
    return { data: await deflate(samples), dict: { BitsPerComponent: 8, ColorSpace: gray ? 'DeviceGray' : 'DeviceRGB',
      Filter: 'FlateDecode' } };
  }
  // Görüntünün sayfaya yerleşimi: görüntüleyicinin tuval yön matrisi (yonDonusumu) PDF birim karesine taşınır.
  // PDF görüntüyü birim kareye ilk satırı üstte olacak biçimde koyar; sayfa ekseni aşağıdan yukarıdır.
  function placement(tiff, page, physical) {
    let m = [1, 0, 0, 1, 0, 0];
    tiff.yonDonusumu({ transform: (...v) => { m = v; } }, page.yon, page.g, page.y);
    const [a, b, c, d, e, f] = m;
    const rotated = page.yon >= 5;
    const sx = physical.width / (rotated ? page.y : page.g), sy = physical.height / (rotated ? page.g : page.y);
    return [sx * a * page.g, -sy * b * page.g, -sx * c * page.y, sy * d * page.y,
      sx * (c * page.y + e), physical.height - sy * (d * page.y + f)];
  }
  async function convert({ bytes, signal, limits = {}, onPage }) {
    if (!(bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes))) fail('TIFF baytları geçersiz.', 'tiff-input');
    const source = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (!source.byteLength || source.byteLength > 64 * MiB) fail('TIFF kaynak boyutu sınırı aşıldı.', 'tiff-limit');
    if (signal?.aborted) throw new DOMException('Durduruldu.', 'AbortError');
    if (!globalThis.UHD?.tiff) {
      globalThis.UHD = globalThis.UHD || {};
      importScripts('vendor/UTIF.js', 'tiff.js');
    }
    // UTIF'in CMYK dönüşümü tanımsız `window` değişkenine başvurur; worker'da bu ReferenceError olur.
    if (!('window' in globalThis)) globalThis.window = undefined;
    const tiff = globalThis.UHD.tiff;
    const document = await tiff.ac(new Blob([source], { type: 'image/tiff' }), { signal });
    verifyDocument(document, limits);
    const PDF = globalThis.PDFLib;
    if (!PDF?.PDFDocument || typeof CompressionStream !== 'function' || typeof tiff.sayfaCoz !== 'function')
      fail('Yerel TIFF/PDF dönüştürücüsü kullanılamıyor.', 'tiff-runtime');
    const pdf = await PDF.PDFDocument.create();
    const warnings = [];
    let output = 0;
    const memoryCap = Math.min(256 * MiB, Number.isFinite(limits.maxWorkingBytes) ? limits.maxWorkingBytes : 256 * MiB);
    for (let index = 0; index < document.sayfalar.length; index++) {
      if (signal?.aborted) throw new DOMException('Durduruldu.', 'AbortError');
      const page = document.sayfalar[index];
      const physical = physicalSize(page);
      warnings.push(...physical.warnings.map(w => `Sayfa ${index + 1}: ${w}`));
      if (source.byteLength + output + workingBytes(page) > memoryCap)
        fail(`TIFF ${index + 1}. sayfa çalışma belleği sınırını aşıyor; paketi bölün.`, 'tiff-memory');
      try {
        const image = await pageImage(tiff, document, page, index, signal);
        output += image.data.byteLength;
        if (output > OUTPUT_CAP || source.byteLength + output > memoryCap)
          fail('TIFF görüntüleri çıktı/bellek sınırını aşıyor; paketi bölün.', 'tiff-memory');
        const ref = pdf.context.register(pdf.context.stream(image.data,
          { Type: 'XObject', Subtype: 'Image', Width: page.g, Height: page.y, ...image.dict }));
        const target = pdf.addPage([physical.width, physical.height]);
        const name = target.node.newXObject('Image', ref);
        target.pushOperators(PDF.pushGraphicsState(), PDF.concatTransformationMatrix(...placement(tiff, page, physical)),
          PDF.drawObject(name), PDF.popGraphicsState());
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        if (error?.code) throw error;
        fail(`TIFF ${index + 1}. sayfa dönüştürülemedi: ${error?.message || 'Bilinmeyen hata'}`);
      }
      if (typeof onPage === 'function') onPage(index + 1, document.sayfalar.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (signal?.aborted) throw new DOMException('Durduruldu.', 'AbortError');
    const result = await pdf.save({ useObjectStreams: false });
    if (result.byteLength > OUTPUT_CAP) fail('TIFF PDF çıktı boyutu sınırını aşıyor.', 'tiff-limit');
    return { bytes: result, diagnostics: { complete: true, warnings }, sourcePages: document.toplam, warnings };
  }
  const api = { convert, physicalSize, verifyDocument };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.DurusmaPaketiTIFF = api;
})();
