// Taranmış evrak OCR'ı. Yalnız uzantı paketindeki Tesseract ve Türkçe traineddata kullanılır.
// Uzak model, blob işçi ve IndexedDB önbelleği kapalıdır. Görüntü ve metin bu işçiden dışarı URL olarak çıkmaz.
(() => {
  'use strict';
  const SAYFA = 12;
  const KENAR = 1800;
  const SAYFA_METIN = 200000;
  const METIN = 2 * 1024 * 1024;
  const PDF_OKUMA = Object.freeze({
    isEvalSupported: false, enableScripting: false, useWasm: false, disableFontFace: true, useSystemFonts: false,
    useWorkerFetch: false, disableAutoFetch: true, cMapUrl: null, standardFontDataUrl: null, wasmUrl: null,
    isOffscreenCanvasSupported: true, isImageDecoderSupported: false, verbosity: 0
  });
  let iptal = false;
  let calisiyor = false;

  function metinTemiz(s) {
    let out = '';
    for (const ch of String(s || '')) {
      const c = ch.charCodeAt(0);
      if (c === 9 || c === 10 || c === 13 || (c > 31 && c !== 127)) out += ch;
      if (out.length >= SAYFA_METIN) break;
    }
    return out.slice(0, SAYFA_METIN);
  }
  function sinir(n) {
    return Number.isSafeInteger(n) && n > 0 && n <= SAYFA ? n : SAYFA;
  }
  function yerel(ad) {
    const url = chrome.runtime.getURL(ad);
    if (!url.startsWith('chrome-extension://')) throw new Error('yerel');
    return url;
  }
  async function pngOlcek(bitmap) {
    const uzun = Math.max(bitmap.width, bitmap.height) || 1;
    const oran = Math.min(1, KENAR / uzun);
    const w = Math.max(1, Math.round(bitmap.width * oran));
    const h = Math.max(1, Math.round(bitmap.height * oran));
    const tuval = new OffscreenCanvas(w, h);
    tuval.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return tuval.convertToBlob({ type: 'image/png' });
  }

  async function pdfKaynak(bytes, son) {
    importScripts('vendor/pdfjs-reader.js');
    const pdfjs = globalThis.DurusmaPaketiPDFJS;
    if (!pdfjs?.getDocument) throw new Error('motor');
    const b = new Uint8Array(bytes);
    if (b.byteLength < 5 || b[0] !== 0x25 || b[1] !== 0x50 || b[2] !== 0x44 || b[3] !== 0x46) return { code: 'ocr-invalid' };
    const task = pdfjs.getDocument({ data: b.slice(), ...PDF_OKUMA });
    let doc;
    try { doc = await task.promise; }
    catch {
      try { await task.destroy(); } catch { /* belge bırakıldı */ }
      return { code: 'ocr-motor' };
    }
    const toplamSayfa = doc.numPages;
    if (!Number.isSafeInteger(toplamSayfa) || toplamSayfa < 1) {
      try { await task.destroy(); } catch { /* belge bırakıldı */ }
      return { code: 'ocr-motor' };
    }
    const adet = Math.min(toplamSayfa, son);
    return {
      adet, toplamSayfa, sayfaKesildi: toplamSayfa > adet,
      async png(no) {
        const page = await doc.getPage(no);
        try {
          const temel = page.getViewport({ scale: 1 });
          const uzun = Math.max(temel.width, temel.height) || 1;
          const viewport = page.getViewport({ scale: Math.min(2, KENAR / uzun) });
          const tuval = new OffscreenCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
          await page.render({ canvasContext: tuval.getContext('2d', { alpha: false }), viewport, canvas: tuval }).promise;
          return tuval.convertToBlob({ type: 'image/png' });
        } finally { try { page.cleanup(); } catch { /* sayfa bırakıldı */ } }
      },
      async kapat() { try { await task.destroy(); } catch { /* belge bırakıldı */ } }
    };
  }

  async function tiffKaynak(bytes, son) {
    globalThis.UHD = globalThis.UHD || {};
    if (!('window' in globalThis)) globalThis.window = undefined;
    importScripts('vendor/UTIF.js', 'tiff.js');
    const tiff = globalThis.UHD.tiff;
    if (!tiff?.ac || !tiff?.sayfaBitmap) throw new Error('motor');
    let belge;
    try { belge = await tiff.ac(new Blob([bytes], { type: 'image/tiff' }), {}); }
    catch { return { code: 'ocr-sayfa' }; }
    const toplamSayfa = belge?.sayfalar?.length || 0;
    if (!toplamSayfa) return { code: 'ocr-sayfa' };
    const adet = Math.min(toplamSayfa, son);
    return {
      adet, toplamSayfa, sayfaKesildi: toplamSayfa > adet,
      async png(no) {
        const s = belge.sayfalar[no - 1];
        const uzun = Math.max(s.g, s.y) || 1;
        const bitmap = await tiff.sayfaBitmap(belge, s, Math.max(1, Math.round(KENAR * s.g / uzun)));
        return pngOlcek(bitmap);
      },
      async kapat() { return undefined; }
    };
  }

  async function resimKaynak(bytes) {
    let bitmap;
    try { bitmap = await createImageBitmap(new Blob([bytes])); }
    catch { return { code: 'ocr-sayfa' }; }
    return {
      adet: 1, toplamSayfa: 1, sayfaKesildi: false,
      async png() { return pngOlcek(bitmap); },
      async kapat() { bitmap.close?.(); }
    };
  }

  async function taniciAc() {
    globalThis.window = { location: { href: self.location.href } };
    importScripts('vendor/tesseract/tesseract.min.js');
    const Tesseract = globalThis.Tesseract;
    const kok = yerel('vendor/tesseract/');
    const workerPath = kok + 'worker.min.js';
    const corePath = kok + 'tesseract-core-simd-lstm.wasm.js';
    const langPath = kok.replace(/\/$/, '');
    if (!Tesseract?.createWorker || !workerPath.startsWith('chrome-extension://')
      || !corePath.endsWith('tesseract-core-simd-lstm.wasm.js') || !langPath.startsWith('chrome-extension://')) throw new Error('motor');
    const tanici = await Tesseract.createWorker('tur', 1, {
      workerPath, corePath, langPath, workerBlobURL: false, cacheMethod: 'none', gzip: true, logger() { return undefined; }
    });
    await tanici.setParameters({ tessedit_pageseg_mode: '6' });
    return tanici;
  }

  async function calistir(data) {
    const runId = data.runId;
    const tur = data.tur;
    const bytes = data.bytes;
    const son = sinir(data.sayfaSiniri);
    const sayfalar = [];
    let toplamSayfa = 0, sayfaKesildi = false, kesildi = false, code = '', tanici = null, kaynak = null, karakter = 0, hatali = 0;
    try {
      if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > 64 * 1024 * 1024 || !['pdf', 'tiff', 'image'].includes(tur)) {
        code = 'ocr-invalid'; return;
      }
      kaynak = tur === 'pdf' ? await pdfKaynak(bytes, son) : tur === 'tiff' ? await tiffKaynak(bytes, son) : await resimKaynak(bytes);
      if (kaynak.code) { code = kaynak.code; return; }
      toplamSayfa = kaynak.toplamSayfa;
      sayfaKesildi = kaynak.sayfaKesildi === true;
      if (sayfaKesildi) kesildi = true;
      if (iptal) { code = 'ocr-stopped'; return; }
      tanici = await taniciAc();
      for (let no = 1; no <= kaynak.adet; no++) {
        if (iptal) { code = 'ocr-stopped'; return; }
        if (karakter >= METIN) { kesildi = true; break; }
        postMessage({ type: 'OCR_PROGRESS', runId, sayfa: no, toplam: kaynak.adet });
        let png = null;
        try { png = await kaynak.png(no); } catch { hatali++; continue; }
        if (iptal) { code = 'ocr-stopped'; return; }
        try {
          const sonuc = await tanici.recognize(png);
          const metin = metinTemiz(sonuc?.data?.text);
          if (!metin.trim()) continue;
          const parca = karakter + metin.length > METIN ? metin.slice(0, METIN - karakter) : metin;
          if (parca.length < metin.length) kesildi = true;
          sayfalar.push({ no, metin: parca });
          karakter += parca.length + 1;
        } catch { hatali++; }
      }
      if (!sayfalar.length && hatali && hatali >= kaynak.adet) code = 'ocr-sayfa';
    } catch { if (!code) code = 'ocr-motor'; }
    finally {
      try { await tanici?.terminate(); } catch { /* tanıma bitti */ }
      try { await kaynak?.kapat(); } catch { /* belge bırakıldı */ }
      const durdu = code === 'ocr-stopped';
      postMessage({
        type: 'OCR_READY', runId, sayfalar: durdu ? [] : sayfalar, toplamSayfa, kesildi: durdu ? false : kesildi,
        ...(sayfaKesildi && !durdu ? { sayfaKesildi: true } : {}), ...(code ? { code } : {})
      });
    }
  }

  self.onmessage = ({ data }) => {
    if (!data || typeof data.runId !== 'string') return;
    if (data.type === 'CANCEL') { iptal = true; return; }
    if (data.type !== 'OCR' || calisiyor) return;
    calisiyor = true;
    void calistir(data);
  };
})();
