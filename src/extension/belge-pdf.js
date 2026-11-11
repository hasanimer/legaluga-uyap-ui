/* global module */
// Tek evrak PDF'i yerel uzantı çerçevesinde hazırlanır. Özgün Blob değişmez; baytların kopyası aktarılır.
(() => {
  'use strict';
  if (globalThis.UHD?.belgePdf) return;
  const SINIR = Object.freeze({ kaynak: 64 * 1024 * 1024, udf: 40 * 1024 * 1024, sonuc: 128 * 1024 * 1024, hazir: 20000, sure: 125000, yokla: 400 });
  const FORMAT = new Set(['udf', 'tiff', 'tif', 'png', 'jpg', 'jpeg', 'html', 'htm', 'xml', 'txt', 'text']);
  const format = ext => typeof ext === 'string' ? ext.toLowerCase().replace(/^\./, '') : '';
  const destekli = ext => FORMAT.has(format(ext));
  // İletiler yalnız nedeni söyler; özgün evrakı indirme önerisini görüntüleyici görünen düğmeye göre ekler.
  const ILETI = {
    'document-busy': 'Başka bir belge işlemi sürüyor. Tamamlanınca PDF indirmeyi tekrar deneyin.',
    'document-stopped': 'PDF dönüşümü başka bir belge işlemi nedeniyle durdu.',
    'document-invalid': 'PDF dönüşümü için evrak geçersiz.',
    'document-worker': 'PDF dönüştürücü başlatılamadı.',
    'document-convert': 'Evrak PDF’e dönüştürülemedi.',
    'document-runtime': 'Tarayıcınız bu dönüşüm için gereken özelliği desteklemiyor.',
    'document-connect': 'PDF dönüştürücüye bağlanılamadı. Sayfayı yenileyip tekrar deneyin.',
    'document-context': 'Eklenti yeniden yüklendiği için PDF dönüştürücü açılamadı. Sayfayı yenileyip tekrar deneyin.',
    'source-limit': 'Evrak PDF dönüşümü için çok büyük (64 MB üstü).',
    'output-limit': 'PDF çıktısı geçersiz veya çok büyük.',
    'page-limit': 'PDF sayfa sınırı aşıldı.',
    'document-timeout': 'PDF dönüşümü süre sınırını aştı.',
    cancelled: 'PDF dönüşümü durduruldu.',
    'format-unsupported': 'Bu evrak türü PDF’e dönüştürülemiyor.',
    'udf-size': 'UDF 40 MB sınırını aşıyor.',
    'udf-zip': 'UDF paketi açılamadı; dosya bozuk ya da UDF değil.',
    'udf-xml': 'UDF’deki belge içeriği okunamadı.',
    'udf-timeout': 'UDF’nin okunması süre sınırını aştı. Tekrar deneyin.',
    'udf-incomplete': 'UDF içeriği eksiksiz çözülemedi.',
    'udf-unsupported': 'Bu UDF’nin düzeni henüz PDF’e aktarılamıyor.',
    'udf-profile': 'UDF düzeni bu PDF dönüştürücüsünde desteklenmiyor.',
    'udf-glyph': 'UDF’de PDF yazı tipinde bulunmayan bir karakter var.',
    'udf-control': 'UDF metninde desteklenmeyen bir denetim karakteri var.',
    'udf-line': 'UDF’de satıra sığmayan uzun bir sözcük var.',
    'udf-overflow': 'UDF satırı metin alanından taşıyor.',
    'udf-font': 'UDF için gereken yazı tipi yüklenemedi.',
    'udf-font-symbol': 'UDF’de simge yazı tipi (ör. Symbol, Wingdings) var; simgeler PDF’e doğru aktarılamıyor.',
    'udf-indent': 'UDF girintisi metin alanını kapatıyor.',
    'udf-line-height': 'UDF satırı sayfaya sığmıyor.',
    'udf-page-limit': 'UDF 300 sayfa sınırını aşıyor.',
    'udf-budget': 'UDF metin ya da öğe sınırını aşıyor.',
    'udf-model': 'UDF modeli geçersiz.',
    'udf-page': 'UDF sayfa ölçüleri geçersiz.',
    'udf-text-loss': 'UDF metni PDF’e eksiksiz aktarılamadı.',
    'udf-image': 'UDF’deki bir resim PDF’e aktarılamadı.',
    'image-load': 'Resim açılamadı ya da bozuk.',
    'image-limit': 'Resim çözünürlüğü ya da bellek sınırı aşıldı.',
    'tiff-incomplete': 'TIFF’in tüm sayfaları eksiksiz dönüştürülemedi.',
    'tiff-memory': 'TIFF çalışma belleği sınırını aşıyor.',
    'tiff-limit': 'TIFF sayfa ya da boyut sınırını aşıyor.',
    'text-limit': 'Evrak metni eksiksiz okunamadı.',
    'text-convert': 'Evrak metni PDF’e çevrilemedi.',
    'metin-bos': 'Evrakta aktarılacak metin yok.'
  };
  // Çerçeveden gelen neden kodları yalnız bu sözlükteki Türkçe adlara çevrilir; bilinmeyen kod atılır.
  const NEDEN = {
    table: 'tablo', image: 'resim', header: 'üst bilgi', footer: 'alt bilgi', watermark: 'filigran',
    template: 'şablon alanı', tab: 'sekme', 'tab-stop': 'sekme durağı', element: 'tanınmayan öğe',
    attribute: 'tanınmayan biçim özelliği', background: 'yazı zemini', color: 'yazı rengi',
    'font-style': 'yazı boyutu ya da biçimi', style: 'yazı stili', paragraph: 'paragraf düzeni', page: 'sayfa ölçüsü',
    format: 'biçim sürümü', list: 'liste numaralandırması', truncated: 'okuma sınırı', offset: 'metin konumları', 'unknown-element': 'tanınmayan öğe',
    'image-unreadable': 'okunamayan resim', 'package-entry': 'ek paket girdisi', 'uncovered-text': 'gösterilmeyen metin',
    limit: 'denetim sınırı'
  };
  const liste = adlar => adlar.length > 1 ? `${adlar.slice(0, -1).join(', ')} ve ${adlar.at(-1)}` : adlar[0];
  // Tek cümle: düzen nedenleri "Bu UDF’deki tablo ve sekme ...", içerik kaybı ise genel iletiye ayraç içinde eklenir.
  function hata(code, reasons) {
    const nedenler = [...new Set((Array.isArray(reasons) ? reasons : [])
      .filter(x => typeof x === 'string' && /^[a-z][a-z-]{0,31}$/.test(x) && Object.hasOwn(NEDEN, x)))].slice(0, 5);
    const adlar = [...new Set(nedenler.map(x => NEDEN[x]))];
    let ileti = Object.hasOwn(ILETI, code) ? ILETI[code] : 'PDF oluşturulamadı.';
    if (adlar.length && code === 'udf-unsupported') ileti = `Bu UDF’deki ${liste(adlar)} henüz PDF’e aktarılamıyor.`;
    else if (adlar.length && code === 'udf-incomplete') ileti = `UDF içeriği eksiksiz çözülemedi (${liste(adlar)}).`;
    return Object.assign(new Error(ileti), { code }, nedenler.length ? { reasons: nedenler } : {});
  }
  let active = null;
  // Eklenti yeniden yüklenince ya da güncellenince bu sayfadaki bağlam kopar (chrome.runtime.id kalmaz).
  const uzantiBagli = () => { try { return !!globalThis.chrome?.runtime?.id; } catch { return false; } };

  // model/diagnostics önizleme kapsamında sınırlı olabilir; UDF her zaman çerçevede paket:true ile yeniden okunur.
  function donustur({ blob, ext, signal, title = 'Evrak', container } = {}) {
    if (signal?.aborted) return Promise.reject(new DOMException('Durduruldu.', 'AbortError'));
    if (active) return Promise.reject(hata('document-busy'));
    if (!destekli(ext)) return Promise.reject(hata('format-unsupported'));
    if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isSafeInteger(blob.size) || blob.size < 1 || typeof container?.append !== 'function')
      return Promise.reject(hata('document-invalid'));
    // Çerçevedeki UDF okuyucusu 40 MB üstünü zaten reddeder; köprü açılmadan somut nedenle döner.
    if (format(ext) === 'udf' && blob.size > SINIR.udf) return Promise.reject(hata('udf-size'));
    if (blob.size > SINIR.kaynak) return Promise.reject(hata('source-limit'));
    if (!uzantiBagli()) return Promise.reject(hata('document-context'));
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
            if (message.code) { finish(hata(/^[a-z][a-z0-9-]{0,40}$/.test(message.code) ? message.code : 'document-convert', message.reasons)); return; }
            const output = message.bytes;
            const prefix = output instanceof ArrayBuffer && output.byteLength >= 5 ? new Uint8Array(output, 0, 5) : null;
            if (!prefix || output.byteLength > SINIR.sonuc || ![37, 80, 68, 70, 45].every((n, i) => prefix[i] === n)) { finish(hata('output-limit')); return; }
            finish(null, { bytes: output, warnings: (Array.isArray(message.warnings) ? message.warnings : []).filter(x => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 500)) });
          }
        }, { exclusive: true });
        // El sıkışma süresi dönüşüm süresi değildir: çerçeve hiç bağlanmadıysa yenileme önerilir.
        readyTimer = setTimeout(() => finish(hata(uzantiBagli() ? 'document-connect' : 'document-context')), SINIR.hazir);
        poll();
      })().catch(error => {
        if (!done) finish(hata(error?.code === 'document-busy' ? error.code : uzantiBagli() ? 'document-worker' : 'document-context'));
      });
    });
  }
  const api = Object.freeze({ SINIR, destekli, donustur });
  globalThis.UHD = { ...(globalThis.UHD || {}), belgePdf: api };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
