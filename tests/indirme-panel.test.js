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
    resume(key, extra) { calls.push(extra === undefined ? ['resume', key] : ['resume', key, JSON.parse(JSON.stringify(extra))]); return options.resume?.(key, extra); }
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

test('atlanan evrak sayısı ayrı not olarak görünür ve bildirilir; tamamlanan iş eksik diye işaretlenir', () => {
  const state = job({ status: 'running', phase: 'fetching' }), h = harness([state]);
  assert.equal(h.field('skipped').hidden, true);
  h.update([{ ...state, saved: 300, partCount: 3, skipped: 2 }]);
  assert.equal(h.field('skipped').hidden, false);
  assert.match(h.field('skipped').textContent, /^2 evrak indirilemediği için atlandı; ZIP içinde yerine “İNDİRİLEMEDİ” notu var\./);
  assert.match(h.field('live').textContent, /2 evrak indirilemediği için atlandı/);
  h.update([{ ...state, status: 'complete', phase: 'idle', saved: 10840, partCount: 109, skipped: 2 }]);
  assert.equal(h.field('status').textContent, 'Tamamlandı (eksik)');
  assert.equal(h.field('skipped').hidden, false);
  h.update([{ ...state, status: 'complete', phase: 'idle', saved: 10840, partCount: 109, skipped: 0 }]);
  assert.equal(h.field('status').textContent, 'Tamamlandı'); assert.equal(h.field('skipped').hidden, true);
  h.api.destroy();
});

test('takılan evrak için atlama düğmesi yalnız motor bildirince görünür ve o evrakın kimliğiyle ister', async () => {
  const durdu = job({ status: 'error', phase: 'idle', error: 'Bu evrak 128 MiB sınırını aşıyor.' }), h = harness([durdu]);
  assert.equal(h.field('skip').hidden, true, 'bildirim yokken atlama sunulmaz');
  assert.equal(h.field('error').textContent, 'Bu evrak 128 MiB sınırını aşıyor.');
  // Tanınmayan neden ya da eksik kimlik düğmeyi açmaz.
  for (const stuck of [{ jobId: 'plan-a', cursor: 200, neden: 'oturum' }, { cursor: 200, neden: 'buyuk' }, { jobId: 'plan-a', cursor: -1, neden: 'buyuk' }]) {
    h.update([{ ...durdu, stuck }]);
    assert.equal(h.field('skip').hidden, true, JSON.stringify(stuck));
  }
  h.update([{ ...durdu, stuck: { jobId: 'plan-a', cursor: 200, neden: 'buyuk', tur: 'Sentetik  Bilirkişi Raporu', tarih: '03.10.2026' } }]);
  assert.equal(h.field('skip').hidden, false);
  assert.equal(h.field('skip').textContent, 'Bu evrakı atla ve sürdür');
  assert.match(h.field('skip').attrs['aria-label'], /2031\/100: alınamayan evrakı atla/);
  assert.match(h.field('error').textContent, /^Bu evrak 128 MiB sınırını aşıyor: Sentetik Bilirkişi Raporu · 03\.10\.2026\. Devam et yeniden dener; “Bu evrakı atla ve sürdür” ZIP’e/);
  assert.equal(h.field('control').textContent, 'Devam et');
  assert.match(h.field('live').textContent, /Bu evrak 128 MiB sınırını aşıyor: Sentetik Bilirkişi Raporu.*“Bu evrakı atla ve sürdür”/, 'duyuru atlama seçeneğini söyler');
  await h.field('skip').click();
  assert.deepEqual(h.calls.filter(call => call[0] === 'resume'), [['resume', 'file-a', { skip: { jobId: 'plan-a', cursor: 200 } }]]);
  // İş yeniden başlayınca düğme kalkar.
  h.update([job({ status: 'running', phase: 'fetching' })]);
  assert.equal(h.field('skip').hidden, true);
  // Motor onayı reddederse neden kartta görünür.
  const r = harness([{ ...durdu, stuck: { jobId: 'plan-a', cursor: 200, neden: 'bos' } }], { resume() { throw new Error('Atlanacak evrak doğrulanamadı. Devam et’e basıp yeniden deneyin.'); } });
  assert.match(r.field('error').textContent, /^UYAP bu evrakı boş döndürüyor: evrak\./);
  await r.field('skip').click();
  assert.match(r.field('error').textContent, /^Atlanacak evrak doğrulanamadı/);
  h.api.destroy(); r.api.destroy();
});

test('mola açıkça yazılır ve duyurulur; kalan süre yalnız sürerken ve 5 dakikaya yuvarlı görünür', () => {
  const surer = job({ status: 'running', phase: 'fetching', currentTitle: 'Sentetik Evrak' }), h = harness([surer]);
  assert.equal(h.field('status').textContent, 'Evraklar alınıyor');
  assert.equal(h.field('eta').hidden, true);
  assert.equal(h.field('current').textContent, 'Evrak: Sentetik Evrak');
  h.update([{ ...surer, restUntil: Date.now() + 45000, etaMs: 23 * 60000 }]);
  assert.equal(h.field('status').textContent, 'Mola veriliyor');
  assert.match(h.field('current').textContent, /^UYAP’a yük bindirmemek için kısa bir mola veriliyor; indirme \d{2}:\d{2}:\d{2} civarında kendiliğinden sürer\.$/);
  assert.match(h.field('live').textContent, /Mola veriliyor/);
  assert.equal(h.field('eta').textContent, 'Kalan süre: yaklaşık 25 dk');
  // Geçmiş mola anı ve duraklatılmış iş mola göstermez.
  h.update([{ ...surer, restUntil: Date.now() - 1, etaMs: 2 * 3600000 + 60000 }]);
  assert.equal(h.field('status').textContent, 'Evraklar alınıyor');
  assert.equal(h.field('eta').textContent, 'Kalan süre: yaklaşık 2 sa 5 dk');
  h.update([{ ...surer, etaMs: 60000 }]);
  assert.equal(h.field('eta').textContent, 'Kalan süre: 5 dakikadan az');
  h.update([{ ...surer, status: 'paused', phase: 'idle', restUntil: Date.now() + 45000, etaMs: 60000 }]);
  assert.equal(h.field('status').textContent, 'Duraklatıldı');
  assert.equal(h.field('eta').hidden, true);
  h.api.destroy();
});

