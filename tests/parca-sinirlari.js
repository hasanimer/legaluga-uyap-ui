// Parça sınırı kuralı: content.js, common.js ve background.js'i oluşturan her .part dosyası tek başına ya da bir fonksiyon
// gövdesi olarak ("(function(){\n" + parça + "\n})"; async sarmalı da) derlenir ve satır sonuyla biter. Gövde hem ifade hem
// bildirim sarmalında ("function __parca(){\n" + parça + "\n}") derlenmeli: ifade sarmalı tek başına bir geri çağrıyı kapatıp
// ötekini açan parçayı ("});\nx.on('y', () => {\n") geçirir. Böylece sınır çoğu deyim ya da ifade ortasından geçemez ve
// birleşik dosyanın her satırı tek parçaya aittir. tests/parca-sinirlari.test.js açık parçaları, özel depodaki test bütün
// parçaları bu modülle denetler. Bugünkü istisnalar parça yoluyla ve ihlal türüyle durur; liste yalnız kısalır: artık kurala
// uyan ya da bulunmayan parça listede kalırsa test kırmızıdır.
const vm = require('node:vm');

const DERLENMEZ = 'derlenmez', SATIR_SONU_YOK = 'satır sonu yok';
// Seçeneklerden birinin bütün sarmallarıyla derlenen parça kurala uyar.
const SECENEKLER = [
  [['', '']],
  [['(function(){\n', '\n})'], ['function __parca(){\n', '\n}']],
  [['(async function(){\n', '\n})'], ['async function __parca(){\n', '\n}']]
];

const derlenir = metin => SECENEKLER.some(sarmallar => sarmallar.every(([once, sonra]) => {
  try { new vm.Script(once + metin + sonra); return true; } catch { return false; }
}));

// Parçanın kurala aykırı yanları; uyan parça için boş dizi.
function ihlaller(metin) {
  return [...(derlenir(metin) ? [] : [DERLENMEZ]), ...(metin.endsWith('\n') ? [] : [SATIR_SONU_YOK])];
}

// bulunan ve istisnalar: { 'parça yolu': [tür, ...] }. yeni: istisnada olmayan ihlal; fazla: artık bulunmayan istisna.
function karsilastir(bulunan, istisnalar) {
  const fark = (a, b) => Object.entries(a).flatMap(([yol, turler]) => turler.filter(t => !b[yol]?.includes(t)).map(t => `${yol}: ${t}`));
  return { yeni: fark(bulunan, istisnalar), fazla: fark(istisnalar, bulunan) };
}

// Açık parçaların bugünkü istisnaları (yol ui/ köküne göre). Parça birleştirmek ya da yeniden adlandırmak listeyi de günceller.
const ACIK_ISTISNALAR = Object.freeze({
  // content.js
  'src/fragments/content/001-bootstrap-shared-request-safety.js.part': ['derlenmez'],
  'src/fragments/content/005-context-invalidation-and-progress-boundaries.js.part': ['derlenmez'],
  'src/fragments/content/007-setup-profile-DOM-boundary.js.part': ['satır sonu yok'],
  'src/fragments/content/009-explicit-scan-stop-and-owner-guards.js.part': ['satır sonu yok'],
  'src/fragments/content/017-native-window-navigation-and-identity-guards.js.part': ['satır sonu yok'],
  'src/fragments/content/019-native-window-navigation-and-identity-guards.js.part': ['satır sonu yok'],
  'src/fragments/content/029-overview-safahat-notes-and-safe-document-rendering.js.part': ['derlenmez'],
  'src/fragments/content/033-overview-safahat-notes-and-safe-document-rendering.js.part': ['derlenmez'],
  'src/fragments/content/037-overview-safahat-notes-and-safe-document-rendering.js.part': ['derlenmez'],
  'src/fragments/content/039-full-viewer-HTML-render-and-action-controls.js.part': ['derlenmez'],
  'src/fragments/content/041-full-viewer-HTML-render-and-action-controls.js.part': ['satır sonu yok'],
  'src/fragments/content/043-full-viewer-HTML-render-and-action-controls.js.part': ['derlenmez'],
  'src/fragments/content/046-original-document-download-and-package-start-controls.js.part': ['derlenmez'],
  'src/fragments/content/050-package-frame-and-start-action-controls.js.part': ['derlenmez'],
  'src/fragments/content/069-bank-click-abort-and-UI-boundary.js.part': ['derlenmez'],
  'src/fragments/content/079-bank-error-and-finish-UI-boundary.js.part': ['derlenmez'],
  'src/fragments/content/087-full-viewer-HTML-render-and-action-controls.js.part': ['satır sonu yok'],
  'src/fragments/content/095-full-viewer-HTML-render-and-action-controls.js.part': ['satır sonu yok'],
  'src/fragments/content/105-viewer-document-load-and-list-ready.js.part': ['derlenmez'],
  'src/fragments/content/118-viewer-list-loading-retry-and-error-controls.js.part': ['derlenmez'],
  'src/fragments/content/123-panel-command-action-boundary.js.part': ['satır sonu yok'],
  'src/fragments/content/125-panel-ready-message-boundary.js.part': ['satır sonu yok'],
  'src/fragments/content/129-session-protection-lifecycle-and-visible-safety-gates.js.part': ['derlenmez'],
  // common.js
  'src/fragments/common/001.js.part': ['derlenmez'],
  'src/fragments/common/015.js.part': ['derlenmez'],
  // background.js
  'src/fragments/background/002.js.part': ['derlenmez', 'satır sonu yok'],
  'src/fragments/background/004.js.part': ['derlenmez', 'satır sonu yok'],
  'src/fragments/background/006.js.part': ['derlenmez', 'satır sonu yok'],
  'src/fragments/background/008.js.part': ['derlenmez'],
  'src/fragments/background/011.js.part': ['derlenmez'],
  'src/fragments/background/013.js.part': ['derlenmez'],
  'src/fragments/background/017.js.part': ['derlenmez'],
  'src/fragments/background/019.js.part': ['derlenmez'],
  'src/fragments/background/023.js.part': ['derlenmez'],
  'src/fragments/background/029.js.part': ['derlenmez']
});

module.exports = { DERLENMEZ, SATIR_SONU_YOK, ihlaller, karsilastir, ACIK_ISTISNALAR };
