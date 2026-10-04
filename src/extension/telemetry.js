// Ham hata metni, UYAP yanıtı ve sayfa adresi bu sınırdan dışarı çıkmaz.
(() => {
  if (globalThis.UHDReporter) return;
  const FILES = new Set(['background.js', 'common.js', 'content.js', 'popup.js', 'options.js', 'onboarding.js', 'tabs.js', 'ui.js', 'udf.js', 'tiff.js']);
  const TYPES = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'DOMException', 'Fatal', 'UdfHatasi', 'TiffHatasi']);
  const CODES = new Set(['PRTL_GNL_100026', 'PRTL_GNL_100063', 'giris-sayfasi', 'baska-oturum', 'safahat-art-arda']);
  const OPERATIONS = Object.freeze({
    unhandled: 'Beklenmeyen uzantı hatası', scheduled: 'Zamanlı işlem hatası',
    update: 'Güncelleme hatası', 'file-open': 'Dosya açma hatası', 'evrak-open': 'Evrak açma hatası',
    safahat: 'Safahat görüntüleme hatası', ozet: 'Dosya özeti hatası',
    udf: 'UDF görüntüleme hatası', tiff: 'TIFF görüntüleme hatası', html: 'HTML evrak görüntüleme hatası', storage: 'Yerel depolama hatası',
    session: 'Oturum denetimi hatası', test: 'Legaluga Sentry kurulum testi'
  });
  const SOURCES = new Set(['background', 'popup', 'content']);
  const source = typeof document === 'undefined' ? 'background' : location.protocol === 'chrome-extension:' ? 'popup' : 'content';
  const prefix = chrome.runtime.getURL('');
  let sender = null;
  const safeInteger = n => Number.isInteger(n) && n > 0 && n < 1000000;
  function cleanFrame(frame) {
    if (!frame || !FILES.has(frame.file) || !safeInteger(frame.line)) return null;
    const out = { file: frame.file, line: frame.line };
    if (safeInteger(frame.column)) out.column = frame.column;
    return out;
  }
  function framesOf(stack) {
    const out = [];
    for (const line of String(stack || '').slice(0, 12000).split('\n').slice(1, 30)) {
      const start = line.indexOf(prefix);
      if (start < 0) continue;
      const match = /^([^/?#:]+\.js):(\d+):(\d+)/.exec(line.slice(start + prefix.length));
      if (!match) continue;
      const frame = cleanFrame({ file: match[1], line: Number(match[2]), column: Number(match[3]) });
      if (frame) out.push(frame);
    }
    return out.slice(-10).reverse();
  }
  function normalize(value) {
    if (!value || !Object.hasOwn(OPERATIONS, value.operation) || !SOURCES.has(value.source)) return null;
    const out = { operation: value.operation, source: value.source, type: TYPES.has(value.type) ? value.type : 'Error' };
    if (CODES.has(value.code)) out.code = value.code;
    if (Number.isInteger(value.status) && value.status >= 400 && value.status <= 599) out.status = value.status;
    const uyapCode = String(value.uyapCode || '');
    if (/^[A-Z0-9_]{1,60}$/i.test(uyapCode)) out.uyapCode = uyapCode;
    out.frames = (Array.isArray(value.frames) ? value.frames.slice(0, 10) : []).map(cleanFrame).filter(Boolean);
    return out;
  }
  function toSentryEvent(value) {
    const report = normalize(value);
    if (!report) return null;
    const tags = { operation: report.operation, source: report.source };
    if (report.code) tags.code = report.code;
    if (report.status) tags.http_status = String(report.status);
    if (report.uyapCode) tags.uyap_code = report.uyapCode;
    const exception = { type: report.type, value: OPERATIONS[report.operation] };
    if (report.frames.length) exception.stacktrace = { frames: report.frames.map(f => ({
      filename: 'app:///' + f.file, lineno: f.line, ...(f.column ? { colno: f.column } : {}), in_app: true
    })) };
    const top = report.frames.at(-1);
    return { level: report.operation === 'test' ? 'info' : 'error', tags, exception: { values: [exception] },
      fingerprint: [report.operation, report.type, report.code || '', String(report.status || ''), report.uyapCode || '', top ? `${top.file}:${top.line}` : ''] };
  }
  function report(error, operation = 'unhandled') {
    try {
      if (!error || ['AbortError', 'Stopped', 'Superseded', 'Blocked'].includes(error.name) ||
          ['Stopped', 'Superseded', 'Blocked'].includes(error.constructor?.name) ||
          /extension context invalidated|context invalidated|Zamanl[ıi] i[şs]lem hatas[ıi]/i.test(String(error.message || '')) ||
          (error.name === 'Fatal' && (error.status === 401 || error.status === 403)) ||
          // UYAP'tan gelen beklenen hatalar (ağ, HTTP, bakım sayfası, UYAP hata yanıtı) eklenti hatası sayılmaz.
          error.uyap === true) return;
      const value = normalize({ operation, source, type: error.name, code: error.code, status: error.status, uyapCode: error.uyapCode, frames: framesOf(error.stack) });
      if (!value) return;
      const task = sender ? sender(value) : chrome.runtime.sendMessage({ type: 'uhd-error-report', report: value });
      Promise.resolve(task).catch(() => {}); // raporlama hatası kullanıcı işlemini kesmez
    } catch { /* geçersizleşen uzantı bağlamında raporlama da durur */ }
  }
  globalThis.UHDReporter = { report, normalize, toSentryEvent, setSender(fn) { sender = fn; } };
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('error', event => {
      if (framesOf(event.error?.stack).length) report(event.error);
    });
    globalThis.addEventListener('unhandledrejection', event => {
      if (framesOf(event.reason?.stack).length) report(event.reason);
    });
  }
})();
