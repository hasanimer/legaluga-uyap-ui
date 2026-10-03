const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
// Kurulum testinin sentetik düğümleri; test kayıtları ve harness'i çalıştırılmaz.
const domSource = fs.readFileSync(path.join(__dirname, 'onboarding-ui.test.js'), 'utf8').split('function harness(')[0];
const plain = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const job = (extra = {}) => ({ id: 'plan-a', fileKey: 'file-a', rec: { dosyaNo: '2031/100', birimAdi: 'Sentetik İcra Dairesi' },
  status: 'running', phase: 'fetching', saved: 25, total: 100, partCount: 1, inPart: 50,
  partBytes: 1024, currentTitle: 'Sentetik belge', elapsedMs: 1000, lastPart: null, ...extra });

function harness({ mode = 'page', states = [], downloads = true, panel = true } = {}) {
  const context = vm.createContext({ require, __dirname });
  vm.runInContext(domSource + '\nglobalThis.ExistingDOM = { Node, all };', context);
  const { Node, all } = context.ExistingDOM;
  const document = { activeElement: null, hidden: false, addEventListener() {} };
  const originalSet = Node.prototype.setAttribute;
  Node.prototype.setAttribute = function (key, value) {
    originalSet.call(this, key, value);
    if (key === 'disabled') this.disabled = true;
    if (key === 'class') this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
  };
  Node.prototype.removeAttribute = function (key) { delete this.attrs[key]; if (key === 'hidden') this.hidden = false; };
  Object.defineProperties(Node.prototype, {
    ownerDocument: { get() { return this.document; } },
    childElementCount: { get() { return this.kids.filter(child => child instanceof Node).length; } },
    dataset: { get() { return this.data ||= {}; } },
    style: { get() { return this.inlineStyle ||= {}; } },
    classList: { get() {
      const classes = this.classes ||= new Set();
      return { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name),
        toggle(name, force) { const on = force === undefined ? !classes.has(name) : force; if (on) classes.add(name); else classes.delete(name); return on; } };
    } }
  });
  Node.prototype.matches = function (selector) {
    let pattern = selector;
    const exclusions = [...pattern.matchAll(/:not\(([^)]+)\)/g)].map(match => match[1]);
    if (exclusions.some(part => this.matches(part))) return false;
    pattern = pattern.replace(/:not\([^)]+\)/g, '');
    const tag = /^[a-z][a-z0-9-]*/i.exec(pattern)?.[0];
    if (tag && this.tag !== tag) return false;
    if ([...pattern.matchAll(/\.([\w-]+)/g)].some(match => !this.classList.contains(match[1]))) return false;
    for (const match of pattern.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
      const key = match[1];
      if (match[2] === undefined) { if (!(key in this.attrs) || key === 'hidden' && !this.hidden) return false; }
      else if (this.attrs[key] !== match[2]) return false;
    }
    return true;
  };
  Node.prototype.querySelectorAll = function (selector) {
    return all(this).slice(1).filter(node => selector.split(',').some(part => {
      const parts = part.trim().split(/\s+/);
      if (!node.matches(parts.pop())) return false;
      let ancestor = node.parentNode;
      while (parts.length) {
        const match = parts.pop();
        while (ancestor && !ancestor.matches(match)) ancestor = ancestor.parentNode;
        if (!ancestor) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    }));
  };
  Node.prototype.querySelector = function (selector) { return this.querySelectorAll(selector)[0] || null; };
  Node.prototype.getRootNode = () => document;
  Node.prototype.contains = function (node) { return all(this).includes(node); };
  Node.prototype.select = function () { this.selectionStart = 0; this.selectionEnd = this.value.length; };
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
  Object.assign(context, { document, window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    chrome: { runtime: { id: 'synthetic-extension', getURL: value => `chrome-extension://synthetic-extension/${value}`,
      getManifest: () => ({ version: '1.19.29' }), sendMessage: async () => ({}) },
      storage: { local: { get: async () => plain(storage), set: async values => Object.assign(storage, plain(values)), remove: async () => {} },
        onChanged: { addListener() {} } } } });
  vm.runInContext(read('demo/common.js'), context);
  if (panel) vm.runInContext(read('indirme-panel.js'), context);
  vm.runInContext(read('ui.js'), context);
  const container = document.createElement('main');
  const api = context.UHD.mountUI(container, { mode, ...(downloads ? { downloads: manager } : {}),
    openDownload: key => calls.push(['open', key]), showDownloadPart: value => calls.push(['folder', plain(value)]),
    onUpdate: () => calls.push(['update']), onStop: () => calls.push(['stop']) });
  return { api, root: api.root, document, calls, nodes: () => all(container),
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

test('mini durum yalnız diske kaydedilen yüzdeyi gösterir; geçici parça sayısı ayrı kalır', async () => {
  const h = harness({ states: [job()] }); await flush();
  const mini = h.find('.download-mini'), progress = mini.querySelector('progress');
  assert.equal(mini.hidden, false);
  assert.equal(progress.value, 25);
  assert.match(mini.textContent, /2031\/100.*25\/100 kaydedildi.*50 evrak bu parçada/);
  assert.equal(h.field('percent').textContent, '%25');
  h.update([job({ saved: 25, inPart: 75, phase: 'saving' })]);
  assert.equal(progress.value, 25);
  assert.match(mini.textContent, /Diske kaydediliyor.*75 evrak bu parçada/);
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
    assert.match(mini.textContent, /Duraklatılıyor….*25\/100 kaydedildi.*50 evrak bu parçada/);
    assert.equal(progress.value, 25, phase);
    assert.equal(h.find('.downloads-toggle').textContent, '↓ 1');
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
  assert.equal(h.find('.downloads-toggle').textContent, '↓');
  assert.equal(h.field('control').disabled, false);
  await h.field('control').click();
  assert.deepEqual(h.calls.at(-1), ['resume', 'file-a']);
});

test('aktif iş bitince mini kapanır; doğrulanmış son parça çekmecede kalır ve callback’e doğru kimlikle gider', async () => {
  const h = harness({ states: [job()] }); await flush();
  h.update([job({ status: 'complete', phase: 'idle', saved: 100, inPart: 0, partCount: 2,
    lastPart: { downloadId: 0, completedAt: 1900000000000 } })]);
  assert.equal(h.find('.download-mini').hidden, true);
  assert.equal(h.find('.downloads-toggle').textContent, '↓');
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
  assert.equal(h.find('.downloads-toggle').textContent, '↓ 2');
  assert.match(h.find('.download-mini').textContent, /^2031\/100/);
  await h.find('.downloads-toggle').click();
  const queuedCard = h.nodes().find(node => node.attrs['data-file-key'] === 'file-b');
  await queuedCard.querySelector('[data-download="control"]').click();
  assert.deepEqual(h.calls.at(-1), ['pause', 'file-b']);
  h.update([queued]);
  assert.equal(h.find('.downloads-toggle').textContent, '↓ 1');
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
  assert.equal(h.find('.download-mini').querySelector('progress').value, 50);
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
