// Yerel evrakları özgün baytlarıyla, Türkçe ve Windows'ta güvenli adlarla tek ZIP'te toplar.
// ZIP32 / STORE ve UTF-8: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
(() => {
  const MAX_BYTES = 256 * 1024 * 1024;
  const MAX_ENTRIES = 5000;
  const MAX_NAME_BYTES = 220;
  const UINT32_MAX = 0xffffffff;
  const encoder = new TextEncoder();
  const typeKey = value => String(value).toLocaleLowerCase('tr-TR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/\s+/gu, ' ').trim();
  function documentType(item) {
    for (const value of [item?.ekTuru, item?.tur, item?.e?.tur]) {
      if (typeof value === 'string' && value.trim()) return value.replace(/\s+/gu, ' ').trim();
    }
    return 'Diğer evraklar';
  }
  const isAttachment = item => !!(item?.ana || item?.yetimEk);
  function typeGroups(rows) {
    const groups = new Map();
    for (const item of Array.isArray(rows) ? rows : []) {
      if (!item || typeof item !== 'object') continue;
      const title = documentType(item), key = typeKey(title);
      if (!groups.has(key)) groups.set(key, { key, title, count: 0, documents: 0, attachments: 0 });
      const group = groups.get(key);
      group.count++; group[isAttachment(item) ? 'attachments' : 'documents']++;
    }
    return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  }
  function selectRows(rows, { mode = 'all', keys = [], includeAttachments = true } = {}) {
    const selected = new Set((Array.isArray(keys) ? keys : keys instanceof Set ? [...keys] : [])
      .filter(value => typeof value === 'string' && value.trim()).map(typeKey));
    return (Array.isArray(rows) ? rows : []).filter(item => {
      if (!item || typeof item !== 'object') return false;
      const attachment = isAttachment(item);
      if (attachment && !includeAttachments) return false;
      if (!['include', 'exclude'].includes(mode)) return true;
      const own = selected.has(typeKey(documentType(item)));
      const parent = item.ana && selected.has(typeKey(documentType(item.ana)));
      // Yalnız seçilen ana evrakın ekleri de gelir; ek türü doğrudan seçilebilir.
      // Hariç tutulan ana evrak bağlı ekleriyle birlikte çıkar, ekin kendi türü de çıkarılabilir.
      return mode === 'include' ? own || !!parent : !own && !parent;
    });
  }
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < crcTable.length; i++) {
    let n = i;
    for (let j = 0; j < 8; j++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    crcTable[i] = n >>> 0;
  }

  function truncate(value, maxBytes) {
    let result = '', length = 0;
    for (const char of value) {
      const n = encoder.encode(char).length;
      if (length + n > maxBytes) break;
      result += char;
      length += n;
    }
    return result;
  }

  function clean(value, fallback = 'Evrak', maxBytes = MAX_NAME_BYTES) {
    let result = String(value == null ? '' : value).normalize('NFC')
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\.{2,}/g, '-')
      .replace(/\s+/g, ' ').trim().replace(/[ .]+$/g, '');
    if (/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:[ .]|$)/i.test(result)) result = '_' + result;
    result = truncate(result, maxBytes).replace(/[ .]+$/g, '');
    return result || fallback;
  }

  function extension(value) {
    return String(value || 'bin').normalize('NFC').replace(/^\.+/, '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 12) || 'bin';
  }

  function filename(base, ext) {
    const suffix = '.' + extension(ext);
    return clean(base, 'Evrak', MAX_NAME_BYTES - encoder.encode(suffix).length) + suffix;
  }

  function archiveName(rec, scope = '') {
    const r = rec || {};
    const parts = [clean(r.birimAdi, '', 95), clean(r.dosyaNo, '', 45), clean(scope, 'Evraklar', 60)].filter(Boolean);
    return filename(parts.join('_'), 'zip');
  }

  function dateParts(value) {
    if (value instanceof Date || typeof value === 'number') {
      const date = value instanceof Date ? value : new Date(value);
      if (!Number.isFinite(date.getTime())) return null;
      return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
    }
    const text = String(value || '').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
    let parts;
    if (m) parts = [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
    else {
      m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
      if (m) parts = [+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
      else {
        m = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
        if (m) parts = [+m[1], +m[2], +m[3], 0, 0, 0];
      }
    }
    if (!parts || parts[0] < 100 || parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return null;
    const date = new Date(Date.UTC(...[parts[0], parts[1] - 1, ...parts.slice(2)]));
    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() + 1 !== parts[1] || date.getUTCDate() !== parts[2]) return null;
    return parts;
  }

  function documentName(rec, item, ext) {
    const x = item || {}, main = x.ana || x, e = x.e || {};
    const date = dateParts(x.onay || e.onaylandigiTarih || main.onay);
    const stamp = date ? date.slice(0, 3).map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-') : 'Tarihsiz';
    const parts = [];
    const group = String(x.dosya || main.dosya || '').trim();
    const groupMatch = /^(.*?)\((.*)\)$/.exec(group);
    const groupNo = (groupMatch ? groupMatch[1] : group).trim();
    if (group && groupNo !== String((rec || {}).dosyaNo || '').trim()) parts.push(clean(groupMatch ? `${groupMatch[2]} ${groupMatch[1]}` : group, '', 55));
    parts.push(stamp);
    if (x.ana) {
      parts.push(clean(main.tur || (main.e || {}).tur, 'Evrak', 60));
      const type = x.ekTuru || x.tur || e.tur || '';
      const number = Number.isInteger(x.ekIndis) && x.ekIndis >= 0 ? ` ${x.ekIndis + 1}` : '';
      parts.push(clean(/^Ek(?:\s|$)/i.test(type) ? type : `Ek${number}${type ? ' - ' + type : ''}`, 'Ek', 60));
    } else parts.push(clean(x.tur || e.tur, 'Evrak', 90));
    const no = x.no || e.birimEvrakNo || main.no || (main.e || {}).birimEvrakNo;
    if (no != null && no !== '') parts.push(clean(no, '', 25));
    return filename(parts.filter(Boolean).join('_'), ext);
  }

  const collisionKey = name => name.normalize('NFC').toUpperCase();
  function nextName(value, usedKeys, nextIndices) {
    const original = clean(value, 'Evrak', Infinity);
    const dot = original.lastIndexOf('.');
    const base = dot > 0 ? original.slice(0, dot) : original;
    const ext = dot > 0 ? '.' + extension(original.slice(dot + 1)) : '';
    const sourceKey = collisionKey(original);
    for (let i = nextIndices && nextIndices.get(sourceKey) || 1; ; i++) {
      const suffix = i === 1 ? '' : ` (${i})`;
      const head = clean(base, 'Evrak', MAX_NAME_BYTES - encoder.encode(suffix + ext).length);
      const name = head + suffix + ext;
      const key = collisionKey(name);
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        if (nextIndices) nextIndices.set(sourceKey, i + 1);
        return name;
      }
    }
  }

  function uniqueName(name, usedSet) {
    if (!(usedSet instanceof Set)) throw new TypeError('Dosya adları için Set gerekli.');
    const keys = new Set([...usedSet].map(value => collisionKey(clean(value))));
    const result = nextName(name, keys);
    usedSet.add(result);
    return result;
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw new DOMException('ZIP oluşturma durduruldu.', 'AbortError');
  }

  async function crc32(blob, signal) {
    throwIfAborted(signal);
    const reader = blob.stream().getReader();
    const cancel = () => { reader.cancel().catch(() => {}); };
    if (signal) signal.addEventListener('abort', cancel, { once: true });
    let crc = UINT32_MAX, count = 0, sinceYield = 0;
    try {
      for (;;) {
        throwIfAborted(signal);
        const { done, value } = await reader.read();
        throwIfAborted(signal);
        if (done) break;
        count += value.byteLength;
        sinceYield += value.byteLength;
        if (count > blob.size) throw new Error('Evrak boyutu okuma sırasında değişti.');
        for (let i = 0; i < value.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ value[i]) & 0xff];
        if (sinceYield >= 1024 * 1024) {
          sinceYield = 0;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      if (count !== blob.size) throw new Error('Evrak eksik okundu.');
      return (crc ^ UINT32_MAX) >>> 0;
    } finally {
      if (signal) signal.removeEventListener('abort', cancel);
      try { await reader.cancel(); } catch { /* Okuma hatasını değiştirme. */ }
      reader.releaseLock();
    }
  }

  function dosStamp(date) {
    let parts = dateParts(date) || [1980, 1, 1, 0, 0, 0];
    if (parts[0] < 1980) parts = [1980, 1, 1, 0, 0, 0];
    if (parts[0] > 2107) parts = [2107, 12, 31, 23, 59, 58];
    const [year, month, day, hour, minute, second] = parts;
    return { day: ((year - 1980) << 9) | (month << 5) | day, time: (hour << 11) | (minute << 5) | Math.floor(second / 2) };
  }

  async function createZip(entries, { signal } = {}) {
    throwIfAborted(signal);
    if (!Array.isArray(entries)) throw new TypeError('ZIP evrak listesi dizi olmalı.');
    if (entries.length > MAX_ENTRIES) throw new Error(`ZIP en fazla ${MAX_ENTRIES} evrak içerebilir. Listeyi bölerek indirin.`);
    const usedKeys = new Set(), nextIndices = new Map();
    let size = 22, localSize = 0, centralSize = 0;
    const prepared = entries.map(entry => {
      if (!entry || !(entry.blob instanceof Blob)) throw new TypeError('ZIP evrakı geçerli bir Blob içermeli.');
      const name = encoder.encode(nextName(entry.name, usedKeys, nextIndices));
      const bytes = entry.blob.size;
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > UINT32_MAX) throw new Error('Evrak ZIP32 boyut sınırını aşıyor.');
      if (name.length > 0xffff) throw new Error('Evrak adı ZIP32 sınırını aşıyor.');
      localSize += 30 + name.length + bytes;
      centralSize += 46 + name.length;
      size += 76 + 2 * name.length + bytes;
      if (size > MAX_BYTES) throw new Error('ZIP 256 MiB sınırını aşıyor. Daha az evrak seçerek indirin.');
      if (localSize > UINT32_MAX || centralSize > UINT32_MAX) throw new Error('ZIP32 boyut sınırı aşıldı.');
      return { blob: entry.blob, name, stamp: dosStamp(entry.date), bytes };
    });
    const parts = [], central = [];
    let offset = 0, processed = 0;
    for (const entry of prepared) {
      throwIfAborted(signal);
      const crc = await crc32(entry.blob, signal);
      const { name, stamp, bytes } = entry;
      const local = new Uint8Array(30), lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.day, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, bytes, true);
      lv.setUint32(22, bytes, true);
      lv.setUint16(26, name.length, true);
      const header = new Uint8Array(46), cv = new DataView(header.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.day, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, bytes, true);
      cv.setUint32(24, bytes, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      parts.push(local, name, entry.blob);
      central.push(header, name);
      offset += 30 + name.length + bytes;
      // Çok sayıda küçük evrakta da Durdur düğmesinin olayı çalışabilsin.
      if (++processed % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    throwIfAborted(signal);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, prepared.length, true);
    ev.setUint16(10, prepared.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  globalThis.UHD = globalThis.UHD || {};
  globalThis.UHD.evrakZip = { archiveName, documentName, uniqueName, createZip, documentType, typeGroups, selectRows, MAX_BYTES, MAX_ENTRIES };
})();
