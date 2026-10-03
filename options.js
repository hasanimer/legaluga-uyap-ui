// Ayarlar sayfası (chrome://extensions → Ayrıntılar → Uzantı seçenekleri ya da popup'taki Ayarlar). Popup'tan ayrı bir
// sekmede açılır: "Yedekten yükle" dosya seçimi popup kapanınca kaybolmaz.
const { mountUI, requestUpdate, requestCbs, stopUpdateAll } = UHD;

const ui = mountUI(document.getElementById('app'), {
  mode: 'options',
  onOpen: () => {},
  onSetupConnection: request => chrome.runtime.sendMessage({ type: 'uhd-setup-connection', ...request }),
  onSetupOpenUyap: () => chrome.runtime.sendMessage({ type: 'uhd-setup-open' }),
  onSetupScan: () => chrome.runtime.sendMessage({ type: 'uhd-setup-scan' }),
  onUpdate: full => requestUpdate(ui, full, () => ui.setNotice('UYAP’ta açık sekme yok. UYAP’a giriş yapıp paneldeki Güncelle’ye basın.', 'err')),
  onCbsDirectory: ilKodu => requestCbs({ type: 'uhd-cbs-directory', ilKodu }),
  onCbsScan: scope => requestCbs({ type: 'uhd-cbs-scan', scope }),
  onStop: stopUpdateAll
});
