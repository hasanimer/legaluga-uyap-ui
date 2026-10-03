const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

class Node {
  constructor(tag, attrs, document) {
    this.tag = tag;
    this.attrs = {};
    this.kids = [];
    this.events = {};
    this.document = document;
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === false || value == null) continue;
      if (key.startsWith('on')) this.addEventListener(key.slice(2), value);
      else this.setAttribute(key, value === true ? '' : value);
    }
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key === 'value') this.value = String(value);
    if (key === 'hidden') this.hidden = true;
  }
  append(...kids) {
    for (const child of kids.flat(Infinity).filter(child => child != null && child !== false)) {
      this.kids.push(child);
      if (child instanceof Node) child.parentNode = this;
    }
  }
  replaceChildren(...kids) {
    for (const child of this.kids) if (child instanceof Node) child.parentNode = null;
    this.kids = [];
    this.append(...kids);
  }
  get textContent() { return this.kids.map(child => child instanceof Node ? child.textContent : String(child)).join(''); }
  set textContent(value) { this.replaceChildren(String(value)); }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  async fire(type) {
    if (this.disabled) return;
    const event = { target: this, preventDefault() {} };
    await Promise.all((this.events[type] || []).map(fn => fn(event)));
  }
  async click() {
    if (this.disabled) return;
    if (this.tag === 'input' && this.attrs.type === 'checkbox') { this.checked = !this.checked; await this.fire('change'); }
    await this.fire('click');
  }
  async choose(value) { this.value = value; await this.fire('change'); }
  async fill(value) { this.value = value; await this.fire('input'); }
  focus() { this.document.activeElement = this; }
  remove() { if (this.parentNode) this.parentNode.kids = this.parentNode.kids.filter(child => child !== this); this.parentNode = null; }
}
const all = root => [root, ...root.kids.filter(child => child instanceof Node).flatMap(all)];

function harness({ prefs = {}, hasFiles = false, stored = prefs, fallback = false, patch, set, onConnection, onOpenUyap, onComplete } = {}) {
  const document = {};
  const el = (tag, attrs, ...kids) => { const node = new Node(tag, attrs, document); node.append(...kids); return node; };
  const h = { writes: [], callbacks: [], store: plain(stored), document };
  const context = { chrome: { storage: { local: {
    async get() { return { uhdPrefs: plain(h.store) }; },
    async set(value) {
      h.writes.push(plain(value.uhdPrefs));
      if (set) await set(value);
      h.store = plain(value.uhdPrefs);
    }
  } } } };
  vm.createContext(context);
  vm.runInContext(read('demo/common.js'), context);
  context.UHD.el = el;
  if (!fallback) context.UHDStorage = { async patchPrefs(value) {
    h.writes.push(plain(value));
    if (patch) await patch(value);
    h.store = { ...h.store, ...plain(value) };
    return plain(h.store);
  } };
  vm.runInContext(read('onboarding.js'), context);
  h.root = el('main');
  h.api = context.UHD.mountOnboarding(h.root, { prefs, hasFiles, onConnection, onOpenUyap, async onComplete(value, startScan) {
    h.callbacks.push({ prefs: plain(value), startScan });
    if (onComplete) await onComplete(value, startScan);
  } });
  h.nodes = () => all(h.root);
  h.field = key => h.nodes().find(node => node.attrs['data-pref'] === key);
  h.type = code => h.nodes().find(node => node.attrs['data-tur'] === code);
  h.city = code => h.nodes().find(node => node.attrs['data-il'] === String(code));
  h.button = text => h.nodes().find(node => node.tag === 'button' && node.textContent === text);
  h.error = () => h.nodes().find(node => node.attrs.role === 'alert');
  h.next = () => h.button('Devam et').click();
  h.settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return h;
}

test('bağlantı önce kontrol edilir; açık hesabın adı alınır, tarama veya kayıt otomatik yapılmaz', async () => {
  const requests = [];
  const h = harness({ onConnection: async request => { requests.push(plain(request)); return { ready: true, status: 'ready', name: '  Hasan İmer Akın  ' }; } });
  assert.match(h.root.textContent, /UYAP bağlantısı/);
  assert.equal(h.type('2'), undefined);
  await h.settle();
  assert.deepEqual(requests, [{ manual: false }]);
  assert.ok(h.type('2'));
  assert.match(h.root.textContent, /UYAP’a bağlı · Hasan İmer Akın/);
  await h.next();
  assert.equal(h.field('myName').value, 'Hasan İmer Akın');
  assert.match(h.root.textContent, /Bu adın vekil olduğu taraflar “Müvekkil” olarak gösterilir/);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.callbacks, []);
  await h.button('Kurulumu tamamla').click();
  assert.equal(h.store.kurulumVekilBekliyor, false);
});

