const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '../src/extension', name), 'utf8');
// Kurulum ve panel testlerinin ortak sentetik DOM'u.
const domTaklidi = require('./dom-taklidi.js');
const plain = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const job = (extra = {}) => ({ id: 'plan-a', fileKey: 'file-a', rec: { dosyaNo: '2031/100', birimAdi: 'Sentetik İcra Dairesi' },
  status: 'running', phase: 'fetching', saved: 25, total: 100, partCount: 1, inPart: 50,
  partBytes: 1024, currentTitle: 'Sentetik belge', elapsedMs: 1000, lastPart: null, ...extra });

function harness({ mode = 'page', states = [], downloads = true, panel = true, sendMessage = async () => ({}) } = {}) {
  const context = vm.createContext({});
  const { Node, all } = domTaklidi();
  const document = { activeElement: null, hidden: false, addEventListener() {} };
  domTaklidi.tarayiciEkleri(Node, all, document);
  document.createElement = tag => new Node(tag, null, document);
  document.createElementNS = (namespace, tag) => document.createElement(tag);
  document.createDocumentFragment = () => document.createElement('fragment');
  document.body = document.createElement('body');

  const calls = [], subscribers = new Set(), storage = { uhdPrefs: { kurulumTamamlandi: true, tema: 'light', myName: 'Sentetik Vekil' },
    uhdIndex: { records: [], updatedAt: Date.now() } };
  let snapshot = states;
  const manager = {
    list() { calls.push(['list']); return snapshot; },
    subscribe(fn) { calls.push(['subscribe']); subscribers.add(fn); fn(snapshot); return () => subscribers.delete(fn); },
    pause(key) { calls.push(['pause', key]); }, resume(key) { calls.push(['resume', key]); },
    start(...args) { calls.push(['start', ...args]); }
  };
  Object.assign(context, { document, window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    chrome: { runtime: { id: 'synthetic-extension', getURL: value => `chrome-extension://synthetic-extension/${value}`,
      getManifest: () => ({ version: '1.19.29' }), sendMessage },
      storage: { local: { get: async () => plain(storage), set: async values => Object.assign(storage, plain(values)), remove: async () => {} },
        onChanged: { addListener() {} } } } });
  // Açık depoda common.js açık parçalardan stub'larla kurulur; tam depo gerçek common.js yolunu LEGALUGA_COMMON_JS ile verir.
  vm.runInContext(require('./common-taklidi.js').commonKaynagi(), context);
  if (panel) vm.runInContext(read('indirme-panel.js'), context);
  vm.runInContext(read('ui.js'), context);
  const container = document.createElement('main');
  const api = context.UHD.mountUI(container, { mode, ...(downloads ? { downloads: manager } : {}),
    openDownload: key => calls.push(['open', key]), showDownloadPart: value => calls.push(['folder', plain(value)]),
    onUpdate: () => calls.push(['update']), onStop: () => calls.push(['stop']) });
  return { api, root: api.root, document, calls, storage, nodes: () => all(container),
    field: name => all(container).find(node => node.attrs['data-download'] === name),
    find: selector => api.root.querySelector(selector),
    update(next) { snapshot = next; for (const fn of subscribers) fn(next); } };
}

test('panelde İndirmeler düğmesi gerçek çekmeceyi açar; geri dönüş odağı ve açılma durumunu korur', async () => {
  const h = harness(); await flush();
  const button = h.find('.downloads-toggle'), area = h.find('.download-area');
  assert.equal(area.hidden, true);
  assert.equal(button.attrs['aria-expanded'], 'false');
  assert.match(h.field('empty').textContent, /Henüz indirme yok/);
  assert.equal(h.calls.some(call => ['start', 'resume', 'update'].includes(call[0])), false);
  await button.click();
  assert.equal(area.hidden, false);
  assert.equal(button.attrs['aria-expanded'], 'true');
  assert.equal(h.root.classList.contains('downloads-open'), true);
  assert.equal(h.document.activeElement.tag, 'h3');
  assert.equal(h.document.activeElement.textContent, 'İndirmeler');
  await h.find('.download-back').click();
  assert.equal(area.hidden, true);
  assert.equal(button.attrs['aria-expanded'], 'false');
  assert.equal(h.root.classList.contains('downloads-open'), false);
  assert.equal(h.document.activeElement, button);
});

test('mini durum alınan evrakla ilerler; diske kaydedilen sayı ayrı yazılır', async () => {
  const h = harness({ states: [job()] }); await flush();
  const mini = h.find('.download-mini'), progress = mini.querySelector('progress');
  assert.equal(mini.hidden, false);
  assert.equal(progress.value, 75);
  assert.match(mini.textContent, /2031\/100.*75\/100 alındı · 25 diske kaydedildi/);
  assert.equal(h.field('percent').textContent, '%75');
  h.update([job({ saved: 25, inPart: 75, phase: 'saving' })]);
  assert.equal(progress.value, 100);
  assert.match(mini.textContent, /ZIP diske kaydediliyor.*100\/100 alındı · 25 diske kaydedildi/);
  await mini.click();
  assert.equal(h.find('.download-area').hidden, false);
  assert.equal(h.field('status').textContent, 'ZIP diske kaydediliyor');
});

