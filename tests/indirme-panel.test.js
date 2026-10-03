const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/extension/indirme-panel.js'), 'utf8');
// Kurulum ekranının mevcut DOM harness'i; o dosyanın harness/test kayıtları çalıştırılmaz.
const domSource = fs.readFileSync(path.join(__dirname, 'onboarding-ui.test.js'), 'utf8').split('function harness(')[0];
const job = (extra = {}) => ({ id: 'plan-a', fileKey: 'file-a', rec: { dosyaNo: '2031/100', birimAdi: 'Sentetik İcra Dairesi' },
  status: 'paused', phase: 'idle', saved: 200, total: 10840, partCount: 2, inPart: 0, partBytes: 0,
  currentTitle: '', elapsedMs: 0, updatedAt: 10, lastPart: null, error: '', ...extra });
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(states = [], options = {}) {
  const context = vm.createContext({ require, __dirname });
  vm.runInContext(domSource + '\nglobalThis.ExistingDOM = { Node, all };', context);
  const { Node, all } = context.ExistingDOM;
  const document = { activeElement: null };
  document.createElement = tag => new Node(tag, null, document);
  const container = new Node('main', null, document);
  context.document = document;
  const calls = [], subscribers = new Set();
  let snapshot = states, retained;
  const manager = {
    list() { calls.push(['list']); if (options.listError) throw options.listError; return snapshot; },
    subscribe(fn) {
      calls.push(['subscribe']); subscribers.add(fn); retained = fn;
      if (options.immediate !== false) fn(snapshot);
      return () => { calls.push(['unsubscribe']); subscribers.delete(fn); };
    },
    start(...args) { calls.push(['start', ...args]); },
    pause(key) { calls.push(['pause', key]); return options.pause?.(key); },
    resume(key) { calls.push(['resume', key]); return options.resume?.(key); }
  };
  vm.runInContext(source, context);
  const api = context.UHDBulkPanel.mount(container, { manager,
    ...(options.callbacks === false ? {} : {
      openFile(key) { calls.push(['open', key]); return options.open?.(key); },
      showPart(value) { calls.push(['folder', JSON.parse(JSON.stringify(value))]); return options.folder?.(value); }
    }) });
  const field = (name, key) => all(key ? all(container).find(node => node.attrs['data-file-key'] === key) : container)
    .find(node => node.attrs['data-download'] === name);
  return { api, manager, calls, container, document, field, all: () => all(container),
    update(next) { snapshot = next; for (const fn of subscribers) fn(next); },
    late(next) { retained(next); } };
}

test('boş İndirmeler alanı işi başlatmadan abonelik kurar ve açık boş durumu gösterir', () => {
  const h = harness();
  assert.equal(h.field('count').textContent, '0 indirme');
  assert.equal(h.field('empty').hidden, false);
  assert.match(h.field('empty').textContent, /Toplu indir/);
  assert.deepEqual(h.calls, [['subscribe']]);
  assert.equal(h.field('panel').attrs['aria-labelledby'], h.all().find(node => node.tag === 'h3').attrs.id);
  assert.equal(h.field('list').attrs.role, 'list');
  h.api.destroy();
});

test('yüzde yalnız kalıcı evrakları sayar; geçici evrak ve ölçülen parça boyutu ayrı görünür', () => {
  const state = job({ status: 'running', phase: 'fetching', saved: 230, inPart: 47,
    partBytes: 2 * 1024 * 1024, currentTitle: 'Sentetik belge', elapsedMs: 80000 });
  const before = JSON.stringify(state), h = harness([state]);
  assert.equal(h.field('count').textContent, '1 indirme · 1 sürüyor');
  assert.equal(h.field('status', 'file-a').textContent, 'Evraklar alınıyor');
  assert.equal(h.field('percent', 'file-a').textContent, '%2');
  assert.equal(h.field('progress', 'file-a').attrs.value, '2');
  assert.match(h.field('saved', 'file-a').textContent, /230 \/ 10\.840 evrak diske kaydedildi/);
  assert.match(h.field('received', 'file-a').textContent, /47.*henüz kaydedilmedi/);
  assert.equal(h.field('bytes', 'file-a').textContent, 'Bu parça: 2 MiB');
  assert.equal(h.field('elapsed', 'file-a').textContent, 'Etkin süre: 1 dk 20 sn');
  assert.match(h.field('parts', 'file-a').textContent, /2 ZIP parçası/);
  assert.doesNotMatch(h.container.textContent, /ETA|kalan ~|toplam.*MiB/);
  assert.equal(JSON.stringify(state), before);
  h.api.destroy();
});