// Tek ZIP indirmesi motor kaydına girmez; sayfa kabuğu onu "zip:" anahtarıyla aynı listeye ekler.
const zipJob = (extra = {}) => job({ kind: 'zip', key: 'zip:file-a', id: '', status: 'running', phase: 'fetching', saved: 3, total: 10,
  partCount: 0, missing: 0, currentTitle: 'Sentetik Dilekçe', ...extra });
const card = (h, jobKey) => h.all().find(node => node.attrs['data-job-key'] === jobKey);
// Bu testlerde tek kart vardır; alan doğrudan panelden bulunur.
const zipField = (h, name) => h.field(name);

test('tek ZIP kartı alınan evrakı sayar; parça ve klasör yoktur, Durdur kendi anahtarıyla çağrılır', async () => {
  const h = harness([zipJob()]);
  assert.equal(zipField(h, 'status').textContent, 'Evraklar alınıyor');
  assert.equal(zipField(h, 'saved').textContent, '3 / 10 evrak alındı');
  assert.equal(zipField(h, 'percent').textContent, '%30');
  assert.equal(zipField(h, 'parts').hidden, true);
  assert.equal(zipField(h, 'folder').hidden, true);
  assert.equal(zipField(h, 'control').hidden, false);
  assert.equal(zipField(h, 'control').textContent, 'Durdur');
  await zipField(h, 'control').click();
  await flush();
  assert.deepEqual(h.calls.filter(call => call[0] === 'pause'), [['pause', 'zip:file-a']]);
  assert.equal(zipField(h, 'open').hidden, true, 'süren tek ZIP’te Dosyayı aç gizlidir: dosyayı yeniden açmak indirmeyi durdururdu');
  await zipField(h, 'open').click();
  assert.deepEqual(h.calls.filter(call => call[0] === 'open'), [], 'gizli düğme çağrı yapmaz');
  h.update([zipJob({ status: 'complete', phase: 'idle', saved: 10 })]);
  assert.equal(zipField(h, 'open').hidden, false);
  await zipField(h, 'open').click();
  assert.deepEqual(h.calls.filter(call => call[0] === 'open'), [['open', 'file-a']], 'Dosyayı aç dosya anahtarını kullanır');
  h.api.destroy();
});

test('durdurulan tek ZIP eksik ZIP hazırlanırken yeniden durdurulamaz', async () => {
  const h = harness([zipJob({ stopping: true })]);
  assert.equal(zipField(h, 'status').textContent, 'Durduruluyor…');
  assert.equal(zipField(h, 'control').disabled, true);
  assert.equal(zipField(h, 'control').textContent, 'Durduruluyor…');
  await zipField(h, 'control').click();
  h.update([zipJob({ stopping: true, phase: 'packing' })]);
  assert.equal(zipField(h, 'control').disabled, true, 'ZIP hazırlanırken de kapalı kalır');
  await zipField(h, 'control').click();
  assert.deepEqual(h.calls.filter(call => call[0] === 'pause'), []);
  h.update([zipJob({ status: 'complete', phase: 'idle', saved: 4, missing: 6, stopping: false })]);
  assert.equal(zipField(h, 'status').textContent, 'ZIP indirildi (eksik)');
  assert.doesNotMatch(zipField(h, 'skipped').textContent, /tekrar dene/i);
  h.api.destroy();
});

test('aynı dosyanın kayıtlı parçalı planı ile tek ZIP indirmesi iki ayrı kart olur', () => {
  const h = harness([job(), zipJob()]);
  assert.equal(h.field('count').textContent, '2 indirme · 1 sürüyor');
  assert.ok(card(h, 'file-a'), 'parçalı plan kartı');
  assert.ok(card(h, 'zip:file-a'), 'tek ZIP kartı');
  h.update([job()]);
  assert.equal(card(h, 'zip:file-a'), undefined, 'listeden kalkan tek ZIP kartı kaldırılır');
  assert.ok(card(h, 'file-a'));
  h.api.destroy();
});

test('biten tek ZIP eksikleri rapora yönlendirir; durdurulan tek ZIP sürdürülemez', () => {
  const h = harness([zipJob({ status: 'complete', phase: 'idle', saved: 8, missing: 2 })]);
  assert.equal(zipField(h, 'status').textContent, 'ZIP indirildi (eksik)');
  assert.match(zipField(h, 'skipped').textContent, /2 evrak alınamadı; .*indirme raporunda/);
  assert.equal(zipField(h, 'control').hidden, true);
  h.update([zipJob({ status: 'paused', phase: 'idle', error: 'ZIP oluşturulmadı.' })]);
  assert.equal(zipField(h, 'status').textContent, 'Durduruldu');
  assert.equal(zipField(h, 'control').hidden, true, 'tek ZIP için Devam et sunulmaz');
  assert.equal(zipField(h, 'error').textContent, 'ZIP oluşturulmadı.');
  h.update([zipJob({ status: 'complete', phase: 'idle', saved: 10 })]);
  assert.equal(zipField(h, 'status').textContent, 'ZIP indirildi');
  assert.equal(zipField(h, 'skipped').hidden, true);
  h.api.destroy();
});