test('duraklatma geçişinde mini görünür kalır; prefix kaydı bittiğinde veya kalıcı Chrome beklemesinde kapanır', async () => {
  const h = harness({ states: [job()] }); await flush();
  const mini = h.find('.download-mini'), progress = mini.querySelector('progress');
  for (const phase of ['fetching', 'packing', 'saving']) {
    h.update([job({ status: 'paused', phase, persistentPending: false })]);
    assert.equal(mini.hidden, false, phase);
    assert.match(mini.textContent, /Duraklatılıyor….*75\/100 alındı · 25 diske kaydedildi/);
    assert.equal(progress.value, 75, phase);
    assert.equal(h.find('.downloads-toggle .dl-n').textContent, '↓ 1');
    assert.equal(h.field('control').disabled, true, phase);
    await h.field('control').click();
  }
  assert.equal(h.calls.some(call => call[0] === 'resume'), false);
  h.update([job({ status: 'paused', phase: 'idle', saved: 75, inPart: 0 })]);
  assert.equal(mini.hidden, true);
  assert.equal(h.field('percent').textContent, '%75');
  assert.equal(h.field('control').disabled, false);
  h.update([job({ status: 'paused', phase: 'waiting', saved: 75, inPart: 0, persistentPending: true })]);
  assert.equal(mini.hidden, true);
  assert.equal(h.find('.downloads-toggle .dl-n').textContent, '↓');
  assert.equal(h.field('control').disabled, false);
  await h.field('control').click();
  assert.deepEqual(h.calls.at(-1), ['resume', 'file-a']);
});

test('aktif iş bitince mini kapanır; doğrulanmış son parça çekmecede kalır ve callback’e doğru kimlikle gider', async () => {
  const h = harness({ states: [job()] }); await flush();
  h.update([job({ status: 'complete', phase: 'idle', saved: 100, inPart: 0, partCount: 2,
    lastPart: { downloadId: 0, completedAt: 1900000000000 } })]);
  assert.equal(h.find('.download-mini').hidden, true);
  assert.equal(h.find('.downloads-toggle .dl-n').textContent, '↓');
  await h.find('.downloads-toggle').click();
  assert.equal(h.field('percent').textContent, '%100');
  assert.equal(h.field('folder').hidden, false);
  await h.field('folder').click();
  assert.deepEqual(h.calls.at(-1), ['folder', { fileKey: 'file-a', jobId: 'plan-a', downloadId: 0 }]);
  await h.field('open').click();
  assert.deepEqual(h.calls.at(-1), ['open', 'file-a']);
});

test('kuyrukta iki dosya görünür; mini çalışan işi öne alır ve duraklatma doğru dosyayı hedefler', async () => {
  const queued = job({ fileKey: 'file-b', id: '', rec: { dosyaNo: '2031/200' }, status: 'queued', phase: 'waiting' });
  const h = harness({ states: [queued, job()] }); await flush();
  assert.equal(h.find('.downloads-toggle .dl-n').textContent, '↓ 2');
  assert.match(h.find('.download-mini').textContent, /^2031\/100/);
  await h.find('.downloads-toggle').click();
  const queuedCard = h.nodes().find(node => node.attrs['data-file-key'] === 'file-b');
  await queuedCard.querySelector('[data-download="control"]').click();
  assert.deepEqual(h.calls.at(-1), ['pause', 'file-b']);
  h.update([queued]);
  assert.equal(h.find('.downloads-toggle .dl-n').textContent, '↓ 1');
  assert.match(h.find('.download-mini').textContent, /^2031\/200.*Sırada/);
});

test('çekmeceye girip dönmek açık Ayarlar taslağını ve aynı form düğümünü korur', async () => {
  const h = harness(); await flush();
  await h.find('.settings-toggle').click(); await flush();
  const settings = h.find('.settings'), input = settings.querySelector('input[type=text]');
  assert.equal(settings.hidden, false);
  assert.ok(input);
  input.value = 'Kaydedilmemiş sentetik taslak';
  await h.find('.downloads-toggle').click();
  assert.equal(h.root.classList.contains('downloads-open'), true);
  assert.equal(h.find('.results').hidden, true);
  await h.find('.download-back').click();
  assert.equal(settings.hidden, false);
  assert.equal(settings.querySelector('input[type=text]'), input);
  assert.equal(input.value, 'Kaydedilmemiş sentetik taslak');
  assert.equal(h.find('.settings-toggle').attrs['aria-expanded'], 'true');
});

