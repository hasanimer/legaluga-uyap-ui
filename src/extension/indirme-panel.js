/* global module */
(() => {
  'use strict';
  if (globalThis.UHDBulkPanel) return;
  const CSS = `
.bdp{display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;max-width:100%;color:var(--text,var(--shell-text,#1d2939));font:inherit;container-type:inline-size}
.bdp [hidden]{display:none!important}
.bdp-heading{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.bdp-heading h3{margin:0;font-size:16px;line-height:1.4}
.bdp-count,.bdp-help,.bdp-meta,.bdp-current,.bdp-empty{color:var(--muted,var(--shell-muted,#667085));font-size:12px;line-height:1.5}
.bdp-help,.bdp-empty,.bdp-current,.bdp-error{margin:0;overflow-wrap:anywhere}
.bdp-list{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:2px}
.bdp-card{flex:none;min-width:0;border:1px solid var(--line,var(--shell-line,#e3e8f2));border-radius:10px;background:var(--card,var(--shell-bg,#fff));padding:12px}
.bdp-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.bdp-file{flex:1;min-width:150px;overflow-wrap:anywhere}
.bdp-file h4{margin:0;font-size:14px;line-height:1.4}
.bdp-court{font-size:12px;color:var(--muted,var(--shell-muted,#667085));overflow-wrap:anywhere}
.bdp-state{font-size:12px;font-weight:600;padding:3px 7px;border-radius:6px;background:var(--grey-bg,var(--shell-soft,#f5f7fb));overflow-wrap:anywhere}
.bdp-card[data-status=running] .bdp-state{background:var(--soft,var(--shell-soft,#f5f7fb));color:var(--accent-text,var(--shell-accent,#0b6663))}
.bdp-card[data-status=complete] .bdp-state{background:var(--green-bg,var(--shell-success-bg,#e7f6ef));color:var(--green,var(--shell-success,#12805c))}
.bdp-card[data-status=error] .bdp-state{background:var(--err-bg,var(--shell-error-bg,#fdecea));color:var(--red,var(--shell-error,#b42318))}
.bdp-saved{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:10px 0 4px;font-size:13px;font-weight:600}
.bdp progress{display:block;width:100%;height:9px;accent-color:var(--focus,var(--shell-accent,#0b6663));margin:0 0 8px}
.bdp-meta{display:flex;gap:4px 12px;flex-wrap:wrap}
.bdp-current{margin-top:6px}
.bdp-error{margin-top:8px;padding:8px;border-radius:6px;font-size:12px;background:var(--err-bg,var(--shell-error-bg,#fdecea));color:var(--red,var(--shell-error,#b42318))}
.bdp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.bdp button{font:inherit;line-height:1.4;min-height:36px;padding:7px 10px;border:1px solid var(--line2,var(--shell-line,#cfd6e4));border-radius:7px;background:var(--card,var(--shell-bg,#fff));color:inherit;cursor:pointer;max-width:100%;overflow-wrap:anywhere}
.bdp button:hover:not(:disabled){background:var(--soft,var(--shell-soft,#f5f7fb))}
.bdp button:disabled{opacity:.55;cursor:default}
.bdp :focus-visible{outline:2px solid var(--focus,var(--shell-focus,#0b6663));outline-offset:2px}
.bdp-live{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
@media(max-width:420px){.bdp-card{padding:10px}.bdp-actions{gap:6px}.bdp-actions button{flex:1 1 auto}.bdp-file{min-width:120px}}
@container (max-width:420px){.bdp-card{padding:10px}.bdp-actions{gap:6px}.bdp-actions button{flex:1 1 auto}.bdp-file{min-width:120px}}
`;
  let sequence = 0;
  const labels = { queued: 'Sırada', running: 'İndiriliyor', paused: 'Duraklatıldı', complete: 'Tamamlandı', error: 'İndirme durdu' };
  const phases = { waiting: 'Sırasını bekliyor', fetching: 'Evraklar alınıyor', packing: 'ZIP hazırlanıyor', saving: 'ZIP diske kaydediliyor', idle: '' };
  const literal = (value, max = 220) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  const number = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const fmt = value => number(value).toLocaleString('tr-TR');
  const elapsed = value => {
    const seconds = Math.floor(number(value) / 1000), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
    return hours ? `${hours} sa ${minutes % 60} dk` : minutes ? `${minutes} dk ${seconds % 60} sn` : `${seconds} sn`;
  };
  // Kalan süre kaba bir tahmindir: 5 dakikaya yuvarlanır, kesin süre gibi gösterilmez.
  const remaining = value => {
    const minutes = Math.ceil(number(value) / 300000) * 5;
    return minutes <= 5 ? '5 dakikadan az' : `yaklaşık ${minutes < 60 ? `${minutes} dk` : `${Math.floor(minutes / 60)} sa${minutes % 60 ? ` ${minutes % 60} dk` : ''}`}`;
  };
  const clock = value => new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const STUCK = { bos: 'UYAP bu evrakı boş döndürüyor', buyuk: 'Bu evrak 128 MiB sınırını aşıyor' };
  const bytes = value => value >= 1024 * 1024 ? `${(value / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MiB`
    : value >= 1024 ? `${(value / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KiB` : `${fmt(value)} B`;

  function mount(container, { manager, openFile, showPart } = {}) {
    if (!container || typeof manager?.list !== 'function' || typeof manager?.subscribe !== 'function')
      throw new Error('İndirme yöneticisi yüklenemedi.');
    const doc = container.ownerDocument || document, key = `bdp-${++sequence}`, rows = new Map();
    let destroyed = false, unsubscribe = null, updates = 0;
    const el = (tag, attrs, ...children) => {
      const node = doc.createElement(tag);
      for (const [name, value] of Object.entries(attrs || {})) if (value !== false && value != null)
        node.setAttribute(name, value === true ? '' : String(value));
      node.append(...children.filter(value => value != null));
      return node;
    };
    const data = (name, attrs = {}) => ({ 'data-download': name, ...attrs });
    const heading = el('h3', { id: `${key}-heading`, tabindex: '-1' }, 'İndirmeler');
    const count = el('span', data('count', { class: 'bdp-count' }));
    const empty = el('p', data('empty', { class: 'bdp-empty' }), 'Henüz indirme yok. Dosyanın Toplu indir sekmesinden indirme başlatabilirsiniz.');
    const problem = el('p', data('problem', { class: 'bdp-error', hidden: true }));
    const retry = el('button', data('retry', { type: 'button', hidden: true }), 'Tekrar dene');
    const live = el('p', data('live', { class: 'bdp-live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
    const list = el('div', data('list', { class: 'bdp-list', role: 'list', 'aria-label': 'İndirme işleri' }));
    const root = el('section', data('panel', { class: 'bdp', 'aria-labelledby': `${key}-heading` }),
      el('div', { class: 'bdp-heading' }, heading, count),
      el('p', { class: 'bdp-help' }, 'Parçalı indirmede yüzde, diske kaydedilmiş evrakları gösterir; mevcut parçadaki evraklar ZIP kaydı tamamlanana kadar geçicidir. Tek ZIP indirmesinde evraklar ZIP hazırlanınca birlikte kaydedilir; bu indirmeler yalnız bu sekmede listelenir.'),
      problem, retry, empty, list, live);
    container.append(root);
    const announce = text => { if (!destroyed && text) live.textContent = text; };
    // Tek ZIP (kind: 'zip') yalnız bu sekmede izlenir: durdurulabilir, sürdürülemez; parça ve klasör bilgisi yoktur.
    const isZip = state => state?.kind === 'zip';
    const zipLabels = { running: 'İndiriliyor', paused: 'Durduruldu', complete: 'ZIP indirildi', error: 'İndirme durdu' };
    const rowKey = state => isZip(state) && typeof state.key === 'string' && state.key.startsWith('zip:') ? state.key : state.fileKey;
    const pausing = state => !isZip(state) && state.status === 'paused' && state.phase !== 'idle' && !state.persistentPending;
    // Mola: motor UYAP’a yük bindirmemek için evrak aralarında bekler; iş takılmış görünmesin diye açıkça yazılır.
    const resting = state => state.status === 'running' && state.phase === 'fetching' && Number.isSafeInteger(state.restUntil) && state.restUntil > Date.now();
    const stuck = state => state.status === 'error' && state.stuck && Object.hasOwn(STUCK, state.stuck.neden) &&
      typeof state.stuck.jobId === 'string' && state.stuck.jobId && Number.isSafeInteger(state.stuck.cursor) && state.stuck.cursor >= 0 ? state.stuck : null;
    const stopping = state => isZip(state) && state.status === 'running' && state.stopping === true;
    const phaseText = state => stopping(state) ? 'Durduruluyor…' : pausing(state) ? 'Duraklatılıyor…' : resting(state) ? 'Mola veriliyor' : state.status === 'running' || state.status === 'queued' ? phases[state.phase] || labels[state.status]
      : isZip(state) ? state.status === 'complete' && number(state.missing) ? 'ZIP indirildi (eksik)' : zipLabels[state.status] || 'Durum bekleniyor'
      : state.status === 'complete' && number(state.skipped) ? 'Tamamlandı (eksik)' : labels[state.status] || 'Durum bekleniyor';
    // Motor, taze listede kimliği kesin doğrulanamayan evrakı yanlış belge indirmemek için atlar ve yerine not koyar.
    const skippedText = state => isZip(state) ? number(state.missing) ? `${fmt(state.missing)} evrak alınamadı; adları ve nedenleri ZIP içindeki indirme raporunda.` : ''
      : number(state.skipped) ? `${fmt(state.skipped)} evrak indirilemediği için atlandı; ZIP içinde yerine “İNDİRİLEMEDİ” notu var. Bu evrakları UYAP’ta elle açabilirsiniz.` : '';
    const stateError = state => literal(state.error, 400);
    // Takılan evrakın iletisi kartta ve ekran okuyucu duyurusunda aynıdır; atlama seçeneğini de söyler.
    const stuckText = state => { const t = stuck(state); return t ? `${STUCK[t.neden]}: ${[literal(t.tur, 200), literal(t.tarih, 40)].filter(Boolean).join(' · ') || 'evrak'}. Devam et yeniden dener; “Bu evrakı atla ve sürdür” ZIP’e bu evrakın yerine “İNDİRİLEMEDİ” notu koyar.` : ''; };

    function createRow(jobKey, fileKey) {
      const titleId = `${key}-file-${rows.size + 1}-${++sequence}`;
      const title = el('h4', data('title', { id: titleId, tabindex: '-1' }));
      const court = el('div', data('court', { class: 'bdp-court' }));
      const status = el('span', data('status', { class: 'bdp-state' }));
      const saved = el('span', data('saved'));
      const percent = el('span', data('percent'));
      const progress = el('progress', data('progress', { max: 100, value: 0, 'aria-label': 'Diske kaydedilen evraklar' }));
      const parts = el('span', data('parts'));
      const received = el('span', data('received'));
      const measured = el('span', data('bytes'));
      const duration = el('span', data('elapsed'));
      const eta = el('span', data('eta'));
      const last = el('span', data('last'));
      const current = el('p', data('current', { class: 'bdp-current' }));
      const skipped = el('p', data('skipped', { class: 'bdp-current', hidden: true }));
      const error = el('p', data('error', { class: 'bdp-error', hidden: true }));
      const control = el('button', data('control', { type: 'button' }));
      const skip = el('button', data('skip', { type: 'button', hidden: true }), 'Bu evrakı atla ve sürdür');
      const open = el('button', data('open', { type: 'button', hidden: typeof openFile !== 'function' }), 'Dosyayı aç');
      const folder = el('button', data('folder', { type: 'button', hidden: true }), 'Son parçayı klasörde göster');
      const card = el('div', data('job', { class: 'bdp-card', role: 'listitem', 'data-file-key': fileKey, 'data-job-key': jobKey, 'aria-labelledby': titleId }),
        el('div', { class: 'bdp-top' }, el('div', { class: 'bdp-file' }, title, court), status),
        el('div', { class: 'bdp-saved' }, saved, percent), progress,
        el('div', { class: 'bdp-meta' }, parts, received, measured, duration, eta, last), current, skipped, error,
        el('div', { class: 'bdp-actions' }, control, skip, open, folder));
      const row = { card, title, court, status, saved, percent, progress, parts, received, measured, duration, eta, last, current, skipped, error,
        control, skip, open, folder, state: null, pending: null, issue: '', stamp: '', alive: true };
      const call = async (name, fn) => {
        if (destroyed || !row.alive || row.pending?.name === name) return;
        const token = {}; row.pending = { name, token }; row.issue = ''; drawRow(row);
        try {
          await fn();
          if (!destroyed && row.alive && row.pending?.token === token) row.issue = '';
        } catch (err) {
          if (!destroyed && row.alive && row.pending?.token === token) {
            row.issue = err?.code === 'SOURCE_REQUIRED' ? name === 'skip' ? 'Atlamak için UYAP dosyasını açın; Toplu indir sekmesinde “Bu evrakı atla ve sürdür”e basın.'
              : 'Devam etmek için UYAP dosyasını açın; Toplu indir sekmesinden kaldığınız yerden devam edin.'
              : literal(err?.message, 400) || 'İşlem tamamlanamadı. Tekrar deneyin.';
            announce(`${row.title.textContent}: ${row.issue}`);
          }
        } finally {
          if (!destroyed && row.alive && row.pending?.token === token) { row.pending = null; drawRow(row); }
        }
      };
      control.addEventListener('click', () => {
        const state = row.state;
        if (destroyed || !row.alive || control.hidden || control.disabled || !state) return;
        const name = ['queued', 'running'].includes(state.status) ? 'pause' : 'resume';
        if (isZip(state) && name !== 'pause') return;
        if (typeof manager[name] === 'function') return call(name, () => manager[name](jobKey));
      });
      // Atlama yalnız motorun bildirdiği evrak için ve o evrakın kimliğiyle istenir; motor eşleşmeyi yeniden doğrular.
      skip.addEventListener('click', () => {
        const target = row.state && stuck(row.state);
        if (destroyed || !row.alive || skip.hidden || skip.disabled || !target || typeof manager.resume !== 'function') return;
        return call('skip', () => manager.resume(jobKey, { skip: { jobId: target.jobId, cursor: target.cursor } }));
      });
      open.addEventListener('click', () => !destroyed && !open.hidden && !open.disabled && call('open', () => openFile(fileKey)));
      folder.addEventListener('click', () => {
        const state = row.state, id = state?.lastPart?.downloadId;
        if (destroyed || folder.hidden || folder.disabled || !Number.isSafeInteger(id) || id < 0) return;
        return call('folder', () => showPart({ fileKey, jobId: state.id, downloadId: id }));
      });
      list.append(card);
      return row;
    }

    function drawRow(row) {
      const state = row.state;
      if (!state) return;
      const total = number(state.total), saved = Math.min(number(state.saved), total);
      const percent = total ? Math.floor(100 * saved / total) : 0;
      const label = literal(state.rec?.dosyaNo, 100) || 'Dosya';
      row.card.setAttribute('data-status', state.status);
      row.title.textContent = label;
      row.court.textContent = literal(state.rec?.birimAdi, 220);
      row.status.textContent = phaseText(state);
      const zip = isZip(state), verb = zip ? 'alındı' : 'diske kaydedildi';
      row.saved.textContent = `${fmt(saved)} / ${fmt(total)} evrak ${verb}`;
      row.percent.textContent = `%${percent}`;
      row.progress.setAttribute('value', percent);
      row.progress.setAttribute('aria-label', zip ? 'Alınan evraklar' : 'Diske kaydedilen evraklar');
      row.progress.setAttribute('aria-valuetext', `${fmt(saved)} / ${fmt(total)} evrak ${verb}, yüzde ${percent}`);
      row.parts.hidden = zip;
      row.parts.textContent = `${fmt(state.partCount)} ZIP parçası kaydedildi`;
      row.received.hidden = !number(state.inPart);
      row.received.textContent = `Bu parçada ${fmt(state.inPart)} evrak alındı; henüz kaydedilmedi`;
      row.measured.hidden = !number(state.partBytes);
      row.measured.textContent = `Bu parça: ${bytes(number(state.partBytes))}`;
      row.duration.hidden = !number(state.elapsedMs);
      row.duration.textContent = `Etkin süre: ${elapsed(state.elapsedMs)}`;
      row.eta.hidden = state.status !== 'running' || !number(state.etaMs);
      row.eta.textContent = row.eta.hidden ? '' : `Kalan süre: ${remaining(state.etaMs)}`;
      const time = state.lastPart?.completedAt, date = Number.isSafeInteger(time) && time > 0 ? new Date(time) : null;
      row.last.hidden = !date || !Number.isFinite(date.getTime());
      row.last.textContent = row.last.hidden ? '' : `Son kayıt: ${date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`;
      const current = literal(state.currentTitle);
      row.current.hidden = !current || !['running', 'queued'].includes(state.status);
      row.current.textContent = resting(state) ? `UYAP’a yük bindirmemek için kısa bir mola veriliyor; indirme ${clock(state.restUntil)} civarında kendiliğinden sürer.`
        : current ? `Evrak: ${current}` : '';
      if (resting(state)) row.current.hidden = false;
      row.skipped.textContent = skippedText(state);
      row.skipped.hidden = !row.skipped.textContent;
      const takilan = stuck(state);
      const message = row.issue || stuckText(state) || stateError(state);
      row.error.hidden = !message;
      row.error.textContent = message;
      const action = ['queued', 'running'].includes(state.status) ? 'pause' : 'resume';
      row.control.hidden = zip ? state.status !== 'running' : state.status === 'complete' || !['queued', 'running', 'paused', 'error'].includes(state.status);
      row.control.disabled = pausing(state) || typeof manager[action] !== 'function' || row.pending?.name === action;
      row.control.textContent = pausing(state) ? 'Duraklatılıyor…' : row.pending?.name === action ? action === 'pause' ? 'Duraklatılıyor…' : 'Başlatılıyor…'
        : action === 'pause' ? 'Duraklat' : 'Devam et';
      if (zip) {
        row.control.disabled = row.control.disabled || stopping(state);
        row.control.textContent = stopping(state) || row.pending?.name === 'pause' ? 'Durduruluyor…' : 'Durdur';
      }
      // Tek ZIP dosya ekranına bağlıdır: sürerken dosyayı yeniden açmak ekranı kapatıp indirmeyi durdururdu.
      const openHidden = typeof openFile !== 'function' || (zip && state.status === 'running');
      if (openHidden && doc.activeElement === row.open) (row.control.hidden || row.control.disabled ? row.title : row.control).focus();
      row.open.hidden = openHidden;
      row.control.setAttribute('aria-label', `${label}: ${zip ? 'ZIP indirmesini durdur' : action === 'pause' ? 'indirmeyi duraklat' : 'indirmeye devam et'}`);
      row.skip.hidden = !takilan;
      row.skip.disabled = row.pending?.name === 'skip' || row.pending?.name === 'resume';
      row.skip.setAttribute('aria-label', `${label}: alınamayan evrakı atla ve indirmeyi sürdür`);
      row.open.disabled = row.pending?.name === 'open';
      const downloadId = state.lastPart?.downloadId;
      row.folder.hidden = zip || typeof showPart !== 'function' || !Number.isSafeInteger(downloadId) || downloadId < 0 || !state.id;
      row.folder.disabled = row.pending?.name === 'folder';
      const odak = doc.activeElement;
      if (odak === row.control && row.control.hidden) (row.folder.hidden ? row.open.hidden ? row.title : row.open : row.folder).focus();
      else if (odak === row.skip && row.skip.hidden) (!row.control.hidden ? row.control : !row.folder.hidden ? row.folder : !row.open.hidden ? row.open : row.title).focus();
    }

    function render(states) {
      if (destroyed || !Array.isArray(states)) return;
      updates++;
      problem.hidden = true; retry.hidden = true;
      const present = new Set(), announcements = [];
      let running = 0, queued = 0;
      for (const state of states) {
        if (typeof state?.fileKey !== 'string' || !state.fileKey) continue;
        const jobKey = rowKey(state);
        if (present.has(jobKey)) continue;
        present.add(jobKey);
        if (state.status === 'running') running++;
        if (state.status === 'queued') queued++;
        let row = rows.get(jobKey);
        if (!row) { row = createRow(jobKey, state.fileKey); rows.set(jobKey, row); }
        const sorun = stuckText(state) || stateError(state);
        const stamp = JSON.stringify([state.status, state.phase, number(state.partCount), sorun, number(state.skipped), number(state.missing), resting(state), stopping(state)]);
        const previous = row.state;
        row.state = state;
        if (previous && previous.status !== state.status && ['running', 'queued', 'complete'].includes(state.status)) row.issue = '';
        drawRow(row);
        if (row.stamp && row.stamp !== stamp) announcements.push(`${row.title.textContent}: ${phaseText(state)}. ${fmt(state.saved)} / ${fmt(state.total)} evrak ${isZip(state) ? 'alındı' : 'kaydedildi'}.${skippedText(state) ? ' ' + skippedText(state) : ''}${sorun ? ' ' + sorun : ''}`);
        row.stamp = stamp;
      }
      for (const [jobKey, row] of rows) if (!present.has(jobKey)) {
        if ([row.control, row.skip, row.open, row.folder].includes(doc.activeElement)) heading.focus();
        row.alive = false; row.card.remove(); rows.delete(jobKey);
      }
      count.textContent = `${fmt(rows.size)} indirme${running ? ` · ${fmt(running)} sürüyor` : ''}${queued ? ` · ${fmt(queued)} sırada` : ''}`;
      empty.hidden = rows.size > 0;
      if (announcements.length) announce(announcements.slice(0, 3).join(' ') + (announcements.length > 3 ? ` ${announcements.length - 3} başka indirme güncellendi.` : ''));
    }
    const fail = err => {
      if (destroyed) return;
      problem.textContent = literal(err?.message, 400) || 'İndirme kayıtları okunamadı. Tekrar deneyin.';
      problem.hidden = false; retry.hidden = false;
      empty.hidden = true;
      announce(problem.textContent);
    };
    const refresh = () => {
      if (destroyed) return;
      try { render(manager.list()); } catch (err) { fail(err); }
    };
    retry.addEventListener('click', refresh);
    try { unsubscribe = manager.subscribe(render); } catch (err) { fail(err); }
    // subscribe ilk listeyi hemen verir. Daha sonra gelecek olayları eski list() sonucu ile geri alma.
    if (!updates) refresh();
    return { destroy() {
      if (destroyed) return;
      destroyed = true;
      try { if (typeof unsubscribe === 'function') unsubscribe(); }
      finally { for (const row of rows.values()) row.alive = false; rows.clear(); root.remove(); }
    } };
  }
  const api = { CSS, mount };
  globalThis.UHDBulkPanel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
