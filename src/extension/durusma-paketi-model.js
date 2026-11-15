/* global module */
// Görünmez paket motorunun saf seçim ve iş durumu modeli: dosya ekranının işaretlediği evraklar ve tek koşunun evresi.
(() => {
  const MAX_ITEMS = 100;
  const text = value => String(value == null ? '' : value).trim();
  const unique = values => [...new Set(values)];

  function normalizeItem(raw) {
    const id = text(raw?.id);
    return { id, selectable: raw?.selectable !== false && !!id };
  }

  function initial() {
    return { items: [], selected: [], locked: false,
      phase: 'idle', runId: null, snapshot: [], failures: [], skipped: [], progress: null, result: null };
  }

  function available(state, id) {
    return state.items.find(item => item.id === id && item.selectable && !item.stale);
  }

  function selectable(state) {
    return state.phase !== 'running';
  }

  function reducer(state, action) {
    const a = action || {};
    switch (a.type) {
      case 'LIST': {
        const incoming = Array.isArray(a.items) ? a.items.map(normalizeItem) : [];
        const counts = new Map();
        for (const item of incoming) counts.set(item.id, (counts.get(item.id) || 0) + 1);
        const items = incoming.map(item => counts.get(item.id) > 1 ? { ...item, selectable: false } : item);
        // Liste yenilemesi önceden seçilmiş evrakı sessizce düşürmez.
        for (const old of state.items) {
          if (state.selected.includes(old.id) && !items.some(item => item.id === old.id))
            items.push({ ...old, stale: true, selectable: false });
        }
        return { ...state, items, locked: !!a.locked };
      }
      // Dosya ekranında işaretlenen sıra: seçim bütünüyle değişir; listede olmayan ya da seçilemeyen atlanır.
      case 'SELECT_SET': {
        if (!selectable(state)) return state;
        const selected = unique((Array.isArray(a.ids) ? a.ids : []).filter(id => typeof id === 'string' && available(state, id))).slice(0, MAX_ITEMS);
        return { ...state, selected, phase: 'idle', runId: null, snapshot: [], failures: [], skipped: [], progress: null, result: null };
      }
      case 'START': {
        if (!selectable(state) || !state.selected.length || state.locked || !a.runId ||
          state.selected.some(id => !available(state, id))) return state;
        return { ...state, phase: 'running', runId: a.runId, snapshot: [...state.selected],
          failures: [], skipped: [], progress: { phase: 'önkontrol', message: 'Paket hazırlanıyor…' }, result: null };
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
      case 'READY': {
        if (state.phase !== 'running' || state.runId !== a.runId || !a.result?.bytes) return state;
        const valid = new Set(state.snapshot);
        const skipped = (Array.isArray(a.result.excluded) ? a.result.excluded : [])
          .filter(x => x && valid.has(x.id)).map(x => ({ id: x.id, reason: text(x.reason) || 'Neden belirtilmedi' }));
        const incomplete = !!a.result.incomplete;
        // Atlanan evrak varken tam paket, hiçbiri yokken eksik paket kabul edilmez.
        if (incomplete !== skipped.length > 0) return state;
        return { ...state, phase: 'ready', skipped, result: { incomplete, filename: a.result.filename }, progress: null };
      }
      case 'ERROR':
        return state.phase === 'running' && state.runId === a.runId ? { ...state, phase: 'failed', result: null,
          failures: [{ id: '', reason: text(a.message) || 'Paket oluşturulamadı.' }], progress: null } : state;
      default: return state;
    }
  }

  const api = { initial, reducer, MAX_ITEMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.UHD = { ...(globalThis.UHD || {}), durusmaPaketiModel: api };
})();
