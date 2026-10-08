/* global module */
// Tek evrak PDF'i yerel uzantı çerçevesinde hazırlanır. Özgün Blob değişmez; baytların kopyası aktarılır.
(() => {
  'use strict';
  if (globalThis.UHD?.belgePdf) return;
  const SINIR = Object.freeze({ kaynak: 64 * 1024 * 1024, sonuc: 128 * 1024 * 1024, hazir: 20000, sure: 125000, yokla: 400 });
  const FORMAT = new Set(['udf', 'tiff', 'tif', 'png', 'jpg', 'jpeg', 'html', 'htm', 'xml', 'txt', 'text']);
  const format = ext => typeof ext === 'string' ? ext.toLowerCase().replace(/^\./, '') : '';
  const destekli = ext => FORMAT.has(format(ext));
  const ILETI = {
    'document-busy': 'Başka bir belge işlemi sürüyor. Tamamlanınca PDF indirmeyi tekrar deneyin.',
    'document-stopped': 'PDF dönüşümü başka bir belge işlemi nedeniyle durdu.',
    'document-invalid': 'PDF dönüşümü için evrak geçersiz.',
    'source-limit': 'Evrak PDF dönüşümü için çok büyük (64 MB üstü).',
    'output-limit': 'PDF çıktısı geçersiz veya çok büyük.',
    'document-timeout': 'PDF dönüşümü süre sınırını aştı.',
    'format-unsupported': 'Bu evrak türü PDF’e dönüştürülemiyor. Özgün evrakı indirebilirsiniz.',
    'udf-incomplete': 'UDF içeriği eksiksiz çözülemedi. Özgün evrakı indirebilirsiniz.',
    'udf-profile': 'UDF düzeni bu PDF dönüştürücüsünde desteklenmiyor. Özgün evrakı indirebilirsiniz.',
    'tiff-incomplete': 'TIFF’in tüm sayfaları eksiksiz dönüştürülemedi. Özgün evrakı indirebilirsiniz.',
    'text-limit': 'Evrak metni eksiksiz okunamadı. Özgün evrakı indirebilirsiniz.'
  };
  const hata = code => Object.assign(new Error(ILETI[code] || 'PDF oluşturulamadı. Özgün evrakı indirebilirsiniz.'), { code });
  let active = null;

  // model/diagnostics önizleme kapsamında sınırlı olabilir; UDF her zaman çerçevede paket:true ile yeniden okunur.
  function donustur({ blob, ext, signal, title = 'Evrak', container } = {}) {
    if (signal?.aborted) return Promise.reject(new DOMException('Durduruldu.', 'AbortError'));
    if (active) return Promise.reject(hata('document-busy'));
    if (!destekli(ext)) return Promise.reject(hata('format-unsupported'));
    if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isSafeInteger(blob.size) || blob.size < 1 || typeof container?.append !== 'function')
      return Promise.reject(hata('document-invalid'));
    if (blob.size > SINIR.kaynak) return Promise.reject(hata('source-limit'));
    const bridge = globalThis.UHD?.durusmaPaketiBridge;
    if (typeof bridge?.create !== 'function') return Promise.reject(hata('document-worker'));
    const job = { id: `pdf-${globalThis.crypto.randomUUID()}` };
    active = job;
    return new Promise((resolve, reject) => {
      let frame = null, session = null, done = false, sent = false, readyTimer = null, pollTimer = null;
      const finish = (error, result) => {
        if (done) return;
        done = true;
        clearTimeout(timer); clearTimeout(readyTimer); clearTimeout(pollTimer);
        signal?.removeEventListener('abort', abort);
        if (error && sent && !session?.closed) { try { session?.send({ type: 'CANCEL_DOCUMENT', jobId: job.id }); } catch {} }
        try { session?.close(); } catch {}
        try { frame?.remove(); } catch {}
        if (active === job) active = null;
        if (error) reject(error); else resolve(result);
      };
      const abort = () => finish(new DOMException('Durduruldu.', 'AbortError'));
      const timer = setTimeout(() => finish(hata('document-timeout')), SINIR.sure);
      signal?.addEventListener('abort', abort, { once: true });
      const poll = () => {
        if (done) return;
        if (signal?.aborted || container.isConnected === false) { abort(); return; }
        if (session?.closed) { finish(hata('document-stopped')); return; }
        pollTimer = setTimeout(poll, SINIR.yokla);
      };
      (async () => {
        const bytes = await blob.arrayBuffer();
        if (done) return;
        if (signal?.aborted || container.isConnected === false) { abort(); return; }
        if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== blob.size || bytes.byteLength > SINIR.kaynak) { finish(hata('document-invalid')); return; }
        frame = globalThis.document.createElement('iframe');
        frame.className = 'paket-motor'; frame.title = 'PDF dönüştürücü'; frame.hidden = true; frame.tabIndex = -1;
        frame.setAttribute('aria-hidden', 'true');
        container.append(frame);
        session = bridge.create(frame, message => {
          if (done || !message || message.sessionId !== session?.sessionId) return;
          if (message.type === 'LIST_REQUEST' && !sent) {
            if (signal?.aborted) { abort(); return; }
            clearTimeout(readyTimer);
            try {
              session.send({ type: 'CONVERT_DOCUMENT', jobId: job.id, item: { bytes, format: format(ext),
                title: typeof title === 'string' ? title.slice(0, 200) : 'Evrak', mime: typeof blob.type === 'string' ? blob.type.slice(0, 200) : '' } }, [bytes]);
              sent = true;
            } catch { finish(hata('document-worker')); }
          } else if (message.type === 'DOCUMENT_PDF_RESULT' && sent && message.jobId === job.id) {
            if (message.code) { finish(hata(/^[a-z][a-z0-9-]{0,40}$/.test(message.code) ? message.code : 'document-convert')); return; }
            const output = message.bytes;
            const prefix = output instanceof ArrayBuffer && output.byteLength >= 5 ? new Uint8Array(output, 0, 5) : null;
            if (!prefix || output.byteLength > SINIR.sonuc || ![37, 80, 68, 70, 45].every((n, i) => prefix[i] === n)) { finish(hata('output-limit')); return; }
            finish(null, { bytes: output, warnings: (Array.isArray(message.warnings) ? message.warnings : []).filter(x => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 500)) });
          }
        }, { exclusive: true });
        readyTimer = setTimeout(() => finish(hata('document-timeout')), SINIR.hazir);
        poll();
      })().catch(error => { if (!done) finish(hata(error?.code === 'document-busy' ? error.code : 'document-worker')); });
    });
  }
  const api = Object.freeze({ SINIR, destekli, donustur });
  globalThis.UHD = { ...(globalThis.UHD || {}), belgePdf: api };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
