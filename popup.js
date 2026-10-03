// Araç çubuğu popup'ı: UYAP dışındayken hızlı bakış (ara, dosyayı UYAP'ta aç; duruşma ve yeni evrak özeti). UYAP
// sekmesinde simge popup yerine sayfadaki paneli açar (background.js); popup orada yalnız panel yanıt vermezse görünür.
const { ORIGIN, openPath, mountUI, uyapTab, focusTab, unresponsive, requestUpdate, stopUpdateAll } = UHD;

// UYAP sekmesi yoksa: UYAP açılır; istenen dosya ya da görünüm giriş yapıldıktan sonra kendiliğinden açılır (3 dk içinde).
function noTab(pending) {
  const ne = pending ? (pending.record ? 'dosya' : 'panel') : null;
  ui.setNotice(ne
    ? `UYAP’ta açık sekme yok. “UYAP’ı aç”a basın; giriş yaptığınızda ${ne} kendiliğinden açılır.`
    : 'UYAP’ta açık sekme yok. “UYAP’ı aç”a basıp giriş yapın; sonra tekrar deneyin.', 'err', {
    label: 'UYAP’ı aç',
    fn: async () => {
      if (pending) await chrome.storage.local.set({ uhdPending: { ...pending, at: Date.now() } });
      await chrome.tabs.create({ url: ORIGIN + (pending && pending.record ? openPath(pending.record) : '/') });
      window.close();
    }
  });
}

// Önce istek gönderilir, sekmeye en son geçilir (focusTab): popup sekme değişince kapanır.
async function ask(tab, msg) {
  try { return !!(await chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 }))?.ok; } catch { return false; }
}

async function openRecord(rec) {
  const tab = await uyapTab();
  if (!tab) return noTab({ record: rec });
  if (await ask(tab, { type: 'uhd-open', record: rec })) await focusTab(tab);
  else {
    // Sekme eklenti yüklenmeden önce açılmışsa içerik betiği yoktur: sayfa dosya sorgulama adresine gider, dosya orada açılır.
    await chrome.storage.local.set({ uhdPending: { record: rec, at: Date.now() } });
    await focusTab(tab, ORIGIN + openPath(rec));
  }
  window.close();
}

// Özet satırı (duruşmalar, yeni evrak): UYAP sekmesindeki panel o görünümde açılır.
async function openView(view) {
  const tab = await uyapTab();
  if (!tab) return noTab({ type: 'view', view });
  if (!(await ask(tab, { type: 'uhd-panel', action: 'view', view }))) return unresponsive(ui, tab);   // popup açık, ileti görünür
  await focusTab(tab);
  window.close();
}

const ui = mountUI(document.getElementById('app'), {
  mode: 'popup',
  onOpen: openRecord,
  onView: openView,
  onSettings: () => chrome.runtime.openOptionsPage().finally(() => window.close()),
  onSetupConnection: request => chrome.runtime.sendMessage({ type: 'uhd-setup-connection', ...request }),
  onSetupOpenUyap: () => chrome.runtime.sendMessage({ type: 'uhd-setup-open' }),
  onSetupScan: () => chrome.runtime.sendMessage({ type: 'uhd-setup-scan' }),
  onUpdate: full => requestUpdate(ui, full, () => noTab()),
  onStop: stopUpdateAll
});

// Arama metni müvekkil adı içerebileceği için saklanmaz; önceki sürümden kalan kaydı da sil.
try { localStorage.removeItem('uhd-q'); } catch {}
setTimeout(() => ui.focus(), 50);
