// UDF evrak görüntüleyicisi. UDF (UYAP Doküman Formatı) bir zip paketidir; içindeki content.xml belgenin bütün
// metnini tek bir havuzda (CDATA) tutar, paragraf ve parçalar havuzu startOffset/length ile gösterir.
// Okuyucu bu eklenti için baştan yazıldı. Ağ isteği yapmaz. Belge içeriği hiçbir zaman HTML olarak işlenmez:
// görünüm yalnız createElement, textContent ve tek tek verilen CSS özellikleriyle kurulur; XML düğümleri sayfaya
// taşınmaz, XML'deki öğe ya da öznitelik adları sayfada öğe adı olarak kullanılmaz.
(() => {
  if (!globalThis.UHD || globalThis.UHD.udf) return;

  const MiB = 1024 * 1024;
  const SINIR = Object.freeze({
    paket: 40 * MiB,          // UYAP'tan gelen dosya
    girdi: 1000,              // zip merkezî dizinindeki girdi
    icerik: 20 * MiB,         // açılmış content.xml (beyan ve fiilî sayaç)
    derinlik: 32,             // tablo → hücre → tablo iç içeliği
    blok: 30000,              // paragraf + tablo + resim
    parca: 200000,
    metin: 2 * MiB,           // ham metin havuzu değil, modeldeki bütün genişletilmiş metin
    paragrafMetin: 128 * 1024,
    paragrafParca: 4096,
    bolum: 300,
    gorunumMetin: 4 * MiB,    // yinelenen üst/alt bilgi dahil
    gorunumDugum: 100000,
    gorunumResim: 500,
    gorunumResimPiksel: 100e6,
    gorunumTuvalPiksel: 32e6,
    hucre: 50000,
    gezinti: 1000000,         // XML'de dolaşılan öğe (bilinmeyenler dahil)
    veriSatiri: 5000,         // şablon belgede çoğaltılan satır
    veriGezinti: 2000000,     // şablon verisinde alan aramaları
    stil: 1000,
    stilZinciri: 16,
    resim: 200,
    resimBayt: 10 * MiB,
    resimToplamBayt: 40 * MiB,
    resimKenar: 10000,
    resimPiksel: 40e6,
    resimToplamPiksel: 100e6,
    tuvalPiksel: 8e6,         // bir resmin çizildiği tuvalin en çok piksel sayısı
    sure: 8000,               // okuma ve model kurma için ms
    sutun: 64,
    kaplama: 64
  });

  const ILETI = {
    zip: 'Evrak açılamadı: dosya bozuk ya da UDF değil.',
    'content-xml-yok': 'UDF paketinde belge içeriği (content.xml) yok.',
    xml: 'Belge içeriği okunamadı (XML bozuk).',
    dtd: 'Belge güvenlik nedeniyle gösterilmedi (izin verilmeyen XML tanımı).',
    boyut: 'Belge görüntüleyicinin sınırından büyük; indirip açın.',
    belirsiz: 'Paket birden çok içerik dosyası taşıyor; güvenlik nedeniyle gösterilmedi.',
    desteklenmiyor: 'Tarayıcınız bu belgeyi açamıyor; Chrome’u güncelleyin.',
    sure: 'Belge zamanında hazırlanamadı; indirip açın.'
  };

  // kod: kısa neden; ayrinti yalnız teknik bilgidir (belge metni taşımaz), günlüğe yazılabilir.
  class UdfHatasi extends Error {
    constructor(kod, ayrinti = '') {
      super(ILETI[kod] || ILETI.zip);
      this.name = 'UdfHatasi';
      this.kod = kod;
      this.ayrinti = ayrinti;
    }
  }
  const hata = (kod, ayrinti) => new UdfHatasi(kod, ayrinti);
  const iptalMi = signal => !!(signal && signal.aborted);
  const iptalDenetle = signal => { if (iptalMi(signal)) throw new DOMException('Evrak okuma iptal edildi.', 'AbortError'); };
  const bekle = () => new Promise(r => setTimeout(r, 0));

  // ---------------------------------------------------------------- zip
  const CRC_TABLO = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = CRC_TABLO[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // Boyut ve CRC yalnız merkezî dizinden alınır: UYAP'ın Java tabanlı editörü DEFLATE girdileri veri tanımlayıcılı
  // yazar ve yerel başlıkta bu alanlar 0'dır.
  function zipGirdileri(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 22 || dv.getUint32(0, true) !== 0x04034b50) throw hata('zip', 'imza yok');
    let eocd = -1;
    for (let i = u8.length - 22, alt = Math.max(0, u8.length - 22 - 65535); i >= alt; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw hata('zip', 'dizin sonu yok');
    if (dv.getUint16(eocd + 4, true) || dv.getUint16(eocd + 6, true)) throw hata('zip', 'çok parçalı');
    const adet = dv.getUint16(eocd + 10, true);
    const mdBoyut = dv.getUint32(eocd + 12, true);
    const mdOfset = dv.getUint32(eocd + 16, true);
    if (adet === 0xffff || mdOfset === 0xffffffff || mdBoyut === 0xffffffff) throw hata('zip', 'ZIP64');
    if (adet > SINIR.girdi) throw hata('zip', 'girdi sınırı');
    if (mdOfset + mdBoyut > eocd) throw hata('zip', 'dizin taşıyor');
    const girdiler = [];
    let p = mdOfset;
    const son = mdOfset + mdBoyut;
    for (let k = 0; k < adet; k++) {
      if (p + 46 > son || dv.getUint32(p, true) !== 0x02014b50) throw hata('zip', 'dizin bozuk');
      const adUz = dv.getUint16(p + 28, true), ekUz = dv.getUint16(p + 30, true), notUz = dv.getUint16(p + 32, true);
      if (p + 46 + adUz + ekUz + notUz > son) throw hata('zip', 'dizin bozuk');
      const bayrak = dv.getUint16(p + 8, true);
      girdiler.push({
        bayrak, yontem: dv.getUint16(p + 10, true), crc: dv.getUint32(p + 16, true),
        sik: dv.getUint32(p + 20, true), acik: dv.getUint32(p + 24, true), yerel: dv.getUint32(p + 42, true),
        ad: new TextDecoder(bayrak & 0x800 ? 'utf-8' : 'windows-1252').decode(u8.subarray(p + 46, p + 46 + adUz)),
        mdOfset
      });
      p += 46 + adUz + ekUz + notUz;
    }
    return girdiler;
  }

  async function girdiAc(u8, g, ust, signal) {
    if (g.bayrak & 1) throw hata('zip', 'şifreli');
    if (g.acik > ust) throw hata('boyut', `beyan ${g.acik} bayt`);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (g.yerel + 30 > u8.length || dv.getUint32(g.yerel, true) !== 0x04034b50) throw hata('zip', 'yerel başlık yok');
    const bas = g.yerel + 30 + dv.getUint16(g.yerel + 26, true) + dv.getUint16(g.yerel + 28, true);
    if (bas + g.sik > Math.min(u8.length, g.mdOfset)) throw hata('zip', 'veri taşıyor');
    const ham = u8.subarray(bas, bas + g.sik);
    let cikti;
    if (g.yontem === 0) {
      if (g.sik !== g.acik) throw hata('zip', 'saklanmış girdi boyutu');
      cikti = ham.slice();
    } else if (g.yontem === 8) {
      // Açılan bayt sayılır: yalancı başlıkta beyanı ya da üst sınırı aşan akış durdurulur (zip bombası).
      const sinir = Math.min(g.acik, ust);
      const okuyucu = new Blob([ham]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const parcalar = [];
      let toplam = 0;
      try {
        for (;;) {
          if (iptalMi(signal)) { okuyucu.cancel().catch(() => {}); iptalDenetle(signal); }
          const { done, value } = await okuyucu.read();
          if (done) break;
          toplam += value.length;
          if (toplam > sinir) {
            okuyucu.cancel().catch(() => {});
            throw hata('boyut', 'açılan veri beyanı aştı');
          }
          parcalar.push(value);
        }
      } catch (e) {
        if (e instanceof UdfHatasi || (e && e.name === 'AbortError')) throw e;
        throw hata('zip', 'açılamadı');
      }
      if (toplam !== g.acik) throw hata('zip', 'boyut beyanla tutmuyor');
      cikti = new Uint8Array(toplam);
      let o = 0;
      for (const c of parcalar) { cikti.set(c, o); o += c.length; }
    } else throw hata('zip', `sıkıştırma ${g.yontem}`);
    if (crc32(cikti) !== g.crc) throw hata('zip', 'CRC-32');
    return cikti;
  }

  // ---------------------------------------------------------------- kodlama ve XML
  function metneCevir(b) {
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { metin: new TextDecoder('utf-8').decode(b), kodlama: 'utf-8' };
    if (b[0] === 0xff && b[1] === 0xfe) return { metin: new TextDecoder('utf-16le').decode(b), kodlama: 'utf-16le' };
    if (b[0] === 0xfe && b[1] === 0xff) return { metin: new TextDecoder('utf-16be').decode(b), kodlama: 'utf-16be' };
    const bas = new TextDecoder('windows-1252').decode(b.subarray(0, 256));
    const m = /^\s*<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]{1,40})["']/.exec(bas);
    for (const k of [m && m[1], 'utf-8', 'windows-1254']) {
      if (!k) continue;
      try { return { metin: new TextDecoder(k, { fatal: true }).decode(b), kodlama: k.toLowerCase() }; } catch { /* sonraki aday */ }
    }
    return { metin: new TextDecoder('windows-1254').decode(b), kodlama: 'windows-1254' };
  }

  // DTD ve varlık tanımı meşru UDF'de yoktur; tarayıcının XML çözücüsü iç varlıkları açtığı için önsözde görülen
  // tanım baştan reddedilir. Yalnız önsöze bakılır: metin havuzunda "<!DOCTYPE" yazan belge reddedilmez.
  function xmlCozumle(metin) {
    // Yorum/işlem talimatındaki "<x" kök başlangıcı değildir. Kökten sonraki
    // CDATA ve belge metni taranmaz; önsözdeki gerçek bildirimler çözülmeden reddedilir.
    let i = metin.charCodeAt(0) === 0xfeff ? 1 : 0;
    for (;;) {
      while (i < metin.length && /[\x20\t\r\n]/.test(metin[i])) i++;
      if (metin.startsWith('<!--', i)) {
        const son = metin.indexOf('-->', i + 4);
        if (son < 0 || metin.slice(i + 4, son).includes('--')) throw hata('xml', 'önsöz yorumu');
        i = son + 3; continue;
      }
      if (metin.startsWith('<?', i)) {
        const son = metin.indexOf('?>', i + 2);
        if (son < 0) throw hata('xml', 'önsöz işlem talimatı');
        i = son + 2; continue;
      }
      if (metin.startsWith('<!', i)) throw hata('dtd');
      if (metin[i] !== '<' || !/[A-Za-z_\u0080-\uffff]/.test(metin[i + 1] || '')) throw hata('xml', 'kök yok');
      break;
    }
    const doc = new DOMParser().parseFromString(metin, 'application/xml');
    if (doc.getElementsByTagNameNS('*', 'parsererror').length) throw hata('xml', 'parsererror');
    return doc;
  }

  const ad = el => (el.localName || '').toLowerCase();

  // Görüntüleyicinin esnek çözümlemesi korunur; PDF dışa aktarma için kaybolabilecek
  // özellikleri ayrı tanıyla bildirir. Dar profil dışındaki XML aynen reddedilir.
  function paketProfili(kok, signal) {
    const issues = []; let unsupported = 0;
    // Tanılarda belge metni/öznitelik değeri tutulmaz; yalnız özellik ve yapısal konum vardır.
    const issue = (code, path, message) => {
      unsupported++;
      if (issues.length < 20) issues.push({ code, path, message });
    };
    const result = () => ({ complete: unsupported === 0, unsupported, issues });
    if (ad(kok) !== 'template') {
      issue('format-root', 'document', 'UDF belge yapısı kurulu Editör biçimiyle uyuşmuyor.'); return result();
    }
    const font = ['family', 'size', 'bold', 'italic', 'underline', 'strikethrough', 'foreground', 'background', 'resolver', 'style'];
    const attrs = {
      template: ['format_id'], properties: [], elements: ['resolver'], styles: [],
      pageformat: ['mediasizename', 'paperorientation', 'leftmargin', 'rightmargin', 'topmargin', 'bottommargin', 'headerfoffset', 'footerfoffset'],
      paragraph: [...font, 'alignment', 'leftindent', 'rightindent', 'firstlineindent', 'spaceabove', 'spacebefore', 'spacebelow', 'spaceafter', 'linespacing', 'tabset'],
      content: [...font, 'startoffset', 'length'],
      style: [...font, 'name', 'parent', 'description'],
      pagebreak: [], br: [], linebreak: [], newline: [], space: []
    };
    const styles = new Map();
    for (const node of cocuk(kok, 'styles')?.children || []) {
      const name = String(oz(node, 'name') || '').toLowerCase();
      if (!name || styles.has(name) || styles.size >= SINIR.stil) {
        issue('style-definition', 'document/styles', 'UDF yazı stili tanımı eksik, yinelenmiş veya sınırı aşıyor.'); return result();
      }
      styles.set(name, node);
    }
    for (const node of styles.values()) {
      const chain = new Set(); let current = node;
      while (current) {
        if (chain.has(current) || chain.size >= SINIR.stilZinciri) {
          issue('style-cycle', 'document/styles', 'UDF yazı stilleri döngülü veya iç içe stil sınırını aşıyor.'); return result();
        }
        chain.add(current);
        current = styles.get(String(oz(current, 'resolver') || oz(current, 'parent') || '').toLowerCase());
      }
    }
    const pageSize = sayfaAyari(cocuk(kok, 'properties'));
    const textWidth = pageSize.en - pageSize.sol - pageSize.sag;
    const started = performance.now();
    const pending = [{ node: kok, path: 'document', depth: 0 }]; let seen = 0;
    while (pending.length) {
      const { node, path, depth } = pending.pop();
      if (depth > SINIR.derinlik) {
        issue('profile-depth', path, 'UDF özellik denetimi iç içe öğe sınırını aştı.'); return result();
      }
      if (++seen > SINIR.gezinti) {
        issue('profile-limit', path, 'UDF özellik denetimi öğe sınırını aştı.'); return result();
      }
      if (seen % 512 === 0) {
        iptalDenetle(signal);
        if (performance.now() - started > SINIR.sure) {
          issue('profile-timeout', path, 'UDF özellik denetimi süre sınırını aştı.'); return result();
        }
      }
      const tag = ad(node), allowed = attrs[tag];
      if (!allowed) {
        const names = { table: 'Tablo', image: 'Resim', header: 'Üst bilgi', footer: 'Alt bilgi',
          bgimage: 'Filigran', data: 'Şablon verisi', field: 'Şablon alanı', tab: 'Sekme' };
        issue('element', path, names[tag] ? `${names[tag]} düzeni bu UDF profilinde henüz desteklenmiyor.` :
          'UDF desteklenmeyen bir belge öğesi içeriyor.');
        // Bu özellik zaten belgeyi bloke eder; altındaki bilinmeyenleri çoğaltma.
        continue;
      }
      for (const attribute of node.attributes || []) {
        const key = attribute.localName.toLowerCase();
        if (!allowed?.includes(key)) {
          // Destek dışı öğenin alt özelliklerini ayrıca saymak aynı nedeni gereksiz çoğaltır.
          if (allowed) issue('attribute', path, 'UDF desteklenmeyen bir biçim özelliği içeriyor.');
          continue;
        }
        if (key === 'size' && (!Number.isFinite(sayi(attribute.value)) || sayi(attribute.value) < 4 || sayi(attribute.value) > 96))
          issue('font-size', path, 'UDF yazı boyutu geçersiz veya desteklenen aralığın dışında.');
        if (['bold', 'italic', 'underline', 'strikethrough'].includes(key) && mantik(attribute.value) === undefined)
          issue('font-style', path, 'UDF yazı biçimi değeri geçersiz.');
        if (['resolver', 'style', 'parent'].includes(key) && attribute.value &&
            !styles.has(attribute.value.toLowerCase())) issue('missing-style', path, 'UDF tanımlanmamış bir yazı stiline başvuruyor.');
        if (key === 'background') issue('color', path, 'Yazı zemini bu UDF profilinde henüz desteklenmiyor.');
        if (key === 'foreground') {
          const n = tamsayi(attribute.value);
          if (!Number.isFinite(n) || n < -2147483648 || n > 4294967295 || (n >>> 24) !== 255)
            issue('color', path, 'UDF yazı rengi geçersiz veya alfa bilgisi doğrulanmadı.');
        }
        if (['leftindent', 'rightindent'].includes(key) &&
            (!Number.isFinite(sayi(attribute.value)) || sayi(attribute.value) < 0 || sayi(attribute.value) > textWidth * 0.8))
          issue('paragraph-indent', path, 'UDF girintisi geçersiz veya desteklenen aralığın dışında.');
        if (key === 'firstlineindent' && (!Number.isFinite(sayi(attribute.value)) ||
            sayi(attribute.value) < -(sayi(oz(node, 'LeftIndent')) || 0) || sayi(attribute.value) > textWidth * 0.8))
          issue('paragraph-indent', path, 'UDF ilk satır girintisi geçersiz veya desteklenen aralığın dışında.');
        if (key === 'linespacing' && (!Number.isFinite(sayi(attribute.value)) || sayi(attribute.value) < 0 || sayi(attribute.value) > 3))
          issue('paragraph-spacing', path, 'UDF satır aralığı geçersiz veya desteklenen aralığın dışında.');
        if (key === 'tabset' && attribute.value.trim()) issue('tab-stop', path, 'Sekme durakları bu UDF profilinde henüz desteklenmiyor.');
        if (['spaceabove', 'spacebefore', 'spacebelow', 'spaceafter'].includes(key) &&
            (!Number.isFinite(sayi(attribute.value)) || sayi(attribute.value) < 0 || sayi(attribute.value) > 144))
          issue('paragraph-spacing', path, 'UDF paragraf boşluğu geçersiz veya desteklenen aralığın dışında.');
      }
      if (tag === 'template' && oz(node, 'format_id') !== '1.8')
        issue('format-version', path, 'UDF biçim sürümü henüz doğrulanmadı.');
      if (tag === 'elements' && oz(node, 'resolver') && oz(node, 'resolver').toLowerCase() !== 'hvl-default')
        issue('body-style', path, 'UDF gövde stilinin yerleşimi henüz doğrulanmadı.');
      if (ad(node) === 'pageformat') {
        if (!['1', '2', '3', 'A4', 'LETTER', 'LEGAL'].includes(String(oz(node, 'mediaSizeName') || '1').toUpperCase()))
          issue('page-size', path, 'UDF kâğıt ölçüsü desteklenmiyor.');
        if (!['1', '2', 'portrait', 'landscape'].includes(String(oz(node, 'paperOrientation') || '1').toLowerCase()))
          issue('page-orientation', path, 'UDF kâğıt yönü geçersiz.');
        const size = sayfaAyari({ children: [node] });
        for (const [key, max] of [['leftMargin', size.en], ['rightMargin', size.en], ['topMargin', size.boy], ['bottomMargin', size.boy]]) {
          const raw = oz(node, key);
          if (raw != null && (!Number.isFinite(sayi(raw)) || sayi(raw) < 0 || sayi(raw) > max * 0.4))
            issue('page-margin', path, 'UDF sayfa kenar boşluğu geçersiz veya desteklenen aralığın dışında.');
        }
      }
      if (tag === 'paragraph' && !['0', '1', '2', '3', 'left', 'center', 'right', 'justify', 'justified'].includes(String(oz(node, 'Alignment') || '0').toLowerCase()))
        issue('alignment', path, 'UDF paragraf hizalaması geçersiz.');
      // Ters push kaynak sırasını korur; konum değer veya belge metni taşımaz.
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i], childName = attrs[ad(child)] ? ad(child) : 'unsupported';
        pending.push({ node: child, path: `${path}/${childName}[${i + 1}]`.slice(-256), depth: depth + 1 });
      }
    }
    return result();
  }
  const cocuklar = (el, a) => Array.from(el.children).filter(c => ad(c) === a);
  const cocuk = (el, a) => { if (el) for (const c of el.children) if (ad(c) === a) return c; return null; };
  function oz(el, a) {
    if (!el) return null;
    const v = el.getAttribute(a);
    if (v !== null) return v;
    const k = a.toLowerCase();
    for (const x of el.attributes) if (x.localName.toLowerCase() === k) return x.value;
    return null;
  }
  const tamsayi = v => (/^-?\d{1,10}$/.test(String(v == null ? '' : v).trim()) ? Number(String(v).trim()) : NaN);
  // Editör Java double değerlerini 15+ ondalık basamakla da yazar. Uzunluğu sınırlı
  // gramer bu değerleri korur; NaN/Infinity ve keyfi metin yine kabul edilmez.
  const sayi = v => {
    const text = String(v == null ? '' : v).trim();
    if (text.length > 64 || !/^-?\d{1,9}(\.\d{1,18})?([eE][+-]?\d{1,3})?$/.test(text)) return NaN;
    const n = Number(text); return Number.isFinite(n) ? n : NaN;
  };
  const kistir = (v, a, b) => Math.min(b, Math.max(a, v));
  const mantik = v => { const s = String(v == null ? '' : v).trim().toLowerCase(); return s === 'true' || s === '1' ? true : s === 'false' || s === '0' ? false : undefined; };

  // Java rengi işaretli 32 bit ARGB tamsayıdır (-16777216 siyah); alfa atılır.
  function renk(v) {
    const n = tamsayi(v);
    if (!Number.isFinite(n) || Math.abs(n) > 0xffffffff) return null;
    const u = n >>> 0;
    return [(u >>> 16) & 255, (u >>> 8) & 255, u & 255];
  }

  // ---------------------------------------------------------------- resim
  function resimBaslik(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52) {
      return { tur: 'image/png', g: dv.getUint32(16), y: dv.getUint32(20) };
    }
    if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { tur: 'image/gif', g: dv.getUint16(6, true), y: dv.getUint16(8, true) };
    if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) {
      const eski = dv.getUint32(14, true) === 12;   // OS/2 başlığı: 16 bitlik boyutlar
      return eski ? { tur: 'image/bmp', g: dv.getUint16(18, true), y: dv.getUint16(20, true) }
        : { tur: 'image/bmp', g: Math.abs(dv.getInt32(18, true)), y: Math.abs(dv.getInt32(22, true)) };
    }
    if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) { o++; continue; }
        const m = b[o + 1];
        if (m === 0xff) { o++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { tur: 'image/jpeg', y: (b[o + 5] << 8) | b[o + 6], g: (b[o + 7] << 8) | b[o + 8] };
        o += 2 + ((b[o + 2] << 8) | b[o + 3]);
      }
    }
    return null;
  }

  // Yalnız sıkı base64 ve bilinen raster imzası kabul edilir; boyut başlıktan okunur, çok büyük resim çözülmez.
  function resimBilgi(veri, s) {
    if (++s.resimSayisi > SINIR.resim) return { red: 'sinir' };
    let v = String(veri == null ? '' : veri);
    if (/^\s*data:/i.test(v)) { const i = v.indexOf(','); v = i > 0 ? v.slice(i + 1) : ''; }
    v = v.replace(/\s+/g, '');
    if (!v || v.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return { red: 'bicim' };
    const tahmin = v.length / 4 * 3;
    if (tahmin > SINIR.resimBayt || s.resimBayt + tahmin > SINIR.resimToplamBayt) return { red: 'buyuk' };
    let bayt;
    try {
      const ikili = atob(v);
      bayt = new Uint8Array(ikili.length);
      for (let i = 0; i < ikili.length; i++) bayt[i] = ikili.charCodeAt(i);
    } catch { return { red: 'bicim' }; }
    s.resimBayt += bayt.length;
    const b = resimBaslik(bayt);
    if (!b) return { red: 'bicim' };
    if (!(b.g > 0 && b.y > 0) || b.g > SINIR.resimKenar || b.y > SINIR.resimKenar || b.g * b.y > SINIR.resimPiksel
      || s.resimPiksel + b.g * b.y > SINIR.resimToplamPiksel) return { red: 'buyuk', g: b.g, y: b.y };
    s.resimPiksel += b.g * b.y;
    return { tur: b.tur, g: b.g, y: b.y, bayt };
  }

  // width/height punto; biri yoksa oran korunur, hiçbiri yoksa doğal boyut (96 dpi) alınır. Metin alanına sığdırılır.
  function resimOlcu(el, r, enCok, boyCok) {
    let en = sayi(oz(el, 'width')), boy = sayi(oz(el, 'height'));
    const gecerli = v => Number.isFinite(v) && v > 0;
    const dEn = r.g > 0 ? r.g * 0.75 : 72, dBoy = r.y > 0 ? r.y * 0.75 : 72;
    if (!gecerli(en) && !gecerli(boy)) { en = dEn; boy = dBoy; }
    else if (!gecerli(en)) en = boy * dEn / dBoy;
    else if (!gecerli(boy)) boy = en * dBoy / dEn;
    const k = Math.min(1, enCok / en, boyCok / boy);
    return { en: Math.max(1, en * k), boy: Math.max(1, boy * k) };
  }

  // ---------------------------------------------------------------- stil
  const YAZI_VARSAYILAN = Object.freeze({ aile: 'Times New Roman', punto: 12, kalin: false, italik: false, alti: false, ustu: false, renk: null, zemin: null });

  function yaziOz(el) {
    const o = {};
    const aile = oz(el, 'family');
    if (aile) o.aile = aile;
    const p = sayi(oz(el, 'size'));
    if (Number.isFinite(p) && p >= 1 && p <= 400) o.punto = kistir(p, 4, 96);
    for (const [k, a] of [['kalin', 'bold'], ['italik', 'italic'], ['alti', 'underline'], ['ustu', 'strikethrough']]) {
      const v = mantik(oz(el, a));
      if (v !== undefined) o[k] = v;
    }
    const fg = renk(oz(el, 'foreground'));
    if (fg) o.renk = fg;
    const bg = renk(oz(el, 'background'));
    if (bg) o.zemin = bg;
    return o;
  }

  function stilCozucu(stylesEl) {
    const tablo = new Map();
    let n = 0;
    if (stylesEl) {
      for (const s of stylesEl.children) {
        if (ad(s) !== 'style') continue;
        if (++n > SINIR.stil) break;
        const isim = String(oz(s, 'name') || '').toLowerCase();
        if (!isim || tablo.has(isim)) continue;
        tablo.set(isim, { ust: String(oz(s, 'resolver') || oz(s, 'parent') || '').toLowerCase(), yazi: yaziOz(s) });
      }
    }
    const onbellek = new Map();
    // Zincir en üstten alta doğru uygulanır; döngü ve tanımsız üst güvenle durdurulur. "default" Swing arayüzünün
    // stilidir (Dialog 12), metne taban yapılmaz.
    function zincir(isim) {
      const k = String(isim || '').toLowerCase();
      if (!k) return null;
      if (onbellek.has(k)) return onbellek.get(k);
      const halkalar = [];
      const gorulen = new Set();
      for (let a = k; a && halkalar.length < SINIR.stilZinciri && !gorulen.has(a);) {
        gorulen.add(a);
        const s = tablo.get(a);
        if (!s) break;
        if (a !== 'default') halkalar.push(s.yazi);
        a = s.ust;
      }
      const sonuc = halkalar.length ? Object.assign({}, ...halkalar.reverse()) : null;
      onbellek.set(k, sonuc);
      return sonuc;
    }
    const taban = Object.freeze({ ...YAZI_VARSAYILAN, ...(zincir('hvl-default') || {}) });
    return { zincir, taban };
  }

  // ---------------------------------------------------------------- şablon + veri
  // UYAP'ın ürettiği form evrakında havuzda alan adları durur; değerler kökteki <data> ağacındadır.
  // Kapsam: aranacak düğümler + dış kapsam. Tekrarlı satır (dataRow) örneklerinin içine yalnız o satırın kapsamında inilir.
  const veriSatiriMi = el => String(oz(el, 'rowType') || '').toLowerCase() === 'datarow' && !!oz(el, 'rowName');

  function veriBaglayici(s) {
    function tara(dugumler, ziyaret) {
      const yigin = [...dugumler].reverse();
      while (yigin.length) {
        if (++s.veriGezinti > SINIR.veriGezinti) { s.kesildi = s.kesildi || 'oge'; return; }
        const el = yigin.pop();
        if (veriSatiriMi(el)) { ziyaret(el, true); continue; }
        if (ziyaret(el, false) === false) continue;
        for (let i = el.children.length - 1; i >= 0; i--) yigin.push(el.children[i]);
      }
    }
    function yapraklar(dugumler, anahtar) {
      const degerler = [];
      tara(dugumler, (el, satir) => {
        if (satir) return;
        if (!el.children.length && ad(el) === anahtar) {
          const t = el.textContent;
          if (t.trim() && !degerler.includes(t)) degerler.push(t);
        }
      });
      return degerler;
    }
    function gruplar(dugumler, anahtar) {
      const bulunan = [];
      tara(dugumler, (el, satir) => {
        if (satir) return;
        if (ad(el) === anahtar) { bulunan.push(el); return false; }
      });
      return bulunan;
    }
    function coz(kapsam, alan, grup, enCok = SINIR.paragrafMetin) {
      const birlestir = degerler => {
        let uzunluk = Math.max(0, degerler.length - 1);
        for (const deger of degerler) {
          uzunluk += deger.length;
          if (uzunluk > enCok) throw hata('boyut', 'alan metni');
        }
        return degerler.join('\n');
      };
      for (let k = kapsam; k; k = k.ust) {
        if (grup) {
          const g = gruplar(k.dugumler, grup);
          if (!g.length) continue;
          const d = alan ? yapraklar(g.flatMap(x => [...x.children]), alan) : [];
          return { grupVar: true, grupDolu: g.some(x => x.textContent.trim()), deger: d.length ? birlestir(d) : undefined };
        }
        const d = yapraklar(k.dugumler, alan);
        if (d.length) return { deger: birlestir(d) };
      }
      return { grupVar: false };
    }
    function satirOrnekleri(kapsam, satirAdi) {
      for (let k = kapsam; k; k = k.ust) {
        const bulunan = [];
        tara(k.dugumler, (el, satir) => { if (satir && String(oz(el, 'rowName')).toLowerCase() === satirAdi) bulunan.push(el); });
        if (bulunan.length) return bulunan;
      }
      return [];
    }
    return { coz, satirOrnekleri };
  }

  // Alan değerindeki HTML kalıntısı düz metne çevrilir; sonuç yalnız metin düğümü olarak kullanılır.
  const htmlsiz = v => v.replace(/\r\n?/g, '\n').replace(/<\s*br\b[^>]*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|tr|table|li)\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .split('\n').map(x => x.trim()).filter(Boolean).join('\n');

  // ---------------------------------------------------------------- model
  const HIZA = { 0: 'left', left: 'left', 1: 'center', center: 'center', 2: 'right', right: 'right', 3: 'justify', justify: 'justify', justified: 'justify' };
  const MADDE = ['•', '◦', '▪'];

  function romen(n) {
    const t = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let s = '';
    for (const [d, h] of t) while (n >= d) { s += h; n -= d; }
    return s;
  }
  function numaraYaz(n, tur) {
    const t = String(tur || '').toUpperCase();
    const buyuk = /UPPER|CAPITAL|BIG|BUYUK/.test(t);
    let s = /ROMAN/.test(t) ? romen(Math.min(n, 3999)) : /LETTER|ALPHA|HARF/.test(t) ? harfNumara(n) : String(n);
    if (buyuk) s = s.toLocaleUpperCase('tr');
    return s + (/PAREN/.test(t) ? ')' : '.');
  }
  function harfNumara(n) {
    let s = '';
    for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
    return s;
  }

  function sayfaAyari(props) {
    const pf = cocuk(props, 'pageformat');
    const boyut = String(oz(pf, 'mediaSizeName') || '1').trim().toUpperCase();
    let [en, boy] = boyut === '2' || boyut === 'LETTER' ? [612, 792] : boyut === '3' || boyut === 'LEGAL' ? [612, 1008] : [595.28, 841.89];
    const yon = String(oz(pf, 'paperOrientation') || '1').trim().toLowerCase();
    if (yon === '2' || yon === 'landscape') [en, boy] = [boy, en];
    const kenar = (a, vars, olcu) => { const v = sayi(oz(pf, a)); return Number.isFinite(v) && v >= 0 ? Math.min(v, olcu * 0.4) : vars; };
    return { en, boy, sol: kenar('leftMargin', 42.52, en), sag: kenar('rightMargin', 28.35, en), ust: kenar('topMargin', 42.52, boy), alt: kenar('bottomMargin', 14.17, boy) };
  }

  function modelKur(doc, { baslangic, signal }) {
    const kok = doc.documentElement;
    const havuz = (cocuk(kok, 'content') || { textContent: '' }).textContent;
    const govde = cocuk(kok, 'elements');
    if (!govde) throw hata('xml', 'elements yok');
    const props = cocuk(kok, 'properties');
    const veri = cocuk(kok, 'data');
    const sayfa = sayfaAyari(props);
    const metinEn = Math.max(72, sayfa.en - sayfa.sol - sayfa.sag);
    const metinBoy = Math.max(72, sayfa.boy - sayfa.ust - sayfa.alt);
    const { zincir, taban } = stilCozucu(cocuk(kok, 'styles'));
    const s = {
      kokAdi: ad(kok), paragraf: 0, tablo: 0, resimSayisi: 0, resimBayt: 0, resimPiksel: 0, resimReddi: 0, sayfaSonu: 0,
      blok: 0, parca: 0, metin: 0, hucre: 0, gezinti: 0, veriSatiri: 0, veriGezinti: 0, ofsetSorunu: 0, bilinmeyen: 0, kesildi: null
    };
    const bag = veri ? veriBaglayici(s) : null;
    const kokKapsam = veri ? { dugumler: [...veri.children], ust: null } : null;
    const listeler = new Map();   // ListId (ya da adsız liste) → düzey sayaçları
    let oncekiListe = null;

    const zamanDenetle = () => {
      if ((s.gezinti & 255) !== 0) return;
      iptalDenetle(signal);
      if (performance.now() - baslangic > SINIR.sure) s.kesildi = s.kesildi || 'sure';
    };

    const dilim = el => {
      const a = tamsayi(oz(el, 'startOffset')), u = tamsayi(oz(el, 'length'));
      if (!Number.isInteger(a) || !Number.isInteger(u) || a < 0 || u <= 0 || a >= havuz.length) { s.ofsetSorunu++; return { bas: 0, son: 0 }; }
      if (a + u > havuz.length) s.ofsetSorunu++;
      return { bas: a, son: Math.min(a + u, havuz.length) };
    };

    // Şablon belgede parçanın metni: alan ise veriden, gruba bağlı düz metinse grup doluysa. Yer tutucu adı hiç gösterilmez.
    function parcaMetni(c, kapsam, enCok) {
      const aralik = dilim(c);
      const ham = () => {
        if (aralik.son - aralik.bas > enCok) throw hata('boyut', 'genişletilmiş metin');
        return havuz.slice(aralik.bas, aralik.son);
      };
      if (!kapsam) return ham();
      const alan = String(oz(c, 'fieldName') || '').toLowerCase();
      const grup = String(oz(c, 'fieldGroupName') || '').toLowerCase();
      const sonSatir = aralik.son > aralik.bas && havuz[aralik.son - 1] === '\n' ? '\n' : '';
      if (!alan) {
        if (!grup) return ham();
        return bag.coz(kapsam, '', grup).grupDolu ? ham() : sonSatir;
      }
      if (alan === 'auto') return sonSatir;
      if (alan === 'eol') return (!grup || bag.coz(kapsam, 'eol', grup).grupVar ? '\n' : '') + sonSatir;
      if (alan === 'ceol') {
        const r = grup ? bag.coz(kapsam, 'ceol', grup) : {};
        return (String(r.deger || '').trim().toLowerCase() === 'true' ? '\n' : '') + sonSatir;
      }
      const r = bag.coz(kapsam, alan, grup, enCok - sonSatir.length);
      return (r.deger === undefined ? '' : htmlsiz(r.deger)) + sonSatir;
    }

    function listeBilgisi(p) {
      const madde = mantik(oz(p, 'Bulleted')) === true, numara = mantik(oz(p, 'Numbered')) === true;
      if (!madde && !numara) { oncekiListe = null; return null; }
      const tur = madde ? 'madde' : 'numara';
      const duzey = kistir(Number.isFinite(tamsayi(oz(p, 'ListLevel'))) ? tamsayi(oz(p, 'ListLevel')) : 0, 0, 8);
      const id = oz(p, 'ListId');
      // ListId yoksa ardışık aynı türdeki maddeler tek liste sayılır.
      let anahtar = id != null && id !== '' ? 'id:' + id : (oncekiListe && oncekiListe.startsWith('anon:' + tur) ? oncekiListe : `anon:${tur}:${s.paragraf}`);
      oncekiListe = anahtar;
      if (!listeler.has(anahtar)) listeler.set(anahtar, new Array(9).fill(0));
      const sayac = listeler.get(anahtar);
      sayac[duzey]++;
      for (let i = duzey + 1; i < 9; i++) sayac[i] = 0;
      let isaret;
      if (madde) {
        const bt = String(oz(p, 'BulletType') || '').toUpperCase();
        isaret = /DASH|LINE/.test(bt) ? '–' : /RECT|SQUARE/.test(bt) ? '▪' : MADDE[duzey % MADDE.length];
      } else isaret = numaraYaz(sayac[duzey], oz(p, 'NumberType'));
      return { tur, duzey, isaret };
    }

    function stilIcin(el, tabanStil) {
      const r = oz(el, 'resolver') || oz(el, 'style');
      const z = r ? zincir(r) : null;
      const temel = z ? { ...taban, ...z } : tabanStil;
      const kendi = yaziOz(el);
      return Object.keys(kendi).length ? { ...temel, ...kendi } : temel;
    }

    function paragraf(p, kapsam) {
      s.paragraf++;
      const pTaban = stilIcin(p, taban);
      const liste = listeBilgisi(p);
      const sol = kistir(sayi(oz(p, 'LeftIndent')) || 0, 0, metinEn * 0.8) + (liste ? liste.duzey * 18 : 0);
      const ilk = kistir(sayi(oz(p, 'FirstLineIndent')) || 0, -sol, metinEn * 0.8);
      const bosluk = (...adlar) => { for (const a of adlar) { const v = sayi(oz(p, a)); if (Number.isFinite(v)) return kistir(v, 0, 144); } return 0; };
      const duraklar = String(oz(p, 'TabSet') || '').split(',').slice(0, 32).map(x => sayi(x.split(':')[0]))
        .filter(v => Number.isFinite(v) && v > 0 && v <= metinEn).sort((a, b) => a - b);
      const model = {
        t: 'p', hiza: HIZA[String(oz(p, 'Alignment') || '0').trim().toLowerCase()] || 'left',
        sol, sag: kistir(sayi(oz(p, 'RightIndent')) || 0, 0, metinEn * 0.8), ilk,
        once: bosluk('SpaceAbove', 'SpaceBefore'), sonra: bosluk('SpaceBelow', 'SpaceAfter'),
        aralik: kistir(sayi(oz(p, 'LineSpacing')) || 0, 0, 3), aralikVar: oz(p, 'LineSpacing') != null,
        duraklar, liste, stil: pTaban, parcalar: []
      };
      const icTablolar = [];
      let paragrafMetin = 0, paragrafParca = 0;
      const ekle = parca => {
        const uzunluk = parca.t === 'metin' ? parca.yazi.length : parca.t === 'sekme' ? 1 : 0;
        if (paragrafMetin + uzunluk > SINIR.paragrafMetin || s.metin + uzunluk > SINIR.metin)
          throw hata('boyut', 'genişletilmiş metin');
        paragrafMetin += uzunluk; s.metin += uzunluk;
        model.parcalar.push(parca);
      };
      for (const c of p.children) {
        if (++s.gezinti > SINIR.gezinti) { s.kesildi = s.kesildi || 'oge'; break; }
        zamanDenetle();
        if (s.kesildi === 'sure') break;
        if (++paragrafParca > SINIR.paragrafParca) throw hata('boyut', 'paragraf parçası');
        if (++s.parca > SINIR.parca) { s.kesildi = s.kesildi || 'oge'; break; }
        const a = ad(c);
        if (a === 'table') { icTablolar.push(c); continue; }
        if (a === 'tab') { ekle({ t: 'sekme', stil: stilIcin(c, pTaban) }); continue; }
        if (a === 'space') { ekle({ t: 'metin', yazi: ' ', stil: stilIcin(c, pTaban) }); continue; }
        if (a === 'br' || a === 'linebreak' || a === 'newline') { ekle({ t: 'metin', yazi: '\n', stil: pTaban }); continue; }
        if (a === 'image') {
          const r = resimBilgi(oz(c, 'imageData') || oz(c, 'data'), s);
          if (r.red) s.resimReddi++;
          ekle({ t: 'resim', r, ...resimOlcu(c, r, metinEn, metinBoy) });
          continue;
        }
        // content, field ve adı bilinmeyen ama havuzu gösteren öğeler metindir; böylece metin kaybolmaz.
        if (a === 'content' || a === 'field' || oz(c, 'startOffset') != null) {
          if (a !== 'content' && a !== 'field') s.bilinmeyen++;
          const yazi = parcaMetni(c, kapsam, Math.min(SINIR.metin - s.metin, SINIR.paragrafMetin - paragrafMetin));
          if (yazi) ekle({ t: 'metin', yazi, stil: stilIcin(c, pTaban) });
        } else s.bilinmeyen++;
      }
      // Paragrafın son parçası paragraf sonu "\n"ini de kapsar; o satır sonu gösterilmez.
      for (let i = model.parcalar.length - 1; i >= 0; i--) {
        const x = model.parcalar[i];
        if (x.t !== 'metin') break;
        if (x.yazi.endsWith('\n')) { x.yazi = x.yazi.slice(0, -1); if (!x.yazi) model.parcalar.splice(i, 1); }
        break;
      }
      return { model, icTablolar };
    }

    function tablo(t, d, kapsam) {
      s.tablo++;
      const agirlik = String(oz(t, 'columnSpans') || '').split(',').filter(x => x.trim()).slice(0, SINIR.sutun)
        .map(x => { const v = sayi(x); return Number.isFinite(v) && v > 0 ? Math.min(v, 1e6) : 1; });
      const kenarAd = String(oz(t, 'border') == null ? 'bordertable' : oz(t, 'border')).trim().toLowerCase();
      const model = { t: 'tablo', kenar: !['none', 'bordernone', 'false', '0', ''].includes(kenarAd), agirlik, satirlar: [], sutun: 1 };
      for (const r of cocuklar(t, 'row')) {
        if (s.kesildi === 'oge' || s.kesildi === 'sure') break;
        const ornekler = kapsam && veriSatiriMi(r) ? bag.satirOrnekleri(kapsam, String(oz(r, 'rowName')).toLowerCase()) : [];
        const kapsamlar = ornekler.length ? ornekler.map(o => ({ dugumler: [...o.children], ust: kapsam })) : [kapsam];
        for (const k of kapsamlar) {
          if (ornekler.length && ++s.veriSatiri > SINIR.veriSatiri) { s.kesildi = s.kesildi || 'veri-satiri'; break; }
          const satir = [];
          let genislik = 0;
          for (const h of cocuklar(r, 'cell')) {
            if (++s.hucre > SINIR.hucre) { s.kesildi = s.kesildi || 'oge'; break; }
            const cs = kistir(tamsayi(oz(h, 'colspan')) || 1, 1, SINIR.kaplama);
            const rs = kistir(tamsayi(oz(h, 'rowspan')) || 1, 1, SINIR.kaplama);
            const dikeyAd = String(oz(h, 'vAlign') || oz(h, 'align') || '').toLowerCase();
            satir.push({
              cs, rs, zemin: renk(oz(h, 'fillColor') || oz(h, 'bgColor') || oz(h, 'cellColor')),
              dikey: /center|middle/.test(dikeyAd) ? 'middle' : /bottom/.test(dikeyAd) ? 'bottom' : 'top',
              bloklar: bloklar(h, d + 1, k)
            });
            genislik += cs;
          }
          model.sutun = Math.max(model.sutun, genislik);
          model.satirlar.push(satir);
        }
      }
      model.sutun = kistir(Math.max(model.sutun, agirlik.length), 1, SINIR.sutun);
      return model;
    }

    function blokResim(c) {
      const r = resimBilgi(oz(c, 'imageData') || oz(c, 'data'), s);
      if (r.red) s.resimReddi++;
      return { t: 'resim', r, ...resimOlcu(c, r, metinEn, metinBoy) };
    }

    // Blok listesi. Açık sayfa sonları yalnız en üst düzeyde bölüm ayırır (bolumler verildiğinde).
    function bloklar(el, d, kapsam, bolumler) {
      const out = [];
      if (bolumler) {
        if (bolumler.length >= SINIR.bolum) throw hata('boyut', 'bölüm');
        bolumler.push(out);
      }
      if (d > SINIR.derinlik) { s.kesildi = s.kesildi || 'derinlik'; return out; }
      let hedef = out;
      for (const c of el.children) {
        if (s.kesildi === 'oge' || s.kesildi === 'sure') break;
        if (++s.gezinti > SINIR.gezinti) { s.kesildi = s.kesildi || 'oge'; break; }
        zamanDenetle();
        const a = ad(c);
        if (a === 'page-break' || a === 'pagebreak') {
          s.sayfaSonu++;
          if (bolumler) {
            if (bolumler.length >= SINIR.bolum) throw hata('boyut', 'bölüm');
            hedef = []; bolumler.push(hedef);
          }
          continue;
        }
        if (a === 'header' || a === 'footer') {
          if (bolumler && d === 0 && !s[a]) s[a] = bloklar(c, d + 1, kapsam);
          continue;
        }
        if (a !== 'paragraph' && a !== 'table' && a !== 'image') { s.bilinmeyen++; continue; }
        if (++s.blok > SINIR.blok) { s.kesildi = s.kesildi || 'oge'; break; }
        if (a === 'paragraph') {
          const { model, icTablolar } = paragraf(c, kapsam);
          hedef.push(model);
          for (const t of icTablolar) {
            if (d + 1 > SINIR.derinlik) { s.kesildi = s.kesildi || 'derinlik'; break; }
            hedef.push(tablo(t, d + 1, kapsam));
          }
        } else if (a === 'table') {
          if (d + 1 > SINIR.derinlik) { s.kesildi = s.kesildi || 'derinlik'; continue; }
          hedef.push(tablo(c, d + 1, kapsam));
        } else hedef.push(blokResim(c));
      }
      return out;
    }

    const bolumler = [];
    bloklar(govde, 0, kokKapsam, bolumler);

    let filigran = null;
    const bg = cocuk(props, 'bgimage');
    if (bg && mantik(oz(bg, 'bgImageWatermark')) === true) {
      const r = resimBilgi(oz(bg, 'bgImageData'), s);
      if (!r.red) filigran = r;
    }
    return {
      sayfa, metinEn, taban, bolumler, ust: s.header || null, alt: s.footer || null, filigran,
      sablon: !!veri, kesildi: s.kesildi, kokAdi: s.kokAdi,
      sayac: { paragraf: s.paragraf, tablo: s.tablo, resim: s.resimSayisi, resimReddi: s.resimReddi, sayfaSonu: s.sayfaSonu, ofsetSorunu: s.ofsetSorunu, bilinmeyen: s.bilinmeyen, veriSatiri: s.veriSatiri, blok: s.blok }
    };
  }

  // Blobu okur ve düz JS modeli döndürür; XML belgesine ait hiçbir düğüm modelde kalmaz.
  async function oku(blob, { signal, paket = false } = {}) {
    const baslangic = performance.now();
    try { new DecompressionStream('deflate-raw'); } catch { throw hata('desteklenmiyor'); }
    if (!blob || blob.size > SINIR.paket) throw hata('boyut', 'paket');
    const u8 = new Uint8Array(await blob.arrayBuffer());
    iptalDenetle(signal);
    const girdiler = zipGirdileri(u8);
    const icerik = girdiler.filter(g => g.ad.replace(/^(\.?\/)+/, '').toLowerCase() === 'content.xml');
    if (!icerik.length) throw hata('content-xml-yok');
    if (icerik.length > 1) throw hata('belirsiz');
    const bayt = await girdiAc(u8, icerik[0], SINIR.icerik, signal);
    iptalDenetle(signal);
    const { metin, kodlama } = metneCevir(bayt);
    const xml = xmlCozumle(metin);
    const model = modelKur(xml, { baslangic, signal });
    if (paket) {
      model.paketTani = paketProfili(xml.documentElement, signal);
      if (girdiler.length !== 1) model.paketTani = { ...model.paketTani, complete: false,
        unsupported: model.paketTani.unsupported + 1,
        issues: [...model.paketTani.issues.slice(0, 19), { code: 'package-entry', path: 'archive',
          message: 'UDF ek paket girdileri içeriyor; bütün içerik doğrulanmadan dönüştürülemez.' }] };
    }
    model.kodlama = kodlama;
    model.imza = girdiler.some(g => /(^|\/)sign\.sgn$/i.test(g.ad));
    model.sure = Math.round(performance.now() - baslangic);
    return model;
  }

  // ---------------------------------------------------------------- çizim
  // Java'nın mantıksal yazı tipleri eşlenir; öteki adlar yalnız harf, rakam, boşluk, nokta, alt çizgi ve tireden
  // oluşuyorsa tırnak içinde kullanılır.
  const MANTIKSAL = { dialog: 'sans-serif', sansserif: 'sans-serif', serif: 'serif', monospaced: 'monospace', dialoginput: 'monospace' };
  function aileListesi(a) {
    const ad = String(a || '').trim();
    const m = MANTIKSAL[ad.toLowerCase()];
    if (m) return m === 'monospace' ? '"Courier New", monospace' : m === 'sans-serif' ? 'Arial, sans-serif' : '"Times New Roman", serif';
    if (/^[\p{L}\p{N} ._-]{1,64}$/u.test(ad)) return `"${ad}", "Times New Roman", serif`;
    return '"Times New Roman", serif';
  }
  const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const pt = v => `${Math.round(v * 100) / 100}pt`;
  const beyazMi = c => c && c[0] === 255 && c[1] === 255 && c[2] === 255;

  // Çizim modeli tekrar kullanır: üst/alt bilgi her bölümde yeni DOM ve tuval
  // üretir. Bu çarpanlar ilk sayfa kabuğu bile ayrılmadan hesaba katılır.
  function gorunumDenetle(model, signal) {
    if (!Array.isArray(model.bolumler) || model.bolumler.length > SINIR.bolum) throw hata('boyut', 'bölüm');
    const toplam = { metin: 0, dugum: 0, resim: 0, resimPiksel: 0, tuvalPiksel: 0 };
    const ust = { metin: SINIR.gorunumMetin, dugum: SINIR.gorunumDugum, resim: SINIR.gorunumResim,
      resimPiksel: SINIR.gorunumResimPiksel, tuvalPiksel: SINIR.gorunumTuvalPiksel };
    let ziyaret = 0;
    const ekle = (tur, n, tekrar = 1) => {
      const maliyet = n * tekrar;
      if (!Number.isSafeInteger(maliyet) || maliyet < 0 || toplam[tur] + maliyet > ust[tur])
        throw hata('boyut', 'görünüm ' + tur);
      toplam[tur] += maliyet;
    };
    const resim = (r, en, boy, tekrar) => {
      ekle('dugum', r.red ? 1 : 2, tekrar);
      if (r.red) { ekle('metin', 40, tekrar); return; }
      const g = Math.max(1, Math.round(en / 0.75 * 2)), y = Math.max(1, Math.round(boy / 0.75 * 2));
      ekle('resim', 1, tekrar);
      ekle('resimPiksel', r.g * r.y, tekrar);
      ekle('tuvalPiksel', Math.min(g * y, SINIR.tuvalPiksel), tekrar);
    };
    function bloklar(liste, tekrar, derinlik = 0) {
      if (!Array.isArray(liste) || derinlik > SINIR.derinlik) throw hata('boyut', 'görünüm yapı');
      for (const b of liste) {
        if ((++ziyaret & 255) === 0) iptalDenetle(signal);
        if (b.t === 'p') {
          ekle('dugum', 2, tekrar); // paragraf ve olası boş satır
          if (!Array.isArray(b.parcalar) || b.parcalar.length > SINIR.paragrafParca) throw hata('boyut', 'paragraf parçası');
          if (b.liste) { ekle('dugum', 1, tekrar); ekle('metin', String(b.liste.isaret).length + 1, tekrar); }
          let uzunluk = 0;
          for (const c of b.parcalar) {
            if (c.t === 'resim') { resim(c.r, c.en, c.boy, tekrar); continue; }
            const n = c.t === 'sekme' ? 1 : typeof c.yazi === 'string' ? c.yazi.length : NaN;
            uzunluk += n;
            if (!Number.isSafeInteger(uzunluk) || uzunluk > SINIR.paragrafMetin) throw hata('boyut', 'paragraf metni');
            ekle('dugum', 1, tekrar); ekle('metin', n, tekrar);
          }
        } else if (b.t === 'tablo') {
          ekle('dugum', 3 + b.sutun, tekrar);
          for (const satir of b.satirlar) {
            ekle('dugum', 1, tekrar);
            for (const hucre of satir) { ekle('dugum', 1, tekrar); bloklar(hucre.bloklar, tekrar, derinlik + 1); }
          }
        } else if (b.t === 'resim') {
          ekle('dugum', 1, tekrar); resim(b.r, b.en, b.boy, tekrar);
        } else throw hata('xml', 'görünüm öğesi');
      }
    }
    iptalDenetle(signal);
    const n = model.bolumler.length;
    ekle('dugum', 1 + n);
    for (const bolum of model.bolumler) {
      ekle('dugum', Math.ceil(bolum.length / 200)); bloklar(bolum, 1);
    }
    for (const bilgi of [model.ust, model.alt]) if (bilgi) { ekle('dugum', 1, n); bloklar(bilgi, n); }
    if (model.filigran) {
      const p = model.sayfa;
      const g = Math.max(1, Math.round((p.en - p.sol - p.sag) / 0.75));
      const y = Math.max(1, Math.round((p.boy - p.ust - p.alt) / 0.75));
      ekle('dugum', 1, n); ekle('resim', 1, n); ekle('tuvalPiksel', g * y, n);
      ekle('resimPiksel', model.filigran.g * model.filigran.y); // bitmap ortak, tuval sayfa başına
    }
    return toplam;
  }

  function ciz(model, { signal, kaydirma } = {}) {
    gorunumDenetle(model, signal);
    const E = (etiket, sinif) => { const e = document.createElement(etiket); if (sinif) e.className = sinif; return e; };
    const { sayfa, taban } = model;
    const tabanAile = aileListesi(taban.aile);
    const olcum = document.createElement('canvas').getContext('2d');
    const bitmapler = new Set();
    let gozlemci = null, bitti = false;
    const bekleyen = new Map();   // tuval → çizim işi

    const kok = E('div', 'udf');
    kok.setAttribute('role', 'document');
    kok.setAttribute('aria-label', 'UDF evrakı');
    kok.lang = 'tr';

    // Parçanın biçimi paragraf ya da sayfa tabanından farklıysa tek tek CSS özelliği olarak verilir.
    function bicimle(e, st, ust) {
      if (st.aile !== ust.aile) e.style.setProperty('font-family', aileListesi(st.aile));
      if (st.punto !== ust.punto) e.style.setProperty('font-size', pt(st.punto));
      if (st.kalin !== ust.kalin) e.style.setProperty('font-weight', st.kalin ? '700' : '400');
      if (st.italik !== ust.italik) e.style.setProperty('font-style', st.italik ? 'italic' : 'normal');
      const cizgi = [st.alti && 'underline', st.ustu && 'line-through'].filter(Boolean).join(' ');
      const ustCizgi = [ust.alti && 'underline', ust.ustu && 'line-through'].filter(Boolean).join(' ');
      if (cizgi !== ustCizgi) e.style.setProperty('text-decoration-line', cizgi || 'none');
      const r = st.renk ? rgb(st.renk) : '', ur = ust.renk ? rgb(ust.renk) : '';
      if (r !== ur) e.style.setProperty('color', r || 'rgb(0, 0, 0)');
      if (st.zemin && !beyazMi(st.zemin)) e.style.setProperty('background-color', rgb(st.zemin));
    }
    const fontKisa = st => `${st.italik ? 'italic ' : ''}${st.kalin ? '700 ' : ''}${st.punto}pt ${aileListesi(st.aile)}`;
    const genislikPt = (metin, st) => { olcum.font = fontKisa(st); return olcum.measureText(metin).width * 0.75; };

    // Resimler görünür alana yaklaşınca çözülür; tuval görüntü boyutunda tutulur.
    function resimTuvali(r, en, boy) {
      const kutu = E('span', 'udf-resim');
      // Resim dar hücreye sığmazsa oranı korunarak küçülür; gösterilemeyen resmin kutusu yazısı sığacak kadar büyüyebilir.
      if (r.red) {
        kutu.style.setProperty('min-width', pt(en));
        kutu.style.setProperty('min-height', pt(boy));
      } else {
        kutu.style.setProperty('width', pt(en));
        kutu.style.setProperty('aspect-ratio', `${Math.round(en * 100) / 100} / ${Math.round(boy * 100) / 100}`);
      }
      if (r.red) {
        kutu.classList.add('red');
        kutu.textContent = r.red === 'buyuk' ? '[Resim gösterilemedi: çok büyük]' : '[Resim gösterilemedi]';
        return kutu;
      }
      const tuval = E('canvas');
      tuval.setAttribute('role', 'img');
      tuval.setAttribute('aria-label', 'Belgedeki resim');
      kutu.append(tuval);
      bekleyen.set(tuval, { r, en, boy, kutu });
      if (gozlemci) gozlemci.observe(tuval);
      return kutu;
    }
    async function resimCiz(tuval) {
      const is = bekleyen.get(tuval);
      if (!is) return;
      bekleyen.delete(tuval);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let g = Math.max(1, Math.round(is.en / 0.75 * dpr)), y = Math.max(1, Math.round(is.boy / 0.75 * dpr));
      const k = Math.min(1, Math.sqrt(SINIR.tuvalPiksel / (g * y)));
      g = Math.max(1, Math.floor(g * k)); y = Math.max(1, Math.floor(y * k));
      let bmp = null;
      try {
        bmp = await createImageBitmap(new Blob([is.r.bayt], { type: is.r.tur }), { resizeWidth: g, resizeHeight: y, resizeQuality: 'high' });
        if (bitti === 'birakildi') return;
        tuval.width = g; tuval.height = y;
        tuval.getContext('2d').drawImage(bmp, 0, 0, g, y);
      } catch {
        is.kutu.classList.add('red');
        is.kutu.textContent = '[Resim gösterilemedi]';
      } finally { if (bmp) bmp.close(); }
    }

    let filigranBmp = null, filigranIs = null;
    function filigranCiz(tuval) {
      const r = model.filigran;
      const g = tuval.width = Math.max(1, Math.round((sayfa.en - sayfa.sol - sayfa.sag) / 0.75));
      const y = tuval.height = Math.max(1, Math.round((sayfa.boy - sayfa.ust - sayfa.alt) / 0.75));
      const yaz = bmp => {
        const k = Math.min(g / bmp.width, y / bmp.height);
        const w = bmp.width * k, h = bmp.height * k;
        tuval.getContext('2d').drawImage(bmp, (g - w) / 2, (y - h) / 2, w, h);
      };
      if (filigranBmp) return yaz(filigranBmp);
      if (!filigranIs) filigranIs = createImageBitmap(new Blob([r.bayt], { type: r.tur })).then(bmp => {
        if (bitti === 'birakildi') { bmp.close(); return null; }
        filigranBmp = bmp; bitmapler.add(bmp); return bmp;
      });
      filigranIs.then(bmp => { if (bmp && bitti !== 'birakildi') yaz(bmp); }).catch(() => {});
    }

    function paragrafCiz(p) {
      const d = E('div', 'udf-p');
      const st = d.style;
      if (p.hiza !== 'left') st.setProperty('text-align', p.hiza);
      if (p.sol) st.setProperty('margin-left', pt(p.sol));
      if (p.sag) st.setProperty('margin-right', pt(p.sag));
      if (p.ilk) st.setProperty('text-indent', pt(p.ilk));
      if (p.once) st.setProperty('padding-top', pt(p.once));
      if (p.sonra) st.setProperty('padding-bottom', pt(p.sonra));
      if (p.aralik) st.setProperty('line-height', String(Math.round(1.15 * (1 + p.aralik) * 1000) / 1000));
      bicimle(d, p.stil, taban);
      // Sekmeler: durak, metnin o satırdaki genişliği ölçülerek seçilir; sekme karakterinin genişliğini tarayıcı
      // o durağa göre verir (tab-size). Durak yoksa 36 pt aralıklı varsayılan duraklar kullanılır.
      const sekmeli = p.parcalar.some(c => c.t === 'sekme');
      let x = p.ilk;
      if (p.liste) {
        const im = E('span', 'udf-isaret');
        im.textContent = p.liste.isaret + ' ';
        if (sekmeli) x += genislikPt(im.textContent, p.stil);
        d.append(im);
      }
      let bos = true;
      for (const c of p.parcalar) {
        if (c.t === 'metin') {
          const sp = E('span');
          sp.textContent = c.yazi;
          bicimle(sp, c.stil, p.stil);
          d.append(sp);
          if (c.yazi.trim()) bos = false;
          if (sekmeli) {
            const satirlar = c.yazi.split('\n');
            if (satirlar.length > 1) x = 0;
            x += genislikPt(satirlar[satirlar.length - 1], c.stil);
          }
        } else if (c.t === 'sekme') {
          const durak = p.duraklar.find(v => v > x + 0.01) || (Math.floor(x / 36) + 1) * 36;
          const sp = E('span', 'udf-sekme');
          sp.textContent = '\t';
          sp.style.setProperty('tab-size', pt(durak));
          bicimle(sp, c.stil, p.stil);
          d.append(sp);
          x = durak;
        } else if (c.t === 'resim') {
          d.append(resimTuvali(c.r, c.en, c.boy));
          x += c.en;
          bos = false;
        }
      }
      if (bos && !sekmeli) {
        const sp = E('span');
        sp.textContent = ' ';
        d.append(sp);
      }
      return d;
    }

    function tabloCiz(t) {
      const tb = E('table', 'udf-tablo' + (t.kenar ? ' kenarli' : ''));
      const cg = E('colgroup');
      // Ağırlığı verilmeyen sütun, verilenlerin ortalamasını alır.
      const ort = t.agirlik.length ? t.agirlik.reduce((a, b) => a + b, 0) / t.agirlik.length : 1;
      const agirlik = Array.from({ length: t.sutun }, (_, i) => t.agirlik[i] || ort);
      const toplam = agirlik.reduce((a, b) => a + b, 0) || 1;
      for (const w of agirlik) {
        const col = E('col');
        col.style.setProperty('width', `${Math.max(0, Math.round(w / toplam * 10000) / 100)}%`);
        cg.append(col);
      }
      tb.append(cg);
      const govde = E('tbody');
      for (const satir of t.satirlar) {
        const tr = E('tr');
        for (const h of satir) {
          const td = E('td');
          td.colSpan = Math.min(h.cs, t.sutun);
          td.rowSpan = h.rs;
          if (h.zemin && !beyazMi(h.zemin)) td.style.setProperty('background-color', rgb(h.zemin));
          if (h.dikey !== 'top') td.style.setProperty('vertical-align', h.dikey);
          for (const b of h.bloklar) td.append(blokCiz(b));
          tr.append(td);
        }
        govde.append(tr);
      }
      tb.append(govde);
      return tb;
    }

    function blokCiz(b) {
      if (b.t === 'p') return paragrafCiz(b);
      if (b.t === 'tablo') return tabloCiz(b);
      const d = E('div', 'udf-blokresim');
      d.append(resimTuvali(b.r, b.en, b.boy));
      return d;
    }

    function ekBilgi(bloklar, sinif) {
      const d = E('div', sinif);
      for (const b of bloklar) d.append(blokCiz(b));
      return d;
    }

    function sayfaDiv() {
      const s = E('div', 'udf-sayfa');
      const st = s.style;
      st.setProperty('width', pt(sayfa.en));
      st.setProperty('min-height', pt(sayfa.boy));
      st.setProperty('padding', `${pt(sayfa.ust)} ${pt(sayfa.sag)} ${pt(sayfa.alt)} ${pt(sayfa.sol)}`);
      st.setProperty('font-family', tabanAile);
      st.setProperty('font-size', pt(taban.punto));
      if (taban.kalin) st.setProperty('font-weight', '700');
      if (taban.italik) st.setProperty('font-style', 'italic');
      if (taban.renk) st.setProperty('color', rgb(taban.renk));
      if (model.filigran) {
        const f = E('canvas', 'udf-filigran');
        f.setAttribute('aria-hidden', 'true');
        f.style.setProperty('left', pt(sayfa.sol));
        f.style.setProperty('top', pt(sayfa.ust));
        f.style.setProperty('width', pt(sayfa.en - sayfa.sol - sayfa.sag));
        f.style.setProperty('height', pt(sayfa.boy - sayfa.ust - sayfa.alt));
        s.append(f);
        filigranCiz(f);
      }
      return s;
    }

    // Uzun belge dilimlerle eklenir: ilk dilim hemen görünür, kalanlar sırayla; ekran dışındaki dilimler
    // content-visibility ile ucuzlar.
    const DILIM = 200;
    const isler = [];
    for (let i = 0; i < model.bolumler.length; i++) {
      const bloklar = model.bolumler[i];
      const sd = sayfaDiv();
      isler.push(() => {
        if (model.ust) sd.append(ekBilgi(model.ust, 'udf-ust'));
        kok.append(sd);
      });
      for (let j = 0; j < bloklar.length; j += DILIM) {
        isler.push(() => {
          const dl = E('div', 'udf-dilim');
          for (const b of bloklar.slice(j, j + DILIM)) dl.append(blokCiz(b));
          sd.append(dl);
        });
      }
      isler.push(() => { if (model.alt) sd.append(ekBilgi(model.alt, 'udf-alt')); });
    }
    if (model.kesildi) {
      isler.push(() => {
        const n = E('div', 'udf-not');
        n.textContent = model.kesildi === 'sure'
          ? 'Belgenin hazırlanması uzun sürdü; ilk bölüm gösteriliyor. Tamamı için indirin ya da UYAP’ta açın.'
          : 'Belge çok uzun ya da karmaşık; ilk bölüm gösteriliyor. Tamamı için indirin ya da UYAP’ta açın.';
        kok.append(n);
      });
    }

    if (typeof IntersectionObserver === 'function') {
      gozlemci = new IntersectionObserver(girdiler => {
        for (const g of girdiler) {
          if (!g.isIntersecting) continue;
          gozlemci.unobserve(g.target);
          resimCiz(g.target);
        }
      }, { root: kaydirma || null, rootMargin: '800px 0px' });
    }

    // İlk dilimler eşzamanlı çizilir; gerisi denetimi sayfaya bırakarak eklenir.
    let sira = 0;
    const t0 = performance.now();
    while (sira < isler.length && (sira < 3 || performance.now() - t0 < 30)) isler[sira++]();
    const bitis = (async () => {
      while (sira < isler.length) {
        await bekle();
        if (iptalMi(signal) || bitti === 'birakildi') return false;
        const t = performance.now();
        while (sira < isler.length && performance.now() - t < 12) isler[sira++]();
      }
      bitti = true;
      return true;
    })();
    if (!gozlemci) for (const tv of [...bekleyen.keys()]) resimCiz(tv);

    return {
      kok,
      bitti: bitis,
      dogalEn: Math.ceil(sayfa.en / 0.75),
      olcekle: z => { kok.style.setProperty('zoom', String(z)); },
      birak() {
        bitti = 'birakildi';
        if (gozlemci) gozlemci.disconnect();
        bekleyen.clear();
        for (const b of bitmapler) b.close();
        bitmapler.clear();
        for (const tv of kok.querySelectorAll('canvas')) { tv.width = 0; tv.height = 0; }
      },
      ozet: {
        tur: 'UDF', bolum: model.bolumler.length, sablon: model.sablon, imza: !!model.imza, kesildi: model.kesildi,
        resimReddi: model.sayac.resimReddi, sayac: model.sayac, sure: model.sure, kodlama: model.kodlama
      }
    };
  }

  const CSS = `
.viewer .udf{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px 8px 24px;width:max-content;min-width:100%;box-sizing:border-box}
.viewer .udf-sayfa{position:relative;box-sizing:border-box;background:#fff;color:#000;box-shadow:0 1px 4px rgba(16,24,40,.25);line-height:1.15;font-kerning:normal;text-rendering:optimizeLegibility;color-scheme:light}
.viewer .udf-dilim{content-visibility:auto;contain-intrinsic-size:auto 800px;position:relative}
.viewer .udf-p{white-space:pre-wrap;overflow-wrap:anywhere;tab-size:36pt}
.viewer .udf-sekme{white-space:pre}
.viewer .udf-tablo{table-layout:fixed;width:100%;border-collapse:collapse;margin:0}
.viewer .udf-tablo td{padding:2pt;vertical-align:top;overflow-wrap:anywhere}
.viewer .udf-tablo.kenarli td{border:1px solid #000}
.viewer .udf-resim{display:inline-block;vertical-align:bottom;max-width:100%}
.viewer .udf-resim canvas{display:block;width:100%;height:100%}
.viewer .udf-resim.red{display:inline-flex;align-items:center;justify-content:center;border:1px dashed #98a2b3;color:#475467;font:9pt/1.2 "Segoe UI",system-ui,sans-serif;font-style:normal;font-weight:400;text-indent:0;text-align:center;box-sizing:border-box;padding:2px 4px;white-space:normal}
.viewer .udf-blokresim{line-height:0}
.viewer .udf-filigran{position:absolute;opacity:.15;pointer-events:none}
.viewer .udf-ust,.viewer .udf-alt{color:#667085;font-size:.8em;opacity:.85}
.viewer .udf-ust{border-bottom:1px dashed #d0d5dd;margin-bottom:6pt;padding-bottom:2pt}
.viewer .udf-alt{border-top:1px dashed #d0d5dd;margin-top:6pt;padding-top:2pt}
.viewer .udf-not{max-width:600px;padding:10px 12px;border-radius:8px;background:var(--shell-warn-bg);color:var(--shell-warn-text);font:12px/1.45 "Segoe UI",system-ui,sans-serif}
`;

  globalThis.UHD.udf = { oku, ciz, UdfHatasi, SINIR, CSS, ILETI };
})();
