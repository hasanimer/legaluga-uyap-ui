// Yerel evrakları özgün baytlarıyla, Türkçe ve Windows'ta güvenli adlarla tek ZIP'te toplar.
// ZIP32 / STORE ve UTF-8: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
(() => {
  const MAX_BYTES = 256 * 1024 * 1024;
  const MAX_ENTRIES = 5000;
  const MAX_NAME_BYTES = 220;
  const UINT32_MAX = 0xffffffff;
  const encoder = new TextEncoder();
  const typeKeyRaw = value => String(value).toLocaleLowerCase('tr-TR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/\s+/gu, ' ').trim();
  // Tür başlıkları çok tekrar eder; her liste çiziminde satır başına yeniden normalize edilmez.
  const typeKeys = new Map();
  const typeKey = value => {
    const text = String(value);
    let key = typeKeys.get(text);
    if (key === undefined) {
      if (typeKeys.size >= 4096) typeKeys.clear();
      key = typeKeyRaw(text);
      typeKeys.set(text, key);
    }
    return key;
  };
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

  // Klasörlü girdi: her bölüm ayrı temizlenir; "/" ile biten ad boş klasör kaydıdır.
  function pathName(value, usedKeys) {
    const dir = String(value).endsWith('/');
    const parts = String(value).split('/').filter(Boolean).map(part => clean(part, '_', Infinity));
    if (!parts.length) throw new Error('ZIP yolu geçersiz.');
    const name = parts.join('/') + (dir ? '/' : '');
    const key = collisionKey(name);
    if (usedKeys.has(key)) throw new Error('ZIP içinde aynı yol iki kez kullanılamaz.');
    usedKeys.add(key);
    return name;
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

  // CRC-32, içerik betiğinde bu dosyadan önce yüklenen ZIP okuyucusundan (DurusmaPaketiZip) gelir; akış parça parça sürdürülür.
  async function crc32(blob, signal) {
    throwIfAborted(signal);
    const { crc32: append } = globalThis.DurusmaPaketiZip;
    const reader = blob.stream().getReader();
    const cancel = () => { reader.cancel().catch(() => {}); };
    if (signal) signal.addEventListener('abort', cancel, { once: true });
    let crc = 0, count = 0, sinceYield = 0;
    try {
      for (;;) {
        throwIfAborted(signal);
        const { done, value } = await reader.read();
        throwIfAborted(signal);
        if (done) break;
        count += value.byteLength;
        sinceYield += value.byteLength;
        if (count > blob.size) throw new Error('Evrak boyutu okuma sırasında değişti.');
        crc = append(value, crc);
        if (sinceYield >= 1024 * 1024) {
          sinceYield = 0;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      if (count !== blob.size) throw new Error('Evrak eksik okundu.');
      return crc;
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
      const name = encoder.encode(entry.path ? pathName(entry.name, usedKeys) : nextName(entry.name, usedKeys, nextIndices));
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

  // Klasör düzeninde indirme: avukat / yargı türü / birim türü / dosya ağacı. Evraklar özgün biçimleriyle kalır.
  // Yollar (uzantı dahil) 200 karakteri aşmaz; Windows'un 260 sınırında çıkarma klasörüne yer kalır. Ana evrak adı,
  // yanındaki _ekler klasöründe en az 16 karakterlik ek adına yer bırakacak kadar kısaltılır.
  const FOLDER_PATH_MAX = 200, EK_ROOM = 7 + 16;
  const KATEGORILER = Object.freeze([
    // Önce özgül kurallar: aynı kelimeyi taşıyan genel kurallardan önce eşleşir.
    ['04-Muzekkereler-Yazismalar', ['teblig muzekkeresi', 'genel karar/muzekkere', 'haciz karar yazisi', '89/1 haciz ihbarnamesi cevabi']],
    ['11-Sorgu-Belgeleri', ['ptt tebligat sorgulamasi', 'adli sicil', 'nufus kayit', 'adres sorusturmasi', 'tasit sahiplik',
      'mahrumiyet raporu', 'dosya hesabi raporu']],
    ['07-Vekalet-Idari', ['talep evraki', 'vekaletname', 'hedef sure formu', 'dava acilis formu', 'istinaf formu']],
    ['09-Durusma-Zabitlari', ['hukuk genel tutanak', 'durusma zapti', 'tensip zapti', 'durusma tutanag']],
    ['10-Talimat', ['talimat']],
    ['12-Sorusturma', ['iddianame', 'hazirlik dosyasi']],
    ['05-Bilirkisi', ['bilirkisi', 'ek rapor', 'teslim tutanagi']],
    ['06-Mali', ['makbuz', 'reddiyat', 'sayman mutem', 'vekalet pulu', 'harc']],
    ['03-Tebligatlar', ['tebligat', 'mazbata']],
    ['01-Kararlar-Tutanaklar', ['karar', 'kesinlesme serhi', 'ifade tutanagi', 'cbs genel tutanak']],
    ['04-Muzekkereler-Yazismalar', ['muzekkere', 'tekit yazisi', 'tekid yazisi', 'dosya isteme yazisi', 'cevap yazisi', 'cevabi', 'yazisi']],
    ['02-Dilekceler', ['dilekce', 'istinaf basvuru', 'mazeret', 'delil', 'vekillikten cekilme', 'takip talebi', 'savunma', 'cevap']],
    ['08-Ekler-Diger', ['diger evrak', 'goruldu evraki', 'sgk hizmet dokumu']]
  ]);
  const DIGER = '99-Siniflandirilmamis';
  function kategori(value) {
    const key = typeKeyRaw(String(value || '')).replace(/ı/g, 'i');
    if (!key) return DIGER;
    for (const [name, words] of KATEGORILER) if (words.some(word => key.includes(word))) return name;
    if (/talebi$/.test(key)) return '02-Dilekceler';
    return DIGER;
  }
  const upperTr = value => String(value || '').toLocaleUpperCase('tr-TR');
  function yargiKlasoru(rec) {
    const r = rec || {}, kod = String(r.yargiTuru ?? '');
    if (kod === '0' || kod === '3') return 'Ceza';
    if (kod === '1') return 'Hukuk';
    if (kod === '2') return 'İcra';
    if (kod === '6') return 'İdari';
    const text = typeKeyRaw([r.yargiTuruAdi, r.birimAdi, r.dosyaTur].filter(Boolean).join(' '));
    if (/\bicra\b/.test(text)) return 'İcra';
    if (/\b(?:idar[ie]|idari|vergi mahkemesi|danistay)\b/.test(text)) return 'İdari';
    if (/\b(?:ceza|savcilik|bassavcilig|cbs)\b/.test(text)) return 'Ceza';
    return 'Hukuk';
  }
  function birimTuru(rec) {
    const r = rec || {};
    let text = String(r.birimTuruAdi || '').trim();
    if (!text || /^\d+$/.test(text)) {
      text = String(r.birimAdi || '').replace(/^\(.+?\)\s*/, '').trim();
      const numbered = /^.*?\d+\.\s*(.+)$/.exec(text);
      if (numbered) text = numbered[1];
      else {
        const words = text.split(/\s+/);
        // "Örnekşehir İcra Dairesi" gibi sırasız birimlerde ilk kelime yer adıdır.
        if (words.length > 2) text = words.slice(1).join(' ');
      }
    }
    return clean(upperTr(text.replace(/\s+/g, ' ')), 'BİRİM', 60);
  }
  const shorten = (value, max) => {
    const chars = [...value];
    return chars.length > max ? chars.slice(0, max).join('').replace(/[ ._-]+$/g, '') : value;
  };
  const segment = (value, fallback, max) => shorten(clean(value, fallback, Infinity), max) || fallback;
  function folderLayout(rec, avukat, now = Date.now()) {
    const r = rec || {}, yargi = yargiKlasoru(r);
    return { v: 1, avukat: segment(avukat, 'Avukat', 30), yargi, birimTuru: birimTuru(r),
      mahkeme: segment(r.birimAdi, 'Mahkeme', 80), esasNo: String(r.dosyaNo || '').slice(0, 60),
      dosyaId: String(r.dosyaId ?? '').slice(0, 100), birimId: String(r.birimId ?? '').slice(0, 100),
      caseType: String(r.dosyaTur || r.yargiTuruAdi || yargi).slice(0, 100), isIcra: yargi === 'İcra',
      clonedAt: new Date(now).toISOString() };
  }
  function caseRoot(layout) {
    const l = layout || {};
    const esas = String(l.esasNo || '').replace(/[\\/]/g, '-');
    // Esas numarası kısaltmada korunur: mahkeme adı kısalır.
    const mahkeme = segment(l.mahkeme, 'Mahkeme', Math.max(10, 49 - esas.length));
    return [segment(l.avukat, 'Avukat', 30), segment(l.yargi, 'Hukuk', 10), segment(l.birimTuru, 'BİRİM', 35),
      segment([mahkeme, esas].filter(Boolean).join(' '), 'Dosya', 50)].join('/');
  }
  // UYAP'ta evrakın yönü (gelen/giden) varsa kullanılır; liste verisinde yoksa Dosya.
  function yon(item) {
    const x = item || {}, main = x.ana || x;
    const raw = typeKeyRaw(main.yon || main.e?.yon || main.e?.evrakYonu || '');
    return raw.startsWith('gelen') ? 'Gelen' : raw.startsWith('giden') ? 'Giden' : 'Dosya';
  }
  function stampOf(item) {
    const x = item || {}, main = x.ana || x;
    const date = dateParts(main.onay || main.e?.onaylandigiTarih || x.onay);
    return date ? date.slice(0, 3).map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-') : 'Tarihsiz';
  }
  function mainBase(item) {
    const x = item || {};
    const tur = shorten(clean(String(x.tur || x.e?.tur || 'Evrak').replace(/\//g, '_'), 'Evrak', Infinity), 50);
    const no = x.no ?? x.e?.birimEvrakNo;
    return [stampOf(x), tur, no != null && no !== '' ? shorten(clean(no, '', Infinity), 20) : ''].filter(Boolean).join('_');
  }
  // Hedeflerin tamamı için kararlı ve benzersiz yollar (uzantısız). Devamda aynı hedef listesi aynı yolları verir.
  function folderPaths(layout, targets) {
    const root = caseRoot(layout), used = new Set(), mains = new Map(), out = [];
    const take = (dir, base, reserve = 0) => {
      for (let i = 1; ; i++) {
        const suffix = i === 1 ? '' : ` (${i})`;
        const room = Math.max(12, FOLDER_PATH_MAX - [...dir].length - 1 - 6 - reserve - suffix.length);
        const name = shorten(base, room) + suffix, key = collisionKey(dir + '/' + name);
        if (!used.has(key)) { used.add(key); return dir + '/' + name; }
      }
    };
    const mainPath = main => {
      const id = JSON.stringify([main.k, main.dosya || '']);
      if (!mains.has(id)) mains.set(id, take(`${root}/evraklar/${yon(main)}/${kategori(main.tur || main.e?.tur)}`, mainBase(main), EK_ROOM));
      return mains.get(id);
    };
    for (const item of Array.isArray(targets) ? targets : []) if (item && !item.ana) mainPath(item);
    for (const item of Array.isArray(targets) ? targets : []) {
      if (!item) { out.push(null); continue; }
      if (!item.ana) { out.push(mainPath(item)); continue; }
      const dir = mainPath(item.ana) + '_ekler';
      const n = Number.isInteger(item.ekIndis) ? item.ekIndis + 1 : out.length + 1;
      const ad = shorten(clean(String(item.ekTuru || item.tur || 'Ek').replace(/\//g, '_'), 'Ek', Infinity), 40);
      // take() ek adını kalan yere göre kısaltır; "EkNN_" öneki korunur.
      out.push(take(dir, `Ek${String(n).padStart(2, '0')}_${ad}`));
    }
    return out;
  }
  function projectJson(layout, rows, now = Date.now()) {
    const l = layout || {};
    return JSON.stringify({ dosyaId: l.dosyaId || '', mahkeme: l.mahkeme || '', birimId: l.birimId || '', esasNo: l.esasNo || '',
      caseType: l.caseType || '', indirenAvukat: l.avukat || '', isIcra: !!l.isIcra, clonedAt: l.clonedAt || new Date(now).toISOString(),
      lastSyncedAt: new Date(now).toISOString(),
      evraklar: (Array.isArray(rows) ? rows : []).map(({ target: x = {}, path, ext }) => {
        const main = x.ana || x;
        return { yol: path ? path.slice(caseRoot(l).length + 1) + (ext ? '.' + extension(ext) : '') : '',
          uzanti: ext ? extension(ext) : null, evrakId: String((x.ana ? x.ekId : x.e?.evrakId) ?? ''),
          tur: String(x.ekTuru || x.tur || x.e?.tur || ''), tarih: stampOf(x), evrakNo: String(main.no ?? main.e?.birimEvrakNo ?? ''),
          kategori: kategori(main.tur || main.e?.tur), yon: yon(x), ek: !!x.ana,
          ...(x.ana ? { anaEvrakId: String(x.ana.e?.evrakId ?? '') } : {}) };
      }) }, null, 2);
  }
  // ZIP'e yol olarak eklenecek sabit girdiler: proje kaydı ve boş "ilgili-dosyalar" klasörü.
  function folderExtras(layout, rows, now = Date.now()) {
    const root = caseRoot(layout);
    return [{ name: `${root}/ilgili-dosyalar/`, path: true, blob: new Blob([]) },
      { name: `${root}/uyap-project.json`, path: true, blob: new Blob([projectJson(layout, rows, now)], { type: 'application/json' }), date: now }];
  }

  globalThis.UHD = globalThis.UHD || {};
  globalThis.UHD.evrakZip = { kategori, yargiKlasoru, birimTuru, folderLayout, caseRoot, folderPaths, projectJson, folderExtras, FOLDER_PATH_MAX,
    archiveName, documentName, uniqueName, createZip, documentType, typeGroups, selectRows, MAX_BYTES, MAX_ENTRIES };
})();
