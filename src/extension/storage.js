// Kalıcı AES-GCM veriler ve anahtar yalnız uzantı kökenindeki service worker'da işlenir.
// Mevcut chrome.storage.local sözleşmesini korur; içerik betiklerine anahtar/ciphertext verilmez.
(() => {
  'use strict';
  if (globalThis.UHDStorage || !globalThis.chrome?.storage?.local) return;
  const native = Object.fromEntries(['get', 'set', 'remove', 'clear'].map(k => [k, chrome.storage.local[k].bind(chrome.storage.local)]));
  const rawListen = chrome.storage.onChanged.addListener.bind(chrome.storage.onChanged);
  const listeners = new Set(), cache = new Map(), REV = '__uhdVaultRevision';
  const MAX_MESSAGE = 32 * 1024 * 1024;
  const checkMessage = value => {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_MESSAGE) throw Object.assign(new Error('Şifreli depolama işlemi 32 MiB sınırını aşıyor. Mevcut veriler değiştirilmedi.'), { code: 'storage-size' });
  };
  const validKey = key => typeof key === 'string' && /^(?:uhd[A-Za-z0-9_]*|ubh_[A-Za-z0-9_]*)$/.test(key) && key.length < 96;
  const keysOf = value => value == null ? null : typeof value === 'string' ? [value] : Array.isArray(value) ? value : Object.keys(value);
  const checkKeys = keys => { if (keys && keys.some(k => !validKey(k))) throw new Error('Depolama anahtarı geçersiz.'); };
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const fire = (changes, area = 'local', revision = 0) => {
    for (const [key, change] of Object.entries(changes)) {
      if (area === 'local') cache.set(key, { value: clone(change.newValue), revision });
    }
    for (const fn of listeners) { try { fn(clone(changes), area); } catch { /* belge/metin içeren hatayı günlüğe alma */ } }
  };
  let broker;
  if (typeof document === 'undefined') {
    let queue = Promise.resolve(), revision = 0, keyRecord;
    const ownRevisions = new Set();
    const transact = task => {
      const result = queue.then(async () => { await ready; return task(); });
      queue = result.catch(() => {}); return result;
    };
    async function keyStore() {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('legaluga-vault', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('keys');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Şifreleme anahtarı deposu açılamadı.'));
        request.onblocked = () => reject(new Error('Şifreleme anahtarı deposu başka pencerede kilitli.'));
      });
      const run = (mode, operation) => new Promise((resolve, reject) => {
        const tx = db.transaction('keys', mode), req = operation(tx.objectStore('keys'));
        let value;
        req.onsuccess = () => { value = req.result; };
        tx.oncomplete = () => resolve(value);
        tx.onerror = tx.onabort = () => reject(new Error('Şifreleme anahtarı kalıcı olarak kaydedilemedi.'));
      });
      try {
        let record = await run('readonly', store => store.get('local'));
        const saved = await native.get(null);
        if (!record) {
          if (Object.values(saved).some(UHDVaultCrypto.isEnvelope)) throw new Error('Şifreli verinin anahtarı bulunamadı. Veri sıfırlanmadı; aynı Chrome profiline dönün.');
          record = { id: crypto.randomUUID(), key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) };
          await run('readwrite', store => store.add(record, 'local'));
        }
        if (!(record.key instanceof CryptoKey) || record.key.extractable || record.key.algorithm.name !== 'AES-GCM' || record.key.algorithm.length !== 256) throw new Error('Şifreleme anahtarı geçersiz.');
        keyRecord = record;
        revision = Number.isSafeInteger(saved[REV]) ? saved[REV] : 0;
        const replacement = {};
        // Başarısız çözmede eski veri silinmez. Bütün eski değerler şifrelenmeden yazma yapılmaz.
        for (const [name, value] of Object.entries(saved)) if (validKey(name)) {
          if (UHDVaultCrypto.isEnvelope(value)) await UHDVaultCrypto.open(record.key, record.id, name, value);
          else replacement[name] = await UHDVaultCrypto.seal(record.key, record.id, name, value);
        }
        if (Object.keys(replacement).length) await commit(replacement);
      } finally { db.close(); }
    }
    const ready = Promise.resolve().then(async () => {
      await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      await keyStore();
    });
    // Bekleyen istekler aynı hatayı alır; eski veriye düz metin geri dönüşü yok.
    ready.catch(() => {});
    async function commit(values) {
      revision = Math.max(revision + 1, Date.now() * 1000);
      ownRevisions.add(revision);
      if (ownRevisions.size > 256) ownRevisions.delete(ownRevisions.values().next().value);
      await native.set({ ...values, [REV]: revision });
    }
    async function read(query, wire = true) {
      const keys = keysOf(query); checkKeys(keys);
      const saved = await native.get(keys == null ? null : [...keys, REV]);
      const data = query && !Array.isArray(query) && typeof query === 'object' ? clone(query) : {};
      const present = [];
      for (const [name, value] of Object.entries(saved)) if (validKey(name)) {
        const result = await UHDVaultCrypto.open(keyRecord.key, keyRecord.id, name, value);
        if (result.exists) { data[name] = result.value; present.push(name); }
        else if (!(query && typeof query === 'object' && !Array.isArray(query))) delete data[name];
      }
      if (wire) checkMessage({ data, present, revision });
      return { data, present, revision };
    }
    async function broadcast(changes) {
      fire(changes, 'local', revision);
      const message = { type: 'uhd-storage-changed', changes, revision };
      // Runtime broadcast reaches extension pages; tab broadcast reaches only our UYAP main-frame scripts.
      void chrome.runtime.sendMessage(message).catch(() => {});
      const tabs = await chrome.tabs.query({ url: 'https://avukat.uyap.gov.tr/*' }).catch(() => []);
      for (const tab of tabs) void chrome.tabs.sendMessage(tab.id, message, { frameId: 0 }).catch(() => {});
    }
    async function write(values, absent = []) {
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Depolama verisi geçersiz.');
      checkMessage(values);
      const names = [...new Set([...Object.keys(values), ...absent])]; checkKeys(names);
      await read(names, false);
      const encrypted = {}, changes = {};
      for (const name of names) {
        const exists = Object.hasOwn(values, name) && values[name] !== undefined;
        encrypted[name] = await UHDVaultCrypto.seal(keyRecord.key, keyRecord.id, name, values[name], exists);
        // Ürün dinleyicileri yalnız newValue kullanır; eski+yeni büyük indeks tek mesajda ikiye katlanmaz.
        changes[name] = exists ? { newValue: clone(values[name]) } : {};
      }
      if (names.length) { await commit(encrypted); await broadcast(changes); }
      return { revision };
    }
    broker = (operation, args) => transact(async () => {
      if (operation === 'get') return read(args);
      if (operation === 'set') return write(args);
      if (operation === 'remove') { const keys = keysOf(args); checkKeys(keys); return write({}, keys || []); }
      if (operation === 'clear') return write({}, Object.keys((await read(null, false)).data));
      if (operation === 'patchPrefs') {
        const prefs = (await read('uhdPrefs')).data.uhdPrefs || {};
        const next = { ...prefs, ...args };
        await write({ uhdPrefs: next }); return { data: next, revision };
      }
      if (operation === 'queueSetupScan') {
        const saved = (await read(['uhdPrefs', 'uhdIndex', 'uhdJob', 'uhdProgress'])).data;
        if (globalThis.UHD.kurulumGerekli(saved.uhdPrefs, saved.uhdIndex)) return { data: { ok: false, error: 'Önce kurulum seçimlerini kaydedin.' }, revision };
        if (saved.uhdJob?.setupPending && !saved.uhdJob.stop) return { data: { ok: true, pending: true, id: saved.uhdJob.id }, revision };
        if (saved.uhdJob || (saved.uhdProgress?.running && Date.now() - (saved.uhdProgress.beat || 0) < 90000))
          return { data: { ok: false, error: 'Devam eden veya yarıda kalan güncellemeyi önce tamamlayın ya da iptal edin.' }, revision };
        const prefs = saved.uhdPrefs || {}, scope = globalThis.UHD.taramaKapsami(prefs);
        const savcilikIller = Array.isArray(prefs.savcilikIller) ? [...prefs.savcilikIller] : [];
        const savcilik = prefs.savcilik || 'otomatik';
        const ilSecildi = savcilikIller.some(il => Number.isInteger(Number(il)) && Number(il) >= 1 && Number(il) <= 81);
        const cbs = savcilik === 'tum' || (savcilik !== 'kapali' && (ilSecildi || (savcilik !== 'secili' && saved.uhdIndex?.records?.length)));
        if (!scope.turler.length && !cbs) return { data: { ok: false, error: 'En az bir dosya türü veya taranacak savcılık ili seçin.' }, revision };
        const job = { id: crypto.randomUUID(), full: false, setupPending: true, startedAt: Date.now(), listDone: false, stats: {},
          taramaKapsami: { taramaTurleri: scope.turler.map(tur => tur.kod),
            taramaDurum: scope.durumlar.length === 2 ? 'tum' : scope.durumlar[0] === 1 ? 'kapali' : 'acik', savcilik, savcilikIller } };
        await write({ uhdJob: job, uhdProgress: { running: false, setupPending: true, jobId: job.id,
          text: 'İlk tarama hazır. UYAP bağlantısı doğrulandığında kendiliğinden başlayacak.' } });
        return { data: { ok: true, pending: true, id: job.id }, revision };
      }
      if (operation === 'fillSetupNameIfEmpty') {
        const prefs = (await read('uhdPrefs')).data.uhdPrefs || {};
        if (prefs.kurulumVekilBekliyor !== true) return { data: null, revision };
        if (typeof args !== 'string' || args.length < 5 || args.length > 100 || args.trim().split(/\s+/).length < 2 ||
          !/^[\p{L}\p{M} '’.-]+$/u.test(args)) throw new Error('Profil adı geçersiz.');
        const next = { ...prefs, myName: String(prefs.myName || '').trim() ? prefs.myName : args.trim(), kurulumVekilBekliyor: false };
        await write({ uhdPrefs: next }); return { data: next, revision };
      }
      if (operation === 'activateSetupScan') {
        const saved = (await read(['uhdPrefs', 'uhdIndex', 'uhdJob'])).data, job = saved.uhdJob;
        if (!job?.setupPending || job.stop || job.id !== args || globalThis.UHD.kurulumGerekli(saved.uhdPrefs, saved.uhdIndex))
          return { data: null, revision };
        const next = { ...job, paused: null };
        delete next.setupPending;
        await write({ uhdJob: next });
        return { data: next, revision };
      }
      if (operation === 'cancelSetupScan') {
        const job = (await read('uhdJob')).data.uhdJob;
        if (!job?.setupPending) return { data: false, revision };
        await write({ uhdProgress: { running: false, text: 'Bekleyen ilk tarama iptal edildi.', endedAt: Date.now() } }, ['uhdJob']);
        return { data: true, revision };
      }
      if (operation === 'togglePref') {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(args)) throw new Error('Tercih adı geçersiz.');
        const prefs = (await read('uhdPrefs')).data.uhdPrefs || {};
        const next = { ...prefs, [args]: !prefs[args] };
        await write({ uhdPrefs: next }); return { data: next, revision };
      }
      if (operation === 'replaceBackup') {
        const data = globalThis.UHD.checkBackup({ app: UHD.BACKUP_APP, format: UHD.BACKUP_FORMAT, data: args });
        await write(data, UHD.BACKUP_KEYS.filter(k => !Object.hasOwn(data, k))); return { revision };
      }
      if (operation === 'mergeBankCheck') {
        if (!args || typeof args.fileKey !== 'string' || !args.snapshot) throw new Error('Banka takip isteği geçersiz.');
        const current = (await read('uhdBankChecks')).data.uhdBankChecks;
        const next = globalThis.UHDBankChecks.mergeSnapshot(current, args.fileKey, args.snapshot);
        await write({ uhdBankChecks: next });
        return { data: next.files[args.fileKey].subjects[args.snapshot.debtorKey], revision };
      }
      // "Tüm verileri sil": evrak listesini taşıyan bütün indirme planları ve dizin kaldırılır. Chrome'a kaydı süren
      // bir parça varsa hiçbir plana dokunulmaz; kullanıcı önce indirmeyi durdurur.
      if (operation === 'clearBulkDownloads') {
        const saved = await native.get(null);
        const keys = Object.keys(saved).filter(name => /^uhdBulkDownload_[0-9a-f]{64}(?:_plan)?$/.test(name));
        for (const name of keys) {
          if (name.endsWith('_plan')) continue;
          const job = (await read(name, false)).data[name];
          if (job?.pendingDownload) return { data: { cleared: false, pending: true }, revision };
        }
        await write({}, [...keys, 'uhdBulkDownloadIndex']);
        return { data: { cleared: true, plans: keys.filter(name => !name.endsWith('_plan')).length }, revision };
      }
      if (['createBulkDownload', 'getBulkDownload', 'listBulkDownloads', 'discardBulkDownload', 'reserveBulkPart', 'attachBulkPart', 'settleBulkPart'].includes(operation)) {
        const bulk = globalThis.UHDBulkDownload;
        if (!bulk) throw new Error('Parçalı evrak indirme modülü yüklenemedi.');
        const index = (await read('uhdBulkDownloadIndex', false)).data.uhdBulkDownloadIndex || { v: 1, files: {} };
        if (operation === 'listBulkDownloads') {
          const pending = [];
          for (const [fileKey, key] of Object.entries(index.files || {})) {
            if (!/^uhdBulkDownload_[0-9a-f]{64}$/.test(key)) continue;
            const job = (await read(key, false)).data[key];
            if (job && job.fileKey === fileKey && job.pendingDownload)
              pending.push({ fileKey, id: job.id, pendingDownload: job.pendingDownload });
          }
          return { data: pending, revision };
        }
        const fileKey = bulk.fileKey(args?.fileKey), key = await bulk.storageKey(fileKey);
        const planKey = key + '_plan', values = (await read([key, planKey], false)).data;
        const saved = values[key], plan = values[planKey];
        const job = saved ? bulk.check({ ...(plan || {}), ...saved }) : null;
        const planOf = value => ({ v: value.v, id: value.id, fileKey: value.fileKey, createdAt: value.createdAt,
          scope: value.scope, includeAttachments: value.includeAttachments, targets: value.targets });
        const stateOf = value => ({ v: value.v, id: value.id, fileKey: value.fileKey, updatedAt: value.updatedAt,
          cursor: value.cursor, parts: value.parts, pendingDownload: value.pendingDownload, status: value.status });
        if (job && job.fileKey !== fileKey) throw new Error('İndirme planının dosyası uyuşmuyor.');
        if (operation === 'getBulkDownload') return { data: job, revision };
        if (operation === 'createBulkDownload') {
          if (job) return { data: job, revision };
          if (Object.keys(index.files || {}).length >= 1000) throw new Error('İndirme kayıtları sınırına ulaşıldı. Tamamlanan planları kaldırın.');
          const next = bulk.create(args, crypto.randomUUID());
          await write({ [planKey]: planOf(next), [key]: stateOf(next), uhdBulkDownloadIndex: { v: 1, files: { ...index.files, [fileKey]: key } } });
          return { data: next, revision };
        }
        if (!job || job.id !== args.jobId) return { data: null, revision };
        if (operation === 'discardBulkDownload') {
          if (job.pendingDownload) return { data: false, revision };
          const files = { ...index.files }; delete files[fileKey];
          await write({ uhdBulkDownloadIndex: { v: 1, files } }, [key, planKey]);
          return { data: true, revision };
        }
        const next = operation === 'reserveBulkPart' ? bulk.reserve(job, args, crypto.randomUUID())
          : operation === 'attachBulkPart' ? bulk.attach(job, args.token, args.downloadId)
            : bulk.settle(job, args);
        if (next) await write({ [key]: stateOf(next), ...(!plan ? { [planKey]: planOf(next) } : {}) });
        return { data: next, revision };
      }
      if (['getSafahat', 'beginSafahat', 'saveSafahat', 'cancelSafahat'].includes(operation)) {
        const key = args?.fileKey;
        if (!globalThis.UHD.safahatFileKey(key)) throw new Error('Safahat dosya anahtarı geçersiz.');
        const current = globalThis.UHD.checkSafahatStore((await read('uhdSafahat')).data.uhdSafahat, true);
        const now = Date.now(), state = globalThis.UHD.safahatState(current, key, now);
        if (operation === 'getSafahat') return { data: state, revision };
        if (operation === 'beginSafahat') {
          if (state.waitMs || state.busy) return { data: { ...state, allowed: false }, revision };
          // Şifreli geçici kilit sekmeler ve worker yeniden başlaması arasında aynı dosyanın çift isteğini önler.
          const token = crypto.randomUUID();
          current.pending[key] = { token, at: now };
          await write({ uhdSafahat: globalThis.UHD.checkSafahatStore(current, true) });
          return { data: { ...state, allowed: true, token }, revision };
        }
        const pending = current.pending[key];
        if (operation === 'cancelSafahat') {
          if (pending && pending.token === args.token) { delete current.pending[key]; await write({ uhdSafahat: current }); }
          return { revision };
        }
        if (!pending || pending.token !== args.token || !state.busy) throw new Error('Safahat sorgusu iptal edildi veya süresi doldu; eski kayıt korundu.');
        if (state.waitMs) throw new Error('Safahat başka bir işlemde güncellendi; eski kayıt korundu.');
        const snapshot = globalThis.UHD.checkSafahatSnapshot({ fetchedAt: Math.max(now, pending.at), items: args.items });
        current.files[key] = snapshot;
        delete current.pending[key];
        await write({ uhdSafahat: globalThis.UHD.checkSafahatStore(current, true) });
        return { data: snapshot, revision };
      }
      if (operation === 'status') {
        const saved = await native.get(null), values = Object.entries(saved).filter(([name]) => validKey(name));
        return { data: { encrypted: true, algorithm: 'AES-256-GCM', automatic: true, extractable: keyRecord.key.extractable, entries: values.length, plaintextEntries: values.filter(([,v])=>!UHDVaultCrypto.isEnvelope(v)).length }, revision };
      }
      throw new Error('Depolama işlemi desteklenmiyor.');
    });
    const trusted = sender => sender.id === chrome.runtime.id && (String(sender.url || '').startsWith(chrome.runtime.getURL('')) || (sender.frameId === 0 && String(sender.url || '').startsWith('https://avukat.uyap.gov.tr/')));
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (message?.type !== 'uhd-storage' || !trusted(sender)) return;
      broker(message.operation, message.args).then(result => reply({ ok: true, ...result }), error => reply({ ok: false, error: error?.code === 'storage-size' ? 'Şifreli depolama işlemi 32 MiB sınırını aşıyor. Mevcut veriler değiştirilmedi.' : 'Şifreli depolama açılamadı veya yazılamadı. Veriler sıfırlanmadı; aynı Chrome profilinde tekrar deneyin.' }));
      return true;
    });
    rawListen((changes, area) => {
      if (area !== 'local') { fire(changes, area); return; }
      const value = changes[REV]?.newValue;
      if (ownRevisions.has(value)) return;
      const names = Object.keys(changes).filter(validKey);
      if (!names.length) return;
      // Eski sürümün açık uzantı sayfası düz metin yazarsa aynı kuyrukta şifrele; raw event yayma.
      void transact(async () => {
        const saved = await native.get(names), encrypted = {}, decoded = {};
        for (const name of names) {
          const raw = saved[name];
          if (raw === undefined) decoded[name] = {};
          else if (UHDVaultCrypto.isEnvelope(raw)) {
            const v = await UHDVaultCrypto.open(keyRecord.key, keyRecord.id, name, raw);
            decoded[name] = v.exists ? { newValue: v.value } : {};
          } else { encrypted[name] = await UHDVaultCrypto.seal(keyRecord.key, keyRecord.id, name, raw); decoded[name] = { newValue: raw }; }
        }
        await commit(encrypted);
        await broadcast(decoded);
      }).catch(() => {});
    });
  }
  async function request(operation, args) {
    checkMessage({ operation, args });
    if (broker) return broker(operation, args);
    const result = await chrome.runtime.sendMessage({ type: 'uhd-storage', operation, args });
    if (!result?.ok) throw new Error(result?.error || 'Şifreli depolama yanıt vermedi. Sayfayı yenileyin.');
    return result;
  }
  const local = {
    async get(query = null) {
      const result = await request('get', query), data = result.data, keys = keysOf(query);
      for (const [name, entry] of cache) if ((keys == null || keys.includes(name)) && entry.revision > result.revision) {
        if (entry.value === undefined) {
          if (query && typeof query === 'object' && !Array.isArray(query) && Object.hasOwn(query, name)) data[name] = clone(query[name]);
          else delete data[name];
        } else data[name] = clone(entry.value);
      }
      const names = new Set([...(keys || Object.keys(data)), ...(keys == null ? cache.keys() : [])]);
      for (const name of names) if (!cache.has(name) || cache.get(name).revision <= result.revision) {
        cache.set(name, { value: result.present.includes(name) ? clone(data[name]) : undefined, revision: result.revision });
      }
      return data;
    },
    async set(values) { await request('set', values); },
    async remove(keys) { await request('remove', keys); },
    async clear() { await request('clear'); }
  };
  if (!broker) {
    rawListen((changes, area) => { if (area !== 'local') fire(changes, area); });
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (message?.type === 'uhd-storage-changed' && sender.id === chrome.runtime.id && !sender.tab && Number.isSafeInteger(message.revision)) {
        const changes = {};
        for (const [key, change] of Object.entries(message.changes || {})) if (validKey(key) && (!cache.has(key) || cache.get(key).revision < message.revision)) changes[key] = change;
        if (Object.keys(changes).length) fire(changes, 'local', message.revision);
      }
    });
  }
  Object.assign(chrome.storage.local, local);
  chrome.storage.onChanged.addListener = fn => listeners.add(fn);
  chrome.storage.onChanged.removeListener = fn => listeners.delete(fn);
  chrome.storage.onChanged.hasListener = fn => listeners.has(fn);
  globalThis.UHDStorage = { local, patchPrefs: async patch => (await request('patchPrefs', patch)).data,
    fillSetupNameIfEmpty: async name => (await request('fillSetupNameIfEmpty', name)).data,
    queueSetupScan: async () => (await request('queueSetupScan')).data,
    activateSetupScan: async id => (await request('activateSetupScan', id)).data,
    cancelSetupScan: async () => (await request('cancelSetupScan')).data,
    createBulkDownload: async options => (await request('createBulkDownload', options)).data,
    readBulkDownload: async fileKey => (await request('getBulkDownload', { fileKey })).data,
    getBulkDownload: async fileKey => {
      if (broker) await globalThis.UHDBulkDownloadSink?.reconcile(fileKey);
      else await chrome.runtime.sendMessage({ type: 'uhd-download-reconcile', fileKey });
      return (await request('getBulkDownload', { fileKey })).data;
    },
    listBulkDownloads: async () => (await request('listBulkDownloads')).data,
    clearBulkDownloads: async () => (await request('clearBulkDownloads')).data,
    discardBulkDownload: async (fileKey, jobId) => (await request('discardBulkDownload', { fileKey, jobId })).data,
    reserveBulkPart: async options => (await request('reserveBulkPart', options)).data,
    attachBulkPart: async options => (await request('attachBulkPart', options)).data,
    settleBulkPart: async options => (await request('settleBulkPart', options)).data,
    togglePref: async name => (await request('togglePref', name)).data,
    replaceBackup: async data => { await request('replaceBackup', data); },
    mergeBankCheck: async (fileKey, snapshot) => (await request('mergeBankCheck', { fileKey, snapshot })).data,
    getSafahat: async fileKey => (await request('getSafahat', { fileKey })).data,
    beginSafahat: async fileKey => (await request('beginSafahat', { fileKey })).data,
    saveSafahat: async (fileKey, token, items) => (await request('saveSafahat', { fileKey, token, items })).data,
    cancelSafahat: async (fileKey, token) => { await request('cancelSafahat', { fileKey, token }); },
    status: async () => (await request('status')).data };
})();
