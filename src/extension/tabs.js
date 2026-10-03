// Eklenti sayfaları (araç çubuğu popup'ı ve Ayarlar sayfası) için UYAP sekmesi yardımcıları. Dosya açma, güncelleme
// ve panel UYAP sekmesinde, oradaki içerik betiğiyle yürür; bu sayfalar yalnız istek iletir.
(() => {
  const { ORIGIN } = globalThis.UHD;
  const UYAP_MATCH = ORIGIN + '/*';

  // Etkin sekme UYAP'taysa o; değilse en son kullanılan UYAP sekmesi.
  async function uyapTab() {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active && active.url && active.url.startsWith(ORIGIN + '/')) return active;
    const tabs = await chrome.tabs.query({ url: UYAP_MATCH });
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return tabs[0] || null;
  }

  // Sekmeye geçiş her zaman son adımdır: Chrome sekme ya da pencere değişince popup'ı hemen kapatır, sonraki çağrılar
  // yarıda kalır. Geçişi arka plan betiği yapar; popup kapansa da tamamlanır. url verilirse sekme o adrese de gider.
  function focusTab(tab, url) {
    return chrome.runtime.sendMessage({ type: 'uhd-focus-tab', tabId: tab.id, windowId: tab.windowId, url }).catch(() => {});
  }

  // Sekme eklenti yüklenmeden (ya da yenilenmeden) önce açılmışsa içerik betiği yoktur.
  function unresponsive(ui, tab) {
    ui.setNotice('UYAP sekmesi eklentiye yanıt vermedi. Sekmeyi yenileyip tekrar deneyin.', 'err', {
      label: 'Sekmeyi yenile',
      fn: () => chrome.tabs.reload(tab.id)
    });
  }

  async function requestUpdate(ui, full, onNoTab) {
    const tab = await uyapTab();
    if (!tab) return onNoTab();
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'uhd-update', full });
      if (!res || !res.ok) ui.setNotice((res && res.error) || 'Güncelleme başlatılamadı.', 'err');
      else ui.setNotice('Güncelleme UYAP sekmesinde sürüyor; ilerlemesi oradaki panelin altında görünür. UYAP sekmesi kapanırsa kaldığı yerden sürer.');
    } catch {
      unresponsive(ui, tab);
    }
  }

  async function stopUpdateAll() {
    await chrome.runtime.sendMessage({ type: 'uhd-setup-cancel' }).catch(() => {});
    const tabs = await chrome.tabs.query({ url: UYAP_MATCH });
    await Promise.all(tabs.map(t => chrome.tabs.sendMessage(t.id, { type: 'uhd-stop' }).catch(() => {})));
  }

  async function requestCbs(msg) {
    const tab = await uyapTab();
    if (!tab) return { ok: false, error: 'UYAP’ta açık sekme yok. UYAP’a giriş yapıp tekrar deneyin.' };
    try {
      return (await chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 })) || { ok: false, error: 'UYAP sekmesi yanıt vermedi. Sekmeyi yenileyip tekrar deneyin.' };
    } catch { return { ok: false, error: 'UYAP sekmesi yanıt vermedi. Sekmeyi yenileyip tekrar deneyin.' }; }
  }

  Object.assign(globalThis.UHD, { uyapTab, focusTab, unresponsive, requestUpdate, requestCbs, stopUpdateAll });
})();