test('oturum yokken boş vekil adıyla kabul edilen tarama ilk bağlantıda adın alınmasını kalıcı olarak bekler', async () => {
  const h = harness({ onConnection: async () => ({ ready: false, status: 'login' }) });
  await h.settle();
  await h.button('Ayarları şimdi seç').click();
  await h.next();
  await h.button('Kaydet ve taramayı başlat').click();
  assert.equal(h.store.myName, '');
  assert.equal(h.store.kurulumVekilBekliyor, true);
  assert.equal(h.callbacks[0].startScan, true);
  assert.equal(h.callbacks[0].prefs.kurulumVekilBekliyor, true);
});

test('kapalı oturum giriş rehberi verir; kullanıcı eylemi dışında başarısız bağlantıyı tekrarlamaz', async () => {
  const requests = [];
  let opens = 0;
  const h = harness({ onConnection: async request => { requests.push(plain(request)); return { ready: false, status: 'login' }; },
    onOpenUyap: async () => { opens++; return { ok: true }; } });
  await h.settle();
  assert.match(h.root.textContent, /UYAP oturumunuz açık değil/);
  assert.ok(h.button('UYAP girişini aç'));
  assert.equal(h.type('2'), undefined);
  await h.button('UYAP girişini aç').click();
  assert.equal(opens, 1);
  await h.settle();
  assert.deepEqual(requests, [{ manual: false }]);
  await h.button('Bağlantıyı yeniden kontrol et').click();
  assert.deepEqual(requests, [{ manual: false }, { manual: true }]);
  assert.deepEqual(h.writes, []);
});

test('giriş tamamlanma bildirimi tekrar kontrol gerektirmeden ilerler ve geç eski yanıt bunu geri alamaz', async () => {
  let release;
  const h = harness({ onConnection: () => new Promise(resolve => { release = resolve; }) });
  h.api.setConnection({ ready: true, status: 'ready', name: 'Bağlanan Vekil' });
  assert.ok(h.type('2'));
  release({ ready: false, status: 'login' });
  await h.settle();
  assert.ok(h.type('2'));
  assert.match(h.root.textContent, /Bağlanan Vekil/);
  await h.next();
  assert.equal(h.field('myName').value, 'Bağlanan Vekil');
});

test('bağlantı olmadan seçilen taslak ve elle girilen ad ilk bağlantıda korunur; tarama niyeti kayıttan sonra iletilir', async () => {
  const h = harness({ onConnection: async () => ({ ready: false, status: 'missing-tab' }) });
  await h.settle();
  await h.button('Ayarları şimdi seç').click();
  await h.type('0').click();
  await h.field('taramaDurum').choose('acik');
  await h.next();
  await h.field('myName').fill('Elle seçilen vekil');
  await h.field('tema').choose('dark');
  h.api.setConnection({ ready: true, status: 'ready', name: 'UYAP hesabı' });
  assert.equal(h.field('myName').value, 'Elle seçilen vekil');
  assert.equal(h.field('tema').value, 'dark');
  await h.button('Kaydet ve taramayı başlat').click();
  assert.equal(h.callbacks[0].startScan, true);
  assert.equal(h.callbacks[0].prefs.taramaDurum, 'acik');
  assert.equal(h.callbacks[0].prefs.taramaTurleri.includes('0'), false);
  assert.equal(h.callbacks[0].prefs.myName, 'Elle seçilen vekil');
  assert.equal(h.callbacks[0].prefs.kurulumVekilBekliyor, false);
  assert.equal(h.writes.length, 1);
});

test('kayıtlı vekil adı korunur; geç bağlantı yanıtı kapatılmış kurulumu açmaz', async () => {
  const kept = harness({ prefs: { myName: 'Önceki vekil' }, onConnection: async () => ({ ready: true, name: 'Yeni hesap' }) });
  await kept.settle();
  await kept.next();
  assert.equal(kept.field('myName').value, 'Önceki vekil');
  let release;
  const closed = harness({ onConnection: () => new Promise(resolve => { release = resolve; }) });
  closed.api.destroy();
  release({ ready: true, name: 'Geç gelen hesap' });
  await closed.settle();
  assert.equal(closed.root.kids.length, 0);
  assert.deepEqual(closed.writes, []);
});

