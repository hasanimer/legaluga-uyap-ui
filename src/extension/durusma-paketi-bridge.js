// Content script tarafında yalnız beklenen uzantı iframe'ine tek MessagePort açar.
(() => {
  let expected = null;
  const extensionOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type !== 'uhd-hearing-secret') return;
    const current = expected;
    if (!current || sender.id !== chrome.runtime.id || msg.sessionId !== current.sessionId ||
        !/^[0-9a-f]{64}$/.test(msg.secret) || !current.iframe.isConnected ||
        current.iframe.contentWindow !== current.window || current.port || current.pending) { reply({ ok: false }); return; }
    const channel = new MessageChannel();
    current.pending = channel.port1;
    const reset = () => { clearTimeout(current.timer); current.pending?.close(); current.pending = null; };
    current.timer = setTimeout(reset, 2000);
    channel.port1.onmessage = event => {
      if (event.data?.type !== 'ACK' || event.data.sessionId !== current.sessionId || current.closed) return;
      clearTimeout(current.timer); current.pending = null; current.port = channel.port1;
      current.port.onmessage = message => current.onMessage(message.data);
      current.port.onmessageerror = () => current.close();
    };
    channel.port1.start();
    try {
      current.window.postMessage({ type: 'uhd-hearing-connect', sessionId: current.sessionId, secret: msg.secret },
        extensionOrigin, [channel.port2]);
      reply({ ok: true });
    } catch {
      reset(); reply({ ok: false });
    }
  });
  function create(iframe, onMessage) {
    if (expected) expected.close();
    const sessionId = crypto.randomUUID();
    const current = {
      iframe, sessionId, onMessage, port: null, pending: null, timer: null, window: null, closed: false,
      send(message, transfer = []) {
        if (!current.closed && current.port) current.port.postMessage({ ...message, sessionId }, transfer);
      },
      close() {
        if (current.closed) return;
        current.closed = true; clearTimeout(current.timer); current.pending?.close(); current.port?.close();
        current.pending = null; current.port = null;
        if (expected === current) expected = null;
      }
    };
    expected = current;
    iframe.src = chrome.runtime.getURL('durusma-paketi.html') + '#' + sessionId;
    current.window = iframe.contentWindow;
    return current;
  }
  globalThis.UHD = { ...(globalThis.UHD || {}), durusmaPaketiBridge: { create } };
})();
