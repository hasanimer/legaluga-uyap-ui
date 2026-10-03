/* global module */
(() => {
  'use strict';
  let count = 0;
  const PROVIDERS = { ptt: 'PTT posta tebligatı', uets: 'UETS / e-Tebligat' };
  const SOURCES = { ptt: 'https://www.ptt.gov.tr/', uets: 'https://ptt.etebligat.gov.tr/' };
  function mount(container, { query, readDocument, readSubjectDocument, readUetsDocument, getDocumentLabel, getDocumentKey, getDocuments, loadDocuments, signal }) {
    const barcodeModel = globalThis.UHDTebligatBarcode;
    if (!barcodeModel || typeof query !== 'function') throw new Error('Tebligat sorgusu yüklenemedi. Eklentiyi ve UYAP sekmesini yenileyin.');
    const key = `tebligat-${++count}`;
    const el = (tag, attrs, ...children) => {
      const node = document.createElement(tag);
      for (const [name, value] of Object.entries(attrs || {})) {
        if (value === false || value == null) continue;
        if (value === true) node.setAttribute(name, ''); else node.setAttribute(name, String(value));
      }
      node.append(...children.flat().filter(value => value != null));
      return node;
    };
    const attr = (name, extra = {}) => ({ 'data-tebligat': name, ...extra });
    const provider = el('select', attr('provider', { id: `${key}-provider` }),
      Object.entries(PROVIDERS).map(([value, name]) => el('option', { value }, name)));
    const barcode = el('input', attr('barcode', { id: `${key}-barcode`, type: 'text', inputmode: 'numeric', maxlength: 40,
      autocomplete: 'off', spellcheck: 'false', placeholder: '13 haneli barkod', 'aria-describedby': `${key}-hint` }));
    const read = el('button', attr('read', { type: 'button', class: 'chip' }), 'Evraktan barkod ve kayıtları oku');
    const hasPicker = typeof getDocuments === 'function';
    const documentSelect = el('select', attr('document', { id: `${key}-document`, 'aria-describedby': `${key}-document-hint` }));
    const reloadDocuments = el('button', attr('load-documents', { type: 'button', class: 'chip' }), 'Listeyi yenile');
    const readSubjects = el('button', attr('read-subjects', { type: 'button', class: 'chip' }), 'İçerikleri oku');
    const documentHint = el('p', attr('document-hint', { id: `${key}-document-hint`, class: 'dp-muted' }));
    const documentSubject = el('p', attr('document-subject', { class: 'dp-muted', hidden: true }));
    const documentPicker = el('div', { class: 'te-document-picker', hidden: !hasPicker },
      el('div', { class: 'te-field' }, el('label', { for: `${key}-document` }, 'Tebligat / mazbata evrakı'), documentSelect),
      el('div', { class: 'te-document-actions' }, reloadDocuments, readSubjects), documentHint, documentSubject);
    const documentLabel = el('span', { class: 'te-document-label' });
    const queryButton = el('button', attr('query', { type: 'submit', class: 'dp-go' }), 'Sorgula');
    const queryUets = el('button', attr('query-uets', { type: 'button', class: 'chip', hidden: true }), 'UETS’den güncel sorgula');
    const openPtt = el('button', attr('open-ptt', { type: 'button', class: 'chip', hidden: true }), 'PTT sayfasını aç');
    const openUets = el('button', attr('open-uets', { type: 'button', class: 'chip', hidden: true }), 'UETS sayfasını aç');
    const stop = el('button', attr('stop', { type: 'button', class: 'chip', hidden: true }), 'Durdur');
    const status = el('div', attr('status', { class: 'te-status', role: 'status', 'aria-live': 'polite' }));
    const candidates = el('fieldset', attr('candidates', { class: 'te-candidates', hidden: true }));
    const results = el('section', attr('results', { class: 'te-results', hidden: true, 'aria-label': 'Tebligat sorgusu sonucu' }));
    const records = el('section', attr('document-records', { class: 'te-results te-document-records', hidden: true, 'aria-label': 'Mazbatadaki kayıtlar' }));
    const hint = el('p', { id: `${key}-hint`, class: 'dp-muted' },
      'PTT için barkodu okuyup Sorgula’ya basın. UETS için dosyadaki e-tebliğ mazbatasını bulun; kayıtlar ve tarihler belgeden gösterilir.');
    const providerHint = el('p', { class: 'te-provider-hint' });
    const form = el('form', { class: 'dp-card te-form', novalidate: true },
      el('h4', null, 'Tebligat sorgusu'), hint,
      documentPicker,
      el('div', { class: 'te-fields' },
        el('div', { class: 'te-field' }, el('label', { for: `${key}-provider` }, 'Sorgu hizmeti'), provider),
        el('div', { class: 'te-field' }, el('label', { for: `${key}-barcode` }, 'Barkod numarası'), barcode)),
      el('div', { class: 'te-document' }, read, documentLabel), candidates,
      el('div', { class: 'te-actions' }, queryButton, queryUets, openPtt, openUets, stop), providerHint, status);
    container.replaceChildren(el('div', { class: 'tebligat-panel' }, form, records, results));
    let current = null, destroyed = false, documentKey = hasPicker ? '' : getDocumentKey?.(), extractedBarcode = '';
    let manualProvider = false, extractedProvider = '';
    let documentsLoaded = false, documentListSignature = '', selectedDocument = '', manualDocument = false;
    let documentItems = [], documentRevision, revisionKnown = false;
    const subjects = new Map();
    const itemStamp = item => JSON.stringify([item.key, item.label, item.aciklama || '']);
    const subjectFor = item => {
      const saved = subjects.get(item.key), metadata = barcodeModel.extractSubject?.(item.aciklama, { metadata: true }) || '';
      return saved?.text ? saved : metadata ? { text: metadata, source: 'UYAP açıklaması' } : saved || null;
    };
    const subjectLabel = item => subjectFor(item)?.text || (subjects.get(item.key)?.error ? 'İçerik okunamadı' : subjects.has(item.key) ? 'İçerik belirlenemedi' : 'İçerik okunmadı');
    const serviceButtons = { ptt: openPtt, uets: openUets };
    let serviceAction = null;
    const clearServiceAction = () => {
      serviceAction = null;
      for (const button of Object.values(serviceButtons)) { button.hidden = true; button.disabled = false; }
    };
    const message = (value, error = false) => {
      status.textContent = value;
      status.classList.toggle('err', error);
    };
    const sync = () => {
      if (destroyed) return;
      let snapshot, items = [];
      if (hasPicker) {
        snapshot = getDocuments() || {};
        items = Array.isArray(snapshot.items) ? snapshot.items.filter(item => typeof item?.key === 'string' && item.key && typeof item.label === 'string') : [];
        if (Object.hasOwn(snapshot, 'revision')) {
          if (revisionKnown && snapshot.revision !== documentRevision) {
            subjects.clear();
            if (['read', 'uets-read', 'subjects'].includes(current?.kind)) current.ac.abort();
          }
          documentRevision = snapshot.revision; revisionKnown = true;
        }
        documentItems = items;
        for (const [itemKey, saved] of subjects) {
          if (!items.some(item => item.key === itemKey && itemStamp(item) === saved.stamp)) subjects.delete(itemKey);
        }
        const nextSignature = JSON.stringify(items.map(item => [item.key, item.label, subjectLabel(item)]));
        if (nextSignature !== documentListSignature) {
          documentListSignature = nextSignature;
          if (!items.some(item => item.key === selectedDocument)) selectedDocument = '';
          documentSelect.replaceChildren(el('option', { value: '' }, items.length ? 'Tebligat veya mazbata seçin' : 'Tebligat listesi boş'),
            ...items.map(item => el('option', { value: item.key }, `${item.label} · İçerik: ${subjectLabel(item)}`)));
        }
        if (!current || current.kind === 'list') {
          if (!selectedDocument && !manualDocument && !documentsLoaded && items.some(item => item.key === snapshot.selectedKey)) {
            selectedDocument = snapshot.selectedKey; manualDocument = true;
          }
          const preferred = items.find(item => item.key === snapshot.preferredUetsKey && item.uets === true && item.own === true);
          if (!manualDocument && preferred && (!manualProvider || provider.value === 'uets')) {
            selectedDocument = preferred.key;
            if (!manualProvider) { provider.value = 'uets'; extractedProvider = 'uets'; }
          } else if (!selectedDocument && !manualDocument && items.length === 1) selectedDocument = items[0].key;
        }
        documentSelect.value = selectedDocument;
        const loading = current?.kind === 'list' || snapshot.loading;
        documentSelect.disabled = !!loading || !items.length || current?.kind === 'query';
        reloadDocuments.disabled = !!current || typeof loadDocuments !== 'function';
        const remaining = items.filter(item => !subjectFor(item) && !subjects.has(item.key));
        readSubjects.disabled = !!current || !remaining.length || typeof (readSubjectDocument || readDocument) !== 'function';
        readSubjects.textContent = remaining.length ? `İçerikleri oku (${remaining.length})` : 'İçerikler okundu';
        readSubjects.title = `${remaining.length} tebligat / mazbata tek tek okunur; UYAP istekleri ortak kuyrukta aralıklı yürütülür. Durdur ile bırakabilirsiniz. Belirlenemeyen içerik tahmin edilmez.`;
        documentHint.textContent = loading ? 'Dosyanın tebligat ve mazbata listesi alınıyor…'
          : snapshot.complete === true ? (items.length ? `${items.length} tebligat / mazbata listelendi. UYAP açıklamaları hemen gösterilir; diğer içerikler yalnız okuma düğmesine bastığınızda okunur.` : 'Bu dosyanın evrak listesinde tebligat veya mazbata bulunamadı. Barkodu elle girebilirsiniz.')
            : 'Evrak listesi henüz tamamlanmadı. Eksik tebligatlar için Listeyi yenile’ye basın; barkodu elle de girebilirsiniz.';
      }
      const nextDocument = hasPicker ? selectedDocument : getDocumentKey?.();
      if (nextDocument !== documentKey) {
        documentKey = nextDocument;
        clearServiceAction();
        if (['read', 'uets-read', 'query', 'subjects'].includes(current?.kind)) current.ac.abort();
        clearCandidates();
        clearRecords();
        if (extractedBarcode && barcode.value === extractedBarcode) {
          current?.ac.abort();
          barcode.value = '';
          results.hidden = true;
        }
        extractedBarcode = '';
        if (!manualProvider && extractedProvider && provider.value === extractedProvider) provider.value = 'ptt';
        extractedProvider = '';
        message('Seçili evrak değişti. Barkodu yeni evraktan bulabilir veya elle girebilirsiniz.');
      }
      if (!manualProvider && hasPicker && selectedDocument === snapshot?.preferredUetsKey && items.some(item => item.key === selectedDocument && item.uets === true && item.own === true)) {
        provider.value = 'uets'; extractedProvider = 'uets';
      }
      const title = hasPicker ? items.find(item => item.key === selectedDocument)?.label || '' : getDocumentLabel?.() || '';
      const selectedItem = items.find(item => item.key === selectedDocument), subject = selectedItem && subjectFor(selectedItem);
      documentSubject.hidden = !selectedItem;
      documentSubject.textContent = selectedItem ? `İçerik: ${subjectLabel(selectedItem)}${subject?.text ? ` · Kaynak: ${subject.source}` : ''}` : '';
      documentLabel.textContent = title ? `Seçili tebligat: ${title}` : hasPicker ? 'Barkod okumak için yukarıdaki listeden bir tebligat veya mazbata seçin.' : 'Barkod okumak için önce Evrak sekmesinden bir tebligat seçin.';
      read.disabled = !!current || !title;
      read.hidden = provider.value === 'uets';
      read.title = title || (hasPicker ? 'Listeden bir tebligat veya mazbata seçin' : 'Önce Evrak sekmesinden bir tebligat seçin');
      provider.disabled = barcode.disabled = queryButton.disabled = !!current;
      queryButton.textContent = provider.value === 'uets' ? 'Dosyadan bul ve göster' : 'Sorgula';
      queryUets.hidden = provider.value !== 'uets';
      queryUets.disabled = !!current || !barcodeModel.normalizeBarcode(barcode.value);
      stop.hidden = !current;
      form.setAttribute('aria-busy', String(!!current));
      providerHint.textContent = provider.value === 'ptt'
        ? 'PTT sorgusu arka planda yürütülür. Doğrulama gerekirse PTT sayfasını açıp tamamlayın; sonuç burada görünür.'
        : 'Seçim yoksa dosyadaki en yeni e-tebliğ mazbatası okunur. Güncel sorgu için “UETS’den güncel sorgula”yı kullanın; UETS oturumunuz gerekir. Giriş gerekiyorsa UETS girişini açın; Gönderi Sorgulama bölümünden sorguyu tamamlayın.';
    };
    const clearCandidates = () => { candidates.hidden = true; candidates.replaceChildren(); };
    const clearRecords = () => { records.hidden = true; records.replaceChildren(); };
    const drawRecords = (value, source = {}) => {
      clearRecords();
      if (value.provider !== 'uets' || value.barcodes.length !== 1) return;
      const events = value.events || [];
      const rows = events.map(event => el('tr', null,
        el('td', { 'data-label': 'Tarih', class: 'te-date' }, event.time),
        el('td', { 'data-label': 'İşlem' }, event.status),
        el('td', { 'data-label': 'Açıklama' }, event.detail)));
      records.replaceChildren(...[
        el('div', { class: 'te-result-head' }, el('div', null,
          el('span', { class: 'te-source' }, 'Seçili evrak · UETS e-tebliğ mazbatası'),
          el('h3', null, 'Mazbatadaki kayıtlar'), source.label ? el('div', { class: 'dp-muted' }, source.label) : null,
          el('div', { class: 'dp-muted' }, `Barkod: ${value.barcodes[0]}`))),
        rows.length ? el('div', { class: 'te-tablewrap' }, el('table', { class: 'te-table' },
          el('thead', null, el('tr', null, ['Tarih', 'İşlem', 'Açıklama'].map(title => el('th', { scope: 'col' }, title)))), el('tbody', null, rows)))
          : el('p', { class: 'dp-muted' }, 'Mazbata tanındı; olay tarihleri ayrı okunamadı. Tarihleri Evrak sekmesindeki belgeden kontrol edin.'),
        el('p', { class: 'dp-summary-source' }, 'Bu kayıtlar seçili mazbatadan okundu. Güncel hizmet kayıtlarını almak için UETS’den güncel sorgula’ya basın.')]);
      records.hidden = false;
    };
    const valid = task => !destroyed && current === task && !task.ac.signal.aborted;
    const validReadTask = task => valid(task) && documentKey === task.documentKey && barcode.value === task.inputBarcode &&
      provider.value === task.inputProvider && task.revision === documentRevision && (hasPicker || getDocumentKey?.() === task.documentKey);
    const validServiceTask = task => valid(task) && task.kind === 'query' && Object.hasOwn(serviceButtons, task.provider) &&
      provider.value === task.provider && barcode.value === task.barcode && documentKey === task.documentKey;
    const showServiceAction = (task, value) => {
      if (!validServiceTask(task)) return;
      if (typeof value?.openPage !== 'function') { clearServiceAction(); return; }
      const button = serviceButtons[task.provider];
      serviceAction = { task, button, openPage: value.openPage };
      button.textContent = task.provider === 'ptt'
        ? value.needsVerification === true ? 'PTT doğrulamasını aç' : 'PTT sayfasını aç'
        : value.needsVerification === true ? 'UETS girişini aç' : 'UETS sayfasını aç';
      button.hidden = false;
      button.disabled = task.openingPage === true;
    };
    for (const [service, button] of Object.entries(serviceButtons)) button.addEventListener('click', async () => {
      const action = serviceAction;
      if (!action || action.button !== button || !validServiceTask(action.task) || action.task.openingPage) return;
      const task = action.task;
      task.openingPage = true;
      button.disabled = true;
      try { await action.openPage(); }
      catch (error) {
        if (serviceAction?.task === task && validServiceTask(task)) message(error?.message || `${service === 'ptt' ? 'PTT' : 'UETS'} sayfası açılamadı. Yeniden deneyin.`, true);
      } finally {
        task.openingPage = false;
        if (serviceAction?.task === task && validServiceTask(task)) button.disabled = false;
      }
    });
    const start = (kind = 'query') => {
      const task = { ac: new AbortController(), kind };
      clearServiceAction();
      current = task;
      task.ac.signal.addEventListener('abort', () => { if (current === task) clearServiceAction(); }, { once: true });
      clearCandidates();
      sync();
      return task;
    };
    const finish = task => { if (current === task) { clearServiceAction(); current = null; sync(); if (!destroyed && task.focusBarcode) barcode.focus(); } };
    const choose = value => {
      barcode.value = value;
      extractedBarcode = value;
      results.hidden = true;
      clearCandidates();
      message(provider.value === 'uets' ? 'Barkod hazır. Güncel hizmet kayıtları için UETS’den güncel sorgula’ya basın.' : 'Barkod hazır. Hizmeti seçip Sorgula’ya basın.');
      if (current) current.focusBarcode = true; else barcode.focus();
    };
    const draw = value => {
      const name = PROVIDERS[value.provider] || PROVIDERS[provider.value];
      const details = Array.isArray(value.details) ? value.details : [];
      const events = Array.isArray(value.events) ? value.events : [];
      const requested = Number.isFinite(value.queriedAt) ? new Date(value.queriedAt).toLocaleString('tr-TR') : '';
      const rows = events.map(event => el('tr', null,
        el('td', { 'data-label': 'Tarih', class: 'te-date' }, String(event.time || '—')),
        el('td', { 'data-label': 'İşlem' }, String(event.status || '—')),
        el('td', { 'data-label': 'Açıklama' }, [event.detail, event.location].filter(Boolean).join(' · ') || '—')));
      results.replaceChildren(...[
        el('div', { class: 'te-result-head' }, el('div', null,
          el('span', { class: 'te-source' }, name), el('h3', null, String(value.status || 'Sorgu sonucu')),
          el('div', { class: 'dp-muted' }, `Barkod: ${value.barcode}${requested ? ` · Sorgulama: ${requested}` : ''}`)),
        el('a', { class: 'chip', href: SOURCES[value.provider] || SOURCES[provider.value], target: '_blank', rel: 'noopener noreferrer' }, 'Resmi hizmeti aç')),
        details.length ? el('dl', { class: 'te-details' }, details.map(item => el('div', null,
          el('dt', null, String(item.label)), el('dd', null, String(item.value))))) : null,
        el('h4', { class: 'te-events-title' }, 'Olay ve hareket kayıtları', el('span', { class: 'dp-summary-count' }, String(events.length))),
        events.length ? el('div', { class: 'te-tablewrap' }, el('table', { class: 'te-table' },
          el('thead', null, el('tr', null, ['Tarih', 'İşlem', 'Açıklama'].map(title => el('th', { scope: 'col' }, title)))), el('tbody', null, rows)))
          : el('p', { class: 'dp-muted' }, 'Hizmet bu sorgu için hareket kaydı döndürmedi.'),
        el('p', { class: 'dp-summary-source' }, 'Bilgiler resmi sorgu hizmetinden alınır ve bu ekran kapanınca bırakılır.')].filter(Boolean));
      results.hidden = false;
    };
    const queryService = async service => {
      if (current || destroyed) return;
      if (provider.value !== service) return;
      const value = barcodeModel.normalizeBarcode(barcode.value);
      if (!value) { message('13 haneli geçerli bir barkod numarası girin.', true); barcode.focus(); return; }
      barcode.value = value;
      const task = start();
      task.provider = service; task.barcode = value; task.documentKey = documentKey;
      results.hidden = true;
      message(service === 'ptt' ? 'PTT sorgusu arka planda başlatılıyor…' : 'UETS sorgusu resmî sayfada hazırlanıyor…');
      try {
        const result = await query(service, value, { signal: task.ac.signal, onStatus: (text, action) => {
          if (!validServiceTask(task)) return;
          message(text);
          showServiceAction(task, action);
        } });
        if (!validServiceTask(task)) return;
        if (!result || result.provider !== service || result.barcode !== value) throw new Error('Sorgu sonucu bu barkodla eşleşmedi. Yeniden deneyin.');
        draw(result);
        message('Sorgu tamamlandı.');
      } catch (error) {
        if (validServiceTask(task)) message(error?.name === 'AbortError' ? 'Sorgu durduruldu.' : error.message || 'Sorgu tamamlanamadı. Yeniden deneyin.', error?.name !== 'AbortError');
      } finally { finish(task); }
    };
    const analyzeReadDocument = doc => {
      const parsed = barcodeModel.analyzeDocument(doc.text);
      const extract = text => barcodeModel.extractBarcodes(text).length > 1 ? '' : barcodeModel.extractSubject?.(text) || '';
      if (!Array.isArray(doc.sources)) return { parsed, label: doc.label || '', subject: parsed.barcodes.length > 1 ? '' : extract(doc.text) };
      const uetsSources = doc.sources.map(source => ({ source, parsed: barcodeModel.analyzeDocument(source?.text) })).filter(source => source.parsed.provider === 'uets');
      if (uetsSources.length === 1) return { parsed: uetsSources[0].parsed,
        label: [doc.label, uetsSources[0].source.label].filter(Boolean).join(' · '), subject: extract(uetsSources[0].source.text) };
      // Çok yaprakta bir belgenin içeriğini başka yaprağın barkoduyla birleştirme.
      const exactSources = parsed.barcodes.length === 1 ? doc.sources.filter(source => {
        const codes = barcodeModel.extractBarcodes(source?.text);
        return codes.length === 1 && codes[0] === parsed.barcodes[0];
      }) : [];
      const source = doc.sources.length === 1 ? doc.sources[0] : exactSources.length === 1 && !uetsSources.length ? exactSources[0] : null;
      return { parsed: { ...parsed, provider: uetsSources.length ? parsed.provider : null, events: [] }, label: doc.label || '',
        subject: source ? extract(source.text) : '', ambiguous: uetsSources.length > 1 };
    };
    const saveSubject = (itemKey, analyzed) => {
      const item = documentItems.find(item => item.key === itemKey);
      if (!item) return;
      subjects.set(itemKey, { text: analyzed.subject || '', stamp: itemStamp(item), source: 'seçili evrak metni' });
    };
    const readLocalDocument = async (fromFile = false) => {
      if (current || destroyed) return;
      if (fromFile && provider.value !== 'uets') return;
      if (fromFile && typeof readUetsDocument !== 'function' && (hasPicker ? !selectedDocument : !getDocumentLabel?.())) {
        message(hasPicker ? 'Önce listeden bir e-tebliğ mazbatası seçin.' : 'Önce Evrak sekmesinden bir e-tebliğ mazbatası seçin.', true); return;
      }
      const task = start(fromFile ? 'uets-read' : 'read');
      clearRecords();
      results.hidden = true;
      if (extractedBarcode && barcode.value === extractedBarcode) barcode.value = '';
      extractedBarcode = '';
      task.documentKey = documentKey; task.inputBarcode = barcode.value; task.inputProvider = provider.value;
      task.revision = documentRevision;
      const requested = barcodeModel.normalizeBarcode(task.inputBarcode);
      message(fromFile ? 'Dosyanın e-tebliğ mazbatası bulunup okunuyor…' : 'Seçili evrakın metni okunuyor…');
      try {
        if (!validReadTask(task)) return;
        if (fromFile && task.inputBarcode.trim() && !requested) throw new Error('Barkodu boş bırakın veya 13 haneli geçerli bir barkod girin.');
        const auto = fromFile && typeof readUetsDocument === 'function';
        const doc = auto ? await readUetsDocument(task.ac.signal, { documentKey: hasPicker ? selectedDocument : undefined, barcode: requested })
          : await readDocument(task.ac.signal, hasPicker ? selectedDocument : undefined);
        if (!validReadTask(task)) return;
        if (!doc || typeof doc.text !== 'string') throw new Error('Evrak metni okunamadı. Mazbatayı Evrak sekmesinden kontrol edin.');
        const analyzed = analyzeReadDocument(doc), parsed = analyzed.parsed;
        if (auto && hasPicker) {
          const items = getDocuments()?.items || [];
          if (typeof doc.key !== 'string' || !items.some(item => item.key === doc.key && item.own !== false)) throw new Error('Bulunan mazbata bu dosyanın evrak listesiyle eşleşmedi. Listeden bir belge seçip yeniden deneyin.');
          if (task.documentKey && doc.key !== task.documentKey) throw new Error('Okunan mazbata seçili evrakla eşleşmedi. Yeniden deneyin.');
          selectedDocument = documentKey = task.documentKey = doc.key;
          documentSelect.value = doc.key;
        } else if (!auto && hasPicker && doc.key != null && doc.key !== task.documentKey) throw new Error('Okunan mazbata seçili evrakla eşleşmedi. Yeniden deneyin.');
        if (fromFile && (parsed.provider !== 'uets' || analyzed.ambiguous)) throw new Error(analyzed.ambiguous
          ? 'Evrakta birden fazla e-tebliğ mazbatası var. Kayıtlar bir gönderiye bağlanamadı; ilgili mazbatayı ayrı seçin.'
          : 'Seçili evrak UETS e-tebliğ mazbatası olarak tanınamadı. İlgili mazbatayı seçip yeniden deneyin.');
        const found = parsed.barcodes;
        if (fromFile && requested && found.length === 1 && found[0] !== requested) throw new Error('Mazbatadaki barkod girdiğiniz barkodla eşleşmedi. Belgeyi veya barkodu kontrol edin.');
        if (hasPicker) saveSubject(task.documentKey, analyzed);
        if (found.length && parsed.provider === 'uets') {
          if (!manualProvider) { provider.value = 'uets'; extractedProvider = 'uets'; }
          if (!analyzed.ambiguous) drawRecords(parsed, { label: analyzed.label || (hasPicker ? getDocuments()?.items?.find(item => item.key === selectedDocument)?.label : getDocumentLabel?.()) || '' });
        }
        if (!found.length) {
          message('Seçili tebligatta okunabilir barkod bulunamadı. Belgedeki barkodu kontrol edip elle girebilirsiniz.');
        } else if (found.length === 1) {
          choose(found[0]);
          if (analyzed.ambiguous) message('Evrakta birden fazla e-tebliğ mazbatası var; olay kayıtları bir gönderiye bağlanamadı. İlgili mazbatayı ayrı seçin.');
          else if (parsed.provider === 'uets') message(fromFile ? 'Dosyadaki e-tebliğ mazbatası okundu. Belgedeki kayıtlar aşağıda gösteriliyor.'
            : manualProvider && provider.value !== 'uets' ? 'E-tebliğ mazbatası tanındı. Barkod hazır; seçtiğiniz hizmetle Sorgula’ya basabilirsiniz.'
              : 'E-tebliğ mazbatası tanındı; kayıtlar aşağıda gösteriliyor. Güncel sorgu için UETS’den güncel sorgula’ya basın.');
        }
        else {
          candidates.replaceChildren(el('legend', null, 'Birden fazla barkod bulundu. Sorgulanacak barkodu seçin.'),
            ...found.map(value => {
              const button = el('button', { type: 'button', class: 'chip', 'data-tebligat-candidate': value }, value);
              button.addEventListener('click', () => choose(value));
              return button;
            }));
          candidates.hidden = false;
          message(`${found.length} barkod bulundu. Birini seçin; sorgu kendiliğinden başlamaz.`);
        }
      } catch (error) {
        if (validReadTask(task)) message(error?.name === 'AbortError' ? 'Okuma durduruldu.' : error.message || 'Evrak okunamadı. Barkodu elle girebilirsiniz.', error?.name !== 'AbortError');
      } finally { finish(task); }
    };
    form.addEventListener('submit', event => {
      event.preventDefault();
      return provider.value === 'uets' ? readLocalDocument(true) : queryService('ptt');
    });
    queryUets.addEventListener('click', () => queryService('uets'));
    read.addEventListener('click', () => readLocalDocument());
    readSubjects.addEventListener('click', async () => {
      if (current || destroyed || !hasPicker) return;
      const reader = readSubjectDocument || readDocument;
      if (typeof reader !== 'function') return;
      const pending = documentItems.filter(item => !subjectFor(item) && !subjects.has(item.key)).map(item => ({ key: item.key, stamp: itemStamp(item) }));
      if (!pending.length) return;
      const task = start('subjects'); task.revision = documentRevision;
      const validSubjects = () => valid(task) && task.revision === documentRevision;
      let completed = 0;
      try {
        for (const item of pending) {
          if (!validSubjects()) return;
          if (!documentItems.some(value => value.key === item.key && itemStamp(value) === item.stamp)) throw new Error('Tebligat listesi değişti. İçerikleri yeniden okumak için düğmeye tekrar basın.');
          message(`Tebligat içerikleri okunuyor: ${completed + 1} / ${pending.length}`);
          let doc;
          try { doc = await reader(task.ac.signal, item.key); }
          catch (error) {
            if (!validSubjects()) return;
            if (error.code !== 'TEBLIGAT_TEXT') throw error;
            if (!documentItems.some(value => value.key === item.key && itemStamp(value) === item.stamp)) throw new Error('Tebligat listesi değişti. İçerikleri yeniden okuyun.', { cause: error });
            subjects.set(item.key, { text: '', stamp: item.stamp, error: true }); completed++; sync(); continue;
          }
          if (!validSubjects()) return;
          if (!doc || typeof doc.text !== 'string' || doc.key != null && doc.key !== item.key) throw new Error('Okunan evrak tebligat listesiyle eşleşmedi. Listeyi yenileyip tekrar deneyin.');
          if (!documentItems.some(value => value.key === item.key && itemStamp(value) === item.stamp)) throw new Error('Tebligat listesi değişti. İçerikleri yeniden okuyun.');
          saveSubject(item.key, analyzeReadDocument(doc)); completed++; sync();
        }
        if (validSubjects()) message(`${completed} tebligat / mazbata okundu. Açık içerik alanı bulunamayanlar “İçerik belirlenemedi” olarak gösterilir.`);
      } catch (error) {
        if (validSubjects()) message(error.message || 'İçerik okunamadı. Kalanları okumak için yeniden deneyin.', true);
      } finally { finish(task); }
    });
    stop.addEventListener('click', () => {
      if (!current) return;
      message(current.kind === 'list' ? 'Liste alma durduruldu.' : current.kind === 'query' ? 'Sorgu durduruldu.' : current.kind === 'subjects' ? 'İçerik okuma durduruldu.' : 'Okuma durduruldu.');
      current.ac.abort();
    });
    documentSelect.addEventListener('change', () => { manualDocument = true; selectedDocument = documentSelect.value; sync(); });
    const refreshDocuments = async (force = false) => {
      if (current || destroyed || typeof loadDocuments !== 'function') return;
      const task = start('list');
      message('Dosyanın tebligat ve mazbata listesi alınıyor…');
      try {
        await loadDocuments(task.ac.signal, { force });
        if (!valid(task)) return;
        sync();
        documentsLoaded = true;
        message('');
      } catch (error) {
        if (!destroyed && current === task) message(error?.name === 'AbortError' ? 'Liste alma durduruldu.' : error.message || 'Tebligat listesi alınamadı. Yeniden deneyebilir veya barkodu elle girebilirsiniz.', error?.name !== 'AbortError');
      } finally { finish(task); }
    };
    reloadDocuments.addEventListener('click', () => refreshDocuments(true));
    const changed = () => { if (['query', 'read', 'uets-read', 'subjects'].includes(current?.kind)) current.ac.abort(); clearServiceAction(); results.hidden = true; clearCandidates(); message(''); sync(); };
    barcode.addEventListener('input', () => { extractedBarcode = ''; clearRecords(); changed(); });
    provider.addEventListener('change', () => { manualProvider = true; extractedProvider = ''; changed(); });
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      clearServiceAction();
      current?.ac.abort();
      current = null;
      candidates.replaceChildren(); results.replaceChildren(); clearRecords(); barcode.value = '';
      subjects.clear(); documentSubject.replaceChildren();
      signal?.removeEventListener('abort', destroy);
    };
    signal?.addEventListener('abort', destroy, { once: true });
    if (signal?.aborted) destroy();
    else { sync(); if (hasPicker && typeof loadDocuments === 'function') void refreshDocuments(); }
    return { sync, destroy };
  }
  const api = Object.freeze({ mount });
  globalThis.UHDTebligatUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