test('aynı veya değişen oturum bildirimi ayar ve il arama düğümlerini, odağı ve yazma konumunu korur', async () => {
  const h = harness({ onConnection: async () => ({ ready: true, status: 'ready', name: 'Hesap Adı' }) });
  await h.settle();
  const citySearch = h.nodes().find(node => node.attrs.name === 'ilArama');
  await citySearch.fill('istanbul');
  citySearch.focus();
  h.api.setConnection({ ready: true, status: 'ready', name: ' Hesap Adı ' });
  assert.equal(h.nodes().find(node => node.attrs.name === 'ilArama'), citySearch);
  assert.equal(h.document.activeElement, citySearch);
  assert.equal(citySearch.value, 'istanbul');
  assert.equal(h.city(34).parentNode.hidden, false);
  assert.equal(h.city(6).parentNode.hidden, true);
  await h.next();
  const input = h.field('myName');
  await input.fill('Elle yazılan ad');
  input.selectionStart = 5;
  input.focus();
  h.api.setConnection({ ready: false, status: 'login' });
  h.api.setConnection({ ready: true, status: 'ready', name: 'Başka hesap' });
  assert.equal(h.field('myName'), input);
  assert.equal(input.value, 'Elle yazılan ad');
  assert.equal(input.selectionStart, 5);
  assert.equal(h.document.activeElement, input);
});

test('ağ ve güvenlik engelinde anlaşılır rehber gösterilir; giriş açma hatası taslağı veya ayarı değiştirmez', async () => {
  for (const [status, message] of [['offline', /İnternet bağlantınızı kontrol edin/], ['blocked', /güvenlik doğrulamasını tamamlayın/]]) {
    const h = harness({ onConnection: async () => ({ ready: false, status }), onOpenUyap: async () => { throw new Error('private'); } });
    await h.settle();
    assert.match(h.root.textContent, message);
    await h.button('UYAP’ı aç').click();
    assert.match(h.error().textContent, /avukat.uyap.gov.tr/);
    assert.doesNotMatch(h.root.textContent, /private/);
    assert.deepEqual(h.writes, []);
  }
});

test('ilk kurulum güvenli varsayılanları gösterir ve tamamlanana kadar ayar yazmaz', async () => {
  const h = harness({ stored: { vekilAra: false, unrelated: 'korunsun' } });
  assert.equal(h.nodes().filter(node => node.attrs['data-tur'] != null && node.checked).length, 7);
  assert.equal(h.field('savcilik').value, 'kapali');
  assert.equal(h.field('taramaDurum').value, 'tum');
  assert.equal(h.nodes().filter(node => node.attrs['data-il'] != null).length, 81);
  assert.equal(h.writes.length, 0);
  await h.next();
  for (const key of ['evrakTakip', 'safahatTakipOptIn', 'panelSabit', 'hataRaporu']) assert.equal(h.field(key).checked, false);
  for (const key of ['durusmaBildirim', 'cakismaBildirim', 'duyuruBildirim', 'oturumAcik']) assert.equal(h.field(key).checked, true);
  assert.equal(h.field('tema').value, 'auto');
  assert.equal(h.field('otoGuncelle').value, 'kapali');
  assert.equal(h.field('acilisSekme').value, 'yok');
  assert.match(h.root.textContent, /Sentry bağlantısı ağ adresinizi görür/);
  assert.equal(h.writes.length, 0);
  await h.button('Kurulumu tamamla').click();
  assert.equal(h.writes.length, 1);
  assert.equal(h.store.kurulumTamamlandi, true);
  assert.equal(h.store.kurulumSurumu, 1);
  assert.equal(h.store.unrelated, 'korunsun');
  assert.equal(h.store.vekilAra, false);
  assert.equal(h.callbacks[0].startScan, false);
  assert.equal(h.callbacks[0].prefs.savcilik, 'kapali');
  assert.equal(h.button('Kurulumu tamamla').disabled, true);
});

