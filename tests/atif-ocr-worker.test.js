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
function isciBaglami({ konum = UZANTI + 'atif-ocr-worker.js', geciciTuval = false } = {}) {
  const kayit = { importlar: [], secenekler: null, tanimaPencere: [], cizimPencere: [], geciciTuval: [], mesajlar: [], tesseractYuklendi: false };
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
    getDocument(secenek) {
      // pdf.js gibi: fabrika verilmezse varsayılan DOM fabrikası document.createElement çağırır.
      const Fabrika = secenek?.CanvasFactory || class { create(w, h) { const canvas = ctx.document.createElement('canvas'); canvas.width = w; canvas.height = h; return { canvas, context: canvas.getContext('2d') }; } };
      const fabrika = new Fabrika({ ownerDocument: ctx.document, enableHWA: false });
      const sayfa = {
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 100 * scale }),
        // pdf.js gibi: `window` tanımlıysa çizim adımını window.requestAnimationFrame ile planlar.
        render() {
          kayit.cizimPencere.push(typeof ctx.window);
          if (geciciTuval) {
            // Büyük görüntü küçültme yolu: geçici tuval fabrikadan istenir, yeniden boyutlanır ve bırakılır.
            try {
              const gecici = fabrika.create(50, 70);
              kayit.geciciTuval.push([gecici.canvas.width, gecici.canvas.height, typeof gecici.context.drawImage]);
              fabrika.reset(gecici, 25, 35);
              kayit.geciciTuval.push([gecici.canvas.width, gecici.canvas.height]);
              fabrika.destroy(gecici);
              kayit.geciciTuval.push([gecici.canvas, gecici.context]);
            } catch (e) { return { promise: Promise.reject(e) }; }
          }
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

test('metinsiz PDF çiziminde pdf.js\'in geçici tuvali document olmayan işçide OffscreenCanvas\'tan gelir', async () => {
  const { ctx, kayit, calistir } = isciBaglami({ geciciTuval: true });
  assert.equal(typeof ctx.document, 'undefined');
  const sonuc = await calistir('pdf', PDF());
  assert.equal(sonuc.code, undefined, JSON.stringify(sonuc));
  assert.equal(sonuc.sayfalar.length, 1);
  assert.deepEqual(kayit.geciciTuval, [[50, 70, 'function'], [25, 35], [null, null]]);
});

// Uzantı sayfaları (popup, Ayarlar, Duruşma Paketi, görünmeyen PTT belgesi), service worker ve işçileri için yönerge
// bazlı izin listesi; her yönerge yalnız burada yazılı değerleri taşır. Yazılmayan yükleme türleri (resim, yazı tipi,
// medya) default-src 'self' ile yalnız paketten. Betik yalnız paketten (WebAssembly derlemesi dahil; işçiler script-src'ye
// düşer). Stil yalnız paketten: arayüz stilini stil dosyası, CSSOM (adoptedStyleSheets) ve sınıfla yazar; satır içi
// <style> öğesi ve style özniteliği yoktur (JS'ten el.style ataması CSP'ye takılmaz). Ağ: paket, Tesseract çekirdeğinin
// gömülü wasm'ı (data:), künye havuzu, Sentry alım adresi ve görünmeyen PTT sorgusu. Çerçeve yalnız resmî PTT formu (görünmez Duruşma
// Paketi çerçevesi önizleme göstermez). Kaynaklar yalnız kökendir, yol taşımaz.
// İçerik betikleri bu politikaya tabi değildir.
const CSP_IZINLERI = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'object-src': ["'self'"],
  'style-src': ["'self'"],
  'connect-src': ["'self'", 'data:', 'https://legaluga.com', 'https://o4511620723703808.ingest.de.sentry.io', 'https://www.ptt.gov.tr'],
  'frame-src': ['https://www.ptt.gov.tr'],
  'base-uri': ["'none'"],
  'form-action': ["'none'"]
};

test('uzantı sayfası CSP yönerge bazlı izin listesine uyar: varsayılan paket, betik paketten, ağ ve çerçeve yalnız bilinen kökenlere', () => {
  const csp = MANIFEST.content_security_policy;
  assert.deepEqual(Object.keys(csp), ['extension_pages']);
  const yonergeler = csp.extension_pages.split(';').map(x => x.trim()).filter(Boolean).map(x => x.split(/\s+/));
  // Tarayıcı yinelenen yönergenin ikincisini yok sayar; her yönerge bir kez yazılır.
  const adlar = yonergeler.map(([ad]) => ad);
  assert.equal(new Set(adlar).size, adlar.length, adlar.join(' '));
  assert.deepEqual(Object.fromEntries(yonergeler.map(([ad, ...degerler]) => [ad, degerler])), CSP_IZINLERI);
  for (const [ad, ...degerler] of yonergeler) {
    for (const deger of degerler) {
      // Hiçbir yönergede 'unsafe-*' kaynak değeri yoktur ('wasm-unsafe-eval' yalnız WebAssembly derlemesidir).
      assert.doesNotMatch(deger, /^'unsafe-|\*|^https?:$/, `${ad} ${deger}`);
      if (/^https?:/.test(deger)) assert.equal(deger, new URL(deger).origin, `${ad}: kaynak yol taşımaz (${deger})`);
    }
  }
  assert.equal(MANIFEST.sandbox, undefined);
});

// default-src 'self' altında sayfaların HTML'i yalnız paketteki göreli dosyaları yükler; satır içi betik ve stil yoktur
// (satır içi betik script-src'ye takılır). Stil dosyası <link> ile, betik src ile gelir.
test('uzantı sayfalarının HTML\'i yalnız paketten yükler; satır içi betik, stil öğesi ve style özniteliği yok', () => {
  const sayfalar = [MANIFEST.action.default_popup, MANIFEST.options_ui.page,
    ...MANIFEST.web_accessible_resources.flatMap(x => x.resources).filter(x => x.endsWith('.html')), 'ptt-offscreen.html'];
  assert.deepEqual(sayfalar, ['popup.html', 'options.html', 'durusma-paketi.html', 'ptt-offscreen.html']);
  for (const ad of sayfalar) {
    const html = fs.readFileSync(path.join(KOK, 'extension', ad), 'utf8');
    assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript:/i, ad);
    for (const [, govde] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) assert.equal(govde.trim(), '', `${ad}: satır içi betik`);
    const kaynaklar = [...html.matchAll(/\s(?:src|href)\s*=\s*"([^"]*)"/gi)].map(([, adres]) => adres);
    assert.ok(kaynaklar.length, ad);
    for (const adres of kaynaklar) assert.match(adres, /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.(?:js|css)$/, `${ad}: ${adres}`);
  }
});

test('evrak HTML çerçevesinin CSP metni değişmez', () => {
  const satirlar = HTML_PARCA.split(/\r?\n/).filter(x => /\bHTML_CSP\s*=/.test(x));
  assert.equal(satirlar.length, 1);
  assert.equal(satirlar[0].trim(), "const HTML_CSP = \"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:\";");
});
