/* global module */
// Evrak görüntüleyicisinde "Atıflar": açılmış evrakın metnindeki karar künyelerini (UHDKunye) bu cihazda bulur, listeler,
// UDF görünümünde ince alt çizgiyle işaretler ve seçilen metinden "Kararı bul" bağlantısı sunar. Evrak metni ve künye
// günlüğe, depolamaya ve hata raporuna girmez. Kullanıcının tıkladığı bağlantının #k= parçası legaluga.com'a gidebilir.
// Panel açılınca en çok 20 disaAktar künyesi arka plan üzerinden legaluga.com/havuz adresine sorulur; belge metni gitmez.
// Saf parçalar (udfMetni, dagit, bol, birlestir) DOM'a dokunmaz; olustur() görüntüleyicinin el() yardımcısıyla çizer ve
// UHDKunye ile DurusmaPaketiMetin'i çağrı anında okur (yükleme sırası: common.js, kunye-ayikla.js, durusma-paketi-metin.js).
// PDF metni içerik betiğinde okunmaz: duruşma paketinin görünmez uzantı çerçevesi (paket motoru) ve onun pdf.js işçisi okur.
(() => {
  'use strict';
  if (globalThis.UHDAtifPaneli) return;   // arka plan içerik betiklerini yeniden yükleyebilir
  // karakter: taranan metin (UHDKunye ile aynı); bayt: HTML/XML/düz metin evrakın okunacak en büyük boyu (HTML_SINIR ile aynı);
  // dilim: alt çizgi çiziminde bir adımda işlenen paragraf sayısı. PDF: pdfBayt motorun kabul ettiği en büyük evrak, pdfSayfa
  // taranan en çok sayfa; pdfHazir motor çerçevesinin bağlanma, pdfSure işin üst süresi (motorun 120 sn'sinin üstünde);
  // pdfBekleme çerçevenin load olayı gelmezse taramanın başlama süresi; pdfYokla köprünün başka işe geçip geçmediğine bakma aralığı.
  const SINIR = Object.freeze({ karakter: 2 * 1024 * 1024, bayt: 10 * 1024 * 1024, dilim: 40,
    pdfBayt: 64 * 1024 * 1024, pdfSayfa: 300, pdfHazir: 20000, pdfSure: 125000, pdfBekleme: 4000, pdfYokla: 400 });
  const RENK = globalThis.UHD?.BRAND?.primary || '#0f817e';   // evrak kâğıdı hep açık renk: çizgi temadan bağımsızdır
  const RESIM = new Set(['tif', 'tiff', 'jpg', 'jpeg', 'png', 'gif', 'bmp']);
  const ILETI = Object.freeze({
    taraniyor: 'Atıflar taranıyor…',
    yok: 'Bu evrakta karar atfı bulunamadı.',
    resim: 'Bu evrak taranmış görüntüdür; atıf taraması yapılamaz.',
    desteklenmiyor: 'Bu evrak türünde atıf taraması yapılamaz.',
    buyuk: 'Evrak atıf taraması için çok büyük (10 MB üstü).',
    hata: 'Atıflar taranamadı.',
    kesik: 'Metin çok uzun; yalnız ilk 2 MB tarandı.',
    kismi: 'Evrakın yalnız görüntüleyicide gösterilen bölümü tarandı.',
    pdfMetinsiz: 'Bu PDF metin katmanı içermiyor (taranmış görüntü); atıf taraması yapılamaz.',
    pdfMesgul: 'Başka bir belge işlemi sürdüğü için PDF şimdi taranamadı.',
    pdfDurdu: 'PDF taraması başka bir belge işlemi nedeniyle durdu.',
    pdfHata: 'PDF metni okunamadı; atıf taraması yapılamadı.',
    pdfBuyuk: 'PDF atıf taraması için çok büyük (64 MB üstü).',
    pdfKesik: 'PDF çok uzun; yalnız ilk 300 sayfa ve en çok 2 MB metin tarandı.',
    pdfYer: 'PDF evrakta atıfın yerine gidilemez; künye yalnız listede gösterilir.'
  });
  // Rozet yalnız arka planın hükmünü yazar. Havuz algoritması bu dosyada yoktur.
  const HAVUZ_EN_COK = 20;
  const HAVUZ_YAZI = Object.freeze({
    dogrulandi: 'Havuzda', eslesti: 'Havuzda', dikkat: 'Dikkat', bulunamadi: 'Havuzda yok',
    denetlenemedi: 'Denetlenemedi', 'hatali-kunye': 'Hatalı künye'
  });
  const HAVUZ_ANLAM = Object.freeze({
    dogrulandi: 'Künye, havuzdaki bir kayıtla ve tarihle uyumlu görünüyor.',
    eslesti: 'Künye, havuzdaki bir kayıtla eşleşti.',
    dikkat: 'Künye havuzda var; tarih uyuşmayabilir.',
    bulunamadi: 'Bu künye, taranan havuz parçasında yok.',
    denetlenemedi: 'Havuz denetimi tamamlanamadı.',
    'hatali-kunye': 'Daire numarası havuzun tanıdığı aralıkta değil.'
  });
  const HAVUZ_UYARI = 'Eşleşme varlık kanıtı değildir; tam metni açın. Havuzda yokluk, kararın bulunmadığı anlamına gelmez.';
  function havuzYuku(k) {
    const aktar = globalThis.UHDKunye && globalThis.UHDKunye.disaAktar;
    if (typeof aktar !== 'function') return null;
    const d = aktar(k);
    return d && typeof d === 'object' ? d : null;
  }
  function havuzHukmu(sonuc) {
    const hukum = sonuc && sonuc.hukum;
    return Object.hasOwn(HAVUZ_YAZI, hukum) ? hukum : 'denetlenemedi';
  }
  function havuzIpucu(hukum, sonuc) {
    let ek = '';
    const kontroller = sonuc && Array.isArray(sonuc.kontroller) ? sonuc.kontroller : [];
    const tarih = kontroller.find(k => k && k.kod === 'havuz-tarih' && typeof k.aciklama === 'string' && k.aciklama.length > 0 && k.aciklama.length <= 240);
    if (hukum === 'dikkat' && tarih && !/https?:|\/havuz\/|\\/.test(tarih.aciklama)) ek = ` ${tarih.aciklama}`;
    return `${HAVUZ_YAZI[hukum]}. ${HAVUZ_ANLAM[hukum]}${ek} ${HAVUZ_UYARI}`;
  }
  function havuzGonder(kunyeler, ozel) {
    const mesaj = { type: 'uhd-havuz-denetle', kunyeler };
    if (typeof ozel === 'function') {
      try { return Promise.resolve(ozel(mesaj)); }
      catch (err) { return Promise.reject(err); }
    }
    const kanal = globalThis['chrome'];
    const runtime = kanal && kanal.runtime;
    if (!runtime || typeof runtime.sendMessage !== 'function') return Promise.reject(new Error('kanal'));
    try { return Promise.resolve(runtime.sendMessage(mesaj)); }
    catch (err) { return Promise.reject(err); }
  }
  function havuzBeklet(promise, ms) {
    return new Promise((resolve, reject) => {
      let bitti = false;
      const t = setTimeout(() => { if (!bitti) { bitti = true; reject(new Error('sure')); } }, ms);
      Promise.resolve(promise).then(v => {
        if (bitti) return;
        bitti = true; clearTimeout(t); resolve(v);
      }, err => {
        if (bitti) return;
        bitti = true; clearTimeout(t); reject(err);
      });
    });
  }

  // ---- Saf parçalar.

  // UDF modelinin (ya da aynı biçimdeki DurusmaPaketiMetin modelinin) gövde metni: paragraflar belge sırasıyla, tablo hücreleri
  // dahil derinlik öncelikli, aralarında "\n". Üst/alt bilgi, liste işareti ve resim alınmaz; sekme "\t" olur. paragraflar[i] =
  // { bas, uzunluk }: i. paragrafın metindeki yeri; sıra, görüntüleyicideki .udf-dilim içindeki .udf-p sırasıyla aynıdır.
  function udfMetni(model) {
    const yazilar = [], paragraflar = [];
    let uzunluk = 0, kesildi = false;
    const paragraf = p => {
      let yazi = '';
      for (const c of p.parcalar || []) yazi += c.t === 'metin' ? String(c.yazi ?? '') : c.t === 'sekme' ? '\t' : '';
      const bas = paragraflar.length ? uzunluk + 1 : 0;
      paragraflar.push({ bas, uzunluk: yazi.length });
      yazilar.push(yazi);
      uzunluk = bas + yazi.length;
    };
    const gez = bloklar => {
      for (const b of bloklar || []) {
        if (kesildi) return;
        if (uzunluk > SINIR.karakter) { kesildi = true; return; }
        if (b?.t === 'p') paragraf(b);
        else if (b?.t === 'tablo') for (const satir of b.satirlar || []) for (const h of satir || []) gez(h?.bloklar);
      }
    };
    for (const bolum of model?.bolumler || []) gez(bolum);
    return { metin: yazilar.join('\n'), paragraflar, kesildi };
  }

  // Metindeki [bas, son) aralığını birimlere ({ bas, uzunluk }, sıralı) böler: [{ i, bas, son }] birim içi konumlar.
  // Birimler arasındaki ayıraçlar (paragraf sonu) hiçbir birime düşmez.
  function dagit(bas, son, birimler) {
    const out = [];
    let a = 0, b = birimler.length - 1;
    while (a < b) { const m = (a + b + 1) >> 1; if (birimler[m].bas <= bas) a = m; else b = m - 1; }
    for (let i = a; i < birimler.length && birimler[i].bas < son; i++) {
      const u = birimler[i], x = Math.max(bas, u.bas), y = Math.min(son, u.bas + u.uzunluk);
      if (y > x) out.push({ i, bas: x - u.bas, son: y - u.bas });
    }
    return out;
  }

  // Yazıyı işaretli aralıklara ({ bas, son, atif }) göre parçalar: düz parçalar dize, işaretliler { yazi, atif }. Çakışan
  // ya da sınır dışı aralık kırpılır; parçaların birleşimi her zaman yazının kendisidir.
  function bol(yazi, araliklar) {
    const out = [];
    let i = 0;
    for (const r of [...araliklar].sort((x, y) => x.bas - y.bas)) {
      const bas = Math.max(r.bas, i), son = Math.min(r.son, yazi.length);
      if (son <= bas) continue;
      if (bas > i) out.push(yazi.slice(i, bas));
      out.push({ yazi: yazi.slice(bas, son), atif: r.atif });
      i = son;
    }
    if (i < yazi.length) out.push(yazi.slice(i));
    return out;
  }

  // Metin düğümlerini tek metne çevirir; ayiraclar[i] i. düğümden önce eklenir ("" ya da "\n"). birimler dagit() içindir.
  function birlestir(metinler, ayiraclar = []) {
    const parcalar = [], birimler = [];
    let uzunluk = 0;
    metinler.forEach((m, i) => {
      const ayirac = i && ayiraclar[i] ? ayiraclar[i] : '';
      parcalar.push(ayirac, m);
      birimler.push({ bas: uzunluk + ayirac.length, uzunluk: m.length });
      uzunluk += ayirac.length + m.length;
    });
    return { metin: parcalar.join(''), birimler };
  }

  // Atıfın ilk geçişini içeren özgün bölüm: UDF/metin paragrafları veya PDF sayfaları. PDF'nin boş/okunamayan
  // sayfalarının ötesine geçmez. Uzun bölümlerde künyenin çevresi alınır; kesilen uçlar açıkça "…" ile gösterilir.
  function alinti(metin, k, birimler = []) {
    if (typeof metin !== 'string' || !Number.isSafeInteger(k?.bas) || !Number.isSafeInteger(k?.son)
      || k.bas < 0 || k.son <= k.bas || k.son > metin.length
      || (typeof k.ham === 'string' && metin.slice(k.bas, k.son) !== k.ham)) return '';
    let bas = 0, son = metin.length;
    if (birimler.length) {
      const parcalar = dagit(k.bas, k.son, birimler);
      if (!parcalar.length) return '';
      const ilk = birimler[parcalar[0].i], sonuncu = birimler[parcalar.at(-1).i];
      bas = ilk.bas; son = sonuncu.bas + sonuncu.uzunluk;
    }
    const once = metin.lastIndexOf('\n\n', k.bas), sonra = metin.indexOf('\n\n', k.son);
    if (once >= bas) bas = once + 2;
    if (sonra >= 0) son = Math.min(son, sonra);
    let x = Math.max(bas, k.bas - 480), y = Math.min(son, k.son + 900);
    // Yarım sözcük kopyalama; özgün satır sonları ve yazım olduğu gibi kalır.
    if (x > bas) { const bos = metin.slice(x, Math.min(x + 80, k.bas)).search(/\s/u); if (bos >= 0) x += bos + 1; }
    if (y < son) { const parca = metin.slice(Math.max(k.son, y - 80), y), bos = parca.match(/\s\S*$/u); if (bos) y -= parca.length - bos.index; }
    if (x > bas && /[\uDC00-\uDFFF]/u.test(metin[x])) x--;
    if (y < son && /[\uDC00-\uDFFF]/u.test(metin[y])) y--;
    return `${x > bas ? '…' : ''}${metin.slice(x, y).trim()}${y < son ? '…' : ''}`;
  }

  // Beklenmeyen hata: rapora yalnız hata türü ve uzantı içi satırlar (dosya:satır) girer. İleti, kod ve öteki alanlar künye
  // ya da evrak metni taşıyabileceği için yeni bir hataya aktarılmaz.
  function raporla(err) {
    if (!err || err.name === 'AbortError') return;
    try {
      const temiz = new Error('atif');
      temiz.name = /^[A-Za-z]{1,40}$/.test(String(err.name)) ? err.name : 'Error';
      temiz.stack = `${temiz.name}\n${String(err.stack || '').split('\n').slice(1).join('\n')}`;
      globalThis.UHDReporter?.report(temiz, 'atif');
    } catch { /* raporlama atıf işini kesmez */ }
  }

  // ---- HTML evrak: htmlBelgesi() temizlediği DOMParser belgesini çerçeveye yazmadan önce bu işlevle işaretletir. Çerçeve
  // sandbox="" ve kökensizdir: işaretler yalnız görünür, tıklanamaz (seçim ve kaydırma da çerçevenin içinde kalır).
  const CIZGI = `text-decoration:underline solid ${RENK};text-decoration-thickness:1.5px;text-underline-offset:2px`;
  const HTML_BLOK = new Set(['P', 'DIV', 'BR', 'LI', 'UL', 'OL', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'SECTION',
    'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'ASIDE', 'BLOCKQUOTE', 'PRE', 'HR', 'DL', 'DT', 'DD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'CENTER', 'ADDRESS', 'FIGURE', 'FIGCAPTION', 'FIELDSET', 'LEGEND', 'BODY']);
  const HTML_ATLA = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SELECT', 'OPTION', 'TITLE']);
  // Gövdedeki metin düğümleri belge sırasıyla; blok öğe ya da satır sonu geçilince düğümler arasına "\n" konur.
  function htmlParcalari(d) {
    const dugumler = [], metinler = [], ayiraclar = [];
    // 1 | 4: SHOW_ELEMENT | SHOW_TEXT; 2: FILTER_REJECT (alt ağaç atlanır), 1: FILTER_ACCEPT.
    const yuruyen = d.createTreeWalker(d.body, 1 | 4, { acceptNode: n => (n.nodeType === 1 && HTML_ATLA.has(n.tagName) ? 2 : 1) });
    let kir = false, oncekiBlok = null;
    for (let n = yuruyen.nextNode(); n; n = yuruyen.nextNode()) {
      if (n.nodeType === 1) { if (HTML_BLOK.has(n.tagName)) kir = true; continue; }
      if (!n.data) continue;
      let blok = n.parentNode;
      while (blok && blok !== d.body && !HTML_BLOK.has(blok.tagName)) blok = blok.parentNode;
      ayiraclar.push(dugumler.length && (kir || blok !== oncekiBlok) ? '\n' : '');
      kir = false;
      oncekiBlok = blok;
      dugumler.push(n);
      metinler.push(n.data);
    }
    return { dugumler, metinler, ayiraclar };
  }
  function htmlIsaretle(d) {
    try {
      const K = globalThis.UHDKunye;
      if (!K || !d?.body) return;
      const { dugumler, metinler, ayiraclar } = htmlParcalari(d);
      const { metin, birimler } = birlestir(metinler, ayiraclar);
      const araliklar = new Map();
      for (const k of K.bul(metin)) {
        for (const p of dagit(k.bas, k.son, birimler)) {
          if (!araliklar.has(p.i)) araliklar.set(p.i, []);
          araliklar.get(p.i).push({ bas: p.bas, son: p.son, atif: 0 });
        }
      }
      for (const [i, liste] of araliklar) {
        dugumler[i].replaceWith(...bol(metinler[i], liste).map(p => {
          if (typeof p === 'string') return p;
          const s = d.createElement('span');
          s.setAttribute('style', CIZGI);
          s.textContent = p.yazi;
          return s;
        }));
      }
    } catch (err) { raporla(err); }
  }

  const bekle = () => new Promise(r => setTimeout(r, 0));

  function idareDosyasi(rec) {
    if (typeof rec?.birimAdi !== 'string') return false;
    const ad = rec.birimAdi.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i')
      .replace(/\./g, ' ').replace(/\s+/gu, ' ').trim();
    return /(?:^|\s)idare mahkemesi(?:$|[\s(/-])/u.test(ad);
  }

  // ---- Görüntüleyici bölümü. Bir dosya ekranında bir kez kurulur; her evrakta belge() ile yeniden doldurulur, temizle() ile boşalır.
  // el: görüntüleyicinin el() yardımcısı; onbar: önizleme çubuğu (icerik() yalnız onu korur); eylemler: evrak işlemleri grubu;
  // kutu: menü ve "Kararı bul" düğmesinin konduğu, odak tuzağının içindeki ekran kutusu; kok: kapalı gölge kök (seçim ve odak);
  // duyur: ekran okuyucu duyurusu; acikMi: "Evraktaki karar atıflarını işaretle" ayarı. PDF için: motorKabi görünmez motor
  // çerçevesinin konduğu öğe; kopru: çağrı anında duruşma paketi köprüsü (UHD.durusmaPaketiBridge); mesgulMu: köprüyü başka
  // bir belge işi (duruşma paketi, banka/tebligat okuması, toplu indirme…) kullanıyor mu? Köprü tekildir: açmak onu kapatırdı.
  function olustur({ el, onbar, eylemler, kutu, kok, kimlik = 'ek', duyur = () => {}, acikMi = () => true,
    motorKabi = kutu, kopru = () => globalThis.UHD?.durusmaPaketiBridge, mesgulMu = () => false, resmiAramaMi = () => false,
    havuzBekleme = 300, havuzSure = 16000, havuzDenetle = null }) {
    const id = `${kimlik}-atif`;
    const sayi = el('span', { class: 'ek-atif-sayi', 'aria-hidden': 'true' });
    const dugme = el('button', { type: 'button', class: 'ek-atif-ac', 'aria-expanded': 'false', 'aria-controls': id, title: 'Evraktaki karar atıfları' }, 'Atıflar', sayi);
    const durumYazi = el('p', { class: 'ek-atif-durum' });
    const yeniden = el('button', { type: 'button', class: 'chip ek-atif-yeniden' }, 'Yeniden dene');
    const liste = el('ul', { class: 'ek-atif-liste', 'aria-label': 'Evraktaki karar atıfları' });
    const not = el('p', { class: 'ek-atif-not' });
    const kapatDugme = el('button', { type: 'button', class: 'chip ek-atif-kapat', 'aria-label': 'Atıfları kapat', title: 'Kapat (Esc)' }, '×');
    const baslikSayi = el('span', { class: 'ek-atif-baslik-sayi' });
    const secilenAc = el('a', { class: 'ek-atif-secilen', target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' }, 'Seçilenleri aç');
    const aktarim = el('span', { id: `${id}-aktarim`, class: 'ek-atif-aktarim' });
    const secilenSatir = el('div', { class: 'ek-atif-secilen-satir' }, secilenAc, aktarim);
    const ara = el('input', { type: 'search', class: 'ek-atif-ara', placeholder: 'Mahkeme veya numara ara', 'aria-label': 'Atıflarda ara', autocomplete: 'off', spellcheck: 'false' });
    const bos = el('p', { class: 'ek-atif-durum ek-atif-bos', hidden: true }, 'Aramanızla eşleşen atıf yok.');
    const ipucu = el('p', { class: 'ek-atif-ipucu' }, 'Alıntı, evraktaki ilk geçişin çevresindeki metindir.');
    const bolum = el('section', { class: 'ek-atiflar', id, role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Karar atıfları' },
      el('div', { class: 'ek-atif-baslik' }, el('b', null, 'Karar atıfları'), baslikSayi, kapatDugme), secilenSatir, ara,
      el('div', { class: 'ek-atif-icerik' }, durumYazi, yeniden, liste, bos, not), ipucu);
    secilenAc.hidden = true; aktarim.hidden = true; secilenSatir.hidden = true;
    dugme.hidden = true; bolum.hidden = true; yeniden.hidden = true; liste.hidden = true; not.hidden = true;
    eylemler?.append(dugme);
    kutu.append(bolum);

    // Liste belge akışının dışında ve her evrakta kapalı başlar. no: evrak sayacı, eski işi durdurur.
    // tekrar: "Yeniden dene"nin işi; motor: süren PDF motoru oturumu ({ kapat }).
    let acik = false, no = 0, tur = null, kunyeler = [], satirlar = [], etkin = 0, alintiMetni = '', alintiBirimleri = [];
    let secilen = [];   // seçim sırasıyla satır indeksleri; arama süzgeci bunu silmez, yeni evrak siler
    let boyutIzleyici = null;
    let cizimKok = null, kapDugum = null, menu = null, secimDugme = null, tekrar = null, motor = null, isNo = 0, sonBelge = null, secimBirak = null;
    const isaretliParcalar = new Set();
    const kopyaEtiketleri = new WeakMap(), kopyaDenemeleri = new WeakMap(), kopyaZamanlari = new WeakMap();
    const zamanlayicilar = new Set();
    const sonra = (fn, ms) => { const t = setTimeout(() => { zamanlayicilar.delete(t); fn(); }, ms); zamanlayicilar.add(t); return t; };
    const vazgec = t => { clearTimeout(t); zamanlayicilar.delete(t); };
    const havuzBekle = Number.isInteger(havuzBekleme) && havuzBekleme >= 0 && havuzBekleme <= 60000 ? havuzBekleme : 300;
    const havuzSinir = Number.isInteger(havuzSure) && havuzSure >= 1 && havuzSure <= 120000 ? havuzSure : 16000;
    const havuzOnbellek = new Map();
    const havuzUcus = new Set();
    let havuzZaman = null;
    const ayarAcik = () => { try { return acikMi() !== false; } catch { return false; } };
    let sonAyar = ayarAcik();
    // Sorulamazsa meşgul sayılır: başka işin köprüsü kapatılmaz.
    const mesgul = () => { try { return !!mesgulMu(); } catch { return true; } };
    const odakta = () => kok?.activeElement || null;

    function panelKonumla() {
      if (!acik) return;
      const k = kutu?.getBoundingClientRect?.(), h = dugme.getBoundingClientRect?.();
      if (!k || !h || !bolum.style) return;
      // Dar ekranın kaydırılan evrak başlığı veya kısa pencere: panel görünür kutunun içinde kalır.
      const hedefUst = Math.max(k.top + 8, Math.min(h.top, k.bottom - 8));
      const hedefAlt = Math.max(k.top + 8, Math.min(h.bottom, k.bottom - 8));
      const altBosluk = k.bottom - hedefAlt - 16, ustBosluk = hedefUst - k.top - 16;
      const yer = altBosluk >= 280 ? 'alt' : ustBosluk >= 280 ? 'ust' : 'kutu';
      const yukseklik = Math.max(0, Math.min(520, k.bottom - k.top - 16, yer === 'alt' ? altBosluk : yer === 'ust' ? ustBosluk : k.bottom - k.top - 16));
      bolum.style.setProperty('max-height', `${yukseklik}px`);
      bolum.style.setProperty('max-width', `${Math.max(0, k.right - k.left - 16)}px`);
      const ust = yer === 'alt' ? hedefAlt + 8 : yer === 'ust' ? Math.max(k.top + 8, hedefUst - (bolum.offsetHeight || yukseklik) - 8) : k.top + 8;
      konumla(bolum, { left: h.right - (bolum.offsetWidth || 420), top: ust - 6, bottom: ust - 6 });
    }
    function panelIzle() {
      boyutIzleyici?.disconnect();
      boyutIzleyici = null;
      if (acik) {
        if (typeof globalThis.ResizeObserver === 'function') {
          boyutIzleyici = new globalThis.ResizeObserver(panelKonumla);
          boyutIzleyici.observe(kutu); boyutIzleyici.observe(onbar);
        }
        globalThis.addEventListener?.('resize', panelKonumla);
        globalThis.addEventListener?.('blur', cerceveOdaklandi);
      } else {
        globalThis.removeEventListener?.('resize', panelKonumla);
        globalThis.removeEventListener?.('blur', cerceveOdaklandi);
      }
    }
    function cerceveOdaklandi() {
      // PDF/HTML çerçevesindeki tıklama üst DOM'a yayılmaz; çerçeveye odak geçince açılır liste kapanır.
      sonra(() => { const d = odakta(); if (acik && d?.tagName === 'IFRAME' && !bolum.contains(d)) panelKapat(false); }, 0);
    }

    function senkron() {
      bolum.hidden = !acik;
      dugme.setAttribute('aria-expanded', String(!!acik));
      dugme.classList.toggle('on', !!acik);
      if (acik) panelKonumla();
    }
    function panelKapat(odakDon = true) {
      if (!acik) return false;
      const icinde = bolum.contains(odakta());
      acik = false; senkron(); panelIzle();
      havuzPlanIptal();
      if (icinde && odakDon) dugme.focus?.({ preventScroll: true });
      return true;
    }
    function panelAc(odak = true) {
      acik = true; senkron(); panelIzle();
      if (odak) (ara.hidden ? kapatDugme : ara).focus?.({ preventScroll: true });
      havuzPlanla();
    }
    // yeniden (isteğe bağlı): durum iletisinin altında "Yeniden dene" düğmesiyle çalışacak iş.
    function goster(metin, sayac = '', yenidenIs = null) {
      if (!ayarAcik()) return;
      durumYazi.textContent = metin;
      durumYazi.hidden = !metin;
      sayi.textContent = sayac;
      sayi.hidden = !sayac;
      baslikSayi.textContent = sayac === '…' ? '' : sayac;
      ara.hidden = !satirlar.length;
      ipucu.hidden = !satirlar.length;
      tekrar = yenidenIs;
      yeniden.hidden = !yenidenIs;
      dugme.hidden = false;
      senkron();
    }
    dugme.addEventListener('click', () => { if (acik) panelKapat(); else panelAc(); });
    kapatDugme.addEventListener('click', () => panelKapat());
    yeniden.addEventListener('click', () => {
      const is = tekrar;
      if (!is) return;
      // Düğme gizlenince odak kopmasın: Atıflar düğmesine geçer.
      if (odakta() === yeniden) dugme.focus?.({ preventScroll: true });
      is();
    });

    function geciciIzle() {
      if (menu || secimDugme) globalThis.addEventListener?.('resize', geciciKapat);
      else globalThis.removeEventListener?.('resize', geciciKapat);
    }
    function geciciKapat() {
      const secimOdak = secimDugme?.contains(odakta());
      menuKapat(); secimKapat();
      if (secimOdak) kapDugum?.focus?.({ preventScroll: true });
    }
    function menuKapat(odakDon = true) {
      if (!menu) return false;
      const icinde = menu.contains(odakta());
      menu.remove();
      menu = null;
      geciciIzle();
      if (icinde && odakDon) kapDugum?.focus?.({ preventScroll: true });
      return true;
    }
    function secimKapat() {
      if (!secimDugme) return false;
      secimDugme.remove();
      secimDugme = null;
      geciciIzle();
      return true;
    }
    // Menü ve "Kararı bul" düğmesi hedefin altında (sığmazsa üstünde), kutunun görünür alanı içinde durur. Koordinatlar
    // düğümün gerçek konumlandırma kabına (offsetParent) göre verilir: kapsayıcı sorgusu kutuyu konumlandırma kabı yapmaz.
    function konumla(dugum, hedef) {
      const ust = dugum.offsetParent, k = kutu?.getBoundingClientRect?.();
      if (!ust || !k || !hedef || !dugum.style) return;
      // Konumlandırma kabı görüntüleyiciden geniş olabilir; menü dar ekran kutusuna göre ölçülür.
      dugum.style.setProperty('max-width', `${Math.min(dugum === menu ? 360 : Infinity, Math.max(0, k.right - k.left - 16))}px`);
      if (dugum !== bolum) dugum.style.setProperty('max-height', `${Math.max(0, k.bottom - k.top - 16)}px`);
      const o = ust.getBoundingClientRect();
      const yukseklik = dugum.offsetHeight || 0, genislik = dugum.offsetWidth || 0;
      const x = Math.max(k.left + 8, Math.min(hedef.left, k.right - genislik - 8));
      let y = hedef.bottom + 6;
      if (y + yukseklik > k.bottom - 8) y = Math.max(k.top + 8, hedef.top - yukseklik - 6);
      dugum.style.setProperty('left', `${Math.round(x - o.left - ust.clientLeft + ust.scrollLeft)}px`);
      dugum.style.setProperty('top', `${Math.round(y - o.top - ust.clientTop + ust.scrollTop)}px`);
    }

    async function kopya(k, d, otekiMetin = null) {
      const benim = no, deneme = d ? (kopyaDenemeleri.get(d) || 0) + 1 : 0;
      if (d) {
        if (!kopyaEtiketleri.has(d)) kopyaEtiketleri.set(d, d.textContent);
        kopyaDenemeleri.set(d, deneme);
        vazgec(kopyaZamanlari.get(d));
      }
      let ok = true;
      try { await globalThis.navigator.clipboard.writeText(otekiMetin ?? globalThis.UHDKunye.tamYazim(k)); } catch { ok = false; }
      if (benim !== no || (d && kopyaDenemeleri.get(d) !== deneme)) return;
      const ne = otekiMetin === null ? 'Künye' : 'Alıntı ve künye';
      duyur(ok ? `${ne} kopyalandı.` : `${ne} kopyalanamadı.`, !ok);
      if (!d) return;
      d.textContent = ok ? 'Kopyalandı' : 'Kopyalanamadı';
      kopyaZamanlari.set(d, sonra(() => { d.textContent = kopyaEtiketleri.get(d); kopyaZamanlari.delete(d); }, 1800));
    }
    function alintiDugmesi(k) {
      const yazi = alinti(alintiMetni, k, alintiBirimleri);
      const d = el('button', { type: 'button', class: 'chip ek-atif-alinti-kopyala',
        title: 'Atıfın evrakta geçtiği bölümü künye ile kopyala', disabled: !yazi }, 'Alıntıyı kopyala');
      d.addEventListener('click', ev => {
        ev.stopPropagation?.();
        if (yazi) kopya(k, d, `“${yazi}”\n\n${globalThis.UHDKunye.tamYazim(k)}`);
      });
      return d;
    }
    function kararNoEksik(k) { return k?.mahkeme !== 'AYM' && k?.kararNo === null; }
    // Kullanıcının tıkladığı bağlantı; künye yalnız adresin # parçasındadır (sunucuya ve Referer'a gitmez).
    function tamMetin(i, sinif) {
      const a = el('a', { class: sinif, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' }, 'Tam metni aç');
      const href = kararNoEksik(kunyeler[i]) ? null : globalThis.UHDKunye?.adres(kunyeler, i);
      if (href) a.setAttribute('href', href); else a.hidden = true;
      return a;
    }
    function resmiMetin(k) {
      let izin = false;
      try { izin = resmiAramaMi() === true; } catch { /* dosya türü belirlenemezse düğme gösterilmez */ }
      const href = izin ? globalThis.UHDKunye?.resmiAdres?.(k) : null;
      return href ? el('a', { class: 'chip ek-atif-resmi', href, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer',
        title: 'Danıştay’ın resmî sayfasını daire ve esas/karar alanları hazır olarak aç' }, 'Danıştay’da ara') : null;
    }

    function etkinYap(i) {
      etkin = i;
      satirlar.forEach((s, j) => {
        const on = j === i && !s.hidden;
        s.setAttribute('tabindex', on ? '0' : '-1');
        for (const c of s.querySelectorAll('.chip')) c.setAttribute('tabindex', on ? '0' : '-1');
        for (const c of s.querySelectorAll('.ek-atif-sec')) c.setAttribute('tabindex', on ? '0' : '-1');
      });
    }
    function vurgula(i) {
      const isaretler = cizimKok ? cizimKok.querySelectorAll(`[data-atif="${i}"]`) : [];
      if (!isaretler.length) return false;
      isaretler[0].scrollIntoView({ block: 'center' });
      for (const x of isaretler) x.classList.toggle('vurgu', true);
      sonra(() => { for (const x of isaretler) x.classList.toggle('vurgu', false); }, 1600);
      return true;
    }
    function atla(i) {
      if (vurgula(i)) return;
      duyur(tur === 'pdf' ? ILETI.pdfYer : tur !== 'udf' ? 'Bu evrak biçiminde atıfın yerine gidilemez.'
        : cizimKok ? 'Bu atıfın evraktaki yeri işaretlenemedi.' : 'Evrak hazırlanıyor; atıf işaretleri birazdan görünür.');
    }
    function listedeGoster(i) {
      const s = satirlar[i];
      if (!s) return;
      ara.value = ''; filtrele(); panelAc(false);
      etkinYap(i);
      s.focus();
    }

    // Karar arama alıcısının kabul ettiği künye: adres() tek künyede null dönerse satır seçilemez (kararNo'suz yerel künye;
    // AYM bireysel başvurusu istisnadır). Yeni adres üretilmez.
    function gonderilebilir(k) {
      const adres = globalThis.UHDKunye?.adres;
      return typeof adres === 'function' && !!adres([k], 0);
    }
    function isaretSiniri() {
      const n = globalThis.UHDKunye?.SINIR?.adres;
      return Number.isInteger(n) && n > 0 ? n : 10;
    }
    // Seçilenleri aç: yalnız işaretli künyeler, seçim sırasıyla, mevcut adres() kısaltmasıyla tek sekme.
    function secilenCiz() {
      const K = globalThis.UHDKunye;
      const liste = secilen.map(i => kunyeler[i]).filter(Boolean);
      const href = liste.length && typeof K?.adres === 'function' ? K.adres(liste, 0) : null;
      const parca = href ? href.slice(href.indexOf('#k=') + 3) : '';
      const giden = href ? (K.coz?.(parca)?.k?.length || 0) : 0;
      const acikLink = !!(href && giden);
      secilenSatir.hidden = !acikLink;
      secilenAc.hidden = !acikLink;
      if (href) secilenAc.setAttribute('href', href); else secilenAc.removeAttribute('href');
      secilenAc.textContent = `Seçilenleri aç (${liste.length})`;
      const yazi = acikLink && giden < liste.length ? `${giden}/${liste.length} aktarılacak` : '';
      const degisti = aktarim.textContent !== yazi;
      aktarim.hidden = !yazi;
      aktarim.textContent = yazi;
      if (yazi) secilenAc.setAttribute('aria-describedby', aktarim.id || `${id}-aktarim`);
      else secilenAc.removeAttribute('aria-describedby');
      for (const s of satirlar) {
        const kutu = s.querySelector('.ek-atif-sec');
        if (kutu) kutu.checked = secilen.includes(Number(s.getAttribute('data-sira')));
      }
      if (degisti && yazi) duyur(yazi);
      if (acik && !acikLink && secilenSatir.contains(odakta())) (satirlar[etkin] || kapatDugme).focus?.({ preventScroll: true });
    }
    function secilenDegistir(i, istenen) {
      const kutu = satirlar[i]?.querySelector('.ek-atif-sec');
      if (!kutu || kutu.disabled || !gonderilebilir(kunyeler[i])) {
        if (kutu) kutu.checked = false;
        return;
      }
      const yer = secilen.indexOf(i);
      if (istenen) {
        if (yer >= 0) { secilenCiz(); return; }
        const sinir = isaretSiniri();
        if (secilen.length >= sinir) {
          kutu.checked = false;
          duyur(`En çok ${sinir} künye seçilebilir.`, true);
          return;
        }
        secilen.push(i);
      } else if (yer >= 0) secilen.splice(yer, 1);
      secilenCiz();
    }
    function satirKur(k, i) {
      const K = globalThis.UHDKunye;
      const ac = tamMetin(i, 'chip ek-atif-git');
      const resmi = resmiMetin(k);
      const kopyala = el('button', { type: 'button', class: 'chip ek-atif-kopyala' }, 'Künyeyi kopyala');
      const alintiKopyala = alintiDugmesi(k), yazi = alinti(alintiMetni, k, alintiBirimleri);
      const uyari = k.hatali === 'olmayan_daire' ? 'olmayan daire' : k.hatali === 'gecersiz_tarih' ? 'geçersiz tarih' : '';
      const eksik = kararNoEksik(k) ? 'Karar numarası belirtilmemiş' : '';
      const uygun = gonderilebilir(k);
      const kutu = el('input', { type: 'checkbox', class: 'ek-atif-sec', tabindex: '-1',
        'aria-label': `${K.kisaYazim(k) || 'Künye'} künyesini seç` });
      kutu.disabled = !uygun;
      if (!uygun) kutu.title = eksik || 'Bu künye karar aramasına gönderilemez';
      const rozet = el('span', { class: 'ek-atif-havuz' });
      rozet.hidden = true;
      const s = el('li', { class: 'ek-atif', tabindex: '-1', 'data-sira': String(i),
        'aria-label': [K.tamYazim(k), k.sayi > 1 ? `${k.sayi} geçiş` : '', eksik, uyari && `uyarı: ${uyari}`].filter(Boolean).join(', ') },
      el('span', { class: 'ek-atif-bas' }, kutu,
        el('span', { class: 'ek-atif-kunye' }, el('b', { class: 'ek-atif-kisa' }, K.kisaYazim(k)), k.sayi > 1 ? el('small', null, ` · ${k.sayi} geçiş`) : null,
          eksik ? el('small', { class: 'ek-atif-eksik' }, eksik) : null,
          uyari ? el('span', { class: 'ek-atif-uyari' }, uyari) : null, rozet)),
      yazi ? el('p', { class: 'ek-atif-alinti', title: yazi }, yazi) : null,
      el('span', { class: 'ek-atif-eylem' }, ac, resmi, kopyala, alintiKopyala));
      // Satıra tıklamak evraktaki ilk geçişe kaydırır; düğmeler ve seçim kutusu kendi işini yapar.
      s.addEventListener('click', ev => { if (ev.target === kutu) return; etkinYap(i); atla(i); });
      kutu.addEventListener('click', ev => ev.stopPropagation?.());
      kutu.addEventListener('change', () => secilenDegistir(i, !!kutu.checked));
      ac.addEventListener('click', ev => ev.stopPropagation());
      resmi?.addEventListener('click', ev => ev.stopPropagation());
      kopyala.addEventListener('click', ev => { ev.stopPropagation(); kopya(k, kopyala); });
      return s;
    }
    // Liste klavyesi: ↑ ↓ Home End satırlar arasında (tek sekme durağı), satırdayken Enter "Tam metni aç", Boşluk seçimi
    // değiştirir. ← → burada evrak değiştirmez (görüntüleyicinin onKey'i icerir() ile bölümü yerinde sayar).
    liste.addEventListener('keydown', ev => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey || !satirlar.length) return;
      if (ev.key === 'Enter') {
        if (ev.target !== satirlar[etkin]) return;
        ev.preventDefault();
        const a = satirlar[etkin].querySelector('.ek-atif-git');
        if (a && !a.hidden) a.click();
        return;
      }
      if (ev.key === ' ' || ev.key === 'Spacebar') {
        const i = satirlar.indexOf(ev.target);
        if (i < 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        const kutu = satirlar[i].querySelector('.ek-atif-sec');
        if (!kutu || kutu.disabled) { duyur('Bu künye karar aramasına gönderilemez.'); return; }
        secilenDegistir(i, !secilen.includes(i));
        return;
      }
      const gorunen = satirlar.map((s, i) => s.hidden ? -1 : i).filter(i => i >= 0), konum = gorunen.indexOf(etkin);
      const hedef = ev.key === 'ArrowDown' ? gorunen[Math.min(gorunen.length - 1, konum + 1)] : ev.key === 'ArrowUp' ? gorunen[Math.max(0, konum - 1)]
        : ev.key === 'Home' ? gorunen[0] : ev.key === 'End' ? gorunen.at(-1) : null;
      if (hedef == null) return;
      ev.preventDefault();
      ev.stopPropagation();
      etkinYap(hedef);
      satirlar[hedef].focus();
    });
    liste.addEventListener('focusin', ev => {
      const i = satirlar.findIndex(s => s.contains(ev.target));
      if (i >= 0 && i !== etkin) etkinYap(i);
    });

    const aramaYazimi = x => String(x || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
    function filtrele() {
      const kelimeler = aramaYazimi(ara.value).trim().split(/\s+/u).filter(Boolean);
      satirlar.forEach((s, i) => { const yazi = aramaYazimi(globalThis.UHDKunye.tamYazim(kunyeler[i])); s.hidden = !kelimeler.every(k => yazi.includes(k)); });
      const ilk = satirlar.findIndex(s => !s.hidden), sayac = satirlar.filter(s => !s.hidden).length;
      if (satirlar[etkin]?.hidden || etkin < 0) etkinYap(ilk);
      bos.hidden = !satirlar.length || sayac > 0;
      baslikSayi.textContent = kelimeler.length ? `${sayac} / ${satirlar.length}` : String(satirlar.length);
    }
    ara.addEventListener('input', filtrele);

    function havuzBoya(rozet, kayit) {
      if (!rozet) return;
      const hukum = havuzHukmu(kayit);
      const ipucu = havuzIpucu(hukum, kayit);
      rozet.hidden = false;
      rozet.setAttribute('data-hukum', hukum);
      rozet.setAttribute('title', ipucu);
      rozet.setAttribute('aria-label', ipucu);
      rozet.replaceChildren(
        el('span', { class: 'ek-atif-havuz-ad', 'aria-hidden': 'true' }, HAVUZ_YAZI[hukum]),
        el('span', { class: 'ek-atif-havuz-not' }, ipucu));
    }
    function havuzSatirlariniBoya() {
      satirlar.forEach((s, i) => {
        const rozet = s.querySelector('.ek-atif-havuz');
        const d = havuzYuku(kunyeler[i]);
        if (!d) { havuzBoya(rozet, { hukum: 'denetlenemedi' }); return; }
        const kayit = havuzOnbellek.get(JSON.stringify(d));
        if (kayit) havuzBoya(rozet, kayit);
      });
    }
    function havuzPlanIptal() {
      if (!havuzZaman) return;
      vazgec(havuzZaman);
      havuzZaman = null;
    }
    function havuzUygula(giden, yanit) {
      const liste = yanit && yanit.ok === true && Array.isArray(yanit.sonuclar) ? yanit.sonuclar : null;
      giden.forEach((b, i) => {
        havuzUcus.delete(b.anahtar);
        const ham = liste && liste[i] && typeof liste[i] === 'object' ? liste[i] : null;
        havuzOnbellek.set(b.anahtar, { hukum: havuzHukmu(ham), kontroller: ham && ham.kontroller });
      });
      havuzSatirlariniBoya();
    }
    function havuzIste() {
      if (!acik) return;
      const aday = [], gorulen = new Set();
      for (let i = 0; i < kunyeler.length; i++) {
        const d = havuzYuku(kunyeler[i]);
        if (!d) continue;
        const anahtar = JSON.stringify(d);
        if (havuzOnbellek.has(anahtar) || havuzUcus.has(anahtar) || gorulen.has(anahtar)) continue;
        gorulen.add(anahtar);
        aday.push({ anahtar, d });
      }
      const giden = aday.slice(0, HAVUZ_EN_COK);
      for (const b of aday.slice(HAVUZ_EN_COK)) havuzOnbellek.set(b.anahtar, { hukum: 'denetlenemedi' });
      if (aday.length > HAVUZ_EN_COK) havuzSatirlariniBoya();
      if (!giden.length) return;
      for (const b of giden) havuzUcus.add(b.anahtar);
      havuzBeklet(havuzGonder(giden.map(b => b.d), havuzDenetle), havuzSinir).then(yanit => havuzUygula(giden, yanit), () => havuzUygula(giden, null));
    }
    function havuzPlanla() {
      havuzPlanIptal();
      if (!acik) return;
      havuzSatirlariniBoya();
      havuzZaman = sonra(() => { havuzZaman = null; havuzIste(); }, havuzBekle);
    }

    function listeCiz(bulunan, notlar) {
      secilen = [];
      kunyeler = bulunan;
      satirlar = bulunan.map(satirKur);
      liste.replaceChildren(...satirlar);
      liste.hidden = !satirlar.length;
      if (satirlar.length) etkinYap(0);
      filtrele();
      not.textContent = notlar.join(' ');
      not.hidden = !notlar.length;
      goster(satirlar.length ? '' : ILETI.yok, String(satirlar.length));
      secilenCiz();
      if (satirlar.length) duyur(`Evrakta ${satirlar.length} karar atfı bulundu.`);
    }

    // Alt çizginin menüsü: Tam metni aç, Künyeyi kopyala, Listede göster. Esc, dışarı tıklama ve evrak değişimi kapatır.
    function menuAc(i, hedef, ev) {
      if (!ayarAcik()) return;
      menuKapat(false);
      secimKapat();
      const k = kunyeler[i];
      if (!k) return;
      const ac = tamMetin(i, 'chip');
      const resmi = resmiMetin(k);
      const kopyala = el('button', { type: 'button', class: 'chip' }, 'Künyeyi kopyala');
      const alintiKopyala = alintiDugmesi(k);
      const listede = el('button', { type: 'button', class: 'chip' }, 'Listede göster');
      menu = el('div', { class: 'ek-atif-menu', role: 'dialog', 'aria-label': 'Atıf işlemleri' },
        el('b', { class: 'ek-atif-kisa' }, globalThis.UHDKunye.kisaYazim(k)),
        kararNoEksik(k) ? el('small', { class: 'ek-atif-eksik' }, 'Karar numarası belirtilmemiş') : null,
        el('div', { class: 'ek-atif-menu-eylem' }, ac, resmi, kopyala, alintiKopyala, listede));
      ac.addEventListener('click', () => sonra(() => menuKapat(false), 0));
      resmi?.addEventListener('click', () => sonra(() => menuKapat(false), 0));
      kopyala.addEventListener('click', () => kopya(k, kopyala));
      listede.addEventListener('click', () => { menuKapat(false); listedeGoster(i); });
      kutu.append(menu);
      // Satır kıran çizgide menü tıklanan satırın altına konur.
      const kutucuklar = [...(hedef?.getClientRects?.() || [])];
      konumla(menu, kutucuklar.find(r => ev?.clientY >= r.top && ev?.clientY <= r.bottom) || kutucuklar.at(-1) || hedef?.getBoundingClientRect?.());
      geciciIzle();
      (ac.hidden ? kopyala : ac).focus({ preventScroll: true });
    }
    kutu?.addEventListener('pointerdown', ev => {
      if (menu && !menu.contains(ev.target)) menuKapat(false);
      if (secimDugme && !secimDugme.contains(ev.target)) secimKapat();
      if (acik && !bolum.contains(ev.target) && !dugme.contains(ev.target) && !menu?.contains(ev.target)) panelKapat(false);
    }, true);
    kutu?.addEventListener('scroll', ev => { if (acik && !bolum.contains(ev.target)) panelKonumla(); }, { capture: true, passive: true });

    // UDF alt çizgisi: model paragrafları ekrandaki .udf-p'lerle sırayla eşlenir; işaretlenecek her paragrafın ekrandaki metni
    // modeldekiyle birebir aynı değilse o künyeye dokunulmaz. Yalnız metin parçası span'leri bölünür (liste işareti, resim ve
    // sekme olduğu gibi kalır). Paragraflar dilim dilim işlenir; evrak değişince iş durur.
    async function cizgile(kokDugum, metin, paragraflar, kesildi, hepsi, sira, surer) {
      const ekrandakiler = [];
      for (const d of kokDugum.querySelectorAll('.udf-dilim')) for (const p of d.querySelectorAll('.udf-p')) ekrandakiler.push(p);
      if (kesildi ? ekrandakiler.length < paragraflar.length : ekrandakiler.length !== paragraflar.length) return;
      const parcalari = p => p.children ? [...p.children].filter(c => !c.getAttribute('class') || c.classList.contains('udf-sekme')) : [];
      const uygunluk = new Map();
      const uygun = i => {
        if (!uygunluk.has(i)) {
          const u = paragraflar[i];
          uygunluk.set(i, parcalari(ekrandakiler[i]).map(c => c.textContent).join('') === metin.slice(u.bas, u.bas + u.uzunluk));
        }
        return uygunluk.get(i);
      };
      const isler = new Map();
      for (const k of hepsi) {
        const atif = sira.get(k.anahtar);
        const parcalar = atif === undefined ? [] : dagit(k.bas, k.son, paragraflar);
        if (!parcalar.length || !parcalar.every(p => uygun(p.i))) continue;
        for (const p of parcalar) {
          if (!isler.has(p.i)) isler.set(p.i, []);
          isler.get(p.i).push({ bas: p.bas, son: p.son, atif });
        }
      }
      const sirali = [...isler.keys()].sort((a, b) => a - b);
      for (let j = 0; j < sirali.length; j++) {
        if (!surer()) return;
        if (j && j % SINIR.dilim === 0) { await bekle(); if (!surer()) return; }
        const araliklar = isler.get(sirali[j]);
        let bas = 0;
        for (const c of parcalari(ekrandakiler[sirali[j]])) {
          const yazi = c.textContent, son = bas + yazi.length;
          const yerel = c.getAttribute('class') ? [] : araliklar.filter(r => r.son > bas && r.bas < son)
            .map(r => ({ bas: Math.max(r.bas, bas) - bas, son: Math.min(r.son, son) - bas, atif: r.atif }));
          if (yerel.length) {
            isaretliParcalar.add(c);
            c.replaceChildren(...bol(yazi, yerel).map(x => typeof x === 'string' ? x : cizgi(x)));
          }
          bas = son;
        }
      }
    }
    function cizgi(x) {
      const s = el('span', { class: 'atif-cizgi', 'data-atif': String(x.atif) }, x.yazi);
      s.addEventListener('click', ev => { ev.stopPropagation?.(); menuAc(x.atif, s, ev); });
      return s;
    }

    // Seçimden bul (UDF): seçim 300 karakteri aşmıyor ve içinde künye varsa seçimin yanında "Kararı bul" bağlantısı çıkar.
    // Seçilen metin yalnız burada ayıklanır; bağlantıya yalnız künye alanları girer.
    function secimBak(benim) {
      const K = globalThis.UHDKunye;
      if (benim !== no || !kapDugum || !K || !ayarAcik()) return;
      secimKapat();
      const secim = (typeof kok?.getSelection === 'function' ? kok.getSelection() : null) || globalThis.document?.getSelection?.();
      if (!secim || secim.isCollapsed || !secim.rangeCount) return;
      const aralik = secim.getRangeAt(0);
      if (!kapDugum.contains(aralik.commonAncestorContainer)) return;
      const yazi = String(secim).trim();
      if (!yazi || yazi.length > K.SINIR.secim) return;
      const bulunan = K.ayikla(yazi);
      if (!bulunan.length) return;
      if (kararNoEksik(bulunan[0])) {
        const kopyala = el('button', { type: 'button', class: 'chip' }, 'Künyeyi kopyala');
        kopyala.addEventListener('click', () => kopya(bulunan[0], kopyala));
        secimDugme = el('div', { class: 'ek-atif-bul ek-atif-secim', role: 'group', 'aria-label': 'Atıf işlemleri' },
          el('small', { class: 'ek-atif-eksik' }, 'Karar numarası belirtilmemiş'), kopyala);
      } else {
        const href = K.adres(bulunan, 0);
        if (!href) return;
        secimDugme = el('a', { class: 'dp-go ek-atif-bul', href, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer',
          title: K.kisaYazim(bulunan[0]) }, 'Kararı bul');
        secimDugme.addEventListener('click', () => sonra(secimKapat, 0));
      }
      kutu.append(secimDugme);
      konumla(secimDugme, aralik.getBoundingClientRect?.());
      geciciIzle();
    }
    function secimDinle(kap, benim) {
      kapDugum = kap;
      const bak = () => sonra(() => secimBak(benim), 0);
      const tus = ev => { if (ev.key !== 'Escape') bak(); };
      const basla = () => secimKapat();
      const kaydir = () => { secimKapat(); menuKapat(false); };
      kap.addEventListener('mouseup', bak);
      kap.addEventListener('keyup', tus);
      kap.addEventListener('mousedown', basla);
      kap.addEventListener('scroll', kaydir, { passive: true });
      // Tercih yeniden açıldığında aynı UDF kabı kullanılır; eski dinleyiciler birikmesin.
      secimBirak = () => {
        kap.removeEventListener?.('mouseup', bak);
        kap.removeEventListener?.('keyup', tus);
        kap.removeEventListener?.('mousedown', basla);
        kap.removeEventListener?.('scroll', kaydir);
      };
    }

    async function tara(t, b, surer) {
      const K = globalThis.UHDKunye;
      let metin = '', paragraflar = null, kesik = false, kismi = false;
      await bekle();   // görüntü önce yerleşsin
      if (!surer()) return;
      if (t === 'udf') {
        const r = udfMetni(b.model);
        ({ metin, paragraflar } = r);
        kesik = r.kesildi;
        kismi = !!b.model?.kesildi;
      } else {
        const Metin = globalThis.DurusmaPaketiMetin, blob = b.doc?.blob;
        if (!Metin || !blob) return goster(ILETI.desteklenmiyor);
        if (blob.size > SINIR.bayt) return goster(ILETI.buyuk);
        const bicim = t === 'html' ? 'html' : t === 'txt' ? 'text' : 'xml';
        // Görüntüleyicinin gösteremediği evrak yalnız içeriği XML ise taranır.
        if (t === 'diger') {
          const ilk = Metin.tur(new Uint8Array(await blob.slice(0, 4100).arrayBuffer()));
          if (!surer()) return;
          if (RESIM.has(ilk)) return goster(ILETI.resim);
          if (ilk !== 'xml') return goster(ILETI.desteklenmiyor);
        }
        const bayt = new Uint8Array(await blob.arrayBuffer());
        if (!surer()) return;
        try {
          const r = Metin.model(bayt, { mime: b.doc.type || '', tur: bicim });
          ({ metin, paragraflar } = udfMetni(r.model));
          kesik = r.uyarilar.some(u => /sonu aktarılmadı/.test(u));
        } catch (err) { if (err?.code !== 'metin-bos') throw err; }
      }
      await bekle();
      if (!surer()) return;
      const hepsi = K.bul(metin), bulunan = K.tekillestir(hepsi);
      alintiMetni = metin; alintiBirimleri = paragraflar || [];
      listeCiz(bulunan, [(kesik || hepsi.kesildi) && ILETI.kesik, kismi && ILETI.kismi].filter(Boolean));
      if (t !== 'udf' || !bulunan.length || !b.gorunum?.kok || !b.gorunum.bitti) return;
      // Çizim dilim dilim sürer: tamamlanınca (iptal edilmediyse) işaretlenir.
      if (!await b.gorunum.bitti || !surer()) return;
      cizimKok = b.gorunum.kok;
      await cizgile(b.gorunum.kok, metin, paragraflar, kesik, hepsi, new Map(bulunan.map((k, i) => [k.anahtar, i])), surer);
    }

    // ---- PDF: metin, duruşma paketinin görünmez uzantı çerçevesindeki pdf.js işçisinde sayfa sayfa okunur.
    // Görünmez motor oturumu: çerçeve eklenir, köprü açılır, motor hazır olunca (LIST_REQUEST) baytlar EXTRACT_PDF_TEXT ile
    // aktarılır. Köprü tekildir: başka bir belge işi köprüyü açarsa bu oturum kapanır (closed) ve iş "durdu" sayılır. Evrak
    // değişince (temizle) iş CANCEL_TEXT ile durdurulur; her sonda köprü kapanır, çerçeve (ve işçisi) kaldırılır.
    // Sonuç: { durum: 'tamam' | 'durdu' | 'iptal' | 'hata', sonuc }.
    function pdfMotoru(bayt, surer) {
      return new Promise(coz => {
        let k;
        try { k = kopru(); } catch { k = null; }
        if (typeof k?.create !== 'function' || typeof motorKabi?.append !== 'function') { coz({ durum: 'hata' }); return; }
        const cerceve = el('iframe', { title: 'Atıf okuyucu', class: 'paket-motor', tabindex: '-1', 'aria-hidden': 'true' });
        const jobId = `atif-${++isNo}`, zamanlar = [];
        let oturum = null, hazir = false, gonderildi = false, bitti = false;
        const kapat = (durum, sonuc) => {
          if (bitti) return;
          bitti = true;
          zamanlar.forEach(vazgec);
          if (motor === bu) motor = null;
          if (durum === 'iptal' && gonderildi && !oturum?.closed) {
            try { oturum.send({ type: 'CANCEL_TEXT', jobId }); } catch { /* çerçeve zaten kaldırılıyor */ }
          }
          try { oturum?.close(); } catch { /* kapanmış köprü */ }
          cerceve.remove();
          coz({ durum, sonuc });
        };
        const bu = { kapat };
        motor = bu;
        motorKabi.append(cerceve);
        try {
          oturum = k.create(cerceve, m => {
            if (bitti || !m || m.sessionId !== oturum?.sessionId) return;
            if (m.type === 'LIST_REQUEST' && !hazir) {
              hazir = true;
              if (!surer()) { kapat('iptal'); return; }
              try {
                oturum.send({ type: 'EXTRACT_PDF_TEXT', jobId, bytes: bayt, sayfaSiniri: SINIR.pdfSayfa }, [bayt]);
                gonderildi = true;
              } catch { kapat('hata'); }
            } else if (m.type === 'PDF_TEXT_RESULT' && m.jobId === jobId) kapat('tamam', m);
          });
        } catch { kapat('hata'); return; }
        const yokla = () => {
          if (bitti) return;
          if (!surer()) kapat('iptal');
          else if (oturum?.closed) kapat('durdu');
          else zamanlar[2] = sonra(yokla, SINIR.pdfYokla);
        };
        zamanlar.push(sonra(() => { if (!hazir) kapat('hata'); }, SINIR.pdfHazir), sonra(() => kapat('hata'), SINIR.pdfSure), sonra(yokla, SINIR.pdfYokla));
      });
    }
    async function pdfOku(b, surer, tekrarla) {
      const K = globalThis.UHDKunye, blob = b.doc?.blob;
      if (!blob || !(blob.size > 0)) return goster(ILETI.pdfHata);
      if (blob.size > SINIR.pdfBayt) return goster(ILETI.pdfBuyuk);
      if (mesgul()) return goster(ILETI.pdfMesgul, '', tekrarla);
      // Görüntüleyicinin Blob'u değişmez: motora baytların kopyası aktarılır.
      const bayt = await blob.arrayBuffer();
      if (!surer()) return;
      if (mesgul()) return goster(ILETI.pdfMesgul, '', tekrarla);
      const r = await pdfMotoru(bayt, surer);
      if (!surer() || r.durum === 'iptal') return;
      if (r.durum === 'durdu') return goster(ILETI.pdfDurdu, '', tekrarla);
      const m = r.durum === 'tamam' ? r.sonuc : null;
      const sayfalar = Array.isArray(m?.sayfalar) ? m.sayfalar.filter(p => typeof p?.metin === 'string' && p.metin.trim()) : [];
      const hata = Number.isSafeInteger(m?.hataSayfa) && m.hataSayfa > 0 ? m.hataSayfa : 0;
      if (!sayfalar.length) return goster(m && !m.code && !hata ? ILETI.pdfMetinsiz : ILETI.pdfHata);
      // Arada okunamayan/metinsiz sayfa varsa iki ayrı sayfanın parçaları tek bir künye gibi eşleşmemeli.
      let oncekiSayfa = null, bas = 0;
      const birimler = [];
      let metin = sayfalar.map(p => {
        const ayirac = oncekiSayfa === null ? '' : Number.isSafeInteger(p.no) && p.no === oncekiSayfa + 1 ? '\n' : '\n\n';
        oncekiSayfa = p.no;
        birimler.push({ bas: bas + ayirac.length, uzunluk: p.metin.length });
        bas += ayirac.length + p.metin.length;
        return ayirac + p.metin;
      }).join(''), kesik = m.kesildi === true;
      if (metin.length > SINIR.karakter) { metin = metin.slice(0, SINIR.karakter); kesik = true; }
      const bos = Number.isSafeInteger(m.bosSayfa) && m.bosSayfa > 0 ? m.bosSayfa : 0;
      await bekle();
      if (!surer()) return;
      const hepsi = K.bul(metin);
      alintiMetni = metin; alintiBirimleri = birimler;
      listeCiz(K.tekillestir(hepsi), [(kesik || hepsi.kesildi) && ILETI.pdfKesik,
        bos && `${bos} sayfada metin katmanı yok (taranmış sayfa); o sayfalar taranamadı.`,
        hata && `${hata} sayfanın metni okunamadı; o sayfalardaki atıflar taranamadı.`].filter(Boolean));
    }
    function pdfTara(b, surer) {
      const tekrarla = () => { if (!surer()) return; goster(ILETI.taraniyor, '…'); pdfTara(b, surer); };
      pdfOku(b, surer, tekrarla).catch(err => {
        if (!surer()) return;
        raporla(err);
        goster(ILETI.hata);
      });
    }
    // Tarama görüntülemeyi yavaşlatmasın: çerçeve yüklenip tarayıcı boşa çıkınca (load gelmezse pdfBekleme sonunda) bir kez başlar.
    function pdfBekle(b, surer) {
      let basladi = false, yedek = null;
      const basla = () => {
        if (basladi || !surer()) return;
        basladi = true;
        vazgec(yedek);
        pdfTara(b, surer);
      };
      const bosta = () => {
        if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(basla, { timeout: 2000 });
        else sonra(basla, 50);
      };
      b.cerceve?.addEventListener?.('load', bosta, { once: true });
      yedek = sonra(basla, SINIR.pdfBekleme);
    }

    // Gösterilen evrakın atıfları. tur: 'udf' | 'tiff' | 'html' | 'txt' | 'pdf' | 'resim' | 'diger' (görüntüleyicinin
    // gösteremediği; ext ile). b: { doc, model, gorunum, kap, cerceve (PDF çerçevesi), ext, signal, gecerli }. Ayar kapalıysa
    // hiçbir şey yapılmaz.
    function belge(t, b = {}) {
      temizle(false);
      sonBelge = { t, b };
      sonAyar = ayarAcik();
      if (!globalThis.UHDKunye || !sonAyar) return;
      const benim = no;
      tur = t === 'tiff' || t === 'resim' || (t === 'diger' && RESIM.has(b.ext)) ? 'resim' : t;
      const surer = () => benim === no && ayarAcik() && !b.signal?.aborted && (typeof b.gecerli !== 'function' || b.gecerli());
      if (tur === 'resim') return goster(ILETI.resim);
      if (!['udf', 'html', 'txt', 'pdf', 'diger'].includes(tur)) return goster(ILETI.desteklenmiyor);
      goster(ILETI.taraniyor, '…');
      if (tur === 'pdf') return pdfBekle(b, surer);
      // Seçimden bul, ayıklayıcının kaçırdığı künyeler içindir: listede künye olmasa da çalışır.
      if (tur === 'udf' && b.kap) secimDinle(b.kap, benim);
      tara(tur, b, surer).catch(err => {
        if (!surer()) return;   // eski evrakın işi sessizce biter
        raporla(err);
        goster(ILETI.hata);
      });
    }
    // Evrak değişti ya da ekran kapanıyor: liste, menü, seçim düğmesi ve süren iş (PDF motoru dahil) bırakılır.
    function temizle(belgeyiBirak = true) {
      no++;
      if (belgeyiBirak) sonBelge = null;
      motor?.kapat('iptal');
      secimBirak?.();
      secimBirak = null;
      menuKapat(false);
      secimKapat();
      panelKapat(false);
      havuzPlanIptal();
      for (const t of zamanlayicilar) clearTimeout(t);
      zamanlayicilar.clear();
      // Ayar kapanırken evrak DOM'u yerinde kalır: yalnız bizim eklediğimiz UDF alt çizgilerini kaldır.
      for (const parca of isaretliParcalar) parca.replaceChildren(parca.textContent);
      isaretliParcalar.clear();
      tur = null; kunyeler = []; satirlar = []; secilen = []; etkin = 0; cizimKok = null; kapDugum = null; tekrar = null;
      alintiMetni = ''; alintiBirimleri = []; ara.value = ''; bos.hidden = true; secilenCiz();
      liste.replaceChildren();
      liste.hidden = true;
      not.hidden = true;
      yeniden.hidden = true;
      durumYazi.textContent = '';
      sayi.textContent = '';
      dugme.hidden = true;
      bolum.hidden = true;
    }

    // applyPagePrefs çağırır: süren işi hemen durdurur; yeniden açılınca eldeki evrakta taramayı başlatır.
    function ayarDegisti() {
      const acik = ayarAcik();
      if (acik === sonAyar) return false;
      sonAyar = acik;
      temizle(false);
      if (acik && sonBelge) belge(sonBelge.t, sonBelge.b);
      return true;
    }

    return Object.freeze({
      belge,
      temizle,
      ayarDegisti,
      // Dosya sekmesi değişirken geçici arayüz kapanır; belge ve tarama sonuçları korunur.
      sakla: () => { menuKapat(false); secimKapat(); panelKapat(false); },
      // HTML evrakta htmlBelgesi()'ne verilen işaretleyici; ayar kapalıysa null.
      htmlIsaretci: () => (globalThis.UHDKunye && ayarAcik() ? d => { if (ayarAcik()) htmlIsaretle(d); } : null),
      // Odak Atıflar bölümünde, menüde ya da "Kararı bul" düğmesinde mi (← → orada evrak değiştirmez)?
      icerir: dugum => !!dugum && (bolum.contains(dugum) || !!menu?.contains(dugum) || !!secimDugme?.contains(dugum)),
      // İlk Esc atıf işlemini/panelini kapatır; belge ekranı açık kalır.
      kapat: () => { const vardi = secimKapat(); return menuKapat(true) || vardi || panelKapat(); }
    });
  }

  const CSS = `
.viewer .ek-onbar .ek-atif-ac{gap:6px}
.viewer .ek-onbar .ek-atif-ac.on{border-color:var(--shell-accent);color:var(--shell-accent)}
.viewer .ek-atif-sayi{min-width:18px;padding:0 6px;border-radius:9px;background:var(--shell-soft);color:var(--shell-muted);font-size:11px;font-weight:600;line-height:18px;text-align:center;font-variant-numeric:tabular-nums}
.viewer .ek-atiflar{position:absolute;z-index:3;box-sizing:border-box;width:420px;max-width:calc(100% - 16px);max-height:min(520px,70dvh);display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--shell-line);border-radius:12px;background:var(--shell-bg);color:var(--shell-text);box-shadow:0 10px 28px rgba(16,24,40,.22);font-size:12px;overflow:hidden}
.viewer .ek-atif-baslik{display:flex;align-items:center;gap:8px;flex:none;min-width:0;font-size:13px}
.viewer .ek-atif-baslik-sayi{color:var(--shell-muted);font-variant-numeric:tabular-nums}
.viewer .ek-atif-baslik .ek-atif-kapat{margin-left:auto;min-width:28px;font-size:20px;line-height:1}
.viewer .ek-atif-secilen-satir{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:none;min-width:0}
.viewer .ek-atif-aktarim{color:var(--shell-warn-text);font-size:11px;font-variant-numeric:tabular-nums}
.viewer .ek-atif-ara{box-sizing:border-box;flex:none;width:100%;min-width:0;padding:8px 10px;border:1px solid var(--shell-line);border-radius:7px;background:var(--shell-bg);color:var(--shell-text);font:inherit}
.viewer .ek-atif-icerik{min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:8px;scrollbar-gutter:stable}
.viewer .ek-atif-ipucu{flex:none;margin:0;color:var(--shell-muted);font-size:11px;line-height:1.4}
.viewer .ek-atif-durum,.viewer .ek-atif-not{margin:0;color:var(--shell-muted)}
.viewer .ek-atif-not{color:var(--shell-warn-text)}
.viewer .ek-atiflar .ek-atif-yeniden{align-self:flex-start}
.viewer .ek-atif-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.viewer .ek-atif{flex:none;display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:10px;border:1px solid var(--shell-line);border-radius:8px;background:var(--shell-bg);cursor:pointer}
.viewer .ek-atif:hover{background:var(--shell-soft)}
.viewer .ek-atif:focus-visible{outline:2px solid var(--shell-focus);outline-offset:-2px}
.viewer .ek-atif-bas{display:flex;align-items:flex-start;gap:8px;min-width:0}
.viewer .ek-atif-sec{flex:none;width:16px;height:16px;margin:1px 0 0;accent-color:var(--shell-accent)}
.viewer .ek-atiflar input.ek-atif-sec:disabled{opacity:.45;cursor:default}
.viewer .ek-atif-kunye{flex:1;min-width:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.viewer .ek-atif-kunye small{color:var(--shell-muted);font-size:inherit}
.viewer .ek-atif-kunye .ek-atif-eksik{display:block;margin-top:2px;font-size:11px}
.viewer .ek-atif-alinti{margin:0;color:var(--shell-muted);font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.viewer .ek-atif-uyari{display:inline-block;margin-left:6px;padding:0 6px;border-radius:6px;background:var(--shell-error-bg);color:var(--shell-error);font-size:11px;font-weight:600}
.viewer .ek-atif-havuz{position:relative;display:inline-flex;align-items:center;margin-left:6px;padding:0 6px;border-radius:6px;background:var(--shell-soft);color:var(--shell-muted);font-size:11px;font-weight:600;line-height:18px;vertical-align:1px}
.viewer .ek-atif-havuz[data-hukum=dogrulandi],.viewer .ek-atif-havuz[data-hukum=eslesti]{color:var(--shell-accent)}
.viewer .ek-atif-havuz[data-hukum=dikkat],.viewer .ek-atif-havuz[data-hukum=bulunamadi]{color:var(--shell-warn-text)}
.viewer .ek-atif-havuz[data-hukum=hatali-kunye]{color:var(--shell-error)}
.viewer .ek-atif-havuz-not{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.viewer .ek-atif-eylem{display:flex;flex-wrap:wrap;gap:6px}
.viewer .ek-atiflar :is(a,button){display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;border:1px solid var(--shell-line);border-radius:7px;background:var(--shell-bg);color:var(--shell-text);text-decoration:none;cursor:pointer;min-height:28px;padding:4px 8px;font:inherit;font-size:11px}
.viewer .ek-atiflar :is(a,button):hover{background:var(--shell-soft)}
.viewer .ek-atiflar :is(a,button,input):focus-visible{outline:2px solid var(--shell-focus);outline-offset:-2px}
.viewer .ek-atiflar button:disabled{opacity:.45;cursor:default}
.viewer .atif-cizgi{${CIZGI};cursor:pointer}
.viewer .atif-cizgi:hover,.viewer .atif-cizgi.vurgu{background:rgba(15,129,126,.16)}
.viewer .atif-cizgi.vurgu{animation:atif-vurgu 1.6s ease-out}
@keyframes atif-vurgu{from{background:rgba(15,129,126,.42)}to{background:rgba(15,129,126,.16)}}
.viewer .ek-atif-menu{position:absolute;z-index:4;box-sizing:border-box;max-width:min(360px,calc(100% - 16px));display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--shell-line);border-radius:10px;background:var(--shell-bg);color:var(--shell-text);box-shadow:0 10px 28px rgba(16,24,40,.22);font-size:12px;overflow:auto;overflow-wrap:anywhere}
.viewer .ek-atif-menu-eylem{display:flex;flex-wrap:wrap;gap:6px}
.viewer .ek-atif-menu a.chip{display:inline-flex;align-items:center;text-decoration:none}
.viewer .ek-atif-bul{position:absolute;z-index:3;box-sizing:border-box;padding:5px 10px;box-shadow:0 6px 18px rgba(16,24,40,.25)}
.viewer .ek-atif-secim{display:flex;flex-direction:column;gap:6px;border:1px solid var(--shell-line);border-radius:8px;background:var(--shell-bg);color:var(--shell-text);font-size:12px}
:host([data-theme=dark]) .viewer :is(.ek-atiflar,.ek-atif-menu,.ek-atif-bul){box-shadow:0 10px 28px rgba(0,0,0,.55)}
@container ekran (max-width:460px){.viewer .ek-atif-eylem :is(a,button){flex:1}.viewer .ek-atif-eylem .ek-atif-alinti-kopyala{flex-basis:100%}}
@media(prefers-reduced-motion:reduce){.viewer .atif-cizgi.vurgu{animation:none}}
@media(prefers-contrast:more){.viewer .ek-atif{border-color:var(--shell-muted)}.viewer .atif-cizgi{text-decoration-thickness:2px}.viewer :is(.ek-atiflar,.ek-atif-menu){border-color:var(--shell-text)}}
`;

  const api = Object.freeze({ SINIR, ILETI, CSS, udfMetni, dagit, bol, birlestir, alinti, idareDosyasi, htmlIsaretle, olustur });
  globalThis.UHDAtifPaneli = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