test('tür ve il seçimleri doğrulanır; CBS taraması için tek başına il seçilebilir', async () => {
  const h = harness();
  for (const node of h.nodes().filter(node => node.attrs['data-tur'] != null)) await node.click();
  await h.next();
  assert.match(h.error().textContent, /en az bir dosya türü/);
  assert.ok(h.button('Devam et'));
  assert.equal(h.document.activeElement, h.error());
  await h.field('savcilik').choose('secili');
  await h.next();
  assert.match(h.error().textContent, /en az bir il seçin/);
  assert.equal(h.writes.length, 0);
  await h.city(34).click();
  await h.next();
  assert.match(h.root.textContent, /Yalnız savcılık/);
  assert.match(h.root.textContent, /İstanbul/);
  await h.button('Kaydet ve taramayı başlat').click();
  assert.deepEqual(h.store.taramaTurleri, []);
  assert.deepEqual(h.store.savcilikIller, [34]);
  assert.equal(h.callbacks[0].startScan, true);
});

test('otomatik savcılık kapsamı kaynak dosya yokken il ister, kayıtlı dosyalar varsa devam eder', async () => {
  const prefs = { taramaTurleri: [], savcilik: 'otomatik', savcilikIller: [] };
  const fresh = harness({ prefs });
  await fresh.next();
  assert.match(fresh.error().textContent, /İlleri bulmak için bir mahkeme dosyası türü seçin veya savcılık için il ekleyin/);
  assert.ok(fresh.button('Devam et'));
  assert.equal(fresh.writes.length, 0);
  await fresh.city(34).click();
  await fresh.next();
  await fresh.button('Kaydet ve taramayı başlat').click();
  assert.deepEqual(fresh.store.taramaTurleri, []);
  assert.deepEqual(fresh.store.savcilikIller, [34]);
  assert.equal(fresh.callbacks[0].startScan, true);

  const existing = harness({ prefs, hasFiles: true });
  await existing.next();
  assert.ok(existing.button('Kurulumu tamamla'));
  await existing.button('Kaydet ve taramayı başlat').click();
  assert.equal(existing.error().hidden, true);
  assert.equal(existing.writes.length, 1);
  assert.deepEqual(existing.store.savcilikIller, []);
  assert.equal(existing.callbacks[0].startScan, true);
});

test('il araması Türkçe adları bulur ve adımlar arasında taslak seçimler korunur', async () => {
  const h = harness();
  await h.type('0').click();
  await h.field('taramaDurum').choose('acik');
  await h.field('savcilik').choose('secili');
  const citySearch = h.nodes().find(node => node.attrs.name === 'ilArama');
  await citySearch.fill('istanbul');
  assert.equal(h.city(34).parentNode.hidden, false);
  assert.equal(h.city(6).parentNode.hidden, true);
  await h.city(34).click();
  await citySearch.fill('ANKARA');
  assert.equal(h.city(34).parentNode.hidden, true);
  assert.equal(h.city(6).parentNode.hidden, false);
  await h.city(6).click();
  await h.next();
  await h.field('myName').fill('  Hasan İmer  ');
  await h.field('tema').choose('dark');
  await h.field('evrakTakip').click();
  await h.button('Geri').click();
  assert.equal(h.type('0').checked, false);
  assert.equal(h.field('taramaDurum').value, 'acik');
  assert.equal(h.field('savcilik').value, 'secili');
  assert.equal(h.city(6).checked, true);
  assert.equal(h.city(34).checked, true);
  await h.next();
  assert.equal(h.field('myName').value, '  Hasan İmer  ');
  assert.equal(h.field('tema').value, 'dark');
  assert.equal(h.field('evrakTakip').checked, true);
  assert.equal(h.writes.length, 0);
  await h.button('Kaydet ve taramayı başlat').click();
  assert.equal(h.store.myName, 'Hasan İmer');
  assert.equal(h.store.kurulumVekilBekliyor, false);
  assert.deepEqual(h.store.savcilikIller, [6, 34]);
  assert.equal(h.store.tema, 'dark');
  assert.equal(h.store.evrakTakip, true);
  assert.equal(h.store.taramaTurleri.includes('0'), false);
});

test('mevcut tercihleri devralır ve doğrudan storage kaydında diğer tercihleri korur', async () => {
  const prefs = { tema: 'light', savcilik: 'otomatik', savcilikIller: [34], taramaTurleri: ['2'],
    taramaDurum: 'kapali', evrakTakip: true, safahatTakipOptIn: true, hataRaporu: true,
    myName: 'Vekil Adı', oturumAcik: false, vekilAra: false };
  const h = harness({ prefs, fallback: true, stored: { ...prefs, siralama: 'newest' } });
  assert.equal(h.field('savcilik').value, 'otomatik');
  assert.equal(h.type('2').checked, true);
  assert.equal(h.type('1').checked, false);
  assert.equal(h.city(34).checked, true);
  await h.next();
  assert.equal(h.field('tema').value, 'light');
  assert.equal(h.field('myName').value, 'Vekil Adı');
  assert.equal(h.field('hataRaporu').checked, true);
  assert.equal(h.field('oturumAcik').checked, false);
  await h.button('Kurulumu tamamla').click();
  assert.equal(h.writes.length, 1);
  assert.equal(h.store.siralama, 'newest');
  assert.equal(h.store.vekilAra, false);
  assert.deepEqual(h.store.taramaTurleri, ['2']);
});