test('Chrome diske kaydederken yüzde ilerlemez; doğrulanmış cursor geldikten sonra tamamlanır', () => {
  const state = job({ status: 'running', phase: 'saving', saved: 0, total: 100, partCount: 0, inPart: 100 });
  const h = harness([state]);
  assert.equal(h.field('percent', 'file-a').textContent, '%0');
  assert.equal(h.field('status', 'file-a').textContent, 'ZIP diske kaydediliyor');
  assert.equal(h.field('folder', 'file-a').hidden, true);
  h.update([job({ status: 'complete', saved: 100, total: 100, partCount: 1,
    lastPart: { downloadId: 7, filename: 'sentetik.zip', completedAt: 1900000000000 } })]);
  assert.equal(h.field('percent', 'file-a').textContent, '%100');
  assert.equal(h.field('status', 'file-a').textContent, 'Tamamlandı');
  assert.equal(h.field('control', 'file-a').hidden, true);
  assert.equal(h.field('folder', 'file-a').hidden, false);
  assert.equal(h.field('last', 'file-a').hidden, false);
  assert.match(h.field('live').textContent, /Tamamlandı.*100 \/ 100/);
  h.api.destroy();
});

test('kuyruktaki işi duraklatma ve başka dosyaya devam etme doğru fileKey ile tek kez çağrılır', async () => {
  const h = harness([job({ id: '', status: 'queued', phase: 'waiting' }),
    job({ id: 'plan-b', fileKey: 'file-b', rec: { dosyaNo: '2031/200', birimAdi: 'Başka Daire' }, status: 'error', error: 'Sentetik bağlantı hatası' })]);
  assert.equal(h.field('count').textContent, '2 indirme · 1 sırada');
  assert.equal(h.field('control', 'file-a').textContent, 'Duraklat');
  assert.equal(h.field('control', 'file-b').textContent, 'Devam et');
  await h.field('control', 'file-a').click();
  await h.field('control', 'file-b').click();
  assert.deepEqual(h.calls, [['subscribe'], ['pause', 'file-a'], ['resume', 'file-b']]);
  assert.match(h.field('error', 'file-b').textContent, /bağlantı/);
  assert.equal(h.field('job', 'file-b').attrs.role, 'listitem');
  h.api.destroy();
});

test('bekleyen kontrol tekrar çağrılmaz ve asenkron hata kaydedilmiş ilerlemeyi korur', async () => {
  let reject;
  const pending = new Promise((resolve, fail) => { reject = fail; });
  const h = harness([job()], { resume: () => pending });
  const first = h.field('control', 'file-a').click();
  assert.equal(h.field('control', 'file-a').disabled, true);
  await h.field('control', 'file-a').click();
  reject(new Error('Sentetik hata <script>literal</script>'));
  await first;
  assert.equal(h.field('control', 'file-a').disabled, false);
  assert.match(h.field('error', 'file-a').textContent, /Sentetik hata <script>literal<\/script>/);
  assert.match(h.field('saved', 'file-a').textContent, /200 \/ 10\.840/);
  assert.equal(h.calls.filter(call => call[0] === 'resume').length, 1);
  assert.equal(h.all().some(node => node.tag === 'script'), false);
  h.api.destroy();
});

test('duraklatılan fetch/paketleme/kayıt bitene kadar Devam et çalışmaz; prefix kaydolunca yeniden etkinleşir', async () => {
  const h = harness([job({ status: 'running', phase: 'fetching', inPart: 47 })], {
    pause: () => h.update([job({ status: 'paused', phase: 'fetching', inPart: 47 })])
  });
  await h.field('control', 'file-a').click();
  for (const phase of ['fetching', 'packing', 'saving']) {
    h.update([job({ status: 'paused', phase, inPart: 47, persistentPending: false })]);
    assert.equal(h.field('status', 'file-a').textContent, 'Duraklatılıyor…', phase);
    assert.equal(h.field('control', 'file-a').textContent, 'Duraklatılıyor…', phase);
    assert.equal(h.field('control', 'file-a').disabled, true, phase);
    assert.match(h.field('saved', 'file-a').textContent, /200 \/ 10\.840/);
    await h.field('control', 'file-a').click();
  }
  assert.equal(h.calls.filter(call => call[0] === 'pause').length, 1);
  assert.equal(h.calls.some(call => call[0] === 'resume'), false);
  h.update([job({ status: 'paused', phase: 'idle', saved: 247, partCount: 3, inPart: 0 })]);
  assert.equal(h.field('status', 'file-a').textContent, 'Duraklatıldı');
  assert.equal(h.field('control', 'file-a').textContent, 'Devam et');
  assert.equal(h.field('control', 'file-a').disabled, false);
  assert.equal(h.field('percent', 'file-a').textContent, '%2');
  await h.field('control', 'file-a').click();
  assert.deepEqual(h.calls.at(-1), ['resume', 'file-a']);
  h.api.destroy();
});

