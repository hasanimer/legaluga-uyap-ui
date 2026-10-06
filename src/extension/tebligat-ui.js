/* global module */
(() => {
  'use strict';
  let count = 0;
  const PROVIDERS = { ptt: 'PTT posta tebligatı', uets: 'UETS / e-Tebligat' };
  const BADGES = { ptt: 'Posta · PTT', uets: 'E-tebligat' };
  const UETS_PAGE = 'https://ptt.etebligat.gov.tr/';
  // UYAP açıklaması: "Normal Tebligat[BORÇLU X] - Tebliğ Edildi" ya da "Elektronik Tebligat[Tebligat Yapılacak 3. Taraf Y]".
  // Yalnız ekranda düzenli göstermek için ayrıştırılır; hizmet kararını tebligat modeli verir.
  function describe(aciklama) {
    const text = typeof aciklama === 'string' ? aciklama.replace(/\s+/gu, ' ').trim().slice(0, 300) : '';
    const match = /^([^[\]]{1,60}?)\s*\[([^[\]]{1,240})\]\s*(?:-\s*([^[\]]{1,80}))?$/u.exec(text);
    // Köşeli parantez yalnız tebligat türünden sonra muhatap sayılır; başka açıklama olduğu gibi İçerik'te kalır.
    if (!match || !/tebli[gğ]/iu.test(match[1])) return { kind: '', party: '', state: '', text };
    return { kind: match[1].trim(), party: match[2].replace(/^tebligat\s+yap[ıi]lacak\s+/iu, '').trim(), state: (match[3] || '').trim(), text };
  }
  const sentence = text => {
    const value = String(text || '').trim();
    return value ? (value.charAt(0).toLocaleUpperCase('tr-TR') + value.slice(1).toLocaleLowerCase('tr-TR'))
      .replace(/(^|[^\p{L}])(ptt|uets|kep|uyap)(?=$|[^\p{L}])/giu, (_, before, word) => before + word.toLocaleUpperCase('tr-TR')) : '';
  };
  // PTT'nin teslim ifadesi; göndericiye teslim (iade) ve mazbatanın teslimi olumlu sonuç sayılmaz. PTT büyük harf
  // yazar: Türkçe küçültme "İ"yi "i", ASCII "I"yı "ı" yapar; ikisi de "i"ye indirilip karşılaştırılır.
  const delivered = status => {
    const text = String(status || '').toLocaleLowerCase('tr-TR').replace(/ı/gu, 'i');
    return /teslim\s+edildi|tebli[gğ]\s+edildi/u.test(text) && !/g[öo]nderici|iade|mazbata/u.test(text);
  };
  function mount(container, { query, readDocument, readSubjectDocument, readUetsDocument, readPttDocument, openPttPage, getDocuments, loadDocuments, openDocument, signal }) {
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
    const submit = el('button', attr('query', { type: 'submit', class: 'dp-go' }), 'Seçilenleri sorgula');
    const stop = el('button', attr('stop', { type: 'button', class: 'chip', hidden: true }), 'Durdur');
    const status = el('p', attr('status', { role: 'status', 'aria-live': 'polite', class: 'dp-muted te-status' }));
    const summary = el('span', attr('summary', { class: 'dp-muted te-summary' }));
    const filters = el('div', attr('filters', { class: 'te-filters', role: 'group', 'aria-label': 'Tebligat türüne göre süz' }));
    const queryFilters = el('div', attr('query-filters', { class: 'te-filters', role: 'group', 'aria-label': 'Sorgu durumuna göre süz' }));
    const pickUnqueried = el('button', attr('pick-unqueried', { type: 'button', class: 'chip', 'data-focus': 'secim|unqueried' }), 'Sorgulanmamışları seç');
    const pickCheck = el('button', attr('pick-check', { type: 'button', class: 'chip', 'data-focus': 'secim|check' }), 'Kontrol gerekenleri seç');
    const clearSelection = el('button', attr('clear-selection', { type: 'button', class: 'chip', 'data-focus': 'secim|clear' }), 'Seçimi temizle');
    const list = el('div', attr('documents', { class: 'te-notice-list' }));
    const form = el('form', { class: 'te-notice-form', novalidate: true },
      el('div', { class: 'te-notice-header' }, el('h4', null, 'Tebligat sorgusu'),
        el('p', { class: 'dp-muted' }, 'Posta tebligatları PTT’de, e-tebligatlar bu dosyadaki e-tebliğ mazbatasından sorgulanır. Sorgu yalnız siz başlatınca yapılır.')),
      el('div', { class: 'te-notice-toolbar' },
        el('label', { for: `${id}-all`, class: 'te-notice-selectall' }, all, ' Tümünü seç'), filters, summary,
        el('div', { class: 'te-notice-actions' }, submit, stop)),
      el('div', { class: 'te-query-toolbar' }, queryFilters,
        el('div', { class: 'te-query-selection' }, pickUnqueried, pickCheck, clearSelection)), status, list);
    const style = el('style', null, `
      .te-notice-form{width:100%;min-width:0;display:grid;gap:8px}.te-notice-header h4{margin:0 0 4px;font-size:15px}.te-notice-header p{margin:0}
      .te-notice-toolbar{position:sticky;top:-12px;z-index:2;display:flex;gap:8px 14px;align-items:center;flex-wrap:wrap;padding:8px 0;
        background:var(--shell-bg,#fff);border-bottom:1px solid var(--shell-line,#d0d7de)}
      .te-notice-selectall{display:flex;gap:6px;align-items:center;white-space:nowrap;cursor:pointer;font-weight:600}
      .te-filters{display:flex;gap:4px;flex-wrap:wrap}.te-filters:empty{display:none}
      .te-filters .chip[aria-pressed="true"]{border-color:var(--shell-accent,#0b6663);color:var(--shell-accent,#0b6663);font-weight:600}
      .te-query-toolbar{display:flex;gap:6px 14px;align-items:center;flex-wrap:wrap}.te-query-toolbar[hidden]{display:none}
      .te-query-selection{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}.te-query-selection .chip{font-size:12px}
      .te-summary{margin:0}.te-notice-actions{display:flex;gap:8px;margin-left:auto;align-items:center}
      .te-status{margin:0}.te-status:empty{display:none}.te-status.err{color:var(--shell-error,#cf222e)}
      .te-notice-list{display:grid;gap:6px}
      .te-row{border:1px solid var(--shell-line,#d0d7de);border-left:3px solid var(--shell-line,#d0d7de);border-radius:10px;padding:8px 12px;background:var(--shell-bg,#fff)}
      .te-row.busy{border-left-color:var(--shell-accent,#0b6663)}.te-row.attn{border-left-color:var(--shell-warn,#bf8700)}
      .te-row.done{border-left-color:var(--shell-success,#1a7f37)}.te-row.err{border-left-color:var(--shell-error,#cf222e)}
      .te-row-head{display:flex;gap:6px 12px;align-items:center;flex-wrap:wrap}
      .te-row-head>input{flex:none;width:16px;height:16px;margin:0;cursor:pointer}
      .te-row-main{flex:1 1 280px;min-width:0;display:grid;gap:2px;cursor:pointer}
      .te-row-title{font-weight:600;overflow-wrap:anywhere;line-height:1.35}.te-row-meta{color:var(--shell-muted,#57606a);font-size:12px;overflow-wrap:anywhere}
      .te-badges{display:flex;gap:4px;flex-wrap:wrap}
      .te-badge{font-size:11px;line-height:1.2;padding:3px 8px;border-radius:999px;border:1px solid var(--shell-line,#d0d7de);color:var(--shell-muted,#57606a);white-space:nowrap}
      .te-badge.ptt,.te-badge.uets{color:var(--shell-text,#1f2328)}.te-badge.uyap{color:var(--shell-success,#1a7f37);border-color:currentColor}
      .te-state{font-size:12px;font-weight:600;white-space:nowrap;min-width:9em;text-align:right}
      .te-state.idle{color:var(--shell-muted,#57606a);font-weight:400}.te-state.busy{color:var(--shell-accent,#0b6663)}
      .te-state.attn{color:var(--shell-warn-text,#9a6700)}.te-state.done{color:var(--shell-success,#1a7f37)}.te-state.err{color:var(--shell-error,#cf222e)}
      .te-state.busy::before{content:"";display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:currentColor;animation:te-pulse 1s ease-in-out infinite}
      @keyframes te-pulse{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.te-state.busy::before{animation:none}}
      .te-row-go{flex:none}.te-notice-form .chip:is(:disabled,[aria-disabled="true"]){opacity:.45;cursor:default}.te-row-subject{margin:4px 0 0 28px!important}
      .te-row-cmds{display:flex;gap:6px;flex:none;align-items:center}.te-row-cmds .chip{white-space:nowrap}
      .te-row-body{display:grid;gap:6px;margin:8px 0 2px 28px;min-width:0;overflow-wrap:anywhere}.te-row-body:empty{display:none}
      .te-row-body p{margin:0}.te-msg.warn{color:var(--shell-warn-text,#9a6700)}.te-msg.err{color:var(--shell-error,#cf222e)}
      .te-result{display:flex;gap:4px 12px;align-items:baseline;flex-wrap:wrap}.te-result strong{font-size:13px}
      .te-facts{display:flex;flex-wrap:wrap;gap:2px 18px;margin:0}.te-facts div{display:flex;gap:6px}.te-facts dt{color:var(--shell-muted,#57606a)}.te-facts dd{margin:0}
      .te-events summary{cursor:pointer;color:var(--shell-accent,#0b6663);font-size:12px;width:max-content}
      .te-tablewrap{max-height:240px;overflow:auto;margin-top:6px}.te-table{width:100%;font-size:12px;border-collapse:collapse}
      .te-table th,.te-table td{text-align:left;padding:5px 8px;vertical-align:top;border-bottom:1px solid var(--shell-line,#d0d7de)}
      .te-table th{color:var(--shell-muted,#57606a);font-weight:600}.te-date{white-space:nowrap}.te-source{color:var(--shell-muted,#57606a);font-size:11px}
      .te-manual{display:grid;gap:6px;padding:8px 10px;border:1px dashed var(--shell-warn,#bf8700);border-radius:8px}.te-manual p{margin:0}
      .te-manual-chips,.te-manual-row,.te-row-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .te-manual-chips .chip[aria-pressed="true"]{border-color:var(--shell-accent,#0b6663);color:var(--shell-accent,#0b6663);font-weight:600}
      .te-manual-row input{width:17ch;font:inherit;padding:5px 8px;border:1px solid var(--shell-line,#d0d7de);border-radius:6px;background:transparent;color:inherit}
      .te-empty{margin:12px 0}
      @media(max-width:720px){.te-state{min-width:0;text-align:left}.te-row-body,.te-row-subject{margin-left:0!important}.te-notice-actions,.te-query-selection{margin-left:0}}
    `);
    container.replaceChildren(style, form);
    let destroyed = false, current = null, opening = false, openError = '', items = [], revision, revisionKnown = false, initialSelection = false, filter = 'all', queryFilter = 'all';
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
    const titleOf = item => item.title || item.label.split(' · ')[0];
    const headingOf = item => describe(item.aciklama).party || titleOf(item);
    // Süzgeç UYAP'ın evrak türü ve açıklamasıyla çalışır; sorgu sırasında satır başka türe kayıp gizlenmez.
    // Rozet ise okunmuş zarfın hizmetini de gösterir. İşlenen ya da bekleyen satır her süzgeçte görünür.
    const metaServiceOf = item => model.noticeProvider({ title: titleOf(item), aciklama: item.aciklama || '' }) || 'unknown';
    const serviceOf = item => stateFor(item).provider || metaServiceOf(item);
    const matchesProvider = item => filter === 'all' || metaServiceOf(item) === filter;
    const visible = item => (matchesProvider(item) && (queryFilter === 'all' || queryStatusOf(item) === queryFilter)) ||
      current?.rowKey === item.key || !!stateFor(item).pending;
    const uetsLink = () => el('a', { class: 'chip', href: UETS_PAGE, target: '_blank', rel: 'noopener noreferrer',
      'data-tebligat': 'open-uets' }, 'UETS sayfasını aç');
    // Aç, özgün evrakı (zarf ya da eşleşen mazbata) dosya ekranının önizlemesinde açar; UYAP isteği yalnız bu tıklamayla gider.
    // Sorgu veya liste işi sürerken açılmaz; açma bitmeden ikinci açma ya da sorgu başlamaz. Hata yalnız durum satırına yazılır.
    const openRow = async (item, key, sourcePath) => {
      if (current || destroyed || opening || typeof openDocument !== 'function' || typeof key !== 'string' || !key ||
        (key !== item.key && key !== stateFor(item).receiptKey && key !== stateFor(item).fileKey) || !items.some(value => value.key === item.key && stamp(value) === stamp(item))) return;
      opening = true;
      try {
        await openDocument(key, sourcePath);
        if (!destroyed && openError && status.textContent === openError) message('');
        openError = '';
      } catch (error) {
        if (!destroyed && error?.name !== 'AbortError') { openError = error?.message || 'Evrak açılamadı. Yeniden deneyin.'; message(openError, true); }
      } finally { opening = false; }
    };
    // Sorgula gibi aria-disabled taşır: iş sürerken odak kaybolmaz; erişilebilir ad görünen yazıyla başlar.
    const openButton = (item, kind, key, text, title, sourcePath) => {
      const node = el('button', attr(kind === 'mazbata' ? 'open-receipt' : kind === 'ptt-file' ? 'open-report' : 'open-envelope', { type: 'button', class: 'chip te-row-open',
        'aria-disabled': current ? 'true' : null, 'aria-label': `${text}: ${headingOf(item)}`, title,
        'data-tebligat-open': `${kind}|${item.key}`, 'data-focus': `ac-${kind}|${item.key}` }), text);
      node.addEventListener('click', () => openRow(item, key, sourcePath));
      return node;
    };
    // Belgeden tekil barkod veya hizmet çıkmadığında satırda gösterilir. Sorgu yalnız kullanıcının seçtiği hizmet
    // düğmesiyle başlar; yazılan barkod yalnız ekranın belleğinde tutulur.
    const manualNodes = (item, manual) => {
      const busy = !!current;
      const input = el('input', attr('manual-barcode', { type: 'text', inputmode: 'numeric', maxlength: 20, autocomplete: 'off', spellcheck: 'false',
        placeholder: '13 haneli barkod', 'aria-label': `${titleOf(item)} için tebligat barkodu`, disabled: busy, 'data-focus': `barkod|${item.key}` }));
      input.value = manual.barcode || '';
      input.addEventListener('input', () => { manual.barcode = input.value; manual.error = ''; });
      // Kutu formun içinde: Enter örtük gönderimle seçili bütün tebligatları yeniden sorgulamasın.
      input.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
      // Düğmeler iş sürerken odak kaybolmasın diye aria-disabled taşır; tıklama işleyicileri current'ı denetler.
      const chips = manual.barcodes.map(code => {
        const chip = el('button', attr('manual-candidate', { type: 'button', class: 'chip', 'aria-disabled': busy ? 'true' : null,
          'aria-pressed': String(manual.barcode === code), 'data-focus': `aday|${item.key}|${code}` }), code);
        chip.addEventListener('click', () => { if (current) return; manual.barcode = code; manual.error = ''; sync(); });
        return chip;
      });
      const button = (provider, text) => {
        const node = el('button', attr(`manual-${provider}`, { type: 'button', class: 'chip', 'aria-disabled': busy ? 'true' : null,
          disabled: provider === 'uets' && typeof readUetsDocument !== 'function', 'data-focus': `${provider}|${item.key}` }), text);
        node.addEventListener('click', () => manualQuery(item, provider));
        return node;
      };
      return el('div', { class: 'te-manual', 'data-tebligat-manual': item.key },
        el('p', null, chips.length > 1 ? 'Belgedeki barkodlardan sorgulanacak olanı seçin ya da barkodu yazın; ardından hizmeti seçin.'
          : 'Barkodu kontrol edin ya da yazın; ardından hizmeti seçin.'),
        chips.length > 1 ? el('div', { class: 'te-manual-chips' }, chips) : null,
        el('div', { class: 'te-manual-row' }, input, button('ptt', 'PTT’de sorgula'), button('uets', 'E-tebliğ mazbatasında ara')),
        manual.error ? el('p', { class: 'te-msg err' }, manual.error) : null);
    };
    const resultNodes = (item, value) => {
      const nodes = [];
      if (value.message && !(value.result && !value.error)) nodes.push(el('p', { class: `te-msg${value.manual || value.verification && value.pending ? ' warn' : value.error ? ' err' : ''}`,
        role: 'status' }, value.message));
      if (value.barcode) nodes.push(el('p', { class: 'dp-muted' }, `Barkod: ${value.barcode} · ${PROVIDERS[value.provider] || 'Hizmet doğrulanmadı'}${value.inferred
        ? ' (zarfta hizmet yazmıyor; UETS izi yok)' : value.chosen ? ' (elle seçildi)' : ''}`));
      if (value.fileMessage) nodes.push(el('p', { class: 'te-msg warn' }, value.fileMessage));
      if (value.fileResult && value.result) nodes.push(el('p', { class: 'te-source' }, 'İki ayrı kaynak bulundu: dosyadaki PTT sorgu PDF’si ve PTT sitesi.'));
      const results = [value.fileResult, value.result].filter(Boolean);
      for (const result of results) {
        const provider = result.provider, events = Array.isArray(result.events) ? result.events : [];
        if (provider === 'ptt-file' || value.fileResult && provider === 'ptt')
          nodes.push(el('p', { class: 'te-source' }, provider === 'ptt-file' ? 'Dosyadaki PTT sorgu PDF’si' : 'PTT sitesi'));
        const facts = Array.isArray(result.details) ? result.details.filter(detail => detail && (detail.label || detail.value)) : [];
        nodes.push(el('div', { class: 'te-result' }, el('strong', null, String(result.status || 'Sorgu sonucu')),
          (provider === 'ptt-file' ? value.fileLabel : value.sourceLabel) ? el('span', { class: 'dp-muted' }, provider === 'ptt-file' ? value.fileLabel : value.sourceLabel) : null));
        if (facts.length) nodes.push(el('dl', { class: 'te-facts' }, facts.map(detail => el('div', null,
          el('dt', null, String(detail.label || '')), el('dd', null, String(detail.value || ''))))));
        nodes.push(events.length ? el('details', { class: 'te-events', open: provider === 'uets' || events.length <= 4 },
          el('summary', null, `${provider === 'uets' ? 'Mazbata kayıtları' : 'Gönderi hareketleri'} (${events.length})`),
          el('div', { class: 'te-tablewrap' }, el('table', { class: 'te-table' },
            el('thead', null, el('tr', null, ['Tarih', 'İşlem', 'Ayrıntı'].map(text => el('th', { scope: 'col' }, text)))),
            el('tbody', null, events.map(event => el('tr', null,
              el('td', { class: 'te-date' }, String(event.time || '—')),
              el('td', null, `${event.mazbata === true ? 'Mazbata · ' : ''}${String(event.status || '—')}`),
              el('td', null, [event.detail, event.location].filter(Boolean).map(String).join(' · ') || '—')))))))
          : el('p', { class: 'dp-muted' }, provider === 'uets'
            ? 'Mazbata eşleşti; olay tarihleri ayrı okunamadı. Belgeden kontrol edin.'
            : 'PTT bu sorgu için hareket kaydı döndürmedi.'));
        nodes.push(el('p', { class: 'te-source' }, `${provider === 'uets' ? 'Kaynak: Bu dosyanın barkodla eşleşen e-tebliğ mazbatası.'
          : provider === 'ptt-file' ? 'Kaynak: Bu dosyanın barkodla eşleşen PTT sorgu PDF’si.' : 'Kaynak: Resmi PTT sorgu sonucu.'}${provider === 'ptt-file' && result.reportDate
          ? ` · Rapor tarihi: ${result.reportDate}` : Number.isFinite(result.queriedAt) ? ` · Sorgulama: ${new Date(result.queriedAt).toLocaleString('tr-TR')}` : ''}`));
      }
      const actions = [];
      if (value.uetsFallback) actions.push(uetsLink());
      if (value.result?.provider === 'uets' && !value.error && value.receiptKey && typeof openDocument === 'function')
        actions.push(openButton(item, 'mazbata', value.receiptKey, 'Mazbatayı aç', 'Eşleşen e-tebliğ mazbatasını önizlemede açar'));
      if (value.fileResult && value.fileKey && typeof openDocument === 'function')
        actions.push(openButton(item, 'ptt-file', value.fileKey, 'PTT sorgu PDF’sini aç', 'Barkodla eşleşen PTT sorgu raporunu önizlemede açar', value.fileSourcePath));
      if (value.action) {
        const action = value.action;
        const button = el('button', attr('open-ptt', { type: 'button', class: 'chip', disabled: action.opening, 'data-focus': `ptt|${item.key}` }),
          'PTT sorgulamasını kontrol et');
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
        actions.push(button);
      }
      if (!value.action && value.provider === 'ptt' && value.barcode && typeof openPttPage === 'function') {
        const button = el('button', attr('open-ptt', { type: 'button', class: 'chip', disabled: !!current || opening,
          'data-focus': `ptt|${item.key}` }), 'PTT sorgulamasını kontrol et');
        button.addEventListener('click', async () => {
          if (destroyed || current || opening || stateFor(item) !== value || !items.some(row => row.key === item.key && stamp(row) === stamp(item))) return;
          opening = true; sync();
          try { await openPttPage(value.barcode); }
          catch (error) { if (!destroyed && stateFor(item) === value) { value.message = error?.message || 'PTT sayfası açılamadı.'; value.error = true; } }
          finally { opening = false; if (!destroyed) sync(); }
        });
        actions.push(button);
      }
      if (actions.length) nodes.push(el('div', { class: 'te-row-actions' }, actions));
      if (value.manual && !value.pending) nodes.push(manualNodes(item, value.manual));
      return nodes;
    };
    // Satırın tek bakışta okunan durumu.
    const stateOf = value => {
      // Yalnız PTT gerçekten doğrulama istediğinde uyarı; olağan arka plan sorgusu "Sorgulanıyor".
      if (value.pending) return value.verification ? ['attn', 'Doğrulama bekliyor'] : ['busy', 'Sorgulanıyor…'];
      if (value.result && !value.error) {
        if (value.result.provider === 'uets') return ['done', 'Mazbata bulundu'];
        // PTT zarfın teslimini mazbatadan ayrı işaretlediyse o gösterilir; son durum mazbatanın dönüşünü anlatıyor olabilir.
        // Kime teslim edildiği PTT'nin kendi ifadesiyle yazılır (ör. muhtara teslim).
        const delivery = value.result.delivery;
        if (delivery && typeof delivery === 'object')
          return ['done', [sentence(delivery.status) || 'Teslim edildi', String(delivery.time || '')].filter(Boolean).join(' · ')];
        // Ayrım yapılmış ama zarfın teslim kaydı yoksa son durum olumlu sayılmaz.
        if (value.result.split) return ['info', sentence(value.result.status) || 'Sonuç alındı'];
        return [delivered(String(value.result.status || '')) ? 'done' : 'info', sentence(value.result.status) || 'Sonuç alındı'];
      }
      if (value.manual) return ['attn', value.uetsFallback ? 'Mazbata bulunamadı' : value.code === 'TEBLIGAT_NOT_FOUND' ? 'PTT’de kayıt yok' : 'Seçim gerekiyor'];
      if (value.fileResult) return ['info', value.error ? 'PDF sonucu var · PTT sorgulanamadı' : 'PDF sonucu var'];
      if (value.error) return ['err', value.code === 'TEBLIGAT_NOT_FOUND' ? 'PTT’de kayıt yok' : value.uetsFallback ? 'Mazbata bulunamadı' : 'Sorgulanamadı'];
      if (value.message) return ['info', 'Durduruldu'];
      return ['idle', 'Sorgulanmadı'];
    };
    // Bunlar sorgu durumlarıdır: bir sonuç alınması teslim veya hukuki tebliğ anlamına gelmez.
    const queryStatusOf = item => {
      const value = stateFor(item), [kind] = stateOf(value);
      if (kind === 'idle') return 'unqueried';
      if (kind === 'busy') return 'working';
      if (kind === 'attn' || kind === 'err' || value.error || value.manual) return 'check';
      if (value.result || value.fileResult) return 'result';
      return 'check';
    };
    const rowFor = (item, index, busy) => {
      const value = stateFor(item), info = describe(item.aciklama), service = serviceOf(item), title = titleOf(item);
      const box = el('input', { type: 'checkbox', 'data-tebligat-select': item.key, id: `${id}-item-${index}`, disabled: busy,
        'aria-describedby': `${id}-state-${index}`, 'data-focus': `sec|${item.key}` });
      box.checked = selected.has(item.key);
      box.addEventListener('change', () => {
        if (current?.kind === 'batch') return;
        if (box.checked) selected.add(item.key); else selected.delete(item.key);
        sync();
      });
      const heading = headingOf(item);
      const meta = (item.date || item.no ? [item.date, item.no ? `Evrak no ${item.no}` : '', info.party ? title : '', item.attachment]
        : [...item.label.split(' · ').slice(1), info.party ? title : '']).filter(Boolean);
      const subject = value.subject || (info.party ? '' : model.extractSubject(item.aciklama || '', { metadata: true }));
      const badges = [el('span', { class: `te-badge ${service}` }, BADGES[service] || 'Hizmet zarftan okunacak')];
      if (info.state) badges.push(el('span', { class: 'te-badge uyap', title: 'UYAP’taki tebligat durumu' }, sentence(info.state)));
      const [kind, label] = stateOf(value);
      const goText = value.result || value.error || value.manual ? 'Yeniden sorgula' : 'Sorgula';
      const go = el('button', { type: 'button', class: 'chip te-row-go', 'data-tebligat-row-query': item.key, 'aria-disabled': current ? 'true' : null,
        'aria-label': `${goText}: ${heading}`, 'data-focus': `sorgu|${item.key}` }, goText);
      go.addEventListener('click', () => run([item]));
      const open = typeof openDocument === 'function' ? openButton(item, 'zarf', item.key, 'Aç', 'Özgün evrakı bu sekmeden ayrılmadan önizlemede açar') : null;
      return el('article', { class: `te-row ${kind}`, 'data-tebligat-row': item.key },
        el('div', { class: 'te-row-head' }, box,
          el('label', { for: `${id}-item-${index}`, class: 'te-row-main' }, el('span', { class: 'te-row-title' }, heading),
            meta.length ? el('span', { class: 'te-row-meta' }, meta.join(' · ')) : null),
          el('span', { class: 'te-badges' }, badges),
          el('span', { class: `te-state ${kind}`, id: `${id}-state-${index}`, 'data-tebligat-state': item.key }, label), el('span', { class: 'te-row-cmds' }, open, go)),
        subject ? el('p', { class: 'dp-muted te-row-subject' }, `İçerik: ${subject}`) : null,
        el('div', { class: 'te-row-body', 'data-tebligat-result': item.key }, resultNodes(item, value)));
    };
    // Liste her çizimde yeniden kurulur; odak, aynı işlevli öğeye geri verilir.
    const focusedKey = () => {
      const root = typeof container.getRootNode === 'function' ? container.getRootNode() : null;
      const active = root?.activeElement;
      return active && typeof form.contains === 'function' && form.contains(active) ? active.getAttribute('data-focus') : null;
    };
    const restoreFocus = key => {
      if (!key || typeof form.querySelectorAll !== 'function') return;
      [...form.querySelectorAll('[data-focus]')].find(node => node.getAttribute('data-focus') === key && !node.disabled)?.focus();
    };
    function sync() {
      if (destroyed) return;
      const focus = focusedKey();
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
      // Süzgeç yalnız birden fazla tür varsa gösterilir; seçili tür kalmadıysa Tümü'ne dönülür.
      const counts = { all: items.length, ptt: 0, uets: 0, unknown: 0 };
      for (const item of items) counts[metaServiceOf(item)]++;
      const kinds = ['ptt', 'uets', 'unknown'].filter(kind => counts[kind]);
      if (filter !== 'all' && !counts[filter]) filter = 'all';
      // Süzgeç iş sürerken de değiştirilebilir (yalnız görünümü değiştirir); seçim yalnız boştayken süzgece uydurulur.
      filters.replaceChildren(...(kinds.length > 1 ? [['all', 'Tümü'], ['ptt', 'Posta'], ['uets', 'E-tebligat'], ['unknown', 'Hizmet belirsiz']]
        .filter(([kind]) => kind === 'all' || counts[kind]).map(([kind, text]) => {
          const button = el('button', attr(`filter-${kind}`, { type: 'button', class: 'chip', 'aria-pressed': String(filter === kind),
            'data-focus': `filtre|${kind}` }), `${text} (${counts[kind]})`);
          button.addEventListener('click', () => {
            if (filter === kind) return;
            filter = kind;
            if (current?.kind !== 'batch') for (const item of items) if (!visible(item)) selected.delete(item.key);
            sync();
          });
          return button;
        }) : []));
      const providerItems = items.filter(matchesProvider);
      const queryCounts = { all: providerItems.length, unqueried: 0, result: 0, check: 0, working: 0 };
      for (const item of providerItems) queryCounts[queryStatusOf(item)]++;
      if (queryFilter !== 'all' && !queryCounts[queryFilter] && !busy) queryFilter = 'all';
      queryFilters.replaceChildren(...[['all', 'Tümü'], ['unqueried', 'Sorgulanmamış'], ['result', 'Sonuç var'], ['check', 'Kontrol gereken']]
        .map(([kind, text]) => {
          const button = el('button', attr(`query-filter-${kind}`, { type: 'button', class: 'chip', 'aria-pressed': String(queryFilter === kind),
            disabled: kind !== 'all' && !queryCounts[kind] && !busy, 'data-focus': `sorgu-filtre|${kind}` }), `${text} (${queryCounts[kind]})`);
          button.addEventListener('click', () => {
            if (queryFilter === kind || kind !== 'all' && !queryCounts[kind] && current?.kind !== 'batch') return;
            queryFilter = kind;
            if (current?.kind !== 'batch') for (const item of items) if (!visible(item)) selected.delete(item.key);
            sync();
          });
          return button;
        }));
      pickUnqueried.disabled = !!current || !queryCounts.unqueried;
      pickCheck.disabled = !!current || !queryCounts.check;
      clearSelection.disabled = !!current || !selected.size;
      const shown = items.filter(visible), chosen = shown.filter(item => selected.has(item.key)).length;
      all.checked = !!shown.length && chosen === shown.length;
      all.indeterminate = chosen > 0 && chosen < shown.length;
      all.disabled = busy || !shown.length;
      summary.textContent = `${items.length} tebligat · ${selected.size} seçili${loading ? ' · Liste alınıyor…' : snapshot.complete !== true ? ' · Liste henüz tamamlanmadı' : ''}`;
      submit.disabled = !!current || !selected.size;
      submit.textContent = busy ? 'Sorgulanıyor…' : selected.size ? `Seçilenleri sorgula (${selected.size})` : 'Seçilenleri sorgula';
      stop.hidden = !current;
      form.setAttribute('aria-busy', String(!!current));
      list.replaceChildren(...shown.map((item, index) => rowFor(item, index, busy)));
      if (!items.length) list.append(el('p', { class: 'dp-muted te-empty' }, loading ? 'Tebligatlar geldikçe burada gösterilir…' : 'Bu dosyada zarf veya tebligat kaydı bulunamadı. Mazbatalar sorgulanan tebligata barkodla eşleştirilir.'));
      else if (!shown.length) list.append(el('p', { class: 'dp-muted te-empty' }, 'Bu süzgeçte tebligat yok.'));
      restoreFocus(focus);
    }
    const finish = task => {
      if (current !== task) return;
      clearActions(); current = null; sync();
    };
    // Barkod ya da hizmet belgeden tekil çıkmazsa sorgu kendiliğinden gönderilmez; bulunan adaylar satırda sunulur.
    const envelopeError = (text, barcodes = []) => Object.assign(new Error(text),
      { code: 'TEBLIGAT_ENVELOPE', barcodes: [...new Set(barcodes)].slice(0, 8) });
    const analyzeEnvelope = (doc, item) => {
      if (!doc || typeof doc.text !== 'string' || doc.key !== item.key) throw new Error('Okunan zarf seçili tebligatla eşleşmedi. Sorgu başlatılmadı.');
      const sources = Array.isArray(doc.sources) ? doc.sources : [{ text: doc.text }];
      const leaves = sources.map(source => ({ source, parsed: model.analyzeNotice(source.text,
        { title: item.title || item.label.split(' · ')[0], aciklama: item.aciklama || '' }),
        mazbata: model.analyzeDocument(source.text).provider === 'uets' }));
      const candidates = leaves.filter(leaf => !leaf.mazbata && leaf.parsed.barcodes.length);
      if (candidates.length !== 1 || candidates[0].parsed.barcodes.length !== 1)
        throw envelopeError(candidates.length ? 'Zarfta birden fazla barkod var; hangisinin sorgulanacağı belgeden anlaşılamadı. Barkodu aşağıdan seçin.'
          : 'Zarfta okunabilir barkod bulunamadı. Taranmış belgede barkodu aşağıya yazabilirsiniz.', candidates.flatMap(leaf => leaf.parsed.barcodes));
      const parsed = candidates[0].parsed;
      // Hizmet çıkarımı yalnız tek parçalı zarfta kullanılır; ayrı yaprakların bilgisi birleştirilmez.
      const inferred = parsed.providerInferred === true;
      const provider = parsed.provider && (!inferred || leaves.length === 1) ? parsed.provider : null;
      if (!provider) throw envelopeError(parsed.providerConflict
        ? 'Zarfın PTT veya UETS hizmeti doğrulanamadı: zarf ve UYAP kaydı farklı hizmet gösteriyor. Hizmeti aşağıdan seçip sorgulayabilirsiniz.'
        : 'Zarfın PTT veya UETS hizmeti doğrulanamadı. Hizmeti aşağıdan seçip sorgulayabilirsiniz.', parsed.barcodes);
      return { ...parsed, provider, providerInferred: inferred };
    };
    // Tek satırın işi: zarfı okur ya da elle seçilen barkod ve hizmeti kullanır, ardından sorgular.
    // true dönerse iş bu satırda durmuştur; sıradaki satır okunmaz.
    const processItem = async (task, item, manual = null) => {
      const value = { stamp: stamp(item), pending: true, message: manual ? 'Seçilen barkod sorgulanıyor…' : 'Zarfın barkodu ve hizmeti okunuyor…' };
      states.set(item.key, value);
      sync();
      try {
        let parsed;
        if (manual) parsed = { barcodes: [manual.barcode], provider: manual.provider, subject: '' };
        else {
          const reader = readSubjectDocument || readDocument;
          if (typeof reader !== 'function') throw new Error('Tebligat okuyucu yüklenemedi.');
          const doc = await reader(task.ac.signal, item.key);
          if (!validRow(task, item)) return true;
          parsed = analyzeEnvelope(doc, item);
          value.read = true;
        }
        value.barcode = parsed.barcodes[0]; value.provider = parsed.provider; value.subject = parsed.subject;
        value.inferred = parsed.providerInferred === true; value.chosen = !!manual;
        if (parsed.provider === 'uets') {
          value.message = 'Aynı dosyadaki barkodla eşleşen e-tebliğ mazbatası aranıyor…'; sync();
          if (typeof readUetsDocument !== 'function') throw Object.assign(new Error('Mazbata okuyucu yüklenemedi.'), { code: 'UETS_MAZBATA_NOT_FOUND' });
          const receipt = await readUetsDocument(task.ac.signal, { documentKey: item.key, barcode: value.barcode });
          if (!validRow(task, item)) return true;
          if (!receipt || typeof receipt.text !== 'string' || receipt.documentKey !== item.key)
            throw new Error('Bulunan mazbata seçili tebligatın dosya kapsamıyla eşleşmedi.');
          const records = model.analyzeDocument(receipt.text);
          if (records.provider !== 'uets' || records.barcodes.length !== 1 || records.barcodes[0] !== value.barcode)
            throw new Error('Mazbata barkodu seçili tebligatla tekil olarak eşleşmedi.');
          value.receiptKey = typeof receipt.key === 'string' ? receipt.key : '';
          value.result = { provider: 'uets', barcode: value.barcode, status: 'Mazbatadaki kayıtlar', events: records.events };
          value.sourceLabel = receipt.label || '';
        } else {
          const noticeTitle = titleOf(item).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/gu, 'i').replace(/[^a-z0-9]/gu, '');
          const physicalClosed = /^kapaliteblig(?:at)?(?:evraki|belgesi)?$/u.test(noticeTitle);
          if (physicalClosed && typeof readPttDocument === 'function') {
            value.message = 'Dosyadaki PTT sorgu PDF’si aranıyor…'; sync();
            try {
              const file = await readPttDocument(task.ac.signal, { documentKey: item.key, barcode: value.barcode });
              if (!validRow(task, item)) return true;
              if (file) {
                if (file.documentKey !== item.key || file.barcode !== value.barcode || file.result?.provider !== 'ptt-file' ||
                    file.result.barcode !== value.barcode || typeof file.key !== 'string' || !file.key)
                  throw Object.assign(new Error('PTT raporu seçili tebligatın barkoduyla eşleşmedi.'), { code: 'TEBLIGAT_SCOPE' });
                const sourcePath = file.sourcePath === undefined ? [] : file.sourcePath;
                if (!Array.isArray(sourcePath) || sourcePath.length > 2 || sourcePath.some(part => !Number.isSafeInteger(part?.indis) || part.indis < 0 || typeof part.ad !== 'string' || !part.ad || part.ad.length > 4096))
                  throw Object.assign(new Error('PTT raporunun özgün PDF kaynağı doğrulanamadı.'), { code: 'TEBLIGAT_SCOPE' });
                value.fileResult = file.result; value.fileKey = file.key; value.fileLabel = file.label || '';
                value.fileSourcePath = sourcePath.map(part => ({ indis: part.indis, ad: part.ad }));
              }
            } catch (error) {
              if (['Fatal', 'Blocked', 'AbortError', 'Stopped', 'Superseded'].includes(error?.name) ||
                  [401, 403, 429, 503].includes(error?.status) || Number.isFinite(error?.retryAt)) throw error;
              value.fileMessage = error?.message || 'Dosyadaki PTT sorgu PDF’si okunamadı.';
            }
          }
          value.message = value.inferred ? 'Zarfta hizmet adı yok; UETS izi bulunmadığı için PTT posta tebligatı olarak sorgulanıyor…'
            : 'PTT sorgusu arka planda yürütülüyor…'; sync();
          const result = await query('ptt', value.barcode, { signal: task.ac.signal, onStatus: (text, action) => {
            if (!validRow(task, item)) return;
            if (action?.needsVerification === true) value.verification = true;
            value.message = action?.needsVerification === true ? `Doğrulama bekliyor. ${text || 'PTT sorgulamasını kontrol et düğmesiyle resmî sayfayı açıp güvenlik doğrulamasını tamamlayın.'}` : String(text || 'PTT sorgusu sürüyor…');
            value.action = typeof action?.openPage === 'function' ? { task, openPage: action.openPage, opening: false } : null;
            sync();
          } });
          if (!validRow(task, item)) return true;
          if (!result || result.provider !== 'ptt' || result.barcode !== value.barcode)
            throw new Error('PTT sorgu sonucu seçili tebligatın barkoduyla eşleşmedi.');
          value.result = result;
        }
        // Önceki "PTT sayfası açılamadı" gibi geçici bir hata başarılı sonucu gölgelemez.
        value.message = 'Tamamlandı.'; value.error = false; value.code = '';
      } catch (error) {
        if (!validRow(task, item)) return true;
        value.message = error?.message || 'Tebligat sorgulanamadı. Yeniden deneyin.';
        value.error = true; value.code = error?.code || '';
        value.uetsFallback = value.provider === 'uets' && ['UETS_MAZBATA_NOT_FOUND', 'UETS_MAZBATA_LIMIT', 'TEBLIGAT_TEXT'].includes(error?.code);
        if (['Fatal', 'Blocked', 'AbortError', 'Stopped', 'Superseded'].includes(error?.name) ||
            [401, 403, 429, 503].includes(error?.status) || Number.isFinite(error?.retryAt)) {
          value.pending = false;
          cancel(value.message);
          sync();
          return true;
        }
        // Belgeden tekil barkod/hizmet çıkmadıysa, çıkarılan posta hizmetinde kayıt yoksa, dosyada mazbata bulunmadıysa
        // ya da elle seçilen hizmet sonuç vermediyse kullanıcı barkodu ve öteki hizmeti seçerek yeniden sorgular.
        const missing = value.inferred && error?.code === 'TEBLIGAT_NOT_FOUND';
        const noReceipt = ['UETS_MAZBATA_NOT_FOUND', 'UETS_MAZBATA_LIMIT'].includes(error?.code);
        if (['TEBLIGAT_ENVELOPE', 'TEBLIGAT_TEXT'].includes(error?.code) || missing || noReceipt || manual) {
          const found = Array.isArray(error?.barcodes) ? error.barcodes : value.barcode ? [value.barcode] : [];
          if (missing) value.message += ' Tebligat elektronik gönderildiyse e-tebliğ mazbatasında arayabilirsiniz.';
          else if (noReceipt && value.barcode) value.message += ' Posta ile gönderildiyse PTT’de sorgulayabilirsiniz.';
          value.manual = { barcodes: found, barcode: found.length === 1 ? found[0] : '', error: '' };
        }
      }
      if (!validRow(task, item)) return true;
      value.pending = false; delete value.action; sync();
      return false;
    };
    // Satırdaki elle seçimle tek tebligat sorgulanır; toplu işle aynı guardlar ve iptal yolu kullanılır.
    const manualQuery = async (item, provider) => {
      const state = stateFor(item), manual = state.manual;
      if (current || destroyed || opening || !manual || state.stamp !== stamp(item) || !items.some(value => value.key === item.key && stamp(value) === stamp(item))) return;
      if (!['ptt', 'uets'].includes(provider) || provider === 'uets' && typeof readUetsDocument !== 'function') return;
      const barcode = model.normalizeBarcode(String(manual.barcode || ''));
      if (!barcode) { manual.error = '13 haneli barkodu yalnız rakamlarla yazın.'; message(manual.error, true); sync(); return; }
      const task = { kind: 'batch', ac: new AbortController(), revision, rowKey: item.key, rowStamp: stamp(item) };
      current = task;
      clearActions();
      message('Seçilen barkod sorgulanıyor…');
      try {
        if (!await processItem(task, item, { barcode, provider }) && valid(task)) message('Sorgu tamamlandı. Sonuç tebligatın altında gösterilir.');
      } finally { finish(task); }
    };
    // Seçilenler ya da satırdaki Sorgula düğmesiyle tek tebligat aynı sırayla ve aynı guardlarla işlenir.
    const run = async chosen => {
      if (current || destroyed || opening || !chosen.length) return;
      const pending = chosen.map(item => ({ ...item }));
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
          message(`Tebligatlar sırayla sorgulanıyor: ${completed + 1} / ${pending.length}`);
          if (await processItem(task, item)) return;
          completed++;
        }
        if (valid(task)) message(pending.length === 1 ? 'Sorgu tamamlandı. Sonuç tebligatın altında gösterilir.'
          : `${completed} tebligat işlendi. Sonuçlar her tebligatın altında gösterilir.`);
      } finally { finish(task); }
    };
    form.addEventListener('submit', event => {
      event.preventDefault();
      return run(items.filter(item => selected.has(item.key)));
    });
    all.addEventListener('change', () => {
      if (current?.kind === 'batch') return;
      selected.clear();
      if (all.checked) for (const item of items.filter(visible)) selected.add(item.key);
      sync();
    });
    const pickByStatus = kind => {
      if (destroyed || current || opening) return;
      const chosen = items.filter(item => matchesProvider(item) && queryStatusOf(item) === kind);
      if (!chosen.length) return;
      selected.clear();
      for (const item of chosen) selected.add(item.key);
      queryFilter = kind;
      sync();
    };
    pickUnqueried.addEventListener('click', () => pickByStatus('unqueried'));
    pickCheck.addEventListener('click', () => pickByStatus('check'));
    clearSelection.addEventListener('click', () => {
      if (destroyed || current || opening) return;
      selected.clear(); sync();
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