test('kaydetme hatasında taslağı korur ve başarılı kayıttan sonra taramayı çağırır', async () => {
  let attempts = 0;
  const h = harness({ patch: async () => { if (++attempts === 1) throw new Error('storage kapalı'); } });
  await h.type('2').click();
  await h.next();
  await h.field('myName').fill('Seçili Vekil');
  await h.field('durusmaBildirim').click();
  await h.button('Kaydet ve taramayı başlat').click();
  assert.match(h.error().textContent, /Ayarlar kaydedilemedi/);
  assert.equal(h.callbacks.length, 0);
  assert.equal(h.field('myName').value, 'Seçili Vekil');
  assert.equal(h.field('durusmaBildirim').checked, false);
  assert.equal(h.button('Kaydet ve taramayı başlat').disabled, false);
  await h.button('Kaydet ve taramayı başlat').click();
  assert.equal(h.writes.length, 2);
  assert.equal(h.callbacks.length, 1);
  assert.equal(h.store.myName, 'Seçili Vekil');
  assert.equal(h.store.durusmaBildirim, false);
  assert.equal(h.store.taramaTurleri.includes('2'), false);
});

test('çift tıklama kaydı ve taramayı tekrarlamaz; kayıt tamamlanmadan tarama açılmaz', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const h = harness({ patch: () => gate });
  await h.next();
  const save = h.button('Kaydet ve taramayı başlat');
  const first = save.click();
  await save.click();
  assert.equal(h.writes.length, 1);
  assert.equal(h.callbacks.length, 0);
  assert.equal(h.button('Geri').disabled, true);
  release();
  await first;
  assert.equal(h.writes.length, 1);
  assert.equal(h.callbacks.length, 1);
  await save.click();
  assert.equal(h.callbacks.length, 1);
});

test('tamamlama işlemi hata verirse ayarların kaydedildiğini söyler ve kaydı yeniden yazmaz', async () => {
  let attempts = 0;
  const h = harness({ onComplete: async () => { if (++attempts === 1) throw new Error('tarama başlamadı'); } });
  await h.next();
  await h.button('Kaydet ve taramayı başlat').click();
  assert.match(h.error().textContent, /Ayarlarınız kaydedildi/);
  assert.equal(h.store.kurulumTamamlandi, true);
  await h.button('Kaydet ve taramayı başlat').click();
  assert.equal(h.writes.length, 1);
  assert.equal(h.callbacks.length, 2);
});

test('tarama kabul hatasından sonra düzenlenen seçim yeniden kaydedilir; ilk kaydın eski taslağı kullanılmaz', async () => {
  let attempts = 0;
  const h = harness({ onComplete: async () => { if (++attempts === 1) throw new Error('İstek kabul edilmedi'); } });
  await h.next();
  await h.button('Kaydet ve taramayı başlat').click();
  assert.equal(h.api.isSaving(), true);
  await h.field('myName').fill('Düzenlenen vekil');
  await h.field('tema').choose('dark');
  assert.equal(h.api.isSaving(), true);
  await h.button('Kaydet ve taramayı başlat').click();
  assert.equal(h.writes.length, 2);
  assert.equal(h.callbacks[1].prefs.myName, 'Düzenlenen vekil');
  assert.equal(h.callbacks[1].prefs.tema, 'dark');
  assert.equal(h.api.isSaving(), false);
});

test('form gönderimi kaydetmeden ilk adımdan ilerler ve ikinci adımda yalnız tamamlar', async () => {
  const h = harness();
  const form = () => h.nodes().find(node => node.tag === 'form');
  await form().fire('submit');
  assert.ok(h.button('Kurulumu tamamla'));
  assert.equal(h.writes.length, 0);
  await form().fire('submit');
  assert.equal(h.writes.length, 1);
  assert.equal(h.callbacks[0].startScan, false);
  h.api.destroy();
  assert.equal(h.root.kids.length, 0);
});
