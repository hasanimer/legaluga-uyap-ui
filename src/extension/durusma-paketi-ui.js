// Görünmez paket motoru (uzantı kökenli çerçeve). Köprü, doğrulanmış tek oturum MessagePort'unu connect ile verir.
// Çerçevenin arayüzü yoktur ve DOM'a dokunmaz: durum dosya ekranına STATUS, hazır PDF RESULT iletisiyle gider.
(() => {
  const M = globalThis.UHD.durusmaPaketiModel;
  let state = M.initial(), transport = null, sessionId = '', nextRun = 0, worker = null, preparse = null, workerTimer = null;
  let textJob = null;
  let documentPdfJob = null;
  function stopDocumentPdfJob(notify = false) { documentPdfJob?.finish({ code: 'document-stopped' }, notify); }
  function stopTextJob() { textJob?.finish([], '', false); }
  function stopWorker() {
    clearTimeout(workerTimer); workerTimer = null;
    preparse?.abort(); preparse = null;
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
    worker = null;
  }

  // Durum değişince yalnız dosya ekranına bildirilir; ilerleme iletisi öğe çizmez.
  function dispatch(action) {
    const previous = state;
    state = M.reducer(state, action);
    if (state === previous) return false;
    notify(); return true;
  }
  function send(type, payload = {}, transfer = []) {
    if (transport) transport.send({ type, sessionId, ...payload }, transfer);
  }
  // Dosya ekranına evre, ilerleme yazısı ve hatalar bildirilir; değişmediyse gönderilmez.
  let lastStatus = '';
  function notify() {
    if (!transport) return;
    const status = { phase: state.phase, message: state.progress?.message || '',
      failures: state.phase === 'failed' ? state.failures.map(f => ({ id: f.id, reason: f.reason })) : [] };
    const key = JSON.stringify(status);
    if (key === lastStatus) return;
    lastStatus = key;
    send('STATUS', status);
  }
  function newRunId() { return `${sessionId}:${++nextRun}`; }
  function start() {
    const runId = newRunId();
    if (!dispatch({ type: 'START', runId })) return;
    stopWorker(); send('START', { runId, orderedIds: [...state.snapshot] });
  }
  // UDF tamlığı ve ret nedenleri tek yerden çıkarılır. nedenler yalnız sabit sözlük kodlarıdır ve çerçeveden yalnız
  // onlar çıkar; iletiler paket raporunun açıklamalarıdır. İkisi de belge metni veya öznitelik değeri taşımaz.
  const UDF_ICERIK_KAYBI = new Set(['truncated', 'offset', 'unknown-element', 'image-unreadable', 'package-entry', 'uncovered-text', 'limit']);
  const NEDEN_KALIBI = /^[a-z][a-z-]{0,31}$/;
  // PDF dönüşümünde UDF okuma bütçesi; önizlemenin 8 sn'si büyük belgeyi zamanlamaya bağlı olarak keserdi.
  const UDF_OKUMA_SURESI = 60000;
  function udfTanisi(model) {
    const c = model.sayac || {}, issues = Array.isArray(model.paketTani?.issues) ? model.paketTani.issues : [];
    const complete = model.paketTani?.complete === true && !model.kesildi && !c.resimReddi && !c.ofsetSorunu && !c.bilinmeyen;
    // Süre aşımı belgenin değil okumanın sorunudur; ayrı kodla bildirilir ve yeniden denenebilir.
    const sure = model.kesildi === 'sure' || issues.some(x => x?.code === 'profile-timeout');
    const nedenler = issues.map(x => x?.neden), iletiler = [...new Set(issues.map(x => x?.message))].slice(0, 3);
    if (model.kesildi) {
      nedenler.push('truncated');
      iletiler.push(model.kesildi === 'sure' ? 'UDF okuma süresi doldu; belgenin tamamı çözülemedi. Tekrar deneyin.'
        : 'UDF okuma sınırına ulaşıldı; belgenin tamamı çözülemedi.');
    }
    if (c.resimReddi) { nedenler.push('image-unreadable'); iletiler.push('UDF içinde çözülemeyen resim var.'); }
    if (c.ofsetSorunu) { nedenler.push('offset'); iletiler.push('UDF metin konumları belge içeriğiyle uyuşmuyor.'); }
    if (c.bilinmeyen) { nedenler.push('unknown-element'); if (!iletiler.length) iletiler.push('UDF içinde çözülemeyen belge öğesi var.'); }
    const gecerli = [...new Set(nedenler.filter(x => typeof x === 'string' && NEDEN_KALIBI.test(x)))];
    const kayip = gecerli.filter(x => UDF_ICERIK_KAYBI.has(x));
    // İçerik kaybı nedeni önce gelir; sınırlı listede düzen nedenleri onu gizlemez.
    return { complete, kayip: kayip.length > 0, sure, nedenler: [...kayip, ...gecerli.filter(x => !UDF_ICERIK_KAYBI.has(x))], iletiler };
  }
  // UdfHatasi.kod kullanıcıya gösterilen sabit koda çevrilir; ileti ve ayrıntı çerçeveden çıkmaz.
  const UDF_HATA_KODU = { zip: 'udf-zip', xml: 'udf-xml', dtd: 'udf-xml', belirsiz: 'udf-xml', 'content-xml-yok': 'udf-xml',
    desteklenmiyor: 'document-runtime', sure: 'udf-timeout' };
  function udfHataKodu(error) {
    if (error?.name !== 'UdfHatasi') return 'udf-incomplete';
    // boyut paket sınırı da model bütçesi de olabilir; 40 MB iletisi yalnız paket için doğrudur.
    if (error.kod === 'boyut') return error.ayrinti === 'paket' ? 'udf-size' : 'udf-budget';
    return Object.hasOwn(UDF_HATA_KODU, error.kod) ? UDF_HATA_KODU[error.kod] : 'udf-incomplete';
  }
  async function startWorker(message) {
    if (message.runId !== state.runId || state.phase !== 'running' || !Array.isArray(message.items) ||
        !Array.isArray(message.orderedIds) || worker) return;
    stopDocumentPdfJob(true);
    const runId = message.runId;
    const items = message.items;
    preparse = new AbortController();
    const parseSignal = preparse.signal;
    const udfFailures = [];
    for (const item of items) {
      if (String(item.format).toLowerCase() !== 'udf') continue;
      try {
        const model = await globalThis.UHD.udf.oku(new Blob([item.bytes], { type: 'application/octet-stream' }),
          { signal: parseSignal, paket: true, sure: UDF_OKUMA_SURESI });
        if (parseSignal.aborted || state.runId !== runId || state.phase !== 'running') return;
        const c = model.sayac || {}, tani = udfTanisi(model);
        item.udfModel = model;
        item.udfDiagnostics = { complete: tani.complete,
          kesildi: model.kesildi || null, resimReddi: c.resimReddi || 0,
          ofsetSorunu: c.ofsetSorunu || 0, bilinmeyen: c.bilinmeyen || 0,
          issues: model.paketTani?.issues || [], referenceVerified: false };
        if (!tani.complete) udfFailures.push({ id: item.id, reason: tani.iletiler.join(' ') || 'UDF içeriği eksiksiz çözülemedi.' });
      } catch (err) {
        if (parseSignal.aborted) return;
        udfFailures.push({ id: item.id, reason: err?.message || 'UDF okunamadı.' });
      }
    }
    preparse = null;
    if (udfFailures.length && udfFailures.length >= items.length) {
      send('WORKER_FAILED', { runId, failures: udfFailures });
      dispatch({ type: 'FAILED', runId, failures: udfFailures }); return;
    }
    const udfSkipped = new Set(udfFailures.map(x => x.id));
    const workItems = items.filter(item => !udfSkipped.has(item.id));
    const workOrder = message.orderedIds.filter(id => !udfSkipped.has(id));
    const workExcluded = [...(message.excluded || []), ...udfFailures.map(x => ({ id: x.id, title: items.find(item => item.id === x.id)?.title || 'Evrak', reason: x.reason }))];
    if (state.runId !== runId || state.phase !== 'running') return;
    let instance;
    try { instance = worker = new Worker(chrome.runtime.getURL('durusma-paketi-worker.js')); }
    catch {
      send('WORKER_FAILED', { runId, failures: [{ id: '', reason: 'PDF hazırlayıcı başlatılamadı.' }] });
      dispatch({ type: 'ERROR', runId, message: 'PDF hazırlayıcı başlatılamadı.' }); return;
    }
    // Süre sınırı işçinin son ilerleme bildiriminden sayılır: çok sayfalı evrak ilerlerken kesilmez, takılan işçi durdurulur.
    const armTimer = () => {
      clearTimeout(workerTimer);
      workerTimer = setTimeout(() => {
        if (worker !== instance || state.runId !== runId) return;
        stopWorker();
        const message = 'PDF hazırlama süresi sınırını aştı. Daha küçük bir paket seçip yeniden deneyin.';
        send('WORKER_FAILED', { runId, failures: [{ id: '', reason: message }] });
        dispatch({ type: 'ERROR', runId, message });
      }, 120000);
    };
    armTimer();
    instance.onmessage = event => {
      if (worker !== instance || state.runId !== runId || state.phase !== 'running') return;
      const result = event.data || {};
      if (result.runId !== runId) return;
      if (result.type === 'PROGRESS') {
        armTimer();
        dispatch({ type: 'PROGRESS', runId, phase: result.phase,
          itemId: result.itemId, message: result.message || `${result.phase || 'PDF'} · ${result.done || 0}/${result.total || '?'}` });
      } else if (result.type === 'FAILED') {
        const failures = (Array.isArray(result.issues) ? result.issues : [])
          .map(x => ({ id: x.id || '', reason: x.message || x.code || 'Dönüştürme başarısız.' }));
        stopWorker(); send('WORKER_FAILED', { runId, failures });
        dispatch({ type: 'FAILED', runId, failures });
      } else if (result.type === 'READY') {
        stopWorker(); send('WORKER_DONE', { runId });
        receive({ type: 'READY', sessionId, runId, bytes: result.bytes,
          incomplete: !!result.incomplete, excluded: Array.isArray(result.excluded) ? result.excluded : [],
          filename: result.incomplete ? 'Durusma_Paketi_eksik-paket.pdf' : 'Durusma_Paketi.pdf' });
      } else if (result.type === 'CANCELLED') {
        stopWorker(); send('CANCEL', { runId }); dispatch({ type: 'CANCELLED', runId });
      }
    };
    instance.onerror = () => {
      if (worker !== instance) return;
      stopWorker(); send('WORKER_FAILED', { runId, failures: [{ id: '', reason: 'PDF hazırlayıcı durdu.' }] });
      dispatch({ type: 'ERROR', runId, message: 'PDF hazırlanamadı.' });
    };
    const transfer = workItems.map(item => item.bytes).filter(bytes => bytes instanceof ArrayBuffer);
    try {
      instance.postMessage({ type: 'INIT', runId, items: workItems, excluded: workExcluded }, transfer);
      instance.postMessage({ type: 'START', runId, orderedIds: workOrder,
        excludedIds: workExcluded.map(x => x.id) });
    } catch {
      stopWorker(); send('WORKER_FAILED', { runId, failures: [{ id: '', reason: 'Evrak PDF hazırlayıcıya aktarılamadı.' }] });
      dispatch({ type: 'ERROR', runId, message: 'Evrak PDF hazırlayıcıya aktarılamadı.' });
    }
  }
  function metinIsi(message) {
    stopDocumentPdfJob(true);
    const jobId = String(message.jobId || '');
    const items = message.items;
    textJob?.finish([], 'Önceki metin okuma işlemi durduruldu.');
    if (!jobId || !Array.isArray(items) || !items.length || items.length > 200 ||
      items.some(x => !x || typeof x.id !== 'string' || !x.id || !(x.bytes instanceof ArrayBuffer) || !x.bytes.byteLength) ||
      new Set(items.map(x => x.id)).size !== items.length || new Set(items.map(x => x.bytes)).size !== items.length ||
      items.reduce((n, x) => n + x.bytes.byteLength, 0) > 64 * 1024 * 1024) {
      send('TEXT_RESULT', { jobId, texts: [], error: 'Metin evrak seçimi veya kaynak boyutu geçersiz.' }); return;
    }
    let w, zaman, finished = false;
    const bitir = (sonuc, hata, notify = true) => {
      if (finished) return;
      finished = true; clearTimeout(zaman);
      if (textJob?.finish === bitir) textJob = null;
      if (w) { w.onmessage = null; w.onerror = null; w.onmessageerror = null; try { w.terminate(); } catch {} }
      if (notify) {
        const texts = Array.isArray(sonuc) ? sonuc : [];
        send('TEXT_RESULT', { jobId, texts, error: hata || '' },
          texts.flatMap(x => (x.sources || []).map(s => s.bytes).filter(b => b instanceof ArrayBuffer)));
      }
    };
    textJob = { jobId, finish: bitir };
    zaman = setTimeout(() => bitir(null, 'Metin çıkarma süresi doldu; işlem durduruldu.'), 120000);
    try { w = new Worker(chrome.runtime.getURL('durusma-paketi-worker.js')); }
    catch { bitir(null, 'Metin okuyucu başlatılamadı.'); return; }
    w.onmessage = e => { if (e.data?.type === 'TEXT_READY' && e.data.runId === jobId) bitir(e.data.texts, e.data.error); };
    w.onerror = () => bitir(null, 'Metin okuyucu durdu.');
    w.onmessageerror = () => bitir(null, 'Metin okuyucunun yanıtı okunamadı.');
    try { w.postMessage({ type: 'TEXT', runId: jobId, items, ...(message.sourcesOnly === true ? { sourcesOnly: true } : {}) }, items.map(x => x.bytes)); }
    catch { bitir(null, 'Evrak metin okuyucuya aktarılamadı.'); }
  }
  // Atıflar (1.19.47): dosya ekranında açık tek PDF'in sayfa metinleri. Her iş kendi işçisinde ve süreyle sınırlıdır; yeni bir
  // metin işi, CANCEL_TEXT ya da panelin kapanması işçiyi durdurur (CANCEL_TEXT yanıt beklemez). Baytlar geri gönderilmez.
  function pdfMetinIsi(message) {
    stopDocumentPdfJob(true);
    const jobId = String(message.jobId || '');
    const bytes = message.bytes;
    textJob?.finish([], 'Önceki metin okuma işlemi durduruldu.');
    const bos = code => ({ sayfalar: [], toplamSayfa: 0, bosSayfa: 0, kesildi: false, code });
    if (!jobId || !(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > 64 * 1024 * 1024) {
      send('PDF_TEXT_RESULT', { jobId, ...bos('pdf-invalid') }); return;
    }
    const sayfaSiniri = Number.isSafeInteger(message.sayfaSiniri) && message.sayfaSiniri > 0 && message.sayfaSiniri <= 300 ? message.sayfaSiniri : 300;
    let w, zaman, finished = false;
    const bitir = (sonuc, notify = true) => {
      if (finished) return;
      finished = true; clearTimeout(zaman);
      if (textJob === is) textJob = null;
      if (w) { w.onmessage = null; w.onerror = null; w.onmessageerror = null; try { w.terminate(); } catch {} }
      if (notify) send('PDF_TEXT_RESULT', { jobId, ...sonuc });
    };
    const is = { jobId, finish: (_texts, _hata, notify = true) => bitir(bos('text-stopped'), notify) };
    textJob = is;
    zaman = setTimeout(() => bitir(bos('text-timeout')), 120000);
    try { w = new Worker(chrome.runtime.getURL('durusma-paketi-worker.js')); }
    catch { bitir(bos('text-worker')); return; }
    w.onmessage = e => {
      const d = e.data;
      if (d?.type !== 'PDF_TEXT_READY' || d.runId !== jobId) return;
      bitir({ sayfalar: Array.isArray(d.sayfalar) ? d.sayfalar : [], toplamSayfa: Number(d.toplamSayfa) || 0,
        bosSayfa: Number(d.bosSayfa) || 0, kesildi: d.kesildi === true,
        ...(Number.isSafeInteger(d.hataSayfa) && d.hataSayfa > 0 ? { hataSayfa: d.hataSayfa } : {}),
        ...(d.code ? { code: String(d.code) } : {}) });
    };
    w.onerror = () => bitir(bos('text-worker'));
    w.onmessageerror = () => bitir(bos('text-worker'));
    try { w.postMessage({ type: 'PDF_TEXT', runId: jobId, bytes, sayfaSiniri }, [bytes]); }
    catch { bitir(bos('text-worker')); }
  }
  // Atıflar: kullanıcının açtığı taranmış evrakın yerel OCR'ı. Görüntü işçiye aktarılır, geriye yalnız sayfa metni döner.
  function ocrIsi(message) {
    stopDocumentPdfJob(true);
    const jobId = String(message.jobId || '');
    const bytes = message.bytes;
    const tur = message.tur;
    textJob?.finish([], 'Önceki metin okuma işlemi durduruldu.');
    const bos = code => ({ sayfalar: [], toplamSayfa: 0, kesildi: false, code });
    if (!jobId || !(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > 64 * 1024 * 1024 || !['pdf', 'tiff', 'image'].includes(tur)) {
      send('OCR_RESULT', { jobId, ...bos('ocr-invalid') }); return;
    }
    const sayfaSiniri = Number.isSafeInteger(message.sayfaSiniri) && message.sayfaSiniri > 0 && message.sayfaSiniri <= 12 ? message.sayfaSiniri : 12;
    let w, zaman, finished = false;
    const bitir = (sonuc, notify = true) => {
      if (finished) return;
      finished = true; clearTimeout(zaman);
      if (textJob === is) textJob = null;
      if (w) { w.onmessage = null; w.onerror = null; w.onmessageerror = null; try { w.terminate(); } catch {} }
      if (notify) send('OCR_RESULT', { jobId, ...sonuc });
    };
    const is = { jobId, finish: (_texts, _hata, notify = true) => bitir(bos('ocr-stopped'), notify) };
    textJob = is;
    zaman = setTimeout(() => bitir(bos('ocr-timeout')), 240000);
    try { w = new Worker(chrome.runtime.getURL('atif-ocr-worker.js')); }
    catch { bitir(bos('ocr-worker')); return; }
    w.onmessage = e => {
      const d = e.data;
      if (!d || d.runId !== jobId) return;
      if (d.type === 'OCR_PROGRESS') {
        send('OCR_PROGRESS', { jobId, sayfa: Number.isSafeInteger(d.sayfa) ? d.sayfa : 0, toplam: Number.isSafeInteger(d.toplam) ? d.toplam : 0 });
        return;
      }
      if (d.type !== 'OCR_READY') return;
      const sayfalar = Array.isArray(d.sayfalar) ? d.sayfalar.filter(p => p && typeof p.metin === 'string' && Number.isSafeInteger(p.no)).slice(0, 12).map(p => ({ no: p.no, metin: p.metin.slice(0, 200000) })) : [];
      const code = typeof d.code === 'string' && /^ocr-[a-z0-9-]{1,24}$/.test(d.code) ? d.code : '';
      bitir({ sayfalar, toplamSayfa: Number.isSafeInteger(d.toplamSayfa) && d.toplamSayfa >= 0 ? d.toplamSayfa : 0, kesildi: d.kesildi === true,
        ...(d.sayfaKesildi === true ? { sayfaKesildi: true } : {}), ...(code ? { code } : {}) });
    };
    w.onerror = () => bitir(bos('ocr-worker'));
    w.onmessageerror = () => bitir(bos('ocr-worker'));
    try { w.postMessage({ type: 'OCR', runId: jobId, bytes, tur, sayfaSiniri }, [bytes]); }
    catch { bitir(bos('ocr-worker')); }
  }
  // Tek belge dönüşümü kendi işçisinde çalışır. UDF, sınırlı önizleme modelinden değil özgün baytlardan paket profiliyle okunur.
  function documentPdf(message) {
    const jobId = typeof message.jobId === 'string' ? message.jobId : '';
    const source = message.item;
    if (documentPdfJob?.jobId === jobId && jobId) return;
    if (documentPdfJob || textJob || worker || preparse || ['running', 'cancelling'].includes(state.phase)) {
      send('DOCUMENT_PDF_RESULT', { jobId, code: 'document-busy' }); return;
    }
    const formats = new Set(['udf', 'tiff', 'tif', 'jpg', 'jpeg', 'png', 'html', 'htm', 'xml', 'txt', 'text']);
    if (!jobId || jobId.length > 120 || !source || !(source.bytes instanceof ArrayBuffer) || !source.bytes.byteLength ||
      source.bytes.byteLength > 64 * 1024 * 1024 || !formats.has(source.format)) {
      send('DOCUMENT_PDF_RESULT', { jobId, code: 'document-invalid' }); return;
    }
    const parse = new AbortController();
    let w = null, timer = null, finished = false;
    const finish = (result, notify = true) => {
      if (finished) return;
      finished = true; clearTimeout(timer); parse.abort();
      if (documentPdfJob === job) documentPdfJob = null;
      if (w) { w.onmessage = null; w.onerror = null; w.onmessageerror = null; try { w.terminate(); } catch {} }
      if (notify) send('DOCUMENT_PDF_RESULT', { jobId, ...result }, result.bytes ? [result.bytes] : []);
    };
    const job = { jobId, finish };
    documentPdfJob = job;
    timer = setTimeout(() => finish({ code: 'document-timeout' }), 120000);
    const item = { id: 'document', title: typeof source.title === 'string' ? source.title.slice(0, 200) : 'Evrak',
      format: source.format, mime: typeof source.mime === 'string' ? source.mime.slice(0, 200) : '', bytes: source.bytes };
    (async () => {
      if (item.format === 'udf') {
        const model = await globalThis.UHD.udf.oku(new Blob([item.bytes], { type: 'application/octet-stream' }),
          { signal: parse.signal, paket: true, sure: UDF_OKUMA_SURESI });
        if (finished || parse.signal.aborted || documentPdfJob !== job) return;
        // Süre aşımı udf-timeout; içerik kaybı varsa udf-incomplete, yalnız henüz çizilemeyen düzen varsa
        // udf-unsupported; en çok 5 neden kodu gider.
        const tani = udfTanisi(model);
        if (tani.sure) { finish({ code: 'udf-timeout' }); return; }
        if (!tani.complete) {
          finish({ code: tani.kayip || !tani.nedenler.length ? 'udf-incomplete' : 'udf-unsupported',
            ...(tani.nedenler.length ? { reasons: tani.nedenler.slice(0, 5) } : {}) });
          return;
        }
        item.udfModel = model;
        item.udfDiagnostics = { complete: true, kesildi: null, resimReddi: 0, ofsetSorunu: 0, bilinmeyen: 0,
          issues: model.paketTani?.issues || [], referenceVerified: false };
      }
      if (finished || parse.signal.aborted || documentPdfJob !== job) return;
      try { w = new Worker(chrome.runtime.getURL('durusma-paketi-worker.js')); }
      catch { finish({ code: 'document-worker' }); return; }
      w.onmessage = ({ data }) => {
        if (finished || documentPdfJob !== job || data?.type !== 'SINGLE_PDF_READY' || data.runId !== jobId) return;
        if (data.code) { finish({ code: /^[a-z][a-z0-9-]{0,40}$/.test(data.code) ? data.code : 'document-convert' }); return; }
        const bytes = data.bytes, prefix = bytes instanceof ArrayBuffer && bytes.byteLength >= 5 ? new Uint8Array(bytes, 0, 5) : null;
        if (!prefix || bytes.byteLength > 128 * 1024 * 1024 || ![37, 80, 68, 70, 45].every((n, i) => prefix[i] === n)) {
          finish({ code: 'output-limit' }); return;
        }
        finish({ bytes, warnings: (Array.isArray(data.warnings) ? data.warnings : []).filter(x => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 500)) });
      };
      w.onerror = w.onmessageerror = () => finish({ code: 'document-worker' });
      try { w.postMessage({ type: 'SINGLE_PDF', runId: jobId, item }, [item.bytes]); }
      catch { finish({ code: 'document-worker' }); }
    })().catch(error => {
      if (finished || error?.name === 'AbortError') return;
      finish({ code: item.format === 'udf' ? udfHataKodu(error) : /^[a-z][a-z0-9-]{0,40}$/.test(error?.code || '') ? error.code : 'document-convert' });
    });
  }
  function receive(message) {
    if (!message || message.sessionId !== sessionId) return;
    if (message.type === 'LIST') { dispatch({ type: 'LIST', ...message }); return; }
    if (message.type === 'DOCUMENTS') { startWorker(message); return; }
    if (message.type === 'CONVERT_DOCUMENT') { documentPdf(message); return; }
    if (message.type === 'CANCEL_DOCUMENT') {
      if (message.jobId && documentPdfJob?.jobId === message.jobId) stopDocumentPdfJob();
      return;
    }
    // Banka cevapları: dosya ekranının aldığı evrakların metni ayrı bir işçide çıkarılır ve geri gönderilir.
    if (message.type === 'EXTRACT_TEXT') { metinIsi(message); return; }
    // Atıflar: dosya ekranında açık PDF'in sayfa metni; CANCEL_TEXT süren metin işini yanıtsız durdurur.
    if (message.type === 'EXTRACT_PDF_TEXT') { pdfMetinIsi(message); return; }
    if (message.type === 'OCR_ATIF') { ocrIsi(message); return; }
    if (message.type === 'CANCEL_TEXT') {
      const jobId = String(message.jobId || '');
      if (jobId && textJob?.jobId === jobId) textJob.finish([], '', false);
      return;
    }
    // Dosya ekranında işaretlenen evraklar bu sırayla seçilir ve paket hemen hazırlanır.
    if (message.type === 'SELECT_AND_START') {
      dispatch({ type: 'SELECT_SET', ids: message.orderedIds });
      if (state.selected.length && state.phase === 'idle') start();
      else send('STATUS', { phase: 'failed', message: '', failures: [{ id: '', reason: 'Seçilen evraklar listede bulunamadı; listeyi yenileyip tekrar deneyin.' }] });
      return;
    }
    if (message.type === 'PROGRESS') dispatch({ type: 'PROGRESS', ...message });
    if (message.type === 'FAILED') dispatch({ type: 'FAILED', ...message });
    if (message.type === 'CANCELLED' && dispatch({ type: 'CANCELLED', ...message })) stopWorker();
    if (message.type === 'ERROR' && dispatch({ type: 'ERROR', ...message })) stopWorker();
    if (message.type === 'READY' && message.runId === state.runId && state.phase === 'running') {
      const bytes = message.bytes;
      if (!(bytes instanceof ArrayBuffer)) return;
      const result = { bytes, incomplete: !!message.incomplete, excluded: Array.isArray(message.excluded) ? message.excluded : [],
        filename: String(message.filename || 'Durusma_Paketi.pdf') };
      if (!dispatch({ type: 'READY', runId: message.runId, result })) return;
      // PDF'in tek kopyası kopyalanmadan dosya ekranına aktarılır (önizleme ve indirme orada); çerçevede kopya kalmaz.
      const skipped = [...state.skipped, ...state.excluded.filter(id => !state.skipped.some(x => x.id === id))
        .map(id => ({ id, reason: 'Dışarıda bırakıldı.' }))];
      transport?.send({ type: 'RESULT', sessionId, runId: message.runId, bytes, filename: result.filename,
        incomplete: result.incomplete, count: state.snapshot.length - skipped.length, skipped }, [bytes]);
    }
  }
  function connect(adapter) {
    if (transport || !adapter || typeof adapter.send !== 'function' || typeof adapter.on !== 'function' || !adapter.sessionId) return false;
    sessionId = String(adapter.sessionId); transport = adapter; adapter.on(receive);
    send('LIST_REQUEST'); notify(); return true;
  }
  // Dosya ekranı çerçeveyi kaldırınca süren işler ve kanal bırakılır.
  window.addEventListener('pagehide', () => { stopDocumentPdfJob(); stopTextJob(); stopWorker(); transport?.close?.(); });
  globalThis.UHD.durusmaPaketiUI = { connect, receive };
})();