test('kalıcı bekleyen Chrome kaydı duraklatma geçişi sayılmaz; elle durum kontrolü engellenmez', async () => {
  const h = harness([job({ status: 'paused', phase: 'waiting', persistentPending: true })]);
  assert.equal(h.field('status', 'file-a').textContent, 'Duraklatıldı');
  assert.equal(h.field('control', 'file-a').textContent, 'Devam et');
  assert.equal(h.field('control', 'file-a').disabled, false);
  assert.equal(h.field('folder', 'file-a').hidden, true);
  assert.equal(h.calls.some(call => call[0] === 'resume'), false);
  await h.field('control', 'file-a').click();
  assert.deepEqual(h.calls.at(-1), ['resume', 'file-a']);
  assert.match(h.field('saved', 'file-a').textContent, /200 \/ 10\.840/);
  h.api.destroy();
});

test('eski işte reader yoksa dosyayı açma önerilir; açma kendiliğinden yapılmaz', async () => {
  const h = harness([job()], { resume: () => { throw Object.assign(new Error('Reader yok'), { code: 'SOURCE_REQUIRED' }); } });
  await h.field('control', 'file-a').click();
  assert.match(h.field('error', 'file-a').textContent, /UYAP dosyasını açın.*Toplu indir/);
  assert.equal(h.calls.some(call => call[0] === 'open'), false);
  await h.field('open', 'file-a').click();
  assert.deepEqual(h.calls.at(-1), ['open', 'file-a']);
  h.api.destroy();
});

test('klasörde göster yalnız işin doğrulanmış son parça kimliğini root callback’ine iletir', async () => {
  const h = harness([job({ status: 'complete', saved: 10840, partCount: 109,
    lastPart: { downloadId: 0, filename: '<a>sentetik.zip', completedAt: 1900000000000 } })]);
  await h.field('folder', 'file-a').click();
  assert.deepEqual(h.calls.at(-1), ['folder', { fileKey: 'file-a', jobId: 'plan-a', downloadId: 0 }]);
  assert.equal(h.all().some(node => node.tag === 'a'), false);
  h.update([job({ lastPart: { downloadId: -1, completedAt: 1900000000000 } })]);
  assert.equal(h.field('folder', 'file-a').hidden, true);
  h.update([job({ id: '', lastPart: { downloadId: 4, completedAt: 1900000000000 } })]);
  assert.equal(h.field('folder', 'file-a').hidden, true);
  h.api.destroy();
});

test('her evrak/byte olayı okunmaz; aşama, parça ve hata değişimleri erişilebilir biçimde bildirilir', () => {
  const state = job({ status: 'running', phase: 'fetching' }), h = harness([state]);
  assert.equal(h.field('live').textContent, '');
  h.update([{ ...state, inPart: 1, partBytes: 100, currentTitle: 'Birinci belge', elapsedMs: 5000 }]);
  assert.equal(h.field('live').textContent, '');
  h.update([{ ...state, inPart: 2, partBytes: 200, currentTitle: 'İkinci belge', elapsedMs: 7000 }]);
  assert.equal(h.field('live').textContent, '');
  h.update([{ ...state, phase: 'packing', inPart: 2 }]);
  assert.match(h.field('live').textContent, /ZIP hazırlanıyor/);
  const previous = h.field('live').textContent;
  h.update([{ ...state, phase: 'packing', inPart: 2, partBytes: 200 }]);
  assert.equal(h.field('live').textContent, previous);
  h.update([{ ...state, saved: 300, partCount: 3 }]);
  assert.match(h.field('live').textContent, /300 \/ 10\.840/);
  h.update([{ ...state, status: 'error', phase: 'idle', error: 'Sentetik oturum hatası' }]);
  assert.match(h.field('live').textContent, /Sentetik oturum hatası/);
  assert.equal(h.field('live').attrs['aria-live'], 'polite');
  assert.equal(h.field('live').attrs['aria-atomic'], 'true');
  h.api.destroy();
});

