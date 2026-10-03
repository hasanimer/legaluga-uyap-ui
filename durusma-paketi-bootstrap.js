// İframe içinde saklanan 256-bit anahtar, sayfa DOM'unda veya URL'de bulunmaz.
(() => {
  const sessionId = location.hash.slice(1);
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) return;
  const secret = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
  const parentOrigin = 'https://avukat.uyap.gov.tr';
  let connected = false;
  function receive(event) {
    if (connected || event.source !== parent || event.origin !== parentOrigin ||
        event.data?.type !== 'uhd-hearing-connect' || event.data.sessionId !== sessionId ||
        event.data.secret !== secret || event.ports.length !== 1) return;
    const port = event.ports[0];
    connected = true;
    window.removeEventListener('message', receive);
    clearInterval(retryTimer);
    port.postMessage({ type: 'ACK', sessionId });
    globalThis.UHD.durusmaPaketiUI.connect({
      sessionId,
      send: (message, transfer) => port.postMessage(message, transfer || []),
      on: handler => { port.onmessage = e => handler(e.data); port.start(); },
      close: () => port.close()
    });
  }
  window.addEventListener('message', receive);
  let attempts = 0;
  const request = () => {
    if (connected || ++attempts > 5) {
      clearInterval(retryTimer);
      if (!connected) document.getElementById('baglanti').textContent = 'Güvenli bağlantı kurulamadı. Paketi kapatıp tekrar açın.';
      return;
    }
    chrome.runtime.sendMessage({ type: 'uhd-hearing-channel', sessionId, secret }).catch(() => {});
  };
  const retryTimer = setInterval(request, 2500);
  request();
})();
