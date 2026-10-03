// Uzantı kökenli panel. Köprü, doğrulanmış tek oturum MessagePort'unu connect ile verir.
(() => {
  const M = globalThis.UHD.durusmaPaketiModel;
  const $ = id => document.getElementById(id);
  let state = M.initial(), transport = null, sessionId = '', nextRun = 0, pdfUrl = null, worker = null, preparse = null, workerTimer = null;
  let textJob = null;
  function stopTextJob() { textJob?.finish([], '', false); }
  function stopWorker() {
    clearTimeout(workerTimer); workerTimer = null;
    preparse?.abort(); preparse = null;
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
    worker = null;
  }

  function revoke() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = null;
    $('onizleme').removeAttribute('src');
    $('indir').removeAttribute('href');
  }
  function dispatch(action) {
    const previous = state;
    state = M.reducer(state, action);
    if (previous.result && !state.result) revoke();
    if (state !== previous) render();
    return state !== previous;
  }
  function send(type, payload = {}, transfer = []) {
    if (transport) transport.send({ type, sessionId, ...payload }, transfer);
  }
  function label(item) {
    const raw = item.date;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    const local = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(raw);
    const date = iso ? `${iso[3]}.${iso[2]}.${iso[1]}`
      : local ? `${local[1].padStart(2, '0')}.${local[2].padStart(2, '0')}.${local[3]}`
        : raw || 'Tarih belirtilmemiş';
    const dateNote = item.isAttachment && item.dateSource === 'parent' ? ' (ana evraktan)' : '';
    return `${date}${dateNote} · ${item.format}${item.group ? ` · ${item.group}` : ''}`;
  }
  function itemFor(id) { return state.items.find(item => item.id === id); }
  function button(text, action, disabled = false) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.disabled = disabled; b.addEventListener('click', action); return b;
  }
  function announce(value) { $('duyuru').textContent = value; }
  function move(id, to) {
    if (!dispatch({ type: 'MOVE', id, to })) return;
    const item = itemFor(id);
    announce(`${item?.title || 'Evrak'} ${state.selected.indexOf(id) + 1}. sıraya taşındı.`);
    [...$('sira-listesi').querySelectorAll('li')].find(li => li.dataset.id === id)?.querySelector('.handle')?.focus();
  }
  function render() {
    const active = document.activeElement;
    const focusId = active?.dataset?.itemId;
    const focusKind = active?.dataset?.focusKind;
    const busy = state.phase === 'running' || state.phase === 'cancelling';
    const edit = !busy;
    const groups = [...new Set(state.items.map(item => item.group).filter(Boolean))];
    const groupSelect = $('grup');
    const chosen = groupSelect.value;
    groupSelect.replaceChildren(new Option('Tüm gruplar', ''), ...groups.map(g => new Option(g, g)));
    groupSelect.value = groups.includes(chosen) ? chosen : '';
    if ($('ara').value !== state.filter) $('ara').value = state.filter;
    $('ara').disabled = !edit; groupSelect.disabled = !edit;
    $('tam-liste').hidden = state.complete;
    $('tam-liste').disabled = !edit;
    $('gorunenleri-sec').disabled = !edit || !M.visible(state).some(item => item.selectable && !item.stale);
    $('ekleri-sec').disabled = !edit || !state.items.some(item => item.isAttachment && state.selected.includes(item.parentId) && !state.selected.includes(item.id));
    $('liste-durum').textContent = state.notice || (state.locked ? 'UYAP evrak listesi kilitli.' : !state.complete ? 'Liste eksik. Gerekirse Tüm listeyi yükle düğmesini kullanın.' : '');
    const list = $('evrak-listesi'); list.replaceChildren();
    for (const item of M.visible(state)) {
      const row = document.createElement('label'); row.className = `item${item.isAttachment ? ' attachment' : ''}`;
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = state.selected.includes(item.id);
      check.dataset.itemId = item.id; check.dataset.focusKind = 'checkbox';
      check.disabled = !edit || !item.selectable || item.stale;
      check.addEventListener('change', () => dispatch({ type: 'TOGGLE', id: item.id }));
      const body = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = item.title;
      const meta = document.createElement('span'); meta.className = 'meta';
      meta.textContent = `${item.isAttachment ? `Ek · Ana evrak: ${item.parentTitle || 'Bilinmiyor'} · ` : ''}${label(item)}${item.stale ? ' · Yeniden doğrulanmalı' : ''}${!item.selectable && !item.stale ? ' · Kimlik belirsiz' : ''}`;
      body.append(title, meta); row.append(check, body); list.append(row);
    }
    if (!list.childElementCount) list.textContent = 'Bu görünümde evrak yok.';
    const ordered = $('sira-listesi'); ordered.replaceChildren();
    state.selected.forEach((id, index) => {
      const item = itemFor(id); if (!item) return;
      const li = document.createElement('li'); li.dataset.id = id;
      const row = document.createElement('div'); row.className = 'row';
      const handle = button('⠿ Taşı', () => {}, !edit); handle.className = 'handle';
      handle.draggable = false;
      handle.dataset.itemId = id; handle.dataset.focusKind = 'handle';
      handle.setAttribute('aria-label', `${item.title} sırasını taşı`);
      handle.addEventListener('keydown', event => {
        if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault(); move(id, index + (event.key === 'ArrowUp' ? -1 : 1));
        }
      });
      const name = document.createElement('span'); name.className = 'name';
      const strong = document.createElement('strong'); strong.textContent = item.title;
      const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = label(item);
      name.append(strong, meta);
      row.append(handle, name,
        button('Yukarı taşı', () => move(id, index - 1), !edit || index === 0),
        button('Aşağı taşı', () => move(id, index + 1), !edit || index === state.selected.length - 1),
        button('Listeden çıkar', () => dispatch({ type: 'REMOVE', id }), !edit));
      li.append(row); ordered.append(li);
    });
    $('sayi').textContent = `(${state.selected.length})`;
    $('hazirla').disabled = !transport || busy || state.locked || !state.selected.length || state.selected.some(id => !itemFor(id)?.selectable || itemFor(id)?.stale);
    $('durdur').hidden = !busy; $('durdur').disabled = state.phase === 'cancelling';
    $('ilerleme').textContent = state.phase === 'running' ? (state.progress?.message || 'Paket hazırlanıyor…')
      : state.phase === 'cancelling' ? 'Durduruluyor…'
        : state.phase === 'cancelled' ? 'İşlem durduruldu; PDF oluşturulmadı.' : '';
    renderFailures();
    $('sonuc').hidden = state.phase !== 'ready' || !state.result || !pdfUrl;
    if (state.phase === 'ready') {
      const n = state.skipped.length + state.excluded.filter(id => !state.skipped.some(x => x.id === id)).length;
      $('sonuc-durum').textContent = state.result?.incomplete
        ? `Paket hazır; ${n} evrak eklenemedi ve PDF’in başında nedeniyle raporlandı.` : 'Paket hazır.';
    }
    renderSkipped();
    notify();
    if (focusId && focusKind) {
      const nodes = focusKind === 'checkbox' ? list.querySelectorAll('input[type=checkbox]') : ordered.querySelectorAll('.handle');
      [...nodes].find(node => node.dataset.itemId === focusId)?.focus({ preventScroll: true });
    }
  }
  // Dosya ekranına (paket motoru olarak açıldığında) evre, ilerleme yazısı ve hatalar bildirilir; değişmediyse gönderilmez.
  let lastStatus = '';
  function notify() {
    if (!transport) return;
    const status = { phase: state.phase, message: state.progress?.message || '',
      failures: state.phase === 'failed' ? state.failures.map(f => ({ id: f.id, reason: f.reason })) : [] };
    const key = JSON.stringify(status);
    if (key === lastStatus) return;
    lastStatus = key;
    send('STATUS', status);
  }
  function renderSkipped() {
    const box = $('atlananlar'); box.replaceChildren();
    box.hidden = state.phase !== 'ready' || !state.skipped.length;
    if (box.hidden) return;
    const ul = document.createElement('ul');
    for (const x of state.skipped) {
      const li = document.createElement('li');
      li.textContent = `${itemFor(x.id)?.title || 'Evrak'}: ${x.reason}`;
      li.append(' ', button('Özgün evrakı indir', () => send('DOWNLOAD_ORIGINAL', { id: x.id })));
      ul.append(li);
    }
    const p = document.createElement('p'); p.textContent = 'Pakete eklenemeyen evraklar:';
    box.append(p, ul);
  }
  function renderFailures() {
    const box = $('hatalar'); box.replaceChildren(); box.hidden = state.phase !== 'failed';
    if (box.hidden) return;
    const p = document.createElement('p'); p.textContent = 'Aşağıdaki evraklar hazırlanamadı. PDF oluşturulmadı.';
    const ul = document.createElement('ul');
    for (const failure of state.failures) {
      const li = document.createElement('li');
      li.textContent = `${itemFor(failure.id)?.title || 'Paket'}: ${failure.reason}`;
      if (failure.id) li.append(' ', button('Özgün evrakı indir', () => send('DOWNLOAD_ORIGINAL', { id: failure.id })));
      ul.append(li);
    }
    box.append(p, ul,
      button('Tekrar dene', retry, !state.failures.length),
      button('Bu evrakları çıkararak devam et', exclude,
        !state.failures.length || state.failures.length >= state.snapshot.length || state.failures.some(x => !x.id)));
  }
  function newRunId() { return `${sessionId}:${++nextRun}`; }
  function start() {
    const runId = newRunId();
    if (!dispatch({ type: 'START', runId })) return;
    stopWorker(); revoke(); send('START', { runId, orderedIds: [...state.snapshot] });
  }
  function retry() {
    const failedIds = state.failures.some(x => !x.id) ? [...state.snapshot] : state.failures.map(x => x.id);
    const runId = newRunId();
    if (dispatch({ type: 'RETRY', runId })) send('RETRY', { runId, failedIds });
  }
  function exclude() {
    const excludedIds = state.failures.map(x => x.id), runId = newRunId();
    if (dispatch({ type: 'EXCLUDE', runId })) send('EXCLUDE_AND_CONTINUE', { runId, excludedIds });
  }
  function cancel() {
    const runId = state.runId;
    if (dispatch({ type: 'CANCEL_REQUEST' })) { stopWorker(); revoke(); send('CANCEL', { runId }); }
  }
  async function startWorker(message) {
    if (message.runId !== state.runId || state.phase !== 'running' || !Array.isArray(message.items) ||
        !Array.isArray(message.orderedIds) || worker) return;
    const runId = message.runId;
    const items = message.items;
    preparse = new AbortController();
    const parseSignal = preparse.signal;
    const udfFailures = [];
    for (const item of items) {
      if (String(item.format).toLowerCase() !== 'udf') continue;
      try {
        const model = await globalThis.UHD.udf.oku(new Blob([item.bytes], { type: 'application/octet-stream' }), { signal: parseSignal, paket: true });
        if (parseSignal.aborted || state.runId !== runId || state.phase !== 'running') return;
        const c = model.sayac || {};
        item.udfModel = model;
        item.udfDiagnostics = { complete: model.paketTani?.complete === true && !model.kesildi && !c.resimReddi && !c.ofsetSorunu && !c.bilinmeyen,
          kesildi: model.kesildi || null, resimReddi: c.resimReddi || 0,
          ofsetSorunu: c.ofsetSorunu || 0, bilinmeyen: c.bilinmeyen || 0,
          issues: model.paketTani?.issues || [], referenceVerified: false };
        if (!item.udfDiagnostics.complete) {
          const reasons = [...new Set(item.udfDiagnostics.issues.map(x => x.message))].slice(0, 3);
          if (model.kesildi) reasons.push('UDF okuma sınırına ulaşıldı; belgenin tamamı çözülemedi.');
          if (c.resimReddi) reasons.push('UDF içinde çözülemeyen resim var.');
          if (c.ofsetSorunu) reasons.push('UDF metin konumları belge içeriğiyle uyuşmuyor.');
          if (c.bilinmeyen && !reasons.length) reasons.push('UDF içinde çözülemeyen belge öğesi var.');
          udfFailures.push({ id: item.id, reason: reasons.join(' ') || 'UDF içeriği eksiksiz çözülemedi.' });
        }
      } catch (err) {
        if (parseSignal.aborted) return;
        udfFailures.push({ id: item.id, reason: err?.message || 'UDF okunamadı.' });
      }
    }
    preparse = null;
    if (udfFailures.length && udfFailures.length >= items.length) {
      send('WORKER_FAILED', { runId, failures: udfFailures });
      dispatch({ type: 'FAILED', runId, failures: udfFailures }); return;
    }
    const udfSkipped = new Set(udfFailures.map(x => x.id));
    const workItems = items.filter(item => !udfSkipped.has(item.id));
    const workOrder = message.orderedIds.filter(id => !udfSkipped.has(id));
    const workExcluded = [...(message.excluded || []), ...udfFailures.map(x => ({ id: x.id, title: items.find(item => item.id === x.id)?.title || 'Evrak', reason: x.reason }))];
    if (state.runId !== runId || state.phase !== 'running') return;
    let instance;
    try { instance = worker = new Worker(chrome.runtime.getURL('durusma-paketi-worker.js')); }
    catch {
      send('WORKER_FAILED', { runId, failures: [{ id: '', reason: 'PDF işçisi başlatılamadı.' }] });
      dispatch({ type: 'ERROR', runId, message: 'PDF işçisi başlatılamadı.' }); return;
    }
    // Süre sınırı işçinin son ilerleme bildiriminden sayılır: çok sayfalı evrak ilerlerken kesilmez, takılan işçi durdurulur.
    const armTimer = () => {
      clearTimeout(workerTimer);
      workerTimer = setTimeout(() => {
        if (worker !== instance || state.runId !== runId) return;
        stopWorker();
        const message = 'PDF hazırlama süresi sınırını aştı. Daha küçük bir paket seçip yeniden deneyin.';
        send('WORKER_FAILED', { runId, failures: [{ id: '', reason: message }] });
        dispatch({ type: 'ERROR', runId, message });
      }, 120000);
    };
    armTimer();
    instance.onmessage = event => {
      if (worker !== instance || state.runId !== runId || state.phase !== 'running') return;
      const result = event.data || {};
      if (result.runId !== runId) return;
      if (result.type === 'PROGRESS') {
        armTimer();
        dispatch({ type: 'PROGRESS', runId, phase: result.phase,
          itemId: result.itemId, message: result.message || `${result.phase || 'PDF'} · ${result.done || 0}/${result.total || '?'}` });
      } else if (result.type === 'FAILED') {
        const failures = (Array.isArray(result.issues) ? result.issues : [])
          .map(x => ({ id: x.id || '', reason: x.message || x.code || 'Dönüştürme başarısız.' }));
        stopWorker(); send('WORKER_FAILED', { runId, failures });
        dispatch({ type: 'FAILED', runId, failures });
      } else if (result.type === 'READY') {
        stopWorker(); send('WORKER_DONE', { runId });
        receive({ type: 'READY', sessionId, runId, bytes: result.bytes,
          incomplete: !!result.incomplete, excluded: Array.isArray(result.excluded) ? result.excluded : [],
          filename: result.incomplete ? 'Durusma_Paketi_eksik-paket.pdf' : 'Durusma_Paketi.pdf' });
      } else if (result.type === 'CANCELLED') {
        stopWorker(); send('CANCEL', { runId }); dispatch({ type: 'CANCELLED', runId });
      }
    };
    instance.onerror = () => {
      if (worker !== instance) return;
      stopWorker(); send('WORKER_FAILED', { runId, failures: [{ id: '', reason: 'PDF işçisi durdu.' }] });
      dispatch({ type: 'ERROR', runId, message: 'PDF hazırlanamadı.' });
    };
    const transfer = workItems.map(item => item.bytes).filter(bytes => bytes instanceof ArrayBuffer);
    try {
      instance.postMessage({ type: 'INIT', runId, items: workItems, excluded: workExcluded }, transfer);
      instance.postMessage({ type: 'START', runId, orderedIds: workOrder,
        excludedIds: workExcluded.map(x => x.id) });
    } catch {
      stopWorker(); send('WORKER_FAILED', { runId, failures: [{ id: '', reason: 'PDF işçisine evrak aktarılamadı.' }] });
      dispatch({ type: 'ERROR', runId, message: 'PDF işçisine evrak aktarılamadı.' });
    }
  }
  function metinIsi(message) {
    const jobId = String(message.jobId || '');
    const items = message.items;
    textJob?.finish([], 'Önceki metin okuma işlemi durduruldu.');
    if (!jobId || !Array.isArray(items) || !items.length || items.length > 200 ||
      items.some(x => !x || typeof x.id !== 'string' || !x.id || !(x.bytes instanceof ArrayBuffer) || !x.bytes.byteLength) ||
      new Set(items.map(x => x.id)).size !== items.length || new Set(items.map(x => x.bytes)).size !== items.length ||
      items.reduce((n, x) => n + x.bytes.byteLength, 0) > 64 * 1024 * 1024) {
      send('TEXT_RESULT', { jobId, texts: [], error: 'Metin evrak seçimi veya kaynak boyutu geçersiz.' }); return;
    }
    let w, zaman, finished = false;
    const bitir = (sonuc, hata, notify = true) => {
      if (finished) return;
      finished = true; clearTimeout(zaman);
      if (textJob?.finish === bitir) textJob = null;
      if (w) { w.onmessage = null; w.onerror = null; w.onmessageerror = null; try { w.terminate(); } catch {} }
      if (notify) {
        const texts = Array.isArray(sonuc) ? sonuc : [];
        send('TEXT_RESULT', { jobId, texts, error: hata || '' },
          texts.flatMap(x => (x.sources || []).map(s => s.bytes).filter(b => b instanceof ArrayBuffer)));
      }
    };
    textJob = { finish: bitir };
    zaman = setTimeout(() => bitir(null, 'Metin çıkarma süresi doldu; işlem durduruldu.'), 120000);
    try { w = new Worker(chrome.runtime.getURL('durusma-paketi-worker.js')); }
    catch { bitir(null, 'Metin işçisi başlatılamadı.'); return; }
    w.onmessage = e => { if (e.data?.type === 'TEXT_READY' && e.data.runId === jobId) bitir(e.data.texts, e.data.error); };
    w.onerror = () => bitir(null, 'Metin işçisi durdu.');
    w.onmessageerror = () => bitir(null, 'Metin işçisinin yanıtı okunamadı.');
    try { w.postMessage({ type: 'TEXT', runId: jobId, items }, items.map(x => x.bytes)); }
    catch { bitir(null, 'Metin işçisine evrak aktarılamadı.'); }
  }
  function receive(message) {
    if (!message || message.sessionId !== sessionId) return;
    if (message.type === 'LIST') { dispatch({ type: 'LIST', ...message }); $('baglanti').hidden = true; return; }
    if (message.type === 'LIST_ERROR') { $('baglanti').hidden = false; $('baglanti').textContent = `Evrak listesi alınamadı: ${message.message || 'Bilinmeyen hata'}`; return; }
    if (message.type === 'ORIGINAL_ERROR') { announce(`Özgün evrak indirilemedi: ${message.message || 'Bilinmeyen hata'}`); return; }
    if (message.type === 'DOCUMENTS') { startWorker(message); return; }
    // Banka cevapları: dosya ekranının aldığı evrakların metni ayrı bir işçide çıkarılır ve geri gönderilir.
    if (message.type === 'EXTRACT_TEXT') { metinIsi(message); return; }
    // Dosya ekranında işaretlenen evraklar bu sırayla seçilir ve paket hemen hazırlanır.
    if (message.type === 'SELECT_AND_START') {
      dispatch({ type: 'SELECT_SET', ids: message.orderedIds });
      if (state.selected.length && state.phase === 'idle') start();
      else send('STATUS', { phase: 'failed', message: '', failures: [{ id: '', reason: 'Seçilen evraklar listede bulunamadı; listeyi yenileyip tekrar deneyin.' }] });
      return;
    }
    if (message.type === 'PROGRESS') dispatch({ type: 'PROGRESS', ...message });
    if (message.type === 'FAILED') dispatch({ type: 'FAILED', ...message });
    if (message.type === 'CANCELLED' && dispatch({ type: 'CANCELLED', ...message })) { stopWorker(); revoke(); }
    if (message.type === 'ERROR' && dispatch({ type: 'ERROR', ...message })) { stopWorker(); revoke(); }
    if (message.type === 'READY' && message.runId === state.runId && state.phase === 'running') {
      const bytes = message.bytes;
      if (!(bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes))) return;
      const result = { bytes, incomplete: !!message.incomplete, excluded: Array.isArray(message.excluded) ? message.excluded : [],
        filename: String(message.filename || 'Durusma_Paketi.pdf') };
      if (!dispatch({ type: 'READY', runId: message.runId, result })) return;
      revoke(); pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      $('onizleme').src = pdfUrl; $('indir').href = pdfUrl; $('indir').download = result.filename;
      render();
      // PDF'in bir kopyası dosya ekranına gider; orada önizlemede açılır ve indirilir.
      const copy = bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const skipped = [...state.skipped, ...state.excluded.filter(id => !state.skipped.some(x => x.id === id))
        .map(id => ({ id, reason: 'Dışarıda bırakıldı.' }))];
      transport?.send({ type: 'RESULT', sessionId, runId: message.runId, bytes: copy, filename: result.filename,
        incomplete: result.incomplete, count: state.snapshot.length - skipped.length, skipped }, [copy]);
    }
  }
  function connect(adapter) {
    if (transport || !adapter || typeof adapter.send !== 'function' || typeof adapter.on !== 'function' || !adapter.sessionId) return false;
    sessionId = String(adapter.sessionId); transport = adapter; adapter.on(receive);
    $('baglanti').textContent = 'Evrak listesi alınıyor…'; send('LIST_REQUEST'); render(); return true;
  }
  $('grup').addEventListener('change', event => dispatch({ type: 'GROUP', value: event.target.value }));
  $('ara').addEventListener('input', event => dispatch({ type: 'FILTER', value: event.target.value }));
  $('gorunenleri-sec').addEventListener('click', () => dispatch({ type: 'SELECT_VISIBLE' }));
  $('ekleri-sec').addEventListener('click', () => dispatch({ type: 'SELECT_ATTACHMENTS' }));
  $('tam-liste').addEventListener('click', () => send('LIST_ALL'));
  $('hazirla').addEventListener('click', start); $('durdur').addEventListener('click', cancel);
  $('kapat').addEventListener('click', () => { if (state.phase === 'running') cancel(); stopTextJob(); stopWorker(); revoke(); send('CLOSE'); transport?.close?.(); });
  let pointerDrag = null;
  const rows = () => [...$('sira-listesi').children];
  const clearPointerDrag = () => {
    pointerDrag = null;
    for (const li of rows()) li.classList.remove('dragging');
  };
  // Sürükleme iptal edilince satırlar özgün sıraya döner.
  const restoreOrder = () => { const list = $('sira-listesi'); for (const id of state.selected) { const li = rows().find(x => x.dataset.id === id); if (li) list.append(li); } };
  $('sira-listesi').addEventListener('pointerdown', event => {
    const handle = event.target.closest('.handle');
    if (!handle || event.button !== 0 || handle.disabled) return;
    pointerDrag = { id: handle.dataset.itemId, y: event.clientY, moved: false };
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
  });
  $('sira-listesi').addEventListener('pointermove', event => {
    if (!pointerDrag) return;
    if (!pointerDrag.moved && Math.abs(event.clientY - pointerDrag.y) <= 5) return;
    const list = $('sira-listesi');
    const dragged = rows().find(li => li.dataset.id === pointerDrag.id);
    if (!dragged) return;
    pointerDrag.moved = true;
    dragged.classList.add('dragging');
    // Sürüklenen satır, imlecin üstünde kaldığı ilk satırın önüne alınır; hiçbirinin üstünde değilse sona.
    const others = rows().filter(li => li !== dragged);
    const before = others.find(li => { const r = li.getBoundingClientRect(); return event.clientY < r.top + r.height / 2; });
    if (before) { if (dragged.nextElementSibling !== before) list.insertBefore(dragged, before); }
    else if (list.lastElementChild !== dragged) list.append(dragged);
    // Kenara yaklaşınca liste ve sayfa kayar.
    if (event.clientY < 40) window.scrollBy(0, -12); else if (event.clientY > window.innerHeight - 40) window.scrollBy(0, 12);
  });
  $('sira-listesi').addEventListener('pointerup', () => {
    const gesture = pointerDrag;
    if (!gesture) return;
    const to = rows().findIndex(li => li.dataset.id === gesture.id);
    clearPointerDrag();
    if (gesture.moved && to >= 0 && to !== state.selected.indexOf(gesture.id)) move(gesture.id, to);
    else if (gesture.moved) restoreOrder();
  });
  $('sira-listesi').addEventListener('pointercancel', () => { if (pointerDrag?.moved) restoreOrder(); clearPointerDrag(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (pointerDrag) { if (pointerDrag.moved) restoreOrder(); clearPointerDrag(); announce('Sürükleme iptal edildi.'); return; }
    if (transport) { if (state.phase === 'running') cancel(); stopTextJob(); stopWorker(); revoke(); send('CLOSE'); transport.close?.(); }
  });
  window.addEventListener('pagehide', () => { stopTextJob(); stopWorker(); revoke(); transport?.close?.(); });
  const darkMq = window.matchMedia?.('(prefers-color-scheme: dark)');
  let tema = 'auto';
  const applyTheme = () => { document.documentElement.dataset.theme = tema === 'dark' || tema === 'light' ? tema : (darkMq?.matches ? 'dark' : 'light'); };
  darkMq?.addEventListener?.('change', applyTheme);
  applyTheme();
  try {
    chrome.storage.local.get('uhdPrefs').then(({ uhdPrefs }) => { tema = uhdPrefs?.tema || 'auto'; applyTheme(); }).catch(() => {});
    chrome.storage.onChanged.addListener(ch => { if (ch.uhdPrefs) { tema = ch.uhdPrefs.newValue?.tema || 'auto'; applyTheme(); } });
  } catch {}
  globalThis.UHD.durusmaPaketiUI = { connect, receive };
  render();
})();
