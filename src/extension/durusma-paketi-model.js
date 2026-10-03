/* global module */
// Duruşma paketi panelinin saf seçim ve iş durumu modeli.
(() => {
  const MAX_ITEMS = 100;
  const text = value => String(value == null ? '' : value).trim();
  const unique = values => [...new Set(values)];

  function normalizeItem(raw) {
    const id = text(raw?.id);
    return {
      id, title: text(raw?.title) || 'Adsız evrak', date: text(raw?.date),
      dateSource: text(raw?.dateSource), format: text(raw?.format).toUpperCase() || 'Bilinmiyor',
      group: text(raw?.group), parentId: text(raw?.parentId), parentTitle: text(raw?.parentTitle),
      isAttachment: !!raw?.isAttachment, selectable: raw?.selectable !== false && !!id,
      stale: !!raw?.stale
    };
  }

  function initial() {
    return { items: [], selected: [], filter: '', group: '', complete: true, locked: false,
      phase: 'idle', runId: null, snapshot: [], failures: [], excluded: [], skipped: [], progress: null,
      result: null, notice: '' };
  }

  function available(state, id) {
    return state.items.find(item => item.id === id && item.selectable && !item.stale);
  }

  function visible(state) {
    const words = state.filter.toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
    return state.items.filter(item => {
      if (state.group && item.group !== state.group) return false;
      if (!words.length) return true;
      const hay = [item.title, item.parentTitle, item.date, item.group, item.format].join(' ').toLocaleLowerCase('tr');
      return words.every(w => hay.includes(w));
    });
  }
  // Sınır aşılacaksa sığan kadarı eklenir (görünüm sırasıyla) ve kaç tanesinin alındığı söylenir.
  function addUpTo(state, ids) {
    const fresh = ids.filter(id => !state.selected.includes(id));
    const room = MAX_ITEMS - state.selected.length;
    if (!fresh.length) return state;
    if (room <= 0) return { ...state, notice: `Paket en çok ${MAX_ITEMS} evrak alır; sınıra ulaşıldı.` };
    const next = selectionChanged(state, [...state.selected, ...fresh.slice(0, room)]);
    return fresh.length > room ? { ...next, notice: `Paket en çok ${MAX_ITEMS} evrak alır; ilk ${room} evrak seçildi.` } : next;
  }

  function selectable(state) {
    return state.phase !== 'running' && state.phase !== 'cancelling';
  }
  function selectionChanged(state, selected) {
    return { ...state, selected, phase: 'idle', runId: null, snapshot: [], failures: [], excluded: [], skipped: [],
      progress: null, result: null, notice: '' };
  }

  function reducer(state, action) {
    const a = action || {};
    switch (a.type) {
      case 'LIST': {
        const incoming = Array.isArray(a.items) ? a.items.map(normalizeItem) : [];
        const counts = new Map();
        for (const item of incoming) counts.set(item.id, (counts.get(item.id) || 0) + 1);
        const items = incoming.map(item => counts.get(item.id) > 1 ? { ...item, selectable: false } : item);
        // Filtreli/kısmi liste yenilemesi, önceden seçilmiş evrakı sessizce düşürmez.
        for (const old of state.items) {
          if (state.selected.includes(old.id) && !items.some(item => item.id === old.id))
            items.push({ ...old, stale: true, selectable: false });
        }
        return { ...state, items, complete: a.complete !== false, locked: !!a.locked,
          notice: counts.size < incoming.length ? 'Aynı kimlikli evraklar ayırt edilemedi; seçim kapatıldı.' : '' };
      }
      case 'FILTER': return { ...state, filter: String(a.value == null ? '' : a.value).slice(0, 200) };
      case 'GROUP': return { ...state, group: text(a.value) };
      case 'TOGGLE': {
        if (!selectable(state) || !available(state, a.id)) return state;
        if (state.selected.includes(a.id)) return selectionChanged(state, state.selected.filter(id => id !== a.id));
        if (state.selected.length >= MAX_ITEMS) return { ...state, notice: `${MAX_ITEMS} evrak sınırına ulaşıldı.` };
        return selectionChanged(state, [...state.selected, a.id]);
      }
      case 'SELECT_VISIBLE': {
        if (!selectable(state)) return state;
        return addUpTo(state, unique(visible(state).filter(item => item.selectable && !item.stale).map(item => item.id)));
      }
      // Dosya ekranında işaretlenen sıra (paket motoru): seçim bütünüyle değişir; listede olmayan ya da seçilemeyen atlanır.
      case 'SELECT_SET': {
        if (!selectable(state)) return state;
        const ids = unique((Array.isArray(a.ids) ? a.ids : []).filter(id => typeof id === 'string' && available(state, id))).slice(0, MAX_ITEMS);
        return selectionChanged(state, ids);
      }
      case 'SELECT_ATTACHMENTS': {
        if (!selectable(state)) return state;
        const parentIds = new Set(state.selected);
        return addUpTo(state, unique(state.items.filter(item => item.isAttachment && parentIds.has(item.parentId) && item.selectable && !item.stale).map(item => item.id)));
      }
      case 'REMOVE':
        return selectable(state) ? selectionChanged(state, state.selected.filter(id => id !== a.id)) : state;
      case 'MOVE': {
        if (!selectable(state)) return state;
        const from = state.selected.indexOf(a.id);
        const to = Math.max(0, Math.min(state.selected.length - 1, Number(a.to)));
        if (from < 0 || !Number.isInteger(to) || from === to) return state;
        const selected = [...state.selected];
        selected.splice(from, 1);
        selected.splice(to, 0, a.id);
        return selectionChanged(state, selected);
      }
      case 'START': {
        if (!selectable(state) || !state.selected.length || state.locked || !a.runId ||
          state.selected.some(id => !available(state, id))) return state;
        return { ...state, phase: 'running', runId: a.runId, snapshot: [...state.selected],
          failures: [], excluded: [], skipped: [], progress: { phase: 'önkontrol', message: 'Paket hazırlanıyor…' }, result: null, notice: '' };
      }
      case 'PROGRESS':
        return state.phase === 'running' && state.runId === a.runId ?
          { ...state, progress: { phase: text(a.phase), itemId: text(a.itemId), message: text(a.message) } } : state;
      case 'FAILED': {
        if (state.phase !== 'running' || state.runId !== a.runId) return state;
        const valid = new Set(state.snapshot);
        const failures = (Array.isArray(a.failures) ? a.failures : [])
          .filter(x => x && (valid.has(x.id) || x.id === ''))
          .map(x => ({ id: x.id, reason: text(x.reason) || 'Bilinmeyen hata' }));
        return { ...state, phase: 'failed', failures, result: null, progress: null };
      }
      case 'RETRY':
        return state.phase === 'failed' && a.runId && state.failures.length ?
          { ...state, phase: 'running', runId: a.runId, failures: [], excluded: [], progress: { phase: 'tekrar', message: 'Sorunlu evraklar yeniden deneniyor…' } } : state;
      case 'EXCLUDE': {
        if (state.phase !== 'failed' || !a.runId) return state;
        const failedIds = unique(state.failures.map(x => x.id));
        if (!failedIds.length || failedIds.some(id => !id) || failedIds.length >= state.snapshot.length) return state;
        return { ...state, phase: 'running', runId: a.runId, excluded: failedIds,
          progress: { phase: 'birleştirme', message: 'Dışarıda bırakılan evraklar raporlanarak hazırlanıyor…' } };
      }
      case 'READY': {
        if (state.phase !== 'running' || state.runId !== a.runId || !a.result?.bytes) return state;
        const valid = new Set(state.snapshot);
        const skipped = (Array.isArray(a.result.excluded) ? a.result.excluded : [])
          .filter(x => x && valid.has(x.id)).map(x => ({ id: x.id, reason: text(x.reason) || 'Neden belirtilmedi' }));
        const incomplete = !!a.result.incomplete;
        // Açıkça dışlanan ya da atlanan evrak varken tam paket, hiçbiri yokken eksik paket kabul edilmez.
        if (incomplete !== (state.excluded.length > 0 || skipped.length > 0)) return state;
        return { ...state, phase: 'ready', skipped, result: { incomplete, filename: a.result.filename }, progress: null };
      }
      case 'CANCEL_REQUEST':
        return state.phase === 'running' ? { ...state, phase: 'cancelling', progress: null, result: null } : state;
      case 'CANCELLED':
        return state.runId === a.runId && (state.phase === 'running' || state.phase === 'cancelling') ?
          { ...state, phase: 'cancelled', result: null, progress: null } : state;
      case 'ERROR':
        return state.phase === 'running' && state.runId === a.runId ? { ...state, phase: 'failed', result: null,
          failures: [{ id: '', reason: text(a.message) || 'Paket oluşturulamadı.' }], progress: null } : state;
      case 'RESET': return { ...initial(), items: state.items, complete: state.complete, locked: state.locked };
      default: return state;
    }
  }

  const api = { initial, reducer, visible, MAX_ITEMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.UHD = { ...(globalThis.UHD || {}), durusmaPaketiModel: api };
})();
