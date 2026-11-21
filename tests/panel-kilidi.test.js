const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/extension/panel-kilidi.js'), 'utf8');

// Sayfa taklidi: giriş bayrağı ve yol değiştirilir, DOM değişikliği/popstate/storage olayı elle tetiklenir, zamanlayıcı elle akar.
function harness({ yol = '/', bayrak = 'true', panelAcik = false, ekranAcik = false } = {}) {
  const sayfa = { yol, bayrak, panelAcik, ekranAcik, aktif: true, depoHatasi: false };
  const olaylar = new Map(), zamanlayicilar = [], gozlemciler = [], cagrilar = [];
  let geriDonusIzni = true;
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const kilit = context.UHDPanelKilidi.izle({
    document: { documentElement: { synthetic: true } },
    window: { addEventListener: (ad, fn) => olaylar.set(ad, fn) },
    MutationObserver: class { constructor(fn) { this.fn = fn; gozlemciler.push(this); } observe(hedef, secenek) { this.hedef = hedef; this.secenek = secenek; } },
    setTimeout: (fn, ms) => { zamanlayicilar.push({ fn, ms }); },
    localStorage: { getItem: key => { if (sayfa.depoHatasi) throw new Error('erişim yok'); return key === 'loginState' ? sayfa.bayrak : null; } },
    girisSayfasi: () => /^\/(giris|cikis)(\/|$)/.test(sayfa.yol),
    aktif: () => sayfa.aktif,
    panelAcik: () => sayfa.panelAcik,
    gizle: () => { cagrilar.push('gizle'); sayfa.panelAcik = false; sayfa.ekranAcik = false; },
    kilitlenince: () => { cagrilar.push('kilitlenince'); },
    kilitAcilinca: () => { cagrilar.push('kilitAcilinca'); },
    geriGetir: () => { cagrilar.push('geriGetir'); if (geriDonusIzni) sayfa.panelAcik = true; }
  });
  const akit = () => { while (zamanlayicilar.length) zamanlayicilar.shift().fn(); };
  return { sayfa, olaylar, zamanlayicilar, gozlemciler, cagrilar, kilit, akit,
    degisti() { gozlemciler[0].fn([]); }, geriDonusuEngelle() { geriDonusIzni = false; } };
}

test('oturum yokken (giriş sayfası, kapalı ya da okunamayan giriş bayrağı) panel kilitli sayılır', () => {
  const h = harness();
  assert.equal(h.kilit.kilitli(), false, 'açık oturumda kilit yok');
  for (const yol of ['/giris', '/giris/e-imza', '/cikis']) {
    h.sayfa.yol = yol;
    assert.equal(h.kilit.kilitli(), true, yol);
  }
  h.sayfa.yol = '/';
  for (const bayrak of [null, 'false', '', 'undefined']) {
    h.sayfa.bayrak = bayrak;
    assert.equal(h.kilit.kilitli(), true, String(bayrak));
  }
  h.sayfa.bayrak = 'true'; h.sayfa.depoHatasi = true;
  assert.equal(h.kilit.kilitli(), true, 'bayrak okunamazsa güvenli tarafta kalınır');
});

test('giriş sayfasında açılan izleyici paneli ve dosya ekranını hemen gizler', () => {
  const h = harness({ yol: '/giris', panelAcik: true, ekranAcik: true });
  assert.equal(h.gozlemciler.length, 1);
  assert.equal(h.gozlemciler[0].secenek.subtree, true, 'sayfa ağacı izlenir');
  h.akit();
  assert.deepEqual(h.cagrilar, ['kilitlenince', 'gizle']);
  assert.equal(h.sayfa.panelAcik, false);
  assert.equal(h.sayfa.ekranAcik, false);
});

test('açık oturumda izleyici panele dokunmaz', () => {
  const h = harness({ panelAcik: true });
  h.akit(); h.degisti(); h.akit();
  assert.deepEqual(h.cagrilar, []);
  assert.equal(h.sayfa.panelAcik, true);
});

test('oturum düşünce (SPA yönlenmesi, çıkış, başka sekmede kapanma) açık panel gizlenir', () => {
  for (const tetik of ['mutation', 'popstate', 'storage']) {
    const h = harness({ panelAcik: true });
    h.akit();
    if (tetik === 'mutation') { h.sayfa.yol = '/giris'; h.degisti(); }
    if (tetik === 'popstate') { h.sayfa.yol = '/cikis'; h.olaylar.get('popstate')(); }
    if (tetik === 'storage') { h.sayfa.bayrak = 'false'; h.olaylar.get('storage')({ key: 'loginState' }); }
    h.akit();
    assert.deepEqual(h.cagrilar, ['kilitlenince', 'gizle'], tetik);
    assert.equal(h.sayfa.panelAcik, false, tetik);
  }
});

test('ilgisiz storage anahtarı denetim başlatmaz; temizleme (key null) başlatır', () => {
  const h = harness({ panelAcik: true });
  h.akit();
  h.sayfa.bayrak = 'false';
  h.olaylar.get('storage')({ key: 'baskaAnahtar' });
  assert.equal(h.zamanlayicilar.length, 0);
  h.olaylar.get('storage')({ key: null });
  h.akit();
  assert.deepEqual(h.cagrilar, ['kilitlenince', 'gizle']);
});