test('çekmeceden Ayarlar’a geçiş çekmeceyi kapatır ve ayarları açar', async () => {
  const h = harness(); await flush();
  h.api.showDownloads();
  await h.find('.settings-toggle').click();
  assert.equal(h.find('.download-area').hidden, true);
  assert.equal(h.root.classList.contains('downloads-open'), false);
  assert.equal(h.find('.downloads-toggle').attrs['aria-expanded'], 'false');
  assert.equal(h.find('.settings').hidden, false);
});

test('panel tekrar odaklanınca açık çekmecenin başlığı odakta kalır; dosya görünümü çekmeceyi kapatır', async () => {
  const h = harness(); await flush();
  h.api.showDownloads();
  const heading = h.document.activeElement;
  h.api.focus();
  assert.equal(h.document.activeElement, heading);
  assert.equal(heading.textContent, 'İndirmeler');
  h.api.showView('files');
  assert.equal(h.find('.download-area').hidden, true);
  assert.equal(h.root.classList.contains('downloads-open'), false);
  assert.equal(h.find('.downloads-toggle').attrs['aria-expanded'], 'false');
  assert.equal(h.document.activeElement, h.api.input);
});

// Çekmece aramayı ve listeyi örter: Escape önce çekmeceyi kapatır; görünmeyen arama metnini silmez.
test('çekmece açıkken Escape çekmeceyi kapatır; gizli arama metni silinmez, odak İndirmeler düğmesine döner', async () => {
  const h = harness(); await flush();
  const button = h.find('.downloads-toggle'), area = h.find('.download-area');
  h.api.input.value = 'sentetik';
  await button.click();
  let durdu = false;
  for (const fn of h.root.events.keydown) fn({ key: 'Escape', target: h.document.activeElement, defaultPrevented: false, preventDefault() { durdu = true; }, stopPropagation() {} });
  assert.equal(area.hidden, true);
  assert.equal(durdu, true);
  assert.equal(button.attrs['aria-expanded'], 'false');
  assert.equal(h.api.input.value, 'sentetik');
  assert.equal(h.document.activeElement, button);
});

test('arka plan güncellemeleri kapalı çekmeceyi açmaz; durmuş iş kullanıcı devam edene kadar bekler', async () => {
  const h = harness({ states: [job()] }); await flush();
  h.update([job({ status: 'error', phase: 'idle', saved: 25, inPart: 0, error: 'Sentetik bağlantı hatası' })]);
  assert.equal(h.find('.download-area').hidden, true);
  assert.equal(h.find('.download-mini').hidden, true);
  assert.equal(h.calls.some(call => ['start', 'resume', 'open'].includes(call[0])), false);
  await h.find('.downloads-toggle').click();
  assert.equal(h.field('percent').textContent, '%25');
  assert.match(h.field('error').textContent, /Sentetik bağlantı hatası/);
  await h.field('control').click();
  assert.deepEqual(h.calls.at(-1), ['resume', 'file-a']);
  await h.find('.download-back').click();
  h.update([job({ saved: 50, inPart: 10 })]);
  assert.equal(h.find('.download-area').hidden, true);
  assert.equal(h.find('.download-mini').querySelector('progress').value, 60, 'alınan evrak: 50 kayıtlı + 10 parçada');
});

test('popup/options veya yöneticisi/bileşeni olmayan ekran indirme UI’sı ve aboneliği oluşturmaz', async () => {
  for (const options of [{ mode: 'popup' }, { mode: 'options' }, { downloads: false }, { panel: false }]) {
    const h = harness(options); await flush();
    assert.equal(h.find('.downloads-toggle'), null);
    assert.equal(h.find('.download-area'), null);
    assert.equal(h.find('.download-mini'), null);
    assert.equal(h.field('panel'), undefined);
    assert.deepEqual(h.calls, []);
    assert.doesNotThrow(() => h.api.showDownloads());
  }
});

// İndirme temposu dosyanın Toplu indir sekmesine taşındı (indirme-panel.js, indirme-panel.test.js); Ayarlar onu çizmez.
test('Ayarlar’da indirme temposu denetimi yoktur; service worker’a tempo sorulmaz', async () => {
  const sorular = [];
  const h = harness({ sendMessage: async msg => { sorular.push(msg.type); return {}; } });
  await flush();
  await h.find('.settings-toggle').click(); await flush();
  const settings = h.find('.settings');
  for (const key of ['indirmeTempo', 'hizliIndirme', 'indirmeAraMin', 'indirmeAraMax', 'indirmeMolaHer', 'indirmeMolaMin', 'indirmeMolaMax'])
    assert.equal(settings.querySelector(`[data-pref=${key}]`), null, key);
  assert.doesNotMatch(settings.textContent, /İndirme temposu|100 evrakta/);
  assert.equal(sorular.includes('uhd-indirme-tempo'), false);
  assert.ok(settings.querySelector('input[data-pref=oturumAcik]'), 'koruma bölümünün öteki seçenekleri yerinde kalır');
});
