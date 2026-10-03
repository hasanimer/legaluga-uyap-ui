// Popup ve UYAP sayfası arasında paylaşılan yardımcılar: Türkçe normalleştirme, yerel arama, açılış adresi.
(() => {
  if (globalThis.UHD) return;

  // Dosya Sorgulama > Detaylı Sorgulama ekranındaki yargı türleri (UYAP kaynak kodundaki sırayla).
  // Cbs (kod 3) burada yok: UYAP savcılık dosyalarını il ve başsavcılık seçilerek ayrı bir uçtan verir (aşağıda CBS).
  const TURLER = [
    { kod: '0', ad: 'Ceza' },
    { kod: '1', ad: 'Hukuk' },
    { kod: '2', ad: 'İcra' },
    { kod: '6', ad: 'İdari Yargı' },
    { kod: '11', ad: 'Satış Memurluğu' },
    { kod: '25', ad: 'Arabuluculuk' },
    { kod: '26', ad: 'Tazminat Komisyonu Başkanlığı' }
  ];

  // Liste filtresinden bağımsızdır: bu kapsam UYAP'a gönderilecek sorguları belirler.
  function taramaKapsami(prefs = {}) {
    const secili = Array.isArray(prefs?.taramaTurleri) ? new Set(prefs.taramaTurleri.map(String)) : null;
    return {
      turler: TURLER.filter(tur => !secili || secili.has(tur.kod)),
      durumlar: prefs?.taramaDurum === 'acik' ? [0] : prefs?.taramaDurum === 'kapali' ? [1] : [0, 1]
    };
  }

  // Yeni kurulumda seçim zorunludur; yükseltmede mevcut indeks kurulumu tamamlanmış sayılır.
  function kurulumGerekli(prefs, index) {
    if (typeof prefs?.kurulumTamamlandi === 'boolean') return !prefs.kurulumTamamlandi;
    return !(index && ((Array.isArray(index.records) && index.records.length) || Number(index.updatedAt) > 0));
  }

  const ORIGIN = 'https://avukat.uyap.gov.tr';

  // ------------------------------------------------ savcılık (Cbs)
  // UYAP savcılık dosyalarını yalnız başsavcılık başsavcılık verir: birim seçilmeden gelen sorgu boş liste döner (canlıda
  // 01.10.2026'da denendi). Eklenti illerin başsavcılık listesini (rehber) bir kez çıkarır ve seçilen illerin bütün
  // başsavcılıklarını tarar. ad, UYAP'ın yargı türü kutusundaki yazıdır; ekranda "Savcılık" yazılır.
  const CBS = { kod: '3', ad: 'Cbs', etiket: 'Savcılık' };
  // İller plaka sırasıyla (ILLER[plaka - 1]); ayarlardaki il seçimi UYAP oturumu olmadan da çalışsın diye burada.
  const ILLER = ('Adana|Adıyaman|Afyonkarahisar|Ağrı|Amasya|Ankara|Antalya|Artvin|Aydın|Balıkesir|Bilecik|Bingöl|Bitlis|Bolu|Burdur|'
    + 'Bursa|Çanakkale|Çankırı|Çorum|Denizli|Diyarbakır|Edirne|Elazığ|Erzincan|Erzurum|Eskişehir|Gaziantep|Giresun|Gümüşhane|Hakkâri|'
    + 'Hatay|Isparta|Mersin|İstanbul|İzmir|Kars|Kastamonu|Kayseri|Kırklareli|Kırşehir|Kocaeli|Konya|Kütahya|Malatya|Manisa|'
    + 'Kahramanmaraş|Mardin|Muğla|Muş|Nevşehir|Niğde|Ordu|Rize|Sakarya|Samsun|Siirt|Sinop|Sivas|Tekirdağ|Tokat|Trabzon|Tunceli|'
    + 'Şanlıurfa|Uşak|Van|Yozgat|Zonguldak|Aksaray|Bayburt|Karaman|Kırıkkale|Batman|Şırnak|Bartın|Ardahan|Iğdır|Yalova|Karabük|'
    + 'Kilis|Osmaniye|Düzce').split('|');
  // Büyükşehirler önce, nüfus sırasıyla; kalan iller plaka sırasıyla. UYAP'ın il listesindeki "buyuksehir" alanı hep
  // false geldiği için sıra burada tutulur.
  const BUYUKSEHIRLER = [34, 6, 35, 16, 7, 42, 1, 63, 27, 41, 33, 21, 31, 45, 38, 55, 10, 59, 9, 65, 54, 20, 46, 48, 26, 47, 61, 52, 44, 25];
  function ilSirasi(iller) {
    const sira = il => { const i = BUYUKSEHIRLER.indexOf(Number(il.il)); return i < 0 ? BUYUKSEHIRLER.length + Number(il.il) : i; };
    return (iller || []).filter(il => il && Number.isInteger(Number(il.il)) && Number(il.il) > 0).slice().sort((a, b) => sira(a) - sira(b));
  }
  // "Küçükçekmece Cumhuriyet Başsavcılığı" → "kucukcekmece" (normalleştirilmiş adliye adı); başsavcılık değilse ''.
  function adliyeOf(birimAdi) {
    const m = /^(.*?)\s*cumhuriyet\s+(?:bas)?savciligi\b/.exec(norm(birimAdi).trim());
    return m ? m[1].trim() : '';
  }
  // Kayıtların bulunduğu iller. Savcılık kaydı ilini taşır; mahkeme kaydının ili, birim adının başladığı adliye
  // adından bulunur ("Küçükçekmece 8. Ağır Ceza Mahkemesi" → İstanbul). En uzun ad kazanır ("İstanbul Anadolu" >
  // "İstanbul"); aynı adlı adliye iki ilde varsa ikisi de alınır.
  function cbsIlleri(rehber, records) {
    const adliyeler = new Map();
    for (const il of (rehber && rehber.iller) || []) {
      for (const b of il.birimler || []) {
        const a = adliyeOf(b.birimAdi);
        if (!a) continue;
        if (!adliyeler.has(a)) adliyeler.set(a, new Set());
        adliyeler.get(a).add(Number(il.il));
      }
    }
    const adlar = [...adliyeler.keys()].sort((x, y) => y.length - x.length);
    const out = new Set();
    for (const r of records || []) {
      if (!r) continue;
      if (r.yargiTuru === CBS.kod && r.ilKodu) { out.add(Number(r.ilKodu)); continue; }
      const ad = norm(cleanBirim(r.birimAdi)).trim();
      const a = adlar.find(x => ad === x || ad.startsWith(x + ' '));
      if (a) for (const il of adliyeler.get(a)) out.add(il);
    }
    return out;
  }
  // Taranacak iller (rehberdeki il nesneleri, büyükşehirler önce). 'secili' yalnız elle seçilen illeri,
  // varsayılan kip kayıtların illeri ile elle eklenen illeri kapsar.
  function cbsKapsam(rehber, records, prefs) {
    const iller = ilSirasi((rehber && rehber.iller) || []);
    const mod = prefs && prefs.savcilik;
    if (mod === 'kapali') return [];
    if (mod === 'tum') return iller;
    const secili = mod === 'secili' ? new Set() : cbsIlleri(rehber, records);
    for (const il of (prefs && prefs.savcilikIller) || []) secili.add(Number(il));
    return iller.filter(il => secili.has(Number(il.il)));
  }
  // UYAP savcılık dosya türünü "CBS Sorusturma Dosyası" diye yazar; ekranda Türkçe harfle gösterilir.
  const dosyaTurAdi = r => String((r && r.dosyaTur) || '').replace(/\bSorusturma\b/g, 'Soruşturma');
  // İl adı ekranda "İSTANBUL" yerine "İstanbul".
  function ilAdi(ad) {
    return String(ad || '').toLocaleLowerCase('tr-TR').replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toLocaleUpperCase('tr-TR'));
  }

  // Marka kimliği: ad ve renkler yalnızca buradan değiştirilir (arayüz, sayfa paneli, bildirimler).
  const BRAND = {
    name: 'Legaluga UYAP Asistanı',
    short: 'Legaluga',
    disclaimer: 'Legaluga ürünüdür. T.C. Adalet Bakanlığı veya UYAP ile resmî bir bağlantısı yoktur.',
    site: 'https://legaluga.com',
    email: 'info@legaluga.com',
    // legaluga.com (apps/web/app/globals.css) marka renkleri
    primary: '#0f817e',
    primaryDark: '#0b6663',
    deep: '#104b49',
    soft: '#e8f7f5',
    border: '#a7d9d2',
    focus: '#0b6663'
  };

  // Her karakter tek karaktere eşlenir; böylece normalleştirilmiş metindeki konumlar
  // özgün metinle birebir örtüşür (vurgulama bu sayede doğru çalışır).
  const MAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
  const charCache = new Map();
  function normChar(ch) {
    let c = charCache.get(ch);
    if (c !== undefined) return c;
    if (/\s/.test(ch)) c = ' ';
    else {
      c = ch.toLocaleLowerCase('tr-TR');
      c = MAP[c] || c;
      if (c.length !== 1 || c.charCodeAt(0) > 127) {
        const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
        c = MAP[base] || base[0] || ' ';
      }
    }
    charCache.set(ch, c);
    return c;
  }
  function norm(s) {
    s = s == null ? '' : String(s);
    let out = '';
    for (let i = 0; i < s.length; i++) out += normChar(s[i]);
    return out;
  }
  const tokens = q => norm(q).split(/[\s,;]+/).filter(Boolean);

  // Dosya numarasının farklı yazımları tek biçime çevrilir: "2024-189", "2024 189", "E. 2024/189", "189/2024",
  // "2024/189 esas", "Soruşturma No: 2024/189", "Sor. 2024/189" → "2024/189". İki sayı yalnız ilki yıl gibiyse (19xx/20xx) birleştirilir ("Ahmet 189" değişmez).
  // "K." karar numarasıdır ve dizinde yoktur; dokunulmaz.
  const YIL = '(?:19|20)\\d{2}';
  function fileNoQuery(q) {
    let s = ` ${String(q == null ? '' : q)} `;
    // "Yıl sıra" yalnız sorgunun tamamıysa birleştirilir: "2024 3 asliye" gibi yıl ve mahkeme numarası dokunulmaz.
    s = s.replace(new RegExp(`^\\s(${YIL})\\s+(\\d{1,7})\\s$`), ' $1/$2 ');
    // Önek ve sonek (E., Esas) numara biçimi düzeltilmeden de düzeltildikten sonra da ayıklanır ("E.2024-189").
    const isaret = x => x
      .replace(new RegExp(`\\s(?:e\\.?|esas(?:\\s+no)?\\.?|soru[sş]turma(?:\\s+no)?\\.?\\s*:?|sor\\.)\\s*(?=\\d+\\s*[/-]\\s*\\d)`, 'giu'), ' ')
      .replace(new RegExp(`(\\d+\\s*/\\s*\\d+)\\s*(?:e\\.|\\s(?:e|esas))(?=\\s)`, 'giu'), '$1');
    s = isaret(s);
    s = s.replace(new RegExp(`(\\s)(${YIL})\\s*-\\s*(\\d+)(?=\\s)`, 'g'), '$1$2/$3');
    s = s.replace(new RegExp(`(\\s)(\\d{1,7})\\s*/\\s*(${YIL})(?=\\s)`, 'g'), (m, sp, n, y) => new RegExp(`^${YIL}$`).test(n) ? m : `${sp}${y}/${n}`);
    s = isaret(s);
    return s.trim().replace(/\s+/g, ' ');
  }
  const nameKey = s => norm(s).replace(/^av\.?\s+/, '').replace(/\s+/g, ' ').trim();

  // "Vekil adınız" ayarı boşsa: indekste en çok dosyada vekil olarak geçen ad kullanıcının adıdır.
  function detectMyName(records) {
    const counts = new Map();
    for (const r of records) {
      const seen = new Set();
      for (const p of r.taraflar || []) {
        for (const v of p.vekil || []) {
          const k = nameKey(v);
          if (!k || seen.has(k)) continue;
          seen.add(k);
          const c = counts.get(k) || { name: v, n: 0 };
          c.n++;
          counts.set(k, c);
        }
      }
    }
    let best = null;
    for (const c of counts.values()) if (!best || c.n > best.n) best = c;
    return best && best.n >= 2 ? best.name : '';
  }

  function myKeys(myName) {
    return String(myName || '').split(/[,;]/).map(nameKey).filter(k => k.length >= 5);
  }

  const isClient = (p, keys) => keys.length > 0 && (p.vekil || []).some(v => {
    const k = nameKey(v);
    return keys.some(m => k === m || k.includes(m));
  });

  const OTHER_TUR = new Set(['6', '11', '25', '26']);
  function passFilter(r, f) {
    if (f.durum === 'acik' && r.sorguDurum === 1) return false;
    if (f.durum === 'kapali' && r.sorguDurum !== 1) return false;
    if (f.tur && f.tur !== 'all') {
      const selected = Array.isArray(f.tur) ? f.tur : [f.tur];
      if (selected.length && !selected.some(t => t === 'other' ? OTHER_TUR.has(r.yargiTuru) : r.yargiTuru === t)) return false;
      if (selected.length === 1 && selected[0] === CBS.kod) {
        if (f.cbsIl && String(r.ilKodu) !== String(f.cbsIl)) return false;
        if (f.cbsBirim && r.birimTuru2 !== f.cbsBirim) return false;
        if (f.cbsIzin === 'izinli' && r.incelemeIzni !== true) return false;
        if (f.cbsIzin === 'bekliyor' && r.incelemeIzni !== false) return false;
      }
    }
    return true;
  }

  // Normalleştirilmiş alanlar kayıt başına bir kez hesaplanır; vekil adı değişince yenilenir.
  const infoCache = new WeakMap();
  function info(r, keys, ctx) {
    let c = infoCache.get(r);
    if (c && c.ctx === ctx) return c;
    const clients = [], others = [], vekils = [];
    for (const p of r.taraflar || []) {
      (isClient(p, keys) ? clients : others).push(norm(p.adi));
      for (const v of p.vekil || []) {
        const k = nameKey(v);
        if (!keys.some(m => k === m || k.includes(m))) vekils.push(norm(v));
      }
    }
    const base = [r.dosyaNo, r.birimAdi, r.dosyaTur, r.yargiTuruAdi, r.birimTuruAdi].map(norm);
    if (r.yargiTuru === CBS.kod) base.push(`savcilik bassavcilik sorusturma cbs ${norm(r.ilAdi)}`.trim());
    const fileNo = /^\s*(\d{4})\s*\/\s*(\d+)/.exec(String(r.dosyaNo || ''));
    const fields = base.concat(clients, others);
    const fieldsWithVekils = fields.concat(vekils);
    c = {
      ctx,
      no: norm(r.dosyaNo),
      fileYear: fileNo ? Number(fileNo[1]) : 0,
      fileSequence: fileNo ? Number(fileNo[2]) : 0,
      fileSequenceText: fileNo ? fileNo[2] : '',
      birim: norm(r.birimAdi),
      clients,
      parties: clients.concat(others),
      vekils,
      fields,
      fieldsWithVekils,
      all: fieldsWithVekils.join(' | '),
      noVek: fields.join(' | '),
      clientOnly: base.concat(clients).join(' | ')
    };
    infoCache.set(r, c);
    return c;
  }

  const wordStart = (list, t) => list.some(p => p.startsWith(t) || p.includes(' ' + t));

  // Tüm kelimeler geçmeli; dosya numarası, müvekkil ve taraf adı başından eşleşmeler öne çıkar.
  // o: { myName, notes: {key: metin}, filter: {durum, tur, turPinned, onlyClient, onlyNew}, yeni: Map(key → en yeni evrak zamanı),
  //      gizli: {key: true} (aramada gösterilmeyecek dosyalar), vekilAra: false (karşı vekillerde arama),
  //      sort: 'relevance' | 'newest' | 'fileNo', limit }
  // Birden çok kelimede, hepsi aynı alanda (ör. mahkeme adında) geçen dosyalar öne çıkar.
  function search(records, query, o = {}) {
    const ts = tokens(fileNoQuery(query));
    const numberQuery = ts.length === 1 && /^\d+$/.test(ts[0]) ? ts[0] : '';
    const f = o.filter || {};
    const filtered = (f.durum && f.durum !== 'all') || (Array.isArray(f.tur) ? f.tur.length : f.tur && f.tur !== 'all') || f.onlyClient || f.onlyNew;
    const yeni = o.yeni || new Map();
    const gizli = o.gizli || {};
    const vekilAra = o.vekilAra !== false;
    if (!ts.length && !filtered) return { total: 0, items: [], tokens: ts };
    const keys = myKeys(o.myName);
    const ctx = keys.join('|');
    const notes = o.notes || {};
    const hits = [];
    for (const r of records) {
      if (!passFilter(r, f)) continue;
      if (f.onlyNew && !yeni.has(r.key)) continue;
      if (gizli[r.key]) continue;
      const c = info(r, keys, ctx);
      if (f.onlyClient && !c.clients.length) continue;
      const hay = f.onlyClient ? c.clientOnly : vekilAra ? c.all : c.noVek;
      const note = ts.length && notes[r.key] ? norm(notes[r.key]) : '';
      let score = 0;
      let ok = true;
      for (const t of ts) {
        if (!hay.includes(t) && !note.includes(t)) { ok = false; break; }
        if (c.no === t) score += 100;
        else if (c.no.includes(t)) score += 20;
        if (wordStart(c.clients, t)) score += 15;
        else if (wordStart(c.parties, t)) score += 10;
        if (note.includes(t)) score += 5;
        if (c.birim.includes(t)) score += 2;
      }
      if (ok && ts.length > 1) {
        const fields = f.onlyClient ? c.clients : vekilAra ? c.fieldsWithVekils : c.fields;
        if (fields.some(x => ts.every(t => x.includes(t))) || (note && ts.every(t => note.includes(t)))) score += 60;
      }
      if (ok) {
        const numberRank = !numberQuery || c.fileSequenceText === numberQuery ? 0 : c.fileSequenceText.includes(numberQuery) ? 1 : 2;
        hits.push({ score, r, c, numberRank, numberLength: numberRank === 1 ? c.fileSequenceText.length : 0 });
      }
    }
    const byRelevance = (a, b) =>
      a.numberRank - b.numberRank ||
      a.numberLength - b.numberLength ||
      b.score - a.score ||
      (yeni.get(b.r.key) || 0) - (yeni.get(a.r.key) || 0) ||
      (a.r.sorguDurum || 0) - (b.r.sorguDurum || 0) ||
      (b.r.acilisTs || 0) - (a.r.acilisTs || 0);
    hits.sort(o.sort === 'newest'
      ? (a, b) => (b.r.acilisTs || 0) - (a.r.acilisTs || 0) || byRelevance(a, b)
      : o.sort === 'fileNo'
        ? (a, b) => b.c.fileYear - a.c.fileYear || b.c.fileSequence - a.c.fileSequence || byRelevance(a, b)
        : byRelevance);
    const limit = o.limit || 60;
    return { total: hits.length, items: hits.slice(0, limit).map(h => h.r), tokens: ts };
  }

  function openPath() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'openPath' }); }
  // ------------------------------------------------ evrak takibi
  function evrakKey() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'evrakKey' }); }
  // "12/09/2026" → zaman damgası (sıralama için); tanınmayan biçimde 0.
  function trDateTs(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s || ''));
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
  }

  function parseEvraklar() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'parseEvraklar' }); }
  function evrakKilidi() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'evrakKilidi' }); }
  // İlk tarama başlangıç sayılır (yeni evrak yok). Sonrakilerde önceki taramalarda görülmemiş anahtarlar yenidir.
  // seen birleşim olarak tutulur; böylece listeden bir kez düşüp geri gelen evrak yeniden "yeni" sayılmaz.
  function diffEvrak(prevSeen, items) {
    const uniq = new Map();
    for (const i of items) if (!uniq.has(i.k)) uniq.set(i.k, i);
    const prev = Array.isArray(prevSeen) ? new Set(prevSeen) : null;
    const yeni = prev ? [...uniq.values()].filter(i => !prev.has(i.k)) : [];
    yeni.sort((a, b) => trDateTs(b.onay) - trDateTs(a.onay));
    const seen = prev ? [...prev] : [];
    for (const k of uniq.keys()) if (!prev || !prev.has(k)) seen.push(k);
    return { seen, yeni };
  }

  // Görüldü olarak işaretlenmemiş yeni evraklar (goruldu: {kayıtKey: zaman}).
  // Dosyadaki en yeni evrak (onay tarihine göre; aynı günde UYAP'ın sırasındaki ilk evrak).
  function sonEvrak(items) {
    let best = null, bestTs = -1;
    for (const i of items || []) {
      const ts = trDateTs(i.onay);
      if (ts > bestTs) { best = i; bestTs = ts; }
    }
    return best && { k: best.k, tur: best.tur, onay: best.onay, gonderim: best.gonderim, dosya: best.dosya };
  }

  // Kayıtta sonEvrak yoksa (1.1.0'da taranmış dosyalar) görülen evrak anahtarlarından çıkarılır:
  // anahtar "birimEvrakNo|onay tarihi|tür" biçimindedir.
  function lastEvrak(r) {
    if (r.sonEvrak) return r.sonEvrak;
    if (!Array.isArray(r.evrakSeen) || !r.evrakSeen.length) return null;
    return sonEvrak(r.evrakSeen.map(k => {
      const [, onay, ...tur] = String(k).split('|');
      return { k, onay, tur: tur.join('|') };
    }));
  }

  // Müvekkil (kişi) kartı: adı normalleştirilmiş hâliyle birebir eşleşen tarafın geçtiği tüm dosyalar ve
  // o dosyalardaki rolleri. UYAP taraf listesinde kimlik numarası olmadığından aynı adlı farklı kişiler ayrılamaz.
  // Sıra: müvekkil olarak geçtiği dosyalar önce; her grupta açıklar önce, sonra son evrakı yeni olan, sonra yeni açılan.
  function personFiles(records, name, myName) {
    const key = nameKey(name);
    const keys = myKeys(myName);
    const out = [];
    if (!key) return out;
    for (const r of records || []) {
      const ps = (r.taraflar || []).filter(p => nameKey(p.adi) === key);
      if (ps.length) out.push({ r, roller: ps.map(p => ({ rol: p.rol || 'Taraf', muvekkil: isClient(p, keys) })) });
    }
    const son = x => trDateTs((lastEvrak(x.r) || {}).onay);
    const bizde = x => x.roller.some(y => y.muvekkil);
    out.sort((a, b) =>
      bizde(b) - bizde(a) ||
      (a.r.sorguDurum === 1) - (b.r.sorguDurum === 1) ||
      son(b) - son(a) ||
      (b.r.acilisTs || 0) - (a.r.acilisTs || 0));
    return out;
  }

  // ------------------------------------------------ tarih yardımcıları
  // Duruşma tarihleri yerel gün olarak "yyyy-mm-dd" biçiminde tutulur.
  const pad2 = n => String(n).padStart(2, '0');
  function isoToUtc(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  const todayIso = (now = new Date()) => `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  // Bugünden belirtilen tarihe kalan gün (geçmişse eksi).
  function daysLeft(iso, today = todayIso()) {
    const a = isoToUtc(today), b = isoToUtc(iso);
    return a && b ? Math.round((b - a) / 86400000) : null;
  }

  function parseDurusma() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'parseDurusma' }); }
  // Bugünden itibaren (bugün dahil) duruşmalar, tarih ve saate göre.
  const upcomingDurusmalar = (list, today = todayIso()) => (list || [])
    .filter(d => d && d.tarih >= today)
    .sort((a, b) => (a.tarih + a.saat < b.tarih + b.saat ? -1 : a.tarih + a.saat > b.tarih + b.saat ? 1 : 0));

  // Mahkemenin bulunduğu adliye (normalleştirilmiş): birim adında sıra numarasından ya da mahkeme türünden önceki kısım.
  // "İstanbul Anadolu 5. Asliye Hukuk Mahkemesi" → "istanbul anadolu", "Silivri Asliye Hukuk Mahkemesi" → "silivri".
  // Bölge adliye ve idari yargı (idare, vergi) çoğu yerde ayrı binada olduğu için ayrı yer sayılır. Bulunamazsa ''.
  const MAHKEME_SOZU = /^(asliye|sulh|agir|is|aile|tuketici|icra|kadastro|fikri|cocuk|idare|idari|vergi|ticaret|ceza|hukuk|infaz|trafik|denizcilik|mahkemesi|dairesi|daire|bolge|cumhuriyet|hakimligi|genel)$/;
  function adliyeAdi(birimAdi) {
    const t = norm(cleanBirim(birimAdi)).replace(/\s*\([^)]*\)\s*$/, '').split(/\s+/).filter(Boolean);
    const i = t.findIndex(w => /^\d+\.?$/.test(w) || MAHKEME_SOZU.test(w));
    if (i <= 0) return '';
    const yer = t.slice(0, i).join(' ');
    const sonra = t.slice(/^\d/.test(t[i]) ? i + 1 : i);
    if (sonra[0] === 'bolge') return yer + ' bolge';
    if (/^(idare|idari|vergi)$/.test(sonra[0])) return yer + ' idari';
    return yer;
  }

  // Duruşma çakışması: aynı gün, farklı mahkemelerdeki iki duruşma arasında aynı adliyede CAKISMA_DK.ayniAdliye,
  // ayrı adliyede CAKISMA_DK.ayriAdliye dakikadan az varsa. Aynı dosyanın ya da aynı mahkemenin duruşmaları (mahkeme
  // sırayla görür) ve saati belli olmayan (00:00) duruşmalar sayılmaz. Dönüş: duruşma kimliği → [{ d, dk, ayniAdliye }].
  const CAKISMA_DK = { ayniAdliye: 30, ayriAdliye: 120 };
  function durusmaCakismalari(list) {
    const gunler = new Map();
    for (const d of list || []) {
      if (!d || !d.id || !d.tarih || !/^\d{2}:\d{2}$/.test(d.saat || '') || d.saat === '00:00') continue;
      if (!gunler.has(d.tarih)) gunler.set(d.tarih, []);
      gunler.get(d.tarih).push(d);
    }
    const dakika = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    const out = new Map();
    const ekle = (x, y, dk, ayniAdliye) => {
      if (!out.has(x.id)) out.set(x.id, []);
      out.get(x.id).push({ d: y, dk, ayniAdliye });
    };
    for (const gun of gunler.values()) {
      gun.sort((a, b) => dakika(a.saat) - dakika(b.saat));
      for (let i = 0; i < gun.length; i++) {
        for (let j = i + 1; j < gun.length; j++) {
          const a = gun[i], b = gun[j];
          const dk = dakika(b.saat) - dakika(a.saat);
          if (dk >= CAKISMA_DK.ayriAdliye) break;
          if (a.key === b.key || norm(cleanBirim(a.birimAdi)) === norm(cleanBirim(b.birimAdi))) continue;
          // Adliyesi anlaşılamayan mahkeme (ayniAdliye null) ayrı adliyede sayılır; yazıda yer belirtilmez.
          const yerA = adliyeAdi(a.birimAdi), yerB = adliyeAdi(b.birimAdi);
          const ayniAdliye = yerA && yerB ? yerA === yerB : null;
          if (dk >= (ayniAdliye ? CAKISMA_DK.ayniAdliye : CAKISMA_DK.ayriAdliye)) continue;
          ekle(a, b, dk, ayniAdliye);
          ekle(b, a, dk, ayniAdliye);
        }
      }
    }
    return out;
  }

  // UYAP'ın beklediği "gg.aa.yyyy".
  const uyapDate = d => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;

  function ihbarCevabiMi() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'ihbarCevabiMi' }); }
  function bankaAdi() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'bankaAdi' }); }
  function bankaUnvanAdi() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'bankaUnvanAdi' }); }
  function bankaCevabi() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'bankaCevabi' }); }
  function bankaBelgeleri() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'bankaBelgeleri' }); }
  // Takvim dosyası (.ics). Türkiye saati yıl boyu UTC+3 olduğu için saatler UTC'ye çevrilir. Taraf adları
  // takvim hizmetlerine (ör. bulut takvim) gidebileceği için yazılmaz; yalnız dosya no, birim ve işlem.
  function durusmaIcs(list, now = new Date()) {
    const esc = s => String(s || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\r?\n/g, '\\n');
    const utc = (tarih, saat, plusMin = 0) => {
      const [y, mo, d] = tarih.split('-').map(Number);
      const [h, mi] = saat.split(':').map(Number);
      const t = new Date(Date.UTC(y, mo - 1, d, h - 3, mi + plusMin));
      return `${t.getUTCFullYear()}${pad2(t.getUTCMonth() + 1)}${pad2(t.getUTCDate())}T${pad2(t.getUTCHours())}${pad2(t.getUTCMinutes())}00Z`;
    };
    const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}00Z`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Legaluga//UYAP Asistani//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const d of list || []) {
      lines.push('BEGIN:VEVENT',
        `UID:${esc(String(d.id).replace(/[^\w.-]/g, '-'))}@legaluga-uyap-asistani`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${utc(d.tarih, d.saat)}`,
        `DTEND:${utc(d.tarih, d.saat, 60)}`,
        `SUMMARY:${esc(`${d.islem}: ${d.dosyaNo} ${d.birimAdi}`)}`,
        `DESCRIPTION:${esc(`${d.dosyaTur}${d.sonuc ? ' · ' + d.sonuc : ''} (UYAP'tan alındı; saati UYAP'ta teyit edin)`)}`,
        `LOCATION:${esc(d.birimAdi)}`,
        'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  const unseenEvrak = (r, goruldu) => (r.yeniEvrak || []).filter(y => (y.at || 0) > ((goruldu && goruldu[r.key]) || 0));

  function parseSafahat() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'parseSafahat' }); }
  // Son başarılı safahat dosyaya göre saklanır. Ham UYAP yanıtı ve oturum kimliği kayda girmez.
  const SAFAHAT_REFRESH_MS = 60 * 60 * 1000, SAFAHAT_LEASE_MS = 15 * 60 * 1000;
  const safahatFileKey = key => typeof key === 'string' && key.length > 0 && key.length <= 512 && !['__proto__', 'constructor', 'prototype'].includes(key);
  function checkSafahatSnapshot(value) {
    if (!value || !Number.isSafeInteger(value.fetchedAt) || value.fetchedAt <= 0 || !Number.isFinite(new Date(value.fetchedAt).getTime()) || !Array.isArray(value.items) || value.items.length > 10000) throw new Error('Safahat kaydı geçersiz.');
    const limits = { tarih: 128, tur: 512, aciklama: 8192, birim: 512, statu: 256 };
    const items = value.items.map(row => {
      if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.ts) || row.ts < 0) throw new Error('Safahat satırı geçersiz.');
      const item = { ts: row.ts };
      for (const [key, max] of Object.entries(limits)) {
        if (typeof row[key] !== 'string' || row[key].length > max) throw new Error('Safahat alanı geçersiz veya çok uzun.');
        item[key] = row[key];
      }
      if (!item.tur && !item.aciklama) throw new Error('Safahat satırı boş.');
      return item;
    }).sort((a, b) => b.ts - a.ts);
    return { fetchedAt: value.fetchedAt, items };
  }
  function checkSafahatStore(value, keepPending = false) {
    if (value === undefined) return { version: 1, files: {}, ...(keepPending ? { pending: {} } : {}) };
    if (!value || value.version !== 1 || !value.files || typeof value.files !== 'object' || Array.isArray(value.files) || Object.keys(value.files).length > 1000) throw new Error('Safahat deposu geçersiz.');
    const result = { version: 1, files: {}, ...(keepPending ? { pending: {} } : {}) };
    for (const [key, snapshot] of Object.entries(value.files)) {
      if (!safahatFileKey(key)) throw new Error('Safahat dosya anahtarı geçersiz.');
      result.files[key] = checkSafahatSnapshot(snapshot);
    }
    if (keepPending && value.pending && (typeof value.pending !== 'object' || Array.isArray(value.pending) || Object.keys(value.pending).length > 1000)) throw new Error('Safahat sorgu deposu geçersiz.');
    if (keepPending) for (const [key, run] of Object.entries(value.pending || {})) {
      if (!safahatFileKey(key) || !run || typeof run.token !== 'string' || run.token.length > 128 || !run.token || !Number.isSafeInteger(run.at) || run.at <= 0) throw new Error('Safahat sorgu kaydı geçersiz.');
      result.pending[key] = { token: run.token, at: run.at };
    }
    if (new TextEncoder().encode(JSON.stringify(result)).length > 16 * 1024 * 1024) throw new Error('Safahat deposu 16 MiB sınırını aşıyor; eski kayıt korunuyor.');
    return result;
  }
  function safahatState(value, fileKey, now = Date.now()) {
    if (!safahatFileKey(fileKey) || !Number.isSafeInteger(now) || now <= 0) throw new Error('Safahat dosyası veya saat bilgisi geçersiz.');
    const store = checkSafahatStore(value, true), snapshot = store.files[fileKey] || null;
    // Saat geri alınırsa kalan süre uzar; 60 dakika koruması atlanamaz.
    const waitMs = snapshot ? Math.max(0, SAFAHAT_REFRESH_MS - (now - snapshot.fetchedAt)) : 0;
    const pending = store.pending[fileKey], busyMs = pending ? Math.max(0, SAFAHAT_LEASE_MS - (now - pending.at)) : 0;
    return { snapshot, waitMs, busy: busyMs > 0, busyMs };
  }

  // Kartta gösterilecek son işlem (saklanan en küçük bilgi).
  const sonIslemOf = items => (items && items[0] ? { tarih: items[0].tarih.slice(0, 10), tur: items[0].tur || items[0].aciklama } : null);

  // Tutar: 12345.5 → "12.345,50 ₺"
  const fmtTL = v => (typeof v === 'number' && isFinite(v) ? v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺' : '—');

  // "alacakKalemFaizTutar" → "Alacak kalem faiz tutar" (bilinmeyen alanları okunur göstermek için).
  // UYAP alan adları ASCII yazılır; ekranda yaygın sözcükler Türkçe karakterle, kısaltmalar büyük harfle gösterilir.
  const HUMAN_WORDS = {
    aciklama: 'açıklama', aciklamasi: 'açıklaması', adi: 'adı', adresi: 'adresi', alacakli: 'alacaklı', bilgileri: 'bilgileri',
    borclu: 'borçlu', borcu: 'borcu', calisani: 'çalışanı', calisma: 'çalışma', cikis: 'çıkış', dogum: 'doğum', durumu: 'durumu',
    giris: 'giriş', isyeri: 'iş yeri', ise: 'işe', isten: 'işten', kisi: 'kişi', kaydi: 'kaydı', meslegi: 'mesleği', numarasi: 'numarası',
    odeme: 'ödeme', arac: 'araç', sayisi: 'sayısı', sigortali: 'sigortalı', sirket: 'şirket', sube: 'şube', tarihi: 'tarihi', tescil: 'tescil',
    tutari: 'tutarı', turu: 'türü', unvani: 'unvanı', ucret: 'ücret', ozet: 'özet', sgk: 'SGK', ssk: 'SSK', egm: 'EGM', tc: 'TC',
    vkn: 'VKN', mersis: 'MERSİS', iban: 'IBAN', ilce: 'ilçe', islem: 'işlem', soyadi: 'soyadı'
  };
  const humanKey = k => {
    // tr-TR küçültme ASCII "I"yı "ı" yapar (ilkIseGiris → "ıse"); alan adları ASCII olduğu için önce "i"ye çevrilir.
    // Kısaltma dizisi sonraki sözcükten ayrılır: TCKimlikNo → "TC kimlik no".
    const words = String(k).replace(/_/g, ' ').replace(/([a-zçğıöşü0-9])([A-ZÇĞİÖŞÜ])/g, '$1 $2')
      .replace(/([A-ZÇĞİÖŞÜ]+)([A-ZÇĞİÖŞÜ][a-zçğıöşü])/g, '$1 $2').replace(/\s+/g, ' ').trim()
      .replace(/I/g, 'i').toLocaleLowerCase('tr-TR').split(' ').map(w => HUMAN_WORDS[w] || w);
    const s = words.join(' ');
    return /^[a-zçğıöşü]/.test(s) ? s.replace(/^./, c => c.toLocaleUpperCase('tr-TR')) : s;
  };

  // ------------------------------------------------ görünüm
  // UYAP adları büyük harfle verir; yalnız baş harfleri büyük gösterilir (arama etkilenmez).
  // Nokta içeren kısaltmalar (A.Ş., T.C., LTD.) ve 2-3 harfli şirket ekleri olduğu gibi kalır.
  const KEEP_UPPER = new Set(['AŞ', 'A.Ş.', 'LTD', 'LTD.', 'ŞTİ', 'ŞTİ.', 'T.C.', 'TC', 'KOOP.', 'SGK', 'TCDD', 'PTT', 'TMSF', 'TOKİ', 'TBMM']);
  function trTitle(s) {
    s = String(s == null ? '' : s);
    if (!/[A-ZÇĞİÖŞÜ]/.test(s) || /[a-zçğıöşü]/.test(s)) return s;   // yalnız tamamen büyük harfli metin çevrilir
    return s.split(/(\s+|-|\(|\))/).map(w => {
      if (!w || /^\s+$|^[-()]$/.test(w)) return w;
      if (KEEP_UPPER.has(w) || /\.\S/.test(w) || /^[A-ZÇĞİÖŞÜ]\.?$/.test(w)) return w;
      if (w === 'VE') return 've';
      const low = w.toLocaleLowerCase('tr-TR');
      return low.charAt(0).toLocaleUpperCase('tr-TR') + low.slice(1);
    }).join('');
  }

  // "Kapalı (2022-02-03 13:44:11.0)" → { label: "Kapalı", tarih: "03.02.2022" }
  function cleanDurum(durum) {
    const s = String(durum || '').trim();
    const m = /^(.*?)\s*\((\d{4})-(\d{2})-(\d{2})[^)]*\)\s*$/.exec(s);
    if (m) return { label: m[1], tarih: `${m[4]}.${m[3]}.${m[2]}` };
    const t = /^(.*?)\s*\((\d{2})[/.](\d{2})[/.](\d{4})\)\s*$/.exec(s);
    return t ? { label: t[1], tarih: `${t[2]}.${t[3]}.${t[4]}` } : { label: s, tarih: '' };
  }

  // "(Kapatılan)İstanbul Anadolu 2. Asliye Ticaret Mahkemesi" → "İstanbul Anadolu 2. Asliye Ticaret Mahkemesi (kapatılan)"
  function cleanBirim(birim) {
    const s = String(birim || '').trim();
    const m = /^\((.+?)\)\s*(.+)$/.exec(s);
    return m ? `${m[2]} (${m[1].toLocaleLowerCase('tr-TR')})` : s;
  }

  // Yeni evrak takibi: yeni kurulumda kapalı. Önceki sürümde açık kullanılıyorsa (taranmış kayıt varsa) açık kalır.
  function evrakTakipAcik(prefs, records) {
    prefs = prefs || {};
    if (typeof prefs.evrakTakip === 'boolean') return prefs.evrakTakip;
    if (prefs.evrakKapali) return false;
    return (records || []).some(r => r && r.evrakSeen);
  }

  // ------------------------------------------------ yedek
  // Yedek dosyası: { app, format, exportedAt, version, data: { anahtar: değer } }. Başka uygulamanın ya da
  // desteklenmeyen biçimin dosyası reddedilir; yalnız bilinen anahtarlar geri yüklenir.
  const BACKUP_APP = 'legaluga-uyap-asistani';
  const BACKUP_FORMAT = 1;
  // Kaldırılan süre özelliğinin eski kayıtları yalnızca yedeklerde kayıpsız korunur.
  const BACKUP_KEYS = ['uhdIndex', 'uhdNotes', 'uhdSureler', 'uhdEvrakGoruldu', 'uhdDurusmalar', 'uhdPrefs', 'uhdRecent', 'uhdGizli', 'uhdTurFilter', 'uhdBankChecks', 'uhdSafahat'];
  function checkBackup(obj) {
    if (!obj || typeof obj !== 'object' || obj.app !== BACKUP_APP) throw new Error('Bu dosya Legaluga UYAP Asistanı yedeği değil.');
    if (obj.format !== BACKUP_FORMAT) throw new Error(`Bu yedeğin biçimi (${obj.format}) bu sürümde desteklenmiyor.`);
    if (!obj.data || typeof obj.data !== 'object') throw new Error('Yedek dosyası bozuk.');
    const data = {};
    for (const k of BACKUP_KEYS) if (k in obj.data) data[k] = obj.data[k];
    if (data.uhdIndex && !Array.isArray(data.uhdIndex.records)) throw new Error('Yedekteki dosya listesi bozuk.');
    if (data.uhdPrefs && (typeof data.uhdPrefs !== 'object' || Array.isArray(data.uhdPrefs))) throw new Error('Yedekteki ayarlar bozuk.');
    if (Object.hasOwn(data, 'uhdBankChecks')) {
      if (!globalThis.UHDBankChecks) throw new Error('Banka takip yedeği bu ekranda doğrulanamadı.');
      data.uhdBankChecks = globalThis.UHDBankChecks.sanitizeStore(data.uhdBankChecks);
    }
    if (Object.hasOwn(data, 'uhdSafahat')) data.uhdSafahat = checkSafahatStore(data.uhdSafahat);
    // Başka cihazın veya eski yedeğin raporlama tercihi bu cihazda onay sayılmaz.
    data.uhdPrefs = { ...(data.uhdPrefs || {}), hataRaporu: false };
    delete data.uhdPrefs.telemetryConsentAt;
    delete data.uhdPrefs.telemetryConsentVersion;
    return data;
  }

  // UYAP'tan gelen değerler (taraf, vekil adı…) =, +, -, @ ya da sekme/satır başıyla başlıyorsa
  // Excel onları formül olarak çalıştırabilir; başa kesme işareti eklenerek düz metne çevrilir.
  const csvCell = v => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  // Dosya numarası Excel'de tarihe dönmesin diye ="…" biçiminde yazılır; yalnız "yıl/sıra" biçimine izin verilir.
  const csvDosyaNo = no => /^\d{4}\/\d+$/.test(String(no || '')) ? `"=""${no}"""` : csvCell(no);

  // Dilekçede kullanılan künye: "İstanbul Anadolu 12. Asliye Hukuk Mahkemesi 2025/1482 E."
  const kunyeOf = r => {
    const birim = cleanBirim(r.birimAdi).replace(/\s*\(kapatılan\)$/i, '');
    return r.yargiTuru === CBS.kod ? `${birim} Soruşturma No: ${r.dosyaNo}` : `${birim} ${r.dosyaNo} E.`;
  };

  // ------------------------------------------------ sayfa bildirimleri
  // Bildirim yığınının düzeni. Aynı kimlikli bildirim yerindekinin yerine geçer ve sırasını korur. Yığın en çok max
  // bildirim tutar; taşarsa sabit olmayanlardan önceliği en düşük, eşitse en eski olan çıkar. Gelen bildirim ve sabit
  // bildirim (oturum uyarısı) çıkarılmaz. Sıra: sabitler üstte, sonra geliş sırasıyla.
  // Öğeler { id, priority, at, pinned }; dönüş { list, evicted: [id] }.
  function toastPlan(list, incoming, max = 3) {
    const old = list.find(t => t.id === incoming.id);
    const next = { ...incoming, at: old ? old.at : incoming.at };
    const all = [...list.filter(t => t.id !== incoming.id), next];
    const evicted = [];
    while (all.length > max) {
      const out = all.filter(t => !t.pinned && t.id !== next.id)
        .sort((a, b) => (a.priority || 0) - (b.priority || 0) || a.at - b.at)[0];
      if (!out) break;
      all.splice(all.indexOf(out), 1);
      evicted.push(out.id);
    }
    all.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.at - b.at);
    return { list: all, evicted };
  }

  // Dosya açma hatasında sunulacak eylemler (en çok iki): 'tekrar', 'guncelle', 'kunye', 'giris'. Dosya UYAP'ın
  // listesinde ya da formunda yoksa "Tekrar dene" sunulmaz: her denemede aynı sonuç çıkar, liste güncellenmelidir.
  // Geçici bir hata aynı dosyada ikinci kez gelirse liste eskimiş olabileceği için Güncelle de önerilir. Güncelleme
  // zaten sürüyorsa Güncelle sunulmaz.
  function openErrorPlan(kind, { repeat = false, updating = false } = {}) {
    let actions;
    if (kind === 'oturum') actions = ['giris'];
    else if (kind === 'secenek' || kind === 'bulunamadi') actions = ['guncelle', 'kunye'];
    else actions = repeat ? ['tekrar', 'guncelle'] : ['tekrar'];
    if (updating) actions = actions.filter(a => a !== 'guncelle');
    return actions.slice(0, 2);
  }

  function ekleriYerlestir() { throw Object.assign(new Error('Özel işlem motoru açık arayüz demosunda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: 'ekleriYerlestir' }); }
  // Görünen evrak satırlarını UYAP tür adına göre klasörler. Ek, ana evrakın türünü kullanır; ana satır arama
  // sonucunda bulunmasa da ekin ana referansı yeterlidir. Kimlik tekilleştirilmez, satırlar ve iç sıra korunur.
  function evrakKategorileri(rows) {
    const ad = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
    const categories = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const title = ad(row?.ana?.tur) || ad(row?.tur) || 'Diğer evraklar';
      const key = norm(title);
      if (!categories.has(key)) categories.set(key, { key, title, items: [], count: 0 });
      const category = categories.get(key);
      category.items.push(row);
      category.count++;
    }
    return [...categories.values()].sort((a, b) => a.title.localeCompare(b.title, 'tr-TR', { sensitivity: 'base' }));
  }

  // HTML evrakın kodlaması (1.19.3). Sıra: bayt sırası işareti, Content-Type'taki charset, belgenin ilk 1024 baytındaki
  // <meta charset>, geçerli UTF-8; hiçbiri yoksa Türkçe (windows-1254). UYAP'ın eski evrakı çoğunlukla 1254'tür; UTF-8
  // sanılıp okunursa ğ, ş, ı, İ bozulur. Dönüş TextDecoder'ın tanıdığı ad.
  function htmlKodlamasi(bayt, icerikTuru = '') {
    const b = bayt || new Uint8Array(0);
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'utf-8';
    if (b[0] === 0xff && b[1] === 0xfe) return 'utf-16le';
    if (b[0] === 0xfe && b[1] === 0xff) return 'utf-16be';
    // Bayt sırası işareti olmadan UTF-16 ya da x-user-defined beyanına güvenilmez (ASCII uyumlu okunmuştur).
    const gecerli = ad => { try { const k = new TextDecoder(ad).encoding; return /^utf-16|^x-user-defined$|^replacement$/.test(k) ? null : k; } catch { return null; } };
    const baslik = /charset\s*=\s*["']?([\w.:-]{1,40})/i.exec(String(icerikTuru || ''));
    const b1 = baslik && gecerli(baslik[1]);
    if (b1) return b1;
    let bas = '';
    for (let i = 0; i < Math.min(b.length, 1024); i++) bas += String.fromCharCode(b[i]);
    bas = bas.replace(/<!--[\s\S]*?(-->|$)/g, '');   // yorumdaki meta sayılmaz
    const meta = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]{1,40})/i.exec(bas);
    const b2 = meta && gecerli(meta[1]);
    if (b2) return b2;
    try { new TextDecoder('utf-8', { fatal: true }).decode(b); return 'utf-8'; } catch { return 'windows-1254'; }
  }

  // UYAP tarihleri ekranda gg.aa.yyyy yazılır ("12/09/2026" → "12.09.2026"; saat varsa kalır). CSV ve UYAP'a geri yazılan
  // değerler değişmez.
  const fmtTrDate = v => String(v == null ? '' : v).replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, '$1.$2.$3');

  const fmtNum = n => Number(n || 0).toLocaleString('tr-TR');
  const fmtDate = ts => ts ? new Date(ts).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';

  globalThis.UHD = { TURLER, taramaKapsami, kurulumGerekli, CBS, ILLER, BUYUKSEHIRLER, ilSirasi, adliyeOf, cbsIlleri, cbsKapsam, ilAdi, evrakKilidi, dosyaTurAdi, ORIGIN, BRAND, norm, tokens, nameKey, detectMyName, myKeys, isClient, passFilter, fileNoQuery, search, openPath, fmtNum, fmtDate, fmtTrDate, csvCell, csvDosyaNo, evrakKey, trDateTs, parseEvraklar, diffEvrak, unseenEvrak, sonEvrak, lastEvrak, personFiles, parseSafahat, checkSafahatSnapshot, checkSafahatStore, safahatState, safahatFileKey, SAFAHAT_REFRESH_MS, SAFAHAT_LEASE_MS, sonIslemOf, fmtTL, humanKey, trTitle, cleanDurum, cleanBirim, kunyeOf, toastPlan, openErrorPlan, htmlKodlamasi, ekleriYerlestir, evrakKategorileri, evrakTakipAcik, BACKUP_APP, BACKUP_FORMAT, BACKUP_KEYS, checkBackup, todayIso, daysLeft, parseDurusma, upcomingDurusmalar, adliyeAdi, CAKISMA_DK, durusmaCakismalari, uyapDate, durusmaIcs, ihbarCevabiMi, bankaAdi, bankaUnvanAdi, bankaCevabi, bankaBelgeleri };
})();