test('art arda değişiklikler tek denetimde toplanır', () => {
  const h = harness();
  h.akit();
  h.sayfa.yol = '/giris';
  for (let i = 0; i < 25; i++) h.degisti();
  h.olaylar.get('popstate')();
  assert.equal(h.zamanlayicilar.length, 1);
  assert.ok(h.zamanlayicilar[0].ms > 0 && h.zamanlayicilar[0].ms <= 250);
});

test('kilidin gizlediği panel oturum dönünce geri getirilir; açılınca beklenmez', () => {
  const h = harness({ panelAcik: true });
  h.akit();
  h.sayfa.yol = '/giris'; h.degisti(); h.akit();
  h.sayfa.yol = '/'; h.degisti(); h.akit();
  assert.deepEqual(h.cagrilar, ['kilitlenince', 'gizle', 'kilitAcilinca', 'geriGetir']);
  assert.equal(h.sayfa.panelAcik, true);
  h.degisti(); h.akit();
  assert.deepEqual(h.cagrilar, ['kilitlenince', 'gizle', 'kilitAcilinca', 'geriGetir'], 'panel açılınca geri getirme biter');
});

test('kapalıyken kilitlenen panel oturum dönünce kendiliğinden açılmaz', () => {
  const h = harness({ yol: '/giris' });
  h.akit();
  h.sayfa.yol = '/'; h.degisti(); h.akit();
  assert.ok(!h.cagrilar.includes('geriGetir'));
});

test('geri getirme açılmayan panel için sınırlı sayıda denenir', () => {
  const h = harness({ panelAcik: true });
  h.akit();
  h.sayfa.yol = '/giris'; h.degisti(); h.akit();
  h.geriDonusuEngelle(); h.sayfa.yol = '/';
  for (let i = 0; i < 200; i++) { h.degisti(); h.akit(); }
  const deneme = h.cagrilar.filter(c => c === 'geriGetir').length;
  assert.ok(deneme >= 1 && deneme <= 60, `deneme ${deneme}`);
});

test('eklenti bağlamı kapansa da kilitli sayfada panel ve dosya ekranı gizlenir; geri getirme yapılmaz', () => {
  const h = harness({ panelAcik: true, ekranAcik: true });
  h.akit();
  h.sayfa.aktif = false; h.sayfa.yol = '/giris'; h.degisti(); h.akit();
  assert.deepEqual(h.cagrilar, ['kilitlenince', 'gizle'], 'gizleme yalnız DOM işidir, bağlam gerektirmez');
  assert.equal(h.sayfa.ekranAcik, false);
  h.sayfa.yol = '/'; h.degisti(); h.akit();
  assert.ok(!h.cagrilar.includes('geriGetir'), 'bağlam kapalıyken panel geri getirilmez');
});

test('kilitlenme anı bir kez bildirilir; kilitli kaldıkça gizleme yinelenir, bildirim yinelenmez', () => {
  const h = harness({ yol: '/giris' });
  h.akit();
  for (let i = 0; i < 5; i++) { h.degisti(); h.akit(); }
  assert.equal(h.cagrilar.filter(c => c === 'kilitlenince').length, 1);
  assert.equal(h.cagrilar.filter(c => c === 'gizle').length, 6, 'geç açılan dosya ekranı için her denetimde gizlenir');
  h.sayfa.yol = '/'; h.degisti(); h.akit();
  h.sayfa.yol = '/cikis'; h.degisti(); h.akit();
  assert.equal(h.cagrilar.filter(c => c === 'kilitlenince').length, 2, 'yeni kilitlenme yeniden bildirilir');
});

test('ileti oturum yokken dosya bilgisinin gösterilmediğini söyler; modül iki kez yüklenince ilk tanım kalır', () => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const ilk = context.UHDPanelKilidi;
  assert.match(ilk.ILETI, /giriş/i);
  assert.ok(Object.isFrozen(ilk));
  vm.runInContext(source, context);
  assert.equal(context.UHDPanelKilidi, ilk);
});

// Giriş sayfasında yüklenen betik oturum açılınca (sayfa yenilenmeden tamamlanan giriş) ertelenen işleri bir kez başlatır:
// ör. kilitliyken gösterilmeyen günlük duruşma hatırlatması.
test('kilit açılma anı bir kez bildirilir; hiç kilitlenmemiş sayfada bildirilmez, bağlam kapalıyken de bildirilmez', () => {
  const h = harness({ yol: '/giris' });
  h.akit();
  h.sayfa.yol = '/';
  for (let i = 0; i < 4; i++) { h.degisti(); h.akit(); }
  assert.equal(h.cagrilar.filter(c => c === 'kilitAcilinca').length, 1);

  const acik = harness();
  acik.akit(); acik.degisti(); acik.akit();
  assert.deepEqual(acik.cagrilar, [], 'oturumu açık yüklenen sayfada açılma bildirimi yok');

  const kopuk = harness({ yol: '/giris' });
  kopuk.akit();
  kopuk.sayfa.aktif = false; kopuk.sayfa.yol = '/'; kopuk.degisti(); kopuk.akit();
  assert.ok(!kopuk.cagrilar.includes('kilitAcilinca'));
});
