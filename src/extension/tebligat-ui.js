/* global module */
(() => {
  'use strict';
  let count = 0;
  const PROVIDERS = { ptt: 'PTT posta tebligatı', uets: 'UETS / e-Tebligat' };
  const UETS_PAGE = 'https://ptt.etebligat.gov.tr/';
  function mount(container, { query, readDocument, readSubjectDocument, readUetsDocument, getDocuments, loadDocuments, signal }) {
    const model = globalThis.UHDTebligatBarcode;
    if (!model || typeof query !== 'function' || typeof getDocuments !== 'function')
      throw new Error('Tebligat sorgusu yüklenemedi. Eklentiyi ve UYAP sekmesini yenileyin.');
    const id = `tebligat-${++count}`;
    const el = (tag, attrs, ...children) => {
      const node = document.createElement(tag);
      for (const [name, value] of Object.entries(attrs || {})) {
        if (value === false || value == null) continue;
        node.setAttribute(name, value === true ? '' : String(value));
      }
      node.append(...children.flat().filter(value => value != null));
      return node;
    };
    const attr = (name, extra = {}) => ({ 'data-tebligat': name, ...extra });
    const all = el('input', attr('select-all', { type: 'checkbox', id: `${id}-all` }));
    const submit = el('button', attr('query', { type: 'submit', class: 'dp-go' }), 'Sorgula');
    const stop = el('button', attr('stop', { type: 'button', class: 'chip', hidden: true }), 'Durdur');
    const status = el('p', attr('status', { role: 'status', 'aria-live': 'polite', class: 'dp-muted' }));
    const summary = el('span', attr('summary', { class: 'dp-muted' }));
    const list = el('div', attr('documents', { class: 'te-notice-list' }));
    const form = el('form', { class: 'te-notice-form', novalidate: true },
      el('div', { class: 'te-notice-header' }, el('div', null, el('h4', null, 'Tebligat sorgusu'),
        el('p', { class: 'dp-muted' }, 'Tebligatları seçip Sorgula’ya basın. Zarfın barkodu ve hizmeti belgeden doğrulanır; e-tebligat kayıtları aynı dosyadaki eşleşen mazbatadan gösterilir.'))),
      el('div', { class: 'te-notice-toolbar' }, el('label', { for: `${id}-all`, class: 'te-notice-selectall' }, all, ' Tümünü seç'), summary,
        el('div', { class: 'te-notice-actions' }, submit, stop)), status, list);
    const style = el('style', null, `
      .te-notice-form{width:100%;min-width:0}.te-notice-header h4{margin:0 0 8px}.te-notice-header p{margin:0 0 16px}
      .te-notice-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--dp-border,#3b4654)}
      .te-notice-selectall{display:flex;gap:6px;align-items:center;white-space:nowrap;cursor:pointer}.te-notice-actions{display:flex;gap:8px;margin-left:auto}
      .te-notice-list{display:grid;gap:10px;padding-top:10px}.te-notice-row{display:grid;grid-template-columns:minmax(240px,1fr) minmax(260px,1.2fr);gap:16px;padding:14px;border:1px solid var(--dp-border,#3b4654);border-radius:9px}
      .te-notice-document{min-width:0}.te-notice-document label{display:flex;align-items:flex-start;gap:9px;cursor:pointer;overflow-wrap:anywhere}.te-notice-document input{flex:none;margin-top:3px}
      .te-notice-document p{margin:8px 0 0 24px;overflow-wrap:anywhere}.te-notice-result{min-width:0;overflow-wrap:anywhere}.te-notice-result h5{margin:0 0 8px;font-size:inherit}
      .te-notice-result p{margin:5px 0 9px}.te-notice-result .te-tablewrap{max-height:260px;overflow:auto}.te-notice-result .te-table{width:100%;font-size:12px}
      .te-notice-result .te-date{white-space:nowrap}.te-notice-result details summary{cursor:pointer}.te-notice-result details p{min-width:150px}
      .te-notice-result .te-table th,.te-notice-result .te-table td{text-align:left;padding:6px;vertical-align:top}.te-notice-result dl{margin:8px 0}
      .te-notice-result dl div{display:flex;gap:10px}.te-notice-result dt{font-weight:600}.te-notice-result dd{margin:0}.te-notice-result .err{color:var(--danger,#ff8282)}
      @media(max-width:780px){.te-notice-row{grid-template-columns:minmax(0,1fr)}.te-notice-actions{margin-left:0}.te-notice-result{padding-left:24px}}
    `);
    container.replaceChildren(style, form);
    let destroyed = false, current = null, items = [], revision, revisionKnown = false, initialSelection = false;
    const selected = new Set(), states = new Map();
    const stamp = item => JSON.stringify([item.key, item.title || '', item.label, item.aciklama || '']);
    const message = (text, error = false) => { status.textContent = text; status.classList.toggle('err', error); };
    const valid = task => !destroyed && current === task && !task.ac.signal.aborted &&
      (task.kind === 'list' || task.revision === revision);
    const validRow = (task, item) => valid(task) && task.rowKey === item.key &&
      items.some(value => value.key === item.key && stamp(value) === stamp(item));
    const clearActions = () => { for (const value of states.values()) delete value.action; };
    const cancel = text => {
      const task = current;
      if (!task) return;
      current = null;
      task.ac.abort();
      clearActions();
      for (const value of states.values()) if (value.pending) { value.pending = false; value.message = 'Durduruldu. Yeniden seçip sorgulayabilirsiniz.'; }
      if (text) message(text);
    };
    const stateFor = item => states.get(item.key) || {};
    const uetsLink = () => el('a', { class: 'chip', href: UETS_PAGE, target: '_blank', rel: 'noopener noreferrer',
      'data-tebligat': 'open-uets' }, 'UETS sayfasını aç');
    const resultNodes = (item, value) => {
      const nodes = [];
      if (value.message) nodes.push(el('p', { class: value.error ? 'err' : 'dp-muted', role: 'status' }, value.message));
      if (value.barcode) nodes.push(el('p', { class: 'dp-muted' }, `${PROVIDERS[value.provider] || 'Hizmet doğrulanmadı'} · Barkod: ${value.barcode}`));
      if (value.result) {
        const result = value.result, events = Array.isArray(result.events) ? result.events : [];
        nodes.push(el('h5', null, String(result.status || 'Sorgu sonucu')));
        if (value.sourceLabel) nodes.push(el('p', { class: 'dp-muted' }, value.sourceLabel));
        if (Number.isFinite(result.queriedAt)) nodes.push(el('p', { class: 'dp-muted' }, `Sorgulama: ${new Date(result.queriedAt).toLocaleString('tr-TR')}`));
        if (Array.isArray(result.details) && result.details.length) nodes.push(el('dl', null, result.details.map(detail => el('div', null,
          el('dt', null, String(detail.label || '')), el('dd', null, String(detail.value || ''))))));
        nodes.push(events.length ? el('div', { class: 'te-tablewrap' }, el('table', { class: 'te-table' },
          el('thead', null, el('tr', null, ['Tarih', 'İşlem', 'Açıklama'].map(text => el('th', { scope: 'col' }, text)))),
          el('tbody', null, events.map(event => el('tr', null,
            el('td', { class: 'te-date' }, String(event.time || '—')), el('td', null, String(event.status || '—')),
            el('td', null, event.detail || event.location ? el('details', null,
              el('summary', null, 'Ayrıntı'), el('p', null, [event.detail, event.location].filter(Boolean).join(' · '))) : '—'))))))
          : el('p', { class: 'dp-muted' }, value.provider === 'uets'
            ? 'Mazbata eşleşti; olay tarihleri ayrı okunamadı. Belgeden kontrol edin.'
            : 'PTT bu sorgu için hareket kaydı döndürmedi.'));
        nodes.push(el('p', { class: 'dp-muted' }, value.provider === 'uets' ? 'Kaynak: Bu dosyanın barkodla eşleşen e-tebliğ mazbatası.' : 'Kaynak: Resmi PTT sorgu sonucu.'));
      }
      if (value.uetsFallback) nodes.push(uetsLink());
      if (value.action) {
        const action = value.action;
        const button = el('button', attr('open-ptt', { type: 'button', class: 'chip', disabled: action.opening }),
          'Resmi PTT sayfasını aç');
        button.addEventListener('click', async () => {
          if (!validRow(action.task, item) || stateFor(item).action !== action || action.opening) return;
          action.opening = true; sync();
          try { await action.openPage(); }
          catch (error) {
            if (validRow(action.task, item) && stateFor(item).action === action) {
              value.message = error?.message || 'PTT sayfası açılamadı. Yeniden deneyin.'; value.error = true;
            }
          } finally { action.opening = false; if (validRow(action.task, item) && stateFor(item).action === action) sync(); }
        });
        nodes.push(button);
      }
      return nodes.length ? nodes : [el('p', { class: 'dp-muted' }, 'Sorgu sonucu burada görünür.')];
    };
    function sync() {
      if (destroyed) return;
      const snapshot = getDocuments() || {};
      const next = Array.isArray(snapshot.items) ? snapshot.items.filter(item => typeof item?.key === 'string' && item.key &&
        typeof item.label === 'string' && item.own !== false && !model.isMazbata(item.title || item.label)) : [];
      if (Object.hasOwn(snapshot, 'revision')) {
        if (revisionKnown && snapshot.revision !== revision) {
          if (current?.kind === 'batch') cancel('Evrak listesi değişti. Seçiminizi kontrol edip yeniden sorgulayın.');
          states.clear();
        }
        revision = snapshot.revision; revisionKnown = true;
      }
      items = next;
      for (const [itemKey, value] of states) if (!items.some(item => item.key === itemKey && stamp(item) === value.stamp)) states.delete(itemKey);
      for (const itemKey of selected) if (!items.some(item => item.key === itemKey)) selected.delete(itemKey);
      if (current?.kind === 'batch' && !items.some(item => item.key === current.rowKey && stamp(item) === current.rowStamp)) {
        cancel('Seçili tebligat değişti. Yeniden sorgulayın.');
      }
      if (!initialSelection && items.length) {
        if (items.some(item => item.key === snapshot.selectedKey)) selected.add(snapshot.selectedKey);
        else if (snapshot.complete === true && items.length === 1) selected.add(items[0].key);
        initialSelection = true;
      }
      const busy = current?.kind === 'batch', loading = current?.kind === 'list' || snapshot.loading;
      all.checked = !!items.length && selected.size === items.length;
      all.indeterminate = selected.size > 0 && selected.size < items.length;
      all.disabled = busy || !items.length;
      summary.textContent = `${items.length} tebligat · ${selected.size} seçili${loading ? ' · Liste alınıyor…' : snapshot.complete !== true ? ' · Liste henüz tamamlanmadı' : ''}`;
      submit.disabled = !!current || !selected.size;
      submit.textContent = busy ? 'Sorgulanıyor…' : selected.size ? `Sorgula (${selected.size})` : 'Sorgula';
      stop.hidden = !current;
      form.setAttribute('aria-busy', String(!!current));
      list.replaceChildren(...items.map((item, index) => {
        const value = stateFor(item), box = el('input', { type: 'checkbox', 'data-tebligat-select': item.key,
          id: `${id}-item-${index}`, disabled: busy });
        box.checked = selected.has(item.key);
        box.addEventListener('change', () => {
          if (current?.kind === 'batch') return;
          if (box.checked) selected.add(item.key); else selected.delete(item.key);
          sync();
        });
        const subject = value.subject || model.extractSubject(item.aciklama || '', { metadata: true });
        const service = value.provider || model.noticeProvider({ title: item.title || item.label.split(' · ')[0], aciklama: item.aciklama || '' });
        return el('article', { class: 'te-notice-row', 'data-tebligat-row': item.key },
          el('div', { class: 'te-notice-document' }, el('label', { for: `${id}-item-${index}` }, box, item.label),
            el('p', { class: 'dp-muted' }, `İçerik: ${subject || (value.read ? 'Belirlenemedi' : 'Sorguda okunacak')}`),
            el('p', { class: 'dp-muted' }, service ? PROVIDERS[service] : 'Hizmet belgeden doğrulanacak')),
          el('div', { class: 'te-notice-result', 'data-tebligat-result': item.key }, resultNodes(item, value)));
      }));
      if (!items.length) list.append(el('p', { class: 'dp-muted' }, loading ? 'Tebligatlar geldikçe burada gösterilir…' : 'Bu dosyada zarf veya tebligat kaydı bulunamadı. Mazbatalar sorgulanan tebligata barkodla eşleştirilir.'));
    }
    const finish = task => {
      if (current !== task) return;
      clearActions(); current = null; sync();
    };
    const analyzeEnvelope = (doc, item) => {
      if (!doc || typeof doc.text !== 'string' || doc.key !== item.key) throw new Error('Okunan zarf seçili tebligatla eşleşmedi. Sorgu başlatılmadı.');
      const sources = Array.isArray(doc.sources) ? doc.sources : [{ text: doc.text }];
      const leaves = sources.map(source => ({ source, parsed: model.analyzeNotice(source.text,
        { title: item.title || item.label.split(' · ')[0], aciklama: item.aciklama || '' }),
        mazbata: model.analyzeDocument(source.text).provider === 'uets' }));
      const candidates = leaves.filter(leaf => !leaf.mazbata && leaf.parsed.barcodes.length);
      if (candidates.length !== 1 || candidates[0].parsed.barcodes.length !== 1)
        throw new Error(candidates.length ? 'Zarfın barkodu tek bir belgeye bağlanamadı. Evrak sekmesinden kontrol edin; sorgu başlatılmadı.'
          : 'Zarfta okunabilir barkod bulunamadı. Taranmış belgenin barkodunu Evrak sekmesinden kontrol edin.');
      const parsed = candidates[0].parsed;
      if (!parsed.provider) throw new Error('Zarfın PTT veya UETS hizmeti doğrulanamadı. Belgeyi kontrol edin; sorgu başlatılmadı.');
      return parsed;
    };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (current || destroyed || !selected.size) return;
      const pending = items.filter(item => selected.has(item.key)).map(item => ({ ...item }));
      const task = { kind: 'batch', ac: new AbortController(), revision, rowKey: pending[0].key, rowStamp: stamp(pending[0]) };
      current = task;
      clearActions();
      let completed = 0;
      sync();
      try {
        for (const item of pending) {
          if (!valid(task)) return;
          task.rowKey = item.key; task.rowStamp = stamp(item);
          if (!validRow(task, item)) { cancel('Tebligat listesi değişti. Yeniden sorgulayın.'); sync(); return; }
          const value = { stamp: stamp(item), pending: true, message: 'Zarfın barkodu ve hizmeti okunuyor…' };
          states.set(item.key, value);
          message(`Tebligatlar sırayla sorgulanıyor: ${completed + 1} / ${pending.length}`);
          sync();
          try {
            const reader = readSubjectDocument || readDocument;
            if (typeof reader !== 'function') throw new Error('Tebligat okuyucu yüklenemedi.');
            const doc = await reader(task.ac.signal, item.key);
            if (!validRow(task, item)) return;
            const parsed = analyzeEnvelope(doc, item);
            value.read = true; value.barcode = parsed.barcodes[0]; value.provider = parsed.provider; value.subject = parsed.subject;
            if (parsed.provider === 'uets') {
              value.message = 'Aynı dosyadaki barkodla eşleşen e-tebliğ mazbatası aranıyor…'; sync();
              if (typeof readUetsDocument !== 'function') throw Object.assign(new Error('Mazbata okuyucu yüklenemedi.'), { code: 'UETS_MAZBATA_NOT_FOUND' });
              const receipt = await readUetsDocument(task.ac.signal, { documentKey: item.key, barcode: value.barcode });
              if (!validRow(task, item)) return;
              if (!receipt || typeof receipt.text !== 'string' || receipt.documentKey !== item.key)
                throw new Error('Bulunan mazbata seçili tebligatın dosya kapsamıyla eşleşmedi.');
              const records = model.analyzeDocument(receipt.text);
              if (records.provider !== 'uets' || records.barcodes.length !== 1 || records.barcodes[0] !== value.barcode)
                throw new Error('Mazbata barkodu seçili tebligatla tekil olarak eşleşmedi.');
              value.result = { provider: 'uets', barcode: value.barcode, status: 'Mazbatadaki kayıtlar', events: records.events };
              value.sourceLabel = receipt.label || '';
            } else {
              value.message = 'PTT sorgusu arka planda yürütülüyor…'; sync();
              const result = await query('ptt', value.barcode, { signal: task.ac.signal, onStatus: (text, action) => {
                if (!validRow(task, item)) return;
                value.message = action?.needsVerification === true ? `Doğrulama bekliyor. ${text || 'Resmi PTT sayfasını açıp güvenlik doğrulamasını tamamlayın.'}` : String(text || 'PTT sorgusu sürüyor…');
                value.action = typeof action?.openPage === 'function' ? { task, openPage: action.openPage, opening: false } : null;
                sync();
              } });
              if (!validRow(task, item)) return;
              if (!result || result.provider !== 'ptt' || result.barcode !== value.barcode)
                throw new Error('PTT sorgu sonucu seçili tebligatın barkoduyla eşleşmedi.');
              value.result = result;
            }
            value.message = 'Tamamlandı.';
          } catch (error) {
            if (!validRow(task, item)) return;
            value.message = error?.message || 'Tebligat sorgulanamadı. Yeniden deneyin.';
            value.error = true;
            value.uetsFallback = value.provider === 'uets' && ['UETS_MAZBATA_NOT_FOUND', 'UETS_MAZBATA_LIMIT', 'TEBLIGAT_TEXT'].includes(error?.code);
            if (['Fatal', 'Blocked', 'AbortError', 'Stopped', 'Superseded'].includes(error?.name) ||
                [401, 403, 429, 503].includes(error?.status) || Number.isFinite(error?.retryAt)) {
              value.pending = false;
              cancel(value.message);
              sync();
              return;
            }
          }
          if (!validRow(task, item)) return;
          value.pending = false; delete value.action; completed++; sync();
        }
        if (valid(task)) message(`${completed} tebligat işlendi. Sonuçlar her tebligatın yanında gösterilir.`);
      } finally { finish(task); }
    });
    all.addEventListener('change', () => {
      if (current?.kind === 'batch') return;
      selected.clear();
      if (all.checked) for (const item of items) selected.add(item.key);
      sync();
    });
    stop.addEventListener('click', () => { cancel('İşlem durduruldu. Tamamlanan sonuçlar korundu.'); sync(); });
    const refresh = async () => {
      if (destroyed || current || typeof loadDocuments !== 'function') return;
      const task = { kind: 'list', ac: new AbortController() };
      current = task; sync();
      try {
        await loadDocuments(task.ac.signal);
        if (valid(task)) { message(''); sync(); }
      } catch (error) {
        if (valid(task)) message(error?.message || 'Tebligat listesi alınamadı. Sekmeyi yeniden açıp deneyin.', true);
      } finally { finish(task); }
    };
    const destroy = () => {
      if (destroyed) return;
      cancel();
      destroyed = true; selected.clear(); states.clear(); items = [];
      list.replaceChildren(); status.replaceChildren();
      signal?.removeEventListener('abort', destroy);
    };
    signal?.addEventListener('abort', destroy, { once: true });
    if (signal?.aborted) destroy();
    else { sync(); if (typeof loadDocuments === 'function') void refresh(); }
    return Object.freeze({ sync, destroy });
  }
  const api = Object.freeze({ mount });
  globalThis.UHDTebligatUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
