const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Taranmış evrak OCR işçisi ve uzantı CSP'si için gerileme testleri.
const KOK = path.join(__dirname, '../src');
const ISCI = fs.readFileSync(path.join(KOK, 'extension/atif-ocr-worker.js'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(KOK, 'extension/manifest.json'), 'utf8'));
const HTML_PARCA = fs.readFileSync(path.join(KOK, 'fragments/content/037-overview-safahat-notes-and-safe-document-rendering.js.part'), 'utf8');
const UZANTI = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/';

// Ayrılmış (dedicated) Worker benzeri bağlam: `chrome` nesnesi ve `window` yoktur.
function isciBaglami({ konum = UZANTI + 'atif-ocr-worker.js' } = {}) {
  const kayit = { importlar: [], secenekler: null, tanimaPencere: [], cizimPencere: [], mesajlar: [], tesseractYuklendi: false };
  let hazir;
  const bitti = new Promise(resolve => { hazir = resolve; });
  const tanici = {
    async setParameters() { return undefined; },
    async recognize() {
      kayit.tanimaPencere.push(typeof ctx.window);
      return { data: { text: 'Yargıtay 9. HD 2020/1234 E., 2021/5678 K.' } };
    },
    async terminate() { return undefined; }
  };
  const pdfjs = {
    getDocument() {
      const sayfa = {
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 100 * scale }),
        // pdf.js gibi: `window` tanımlıysa çizim adımını window.requestAnimationFrame ile planlar.
        render() {
          kayit.cizimPencere.push(typeof ctx.window);
          if (typeof ctx.window !== 'undefined') return { promise: new Promise(r => ctx.window.requestAnimationFrame(r)) };
          return { promise: Promise.resolve() };
        },
        cleanup() { return undefined; }
      };
      return { promise: Promise.resolve({ numPages: 1, getPage: async () => sayfa }), async destroy() { return undefined; } };
    }
  };
  class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return { drawImage() { return undefined; } }; }
    async convertToBlob() { return new Blob(['png'], { type: 'image/png' }); }
  }
  const ctx = vm.createContext({
    Blob, URL, Uint8Array, ArrayBuffer, Promise, Object, Number, Math, String, Error, setTimeout, clearTimeout,
    OffscreenCanvas,
    createImageBitmap: async () => ({ width: 40, height: 20, close() { return undefined; } }),
    importScripts(...adlar) {
      kayit.importlar.push(...adlar);
      for (const ad of adlar) {
        if (ad === 'vendor/tesseract/tesseract.min.js') {
          kayit.tesseractYuklendi = true;
          ctx.Tesseract = { async createWorker(dil, oem, secenekler) { kayit.secenekler = { dil, oem, ...secenekler }; return tanici; } };
        } else if (ad === 'vendor/pdfjs-reader.js') {
          ctx.DurusmaPaketiPDFJS = pdfjs;
        } else throw new Error('beklenmeyen içe aktarma: ' + ad);
      }
    },
    postMessage(m) { kayit.mesajlar.push(m); if (m.type === 'OCR_READY') hazir(m); }
  });
  ctx.self = ctx;
  ctx.location = { href: konum };
  ctx.self.location = ctx.location;
  vm.runInContext(ISCI, ctx, { filename: 'atif-ocr-worker.js' });
  const calistir = (tur, bytes) => {
    ctx.onmessage({ data: { type: 'OCR', runId: 'r1', tur, bytes, sayfaSiniri: 12 } });
    return bitti;
  };
  return { ctx, kayit, calistir };
}

const PDF = () => Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer;

test('OCR işçisi chrome nesnesi olmayan Worker bağlamında paket yollarını kendi adresinden çözer', async () => {
  const { ctx, kayit, calistir } = isciBaglami();
  assert.equal(typeof ctx.chrome, 'undefined');
  const sonuc = await calistir('image', Uint8Array.from([1, 2, 3]).buffer);
  assert.equal(sonuc.code, undefined, JSON.stringify(sonuc));
  assert.equal(sonuc.sayfalar.length, 1);
  assert.match(sonuc.sayfalar[0].metin, /2020\/1234/);
  assert.equal(kayit.secenekler.dil, 'tur');
  assert.equal(kayit.secenekler.workerPath, UZANTI + 'vendor/tesseract/worker.min.js');
  assert.equal(kayit.secenekler.corePath, UZANTI + 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js');
  assert.equal(kayit.secenekler.langPath, UZANTI + 'vendor/tesseract');
  assert.equal(kayit.secenekler.workerBlobURL, false);
  assert.equal(kayit.secenekler.cacheMethod, 'none');
});

test('OCR işçisi uzantı paketi dışındaki adresten motor yüklemez', async () => {
  const { kayit, calistir } = isciBaglami({ konum: 'https://avukat.uyap.gov.tr/atif-ocr-worker.js' });
  const sonuc = await calistir('image', Uint8Array.from([1, 2, 3]).buffer);
  assert.equal(sonuc.code, 'ocr-motor');
  assert.equal(kayit.secenekler, null);
  assert.equal(sonuc.sayfalar.length, 0);
});

test('Tesseract için geçici window taklidi geri alınır; metinsiz PDF çizimi requestAnimationFrame aramaz', async () => {
  const { ctx, kayit, calistir } = isciBaglami();
  const sonuc = await calistir('pdf', PDF());
  assert.equal(sonuc.code, undefined, JSON.stringify(sonuc));
  assert.equal(sonuc.sayfalar.length, 1);
  assert.deepEqual(kayit.cizimPencere, ['undefined']);
  assert.deepEqual(kayit.tanimaPencere, ['undefined']);
  assert.equal(typeof ctx.window, 'undefined');
  assert.deepEqual(kayit.importlar, ['vendor/pdfjs-reader.js', 'vendor/tesseract/tesseract.min.js']);
});

test('uzantı sayfası CSP yalnız paket betiğine ve WebAssembly derlemesine izin verir', () => {
  const csp = MANIFEST.content_security_policy;
  assert.deepEqual(Object.keys(csp), ['extension_pages']);
  const metin = csp.extension_pages;
  assert.doesNotMatch(metin, /'unsafe-eval'|'unsafe-inline'|https?:|\*|data:|blob:/);
  const yonergeler = Object.fromEntries(metin.split(';').map(x => x.trim()).filter(Boolean)
    .map(x => { const [ad, ...degerler] = x.split(/\s+/); return [ad, degerler]; }));
  assert.deepEqual(Object.keys(yonergeler).sort(), ['object-src', 'script-src']);
  assert.deepEqual(yonergeler['script-src'], ["'self'", "'wasm-unsafe-eval'"]);
  assert.deepEqual(yonergeler['object-src'], ["'self'"]);
  assert.equal(MANIFEST.sandbox, undefined);
});

test('evrak HTML çerçevesinin CSP metni değişmez', () => {
  const satirlar = HTML_PARCA.split(/\r?\n/).filter(x => /\bHTML_CSP\s*=/.test(x));
  assert.equal(satirlar.length, 1);
  assert.equal(satirlar[0].trim(), "const HTML_CSP = \"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:\";");
});