test('canlı ilerleme düğmeyi yeniden yaratmaz; tamamlanan/kaldırılan işte odak görünür hedefe geçer', () => {
  const state = job({ status: 'running', phase: 'fetching' }), h = harness([state]);
  const control = h.field('control', 'file-a'); control.focus();
  h.update([{ ...state, inPart: 3 }]);
  assert.equal(h.field('control', 'file-a'), control);
  assert.equal(h.document.activeElement, control);
  h.update([job({ status: 'complete', saved: 10840, lastPart: { downloadId: 7, completedAt: 1900000000000 } })]);
  assert.equal(h.document.activeElement, h.field('folder', 'file-a'));
  h.update([]);
  assert.equal(h.document.activeElement.tag, 'h3');
  assert.equal(h.field('count').textContent, '0 indirme');
  h.api.destroy();
});

test('aynı başlıkların satır kimliği ayrıdır; başlık ve evrak içeriği sınırlı literal metindir', () => {
  const title = '<img onerror=x>'.repeat(30);
  const h = harness([job({ rec: { dosyaNo: title, birimAdi: title }, status: 'running', phase: 'fetching', currentTitle: title }),
    job({ id: 'plan-b', fileKey: 'file-b', rec: { dosyaNo: title, birimAdi: title } })]);
  const first = h.field('job', 'file-a'), second = h.field('job', 'file-b');
  assert.notEqual(first.attrs['aria-labelledby'], second.attrs['aria-labelledby']);
  assert.ok(h.field('title', 'file-a').textContent.length <= 100);
  assert.ok(h.field('current', 'file-a').textContent.length <= 227);
  assert.equal(h.all().some(node => node.tag === 'img'), false);
  assert.match(h.field('title', 'file-a').textContent, /<img onerror=x>/);
  h.api.destroy();
});

test('başlangıç okuma hatası açık kalır; yeniden okuma önceki işin kaydını değiştirmez', async () => {
  const options = { immediate: false, listError: new Error('Sentetik kayıt hatası') }, h = harness([job()], options);
  assert.equal(h.field('problem').hidden, false);
  assert.equal(h.field('empty').hidden, true);
  assert.equal(h.field('retry').hidden, false);
  delete options.listError;
  await h.field('retry').click();
  assert.equal(h.field('problem').hidden, true);
  assert.equal(h.field('retry').hidden, true);
  assert.match(h.field('saved', 'file-a').textContent, /200 \/ 10\.840/);
  assert.equal(h.calls.some(call => ['resume', 'start', 'pause'].includes(call[0])), false);
  h.api.destroy();
});

test('panel kapanışı aboneliği temizler, işi durdurmaz ve geç asenkron sonuç DOM’a dönmez', async () => {
  let reject;
  const pending = new Promise((resolve, fail) => { reject = fail; });
  const h = harness([job()], { resume: () => pending });
  const click = h.field('control', 'file-a').click();
  h.api.destroy(); h.api.destroy();
  h.late([job({ status: 'complete', saved: 10840 })]);
  reject(new Error('Geç sentetik hata')); await click; await flush();
  assert.equal(h.container.kids.length, 0);
  assert.equal(h.calls.filter(call => call[0] === 'unsubscribe').length, 1);
  assert.equal(h.calls.some(call => call[0] === 'pause'), false);
});

test('isteğe bağlı dosya/klasör callback’leri yokken ilgili düğmeler gösterilmez', () => {
  const h = harness([job({ lastPart: { downloadId: 7, completedAt: 1900000000000 } })], { callbacks: false });
  assert.equal(h.field('open', 'file-a').hidden, true);
  assert.equal(h.field('folder', 'file-a').hidden, true);
  h.api.destroy();
});

test('gizli tamamlanmış ve geçersiz parça düğmelerine programatik tıklama yeni iş başlatmaz', async () => {
  const h = harness([job({ status: 'complete', saved: 10840, lastPart: { downloadId: -1, completedAt: 1900000000000 } })]);
  await h.field('control', 'file-a').click();
  await h.field('folder', 'file-a').click();
  assert.deepEqual(h.calls, [['subscribe']]);
  h.api.destroy();
});

test('iş listeden kaldırılırsa bekleyen kontrolün geç hatası başka işin bildirimine dönüşmez', async () => {
  let reject;
  const pending = new Promise((resolve, fail) => { reject = fail; });
  const h = harness([job()], { resume: () => pending });
  const control = h.field('control', 'file-a'), click = control.click();
  h.update([]);
  const previous = h.field('live').textContent;
  reject(new Error('Kaldırılmış işin geç hatası')); await click;
  assert.equal(h.field('live').textContent, previous);
  await control.click();
  assert.equal(h.calls.filter(call => call[0] === 'resume').length, 1);
  h.api.destroy();
});
