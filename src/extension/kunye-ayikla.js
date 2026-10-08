/* global module */
// Karar künyesi ayıklayıcı: açılmış evrakın düz metnindeki Yargıtay, Danıştay, Anayasa Mahkemesi ve bölge adliye
// mahkemesi künyelerini yerelde bulur. DOM'a, ağa ve depolamaya dokunmaz; metin ve künye günlüğe yazılmaz.
// Dışarı yalnız disaAktar() alanları çıkar ve yalnız adres() ile kullanıcının tıkladığı bağlantının #k= parçasında taşınır.
// bul() ve ayikla() dizi döndürür. Dizinin sayılmayan `kesildi` özelliği, girdi SINIR.karakter sınırında kesildiği için
// listenin eksik olabileceğini bildirir (JSON'a ve yaymaya girmez; her zaman true/false tanımlıdır).
(() => {
  'use strict';
  if (globalThis.UHDKunye) return;   // arka plan içerik betiklerini yeniden yükleyebilir
  const SINIR = Object.freeze({ karakter: 2 * 1024 * 1024, secim: 300, adres: 10 });
  const ADRES_UZUNLUK = 4096;        // sunucu daha uzun #k= değerini reddeder
  // Katlanmış metinde en çok: mahkeme ile numara arası, aynı mahkemenin ardışık iki künyesi arası,
  // bölge mahkemesi adı ile ardından gelen çıplak daire ("… BAM'ın kapatılan 3. HD") arası.
  const PENCERE = 120, ZINCIR = 60, BAGLAM = 60;

  // ---- Katlama: her UTF-16 birimi en çok bir karaktere iner; konum[] ile özgün metindeki yeri korunur.
  const OZEL = { 'ı': 'i', '’': "'", '‘': "'", '´': "'", 'ʼ': "'", '′': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"' };
  const onbellek = new Map();
  // -1 boşluk, 0 atlanır (birleşik işaret, sıfır genişlikli karakter, yumuşak tire), 126 (~) tanınmayan işaret.
  function katlaKod(ch) {
    let k = onbellek.get(ch);
    if (k !== undefined) return k;
    if (/\s|[\u0080-\u009f]/.test(ch)) k = -1;
    else if (/[\u0300-\u036f\u00ad\u200b-\u200d\u2060]/.test(ch)) k = 0;
    else if (/[\u2010-\u2015\u2212]/.test(ch)) k = 45;
    else {
      let c = ch.toLocaleLowerCase('tr-TR');
      c = OZEL[c] || c;
      if (c.length !== 1 || c.charCodeAt(0) > 127) c = (OZEL[c] || c.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')).toLowerCase();
      k = c.length === 1 && c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 126;
      if (k <= 32) k = -1;
    }
    onbellek.set(ch, k);
    return k;
  }
  const harf = c => c >= 97 && c <= 122;
  // Büyük/küçük harf denetimi yerel ayarla yavaştır; karakter başına bir kez hesaplanır.
  const harfDurumu = new Map();
  function durum(ch) {
    let d = harfDurumu.get(ch);
    if (d === undefined) {
      d = ch !== ch.toLocaleUpperCase('tr-TR') ? 1 : ch !== ch.toLocaleLowerCase('tr-TR') ? 2 : 0;
      harfDurumu.set(ch, d);
    }
    return d;
  }
  const kucuk = ch => !!ch && durum(ch) === 1;
  const buyuk = ch => !!ch && durum(ch) === 2;

  // Küçük harfe, Türkçe harfleri ASCII'ye katlar; boşlukları teke indirir (iki satır sonu paragraf: \n),
  // satır sonundaki hece tiresini ("Dai-\nresi") birleştirir. konum[j], katlanmış j. karakterin özgün yeridir.
  function hazirla(metin) {
    const n = metin.length, kod = new Uint16Array(n), konum = new Uint32Array(n + 1);
    let j = 0, bosluk = -1, satir = 0, yumusak = false;
    for (let i = 0; i < n; i++) {
      const c = metin.charCodeAt(i);
      const k = c < 128 ? (c <= 32 || c === 127 ? -1 : c >= 65 && c <= 90 ? c + 32 : c === 96 ? 39 : c) : katlaKod(metin[i]);
      if (k === -1) {
        if (bosluk < 0) { bosluk = i; satir = 0; }
        if (c === 10 || c === 0x2028 || c === 0x2029 || (c === 13 && metin.charCodeAt(i + 1) !== 10)) satir++;
        continue;
      }
      if (k === 0) { if (c === 0xad) yumusak = true; continue; }
      if (bosluk >= 0) {
        let bitisik = false;
        if (satir && j > 1 && kucuk(metin[i]) && harf(k)) {
          if (kod[j - 1] === 45 && harf(kod[j - 2]) && kucuk(metin[konum[j - 2]])) { j--; bitisik = true; }
          else if (yumusak && harf(kod[j - 1]) && kucuk(metin[konum[j - 1]])) bitisik = true;
        }
        if (!bitisik && j) { kod[j] = satir > 1 ? 10 : 32; konum[j++] = bosluk; }
        bosluk = -1;
      }
      yumusak = false;
      kod[j] = k; konum[j++] = i;
    }
    konum[j] = n;
    let duz = '';
    for (let a = 0; a < j; a += 8192) duz += String.fromCharCode.apply(null, kod.subarray(a, Math.min(j, a + 8192)));
    return { duz, konum };
  }

  // ---- Dilbilgisi (katlanmış metin üzerinde). Düzenli ifadeler iç içe belirsiz tekrar içermez; süre doğrusaldır.
  const S = '(?![a-z0-9])';                                   // sözcük sonu
  const EK = "[a-z]{0,8}(?:'[a-z]{1,8})?";                    // Dairesi'nin, Dairesince, Kurulunun
  const KEK = "(?:'[a-z]{1,8})?";                             // HD'nin
  const SIRA = '(?:(?:(?:on|yirmi) ?)?(?:birinci|ikinci|ucuncu|dorduncu|besinci|altinci|yedinci|sekizinci|dokuzuncu)|onuncu|yirminci)';
  const NO = `\\d{1,2}(?: ?\\.|'? ?(?:inci|nci|uncu|ncu)${S})`;   // 3. · 3'üncü · 6 ncı
  const KAP = '(?:\\(kapatilan\\) )?';
  const YP = `(?:yargitay ${KAP}|yarg\\. ?|y\\. ?)`;
  const DP = `(?:danistay ${KAP}|dan\\. ?|d\\. ?)`;
  const kis = harfler => harfler.split('').join('\\.? ?') + `\\.?${S}${KEK}`;   // HGK, H.G.K., H. G. K.
  // Sıra önemlidir: aynı yerde başlayan seçeneklerden ilk eşleşen alınır.
  const ANMA = [
    ['ibk', `${YP}?(?:ictiha(?:di|tlari|t) birlestirme (?:buyuk |hukuk |ceza )?genel kurulu${EK}|y?${kis('ibbgk')}|y?${kis('ibgk')}|y?${kis('ibk')})`],
    ['hgk', `${YP}?(?:hukuk genel kurulu${EK}|y?${kis('hgk')})`],
    ['cgk', `${YP}?(?:ceza genel kurulu${EK}|y?${kis('cgk')})`],
    ['hdbk', `${YP}?(?:hukuk daireleri baskanlar kurulu${EK}|y?${kis('hdbk')})`],
    ['cdbk', `${YP}?(?:ceza daireleri baskanlar kurulu${EK}|y?${kis('cdbk')})`],
    ['bgk', `${YP}?buyuk genel kurul${EK}`],
    ['dibk', `(?:danistay ${KAP}ictiha(?:tlari|di|t) birlestirme kurulu${EK}|ictihatlari birlestirme kurulu${EK}|danistay ${kis('ibk')}|${kis('dibk')})`],
    ['iddk', `${DP}?(?:ida(?:ri|re) dava daireleri (?:genel )?kurulu${EK}|${kis('iddk')})`],
    ['vddk', `${DP}?(?:vergi dava daireleri (?:genel )?kurulu${EK}|${kis('vddk')})`],
    ['dd', `(?:danistay ${KAP}(?:${NO}|${SIRA})|(?:d|dan)\\. ?\\d{1,2} ?\\.) ?d(?:aire(?:si)?${EK}|\\.?${S}${KEK})`],
    ['bim', `(?:bolge idare mahkemesi${EK}|${kis('bim')})(?: ${KAP}(?:(?:${NO}|${SIRA}) ?)?(?:ida(?:ri|re)|vergi) dava daire(?:si|leri (?:genel )?kurulu)${EK}| (?:${kis('iddk')}|${kis('vddk')}))?`],
    ['bam', `(?:[a-z]+${KEK} )?(?:bolge adliye mahkemesi${EK}|bam${S}${KEK})(?: ${KAP}(?:${NO}|${SIRA}) ?(?:(?:hukuk|ceza) dairesi${EK}|[hc]\\.? ?d\\.?${S}${KEK}))?`],
    ['yd', `(?:${YP}|y(?=\\d))?(?:(?:${NO}|${SIRA}) ?(?:hukuk|ceza) dairesi${EK}|\\d{1,2} ?\\.? ?[hc]\\.? ?d\\.?${S}${KEK})`],
    ['aym', `(?:t\\.? ?c\\.? )?(?:anayasa mahkemesi${EK}|aym${S}${KEK})`],
    // Başka bir yargı yeri: aradaki numaralar onundur; önceki Yargıtay/Danıştay anmasıyla eşleştirilmez.
    ['engel', `[a-z]*(?:mahkemesi|mahkemeleri|mudurlugu|savciligi|hakimligi|noterligi|icra dairesi|hakem heyeti|baskanligi'?n[ae])${EK}`]
  ];
  // Yönelme eki ("Dairesine", "Daire'ye", "Kuruluna", "HGK'ya", "BAŞKANLIĞI'NA") dilekçenin gönderildiği yeri gösterir;
  // ardındaki "ESAS NO … KARAR NO …" alt mahkemenin dosyasıdır, künye değildir. AYM'ye "yapılan başvuru" bundan ayrıktır.
  const YONELME = /(?:(?:si|su|lu)'?n|'?y|kurul'?)[ae]$/;
  const ANMA_RE = new RegExp(`(?<![a-z0-9])(?:${ANMA.map(([, kaynak]) => `(${kaynak})`).join('|')})`, 'g');
  const NUM = '((?:19|20)\\d{2} ?/ ?(?:\\d{1,2}-)?\\d{1,7})(?!\\.?[0-9])';   // "2010/ 21.01.2010" sıra numarası değildir
  const E_ON = '(?:esas(?: (?:no(?:su)?|numarasi|sayisi))?|e\\.?(?: ?no)?)\\.? ?:? ?';
  const K_ON = '(?:karar(?: (?:no(?:su)?|numarasi|sayisi))?|k\\.?(?: ?no)?)\\.? ?:? ?';
  const E_SON = ` ?(?:esas|e)${S}\\.?`, K_SON = ` ?(?:karar|k)${S}\\.?`;
  const ARA = ' ?(?:[,;-] ?)?(?:(?:ve|ile) )?';
  // 1-2: "2010/119 E., 2010/478 K." · 3-4: "E. 2010/119 K. 2010/478" · 5-6: AYM bireysel başvuru numarası
  const GRUP_RE = new RegExp(`(?<![a-z0-9])(?:${NUM}${E_SON}${ARA}${NUM}${K_SON}|${E_ON}${NUM}${ARA}${K_ON}${NUM}|` +
    `(?:b\\.? ?no|basvuru (?:no|numarasi))\\.? ?:? ?${NUM}|${NUM} (?:basvuru numarali|numarali basvuru|sayili basvuru))`, 'g');
  const TARIH = '(?<![0-9])(?<![0-9][./])(\\d{1,2})[./](\\d{1,2})[./](\\d{4})(?![0-9])';
  const TARIH_RE = new RegExp(TARIH, 'g');
  const SONRA_TARIH_RE = new RegExp(`^(?:[ ,;:()-]{0,4}(?:sayili|ve|ile|tarihli|tarihinde|tarihi|tarih|karar tarihi|kararlari|karari|ilami|k\\.? ?t|t)(?![a-z])\\.?){0,3}[ ,;:()-]{0,4}${TARIH}`);
  const SIRA_RE = new RegExp(`(\\d{1,2})|(${SIRA})`);
  const BIRLER = { birinci: 1, ikinci: 2, ucuncu: 3, dorduncu: 4, besinci: 5, altinci: 6, yedinci: 7, sekizinci: 8, dokuzuncu: 9 };
  const KISALTMA = new Set(['yarg', 'prof', 'mahk']);   // nokta ve büyük harfle sürse de cümle sonu sayılmaz
  const BAM_ILLERI = new Map([['adana', 'Adana'], ['ankara', 'Ankara'], ['antalya', 'Antalya'], ['bursa', 'Bursa'], ['denizli', 'Denizli'],
    ['diyarbakir', 'Diyarbakır'], ['erzurum', 'Erzurum'], ['gaziantep', 'Gaziantep'], ['istanbul', 'İstanbul'], ['izmir', 'İzmir'],
    ['kayseri', 'Kayseri'], ['konya', 'Konya'], ['sakarya', 'Sakarya'], ['samsun', 'Samsun'], ['tekirdag', 'Tekirdağ'], ['trabzon', 'Trabzon'], ['van', 'Van']]);
  const KURUL = {
    ibk: ['YARGITAY', 'İçtihadı Birleştirme Büyük Genel Kurulu'], hgk: ['YARGITAY', 'Hukuk Genel Kurulu'], cgk: ['YARGITAY', 'Ceza Genel Kurulu'],
    hdbk: ['YARGITAY', 'Hukuk Daireleri Başkanlar Kurulu'], cdbk: ['YARGITAY', 'Ceza Daireleri Başkanlar Kurulu'], bgk: ['YARGITAY', 'Büyük Genel Kurul'],
    dibk: ['DANISTAY', 'İçtihatları Birleştirme Kurulu'], iddk: ['DANISTAY', 'İdari Dava Daireleri Kurulu'], vddk: ['DANISTAY', 'Vergi Dava Daireleri Kurulu']
  };

  // Daire numarası rakamla ("3.") ya da yazıyla ("Üçüncü", "On İkinci") yazılabilir; dönüş { no, son }.
  function daireNo(yazi) {
    const m = SIRA_RE.exec(yazi);
    if (!m) return null;
    let no;
    if (m[1]) no = Number(m[1]);
    else {
      let s = m[2].replace(/ /g, '');
      if (s === 'onuncu') no = 10;
      else if (s === 'yirminci') no = 20;
      else {
        no = 0;
        if (s.startsWith('yirmi')) { no = 20; s = s.slice(5); } else if (s.startsWith('on')) { no = 10; s = s.slice(2); }
        no += BIRLER[s];
      }
    }
    return { no, son: m.index + m[0].length };
  }
  const cezaMi = kalan => /ceza|(?:^|[^a-z])c\.? ?d(?![a-z])/.test(kalan);

  // Eşleşen anma metnini yargı yerine çevirir. engel: bu anmadan sonraki numaralar künye sayılmaz.
  function anmaCoz(tur, yazi) {
    if (KURUL[tur]) {
      const a = { mahkeme: KURUL[tur][0], daire: KURUL[tur][1] };
      if ((tur === 'iddk' || tur === 'vddk') && !/^(?:danistay|dan\.|d\.)/.test(yazi)) a.ciplak = true;
      return a;
    }
    if (tur === 'aym') return { mahkeme: 'AYM' };
    if (tur === 'engel') return { engel: true };
    if (tur === 'bim') return { engel: true, baglam: 'bim' };
    if (tur === 'bam') {
      const kelime = /^([a-z]+)(?:'[a-z]+)? (?:bolge|bam)/.exec(yazi);
      const il = kelime ? BAM_ILLERI.get(kelime[1]) : undefined;
      const d = daireNo(yazi.slice(kelime ? kelime[0].length : 0));
      if (!il || !d) return { engel: true, baglam: 'bam', il };
      const kalan = yazi.slice((kelime ? kelime[0].length : 0) + d.son);
      return { mahkeme: 'BAM', il, daire: `${d.no}. ${cezaMi(kalan) ? 'Ceza' : 'Hukuk'} Dairesi`, no: d.no, baglam: 'bam' };
    }
    const d = daireNo(yazi);
    if (!d) return { engel: true };
    if (tur === 'dd') return { mahkeme: 'DANISTAY', daire: `${d.no}. Daire`, no: d.no };
    const a = { mahkeme: 'YARGITAY', daire: `${d.no}. ${cezaMi(yazi.slice(d.son)) ? 'Ceza' : 'Hukuk'} Dairesi`, no: d.no };
    if (!/^(?:yargitay|yarg\.|y\.|y\d)/.test(yazi)) a.ciplak = true;
    return a;
  }
  function olmayanDaire(a) {
    if (a.no === undefined) return false;
    if (a.no === 0) return true;
    return a.mahkeme === 'YARGITAY' ? a.no > 23 : a.mahkeme === 'DANISTAY' ? a.no > 17 : false;
  }

  // Katlanmış [a, b) aralığında cümle ya da paragraf bitiyor mu? Kısaltma noktaları (E., HD., Y., 3.) bitiş sayılmaz.
  function cumleSonu(duz, konum, metin, a, b) {
    for (let i = a; i < b; i++) {
      const c = duz.charCodeAt(i);
      if (c === 10 || c === 33 || c === 63) return true;
      if (c !== 46 || duz.charCodeAt(i + 1) !== 32 || i + 2 >= b || !harf(duz.charCodeAt(i + 2)) || !buyuk(metin[konum[i + 2]])) continue;
      let w = i;
      while (w > 0 && harf(duz.charCodeAt(w - 1))) w--;
      if (i - w > 3 && !KISALTMA.has(duz.slice(w, i))) return true;
    }
    return false;
  }

  function anmalariBul(duz, konum, metin) {
    const anmalar = [];
    ANMA_RE.lastIndex = 0;
    for (let m; (m = ANMA_RE.exec(duz));) {
      let t = 1;
      while (m[t] === undefined) t++;
      const a = anmaCoz(ANMA[t - 1][0], m[0]);
      a.b = m.index; a.s = m.index + m[0].length;
      if (a.mahkeme && a.mahkeme !== 'AYM' && YONELME.test(m[0])) a.engel = true;
      // "Bölge Adliye/İdare Mahkemesi ... 3. Hukuk Dairesi": yargı yeri belirtilmemiş daire o bağlama aittir.
      const p = anmalar[anmalar.length - 1];
      if (a.ciplak && p?.baglam && a.b - p.s <= BAGLAM && !cumleSonu(duz, konum, metin, p.s, a.b)) {
        if (p.baglam === 'bam' && p.il && a.mahkeme === 'YARGITAY' && a.no !== undefined) { a.mahkeme = 'BAM'; a.il = p.il; a.baglam = 'bam'; }
        else a.engel = true;
      }
      anmalar.push(a);
    }
    return anmalar;
  }

  const numara = s => s.replace(/ /g, '').replace(/\/0+(?=\d)/, '/').replace(/-0+(?=\d)/, '-');
  function tarihOku(g, a, y) {
    const gun = Number(g), ay = Number(a), yil = Number(y);
    const d = new Date(Date.UTC(yil, ay - 1, gun));
    if (yil < 1900 || yil > 2100 || d.getUTCFullYear() !== yil || d.getUTCMonth() !== ay - 1 || d.getUTCDate() !== gun) return null;
    return `${y}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
  }
  // Mahkeme ile numara arasındaki son tarih ("…'nin 21.01.2010 tarihli, 2010/119 E. …").
  function oncekiTarih(duz, a, b) {
    if (b <= a) return null;
    const parca = duz.slice(a, b);
    let son = null;
    TARIH_RE.lastIndex = 0;
    for (let m; (m = TARIH_RE.exec(parca));) son = { b: a + m.index, s: a + m.index + m[0].length, iso: tarihOku(m[1], m[2], m[3]) };
    return son;
  }
  // Numaradan hemen sonra gelen tarih ("…K., T. 21.01.2010", "…K. sayılı ve 21.01.2010 tarihli").
  function sonrakiTarih(duz, s) {
    const m = SONRA_TARIH_RE.exec(duz.slice(s, s + 80));
    if (!m) return null;
    const uzunluk = m[1].length + m[2].length + m[3].length + 2;
    return { b: s + m[0].length - uzunluk, s: s + m[0].length, iso: tarihOku(m[1], m[2], m[3]) };
  }

  // Alan sırası sabittir: mahkeme, daire, il?, esasNo, kararNo, tarih?, hatali?, bas, son, ham, anahtar, sayi?
  function kunyeKur(alan, bas, son, ham) {
    const k = { mahkeme: alan.mahkeme, daire: alan.daire };
    if (alan.il) k.il = alan.il;
    k.esasNo = alan.esasNo; k.kararNo = alan.kararNo;
    if (alan.tarih) k.tarih = alan.tarih;
    if (alan.hatali) k.hatali = alan.hatali;
    k.bas = bas; k.son = son; k.ham = ham;
    k.anahtar = [k.mahkeme, k.daire, k.il || '', k.esasNo, k.kararNo || ''].join('|');
    if (alan.sayi !== undefined) k.sayi = alan.sayi;
    return k;
  }

  function tara(metin, sonuc) {
    const { duz, konum } = hazirla(metin);
    const anmalar = anmalariBul(duz, konum, metin);
    let ai = -1, onceki = null, tuketilen = 0;
    GRUP_RE.lastIndex = 0;
    for (let g; (g = GRUP_RE.exec(duz));) {
      const gb = g.index, gs = gb + g[0].length;
      while (ai + 1 < anmalar.length && anmalar[ai + 1].s <= gb) ai++;
      const a = anmalar[ai];
      const zincir = !!onceki && onceki.anma === a;
      const bas = zincir ? onceki.s : a?.s;
      const bireysel = g[5] || g[6];
      onceki = null;
      if (!a || a.engel || gb - bas > (zincir ? ZINCIR : PENCERE) || cumleSonu(duz, konum, metin, bas, gb)) continue;
      if (bireysel && a.mahkeme !== 'AYM') continue;
      const alan = { mahkeme: a.mahkeme, daire: a.daire, il: a.il };
      if (a.mahkeme === 'AYM') alan.daire = bireysel ? 'Bireysel başvuru' : 'Norm denetimi';
      alan.esasNo = numara(bireysel || g[1] || g[3]);
      alan.kararNo = bireysel ? null : numara(g[2] || g[4]);
      let tarih = oncekiTarih(duz, Math.max(bas, tuketilen), gb), bitis = gs;
      const once = !!tarih;
      if (!tarih) { tarih = sonrakiTarih(duz, gs); if (tarih) bitis = tarih.s; }
      if (tarih?.iso) alan.tarih = tarih.iso;
      if (olmayanDaire(a)) alan.hatali = 'olmayan_daire';
      else if (tarih && !tarih.iso) alan.hatali = 'gecersiz_tarih';
      // Zincirdeki ikinci künye ("… K. ve 2011/5 E., 2011/9 K.") yalnız kendi numarasını (ve tarihini) işaretler.
      const nb = zincir ? (once ? tarih.b : gb) : a.b;
      const kb = konum[nb], ks = konum[bitis - 1] + 1;
      sonuc.push(kunyeKur(alan, kb, ks, metin.slice(kb, ks)));
      onceki = { anma: a, s: bitis };
      tuketilen = bitis;
    }
  }

  const isaretle = (dizi, kesildi) => Object.defineProperty(dizi, 'kesildi', { value: !!kesildi, enumerable: false });
  // Sınırdaki sözcük yarım kalmasın ("2010/47|8" yanlış numara olurdu): son boşlukta kesilir.
  function kes(metin) {
    let s = SINIR.karakter;
    const alt = s - 512;
    while (s > alt && !/\s/.test(metin[s])) s--;
    return metin.slice(0, s > alt ? s : SINIR.karakter);
  }

  // Metindeki her künye geçişi, metindeki sırasıyla.
  function bul(metin) {
    const sonuc = [];
    let kesildi = false;
    if (typeof metin === 'string' && metin) {
      if (metin.length > SINIR.karakter) { metin = kes(metin); kesildi = true; }
      tara(metin, sonuc);
    }
    return isaretle(sonuc, kesildi);
  }

  // Tekilleştirilmiş liste: ilk geçişin alanları ve konumu + sayi. İlk geçişte tarih yoksa sonraki geçişin tarihi alınır
  // (geçersiz yazılmış ilk tarihin "gecersiz_tarih" işareti de bu durumda kalkar). tekillestir(), bul() sonucunu yeniden
  // taramadan tekilleştirir (görüntüleyici her geçişi işaretler, listeyi tekilleştirir).
  function ayikla(metin) { return tekillestir(bul(metin)); }
  function tekillestir(hepsi) {
    const harita = new Map(), sira = [];
    for (const k of hepsi) {
      const ilk = harita.get(k.anahtar);
      if (!ilk) { const yeni = { ...k, sayi: 1 }; harita.set(k.anahtar, yeni); sira.push(yeni); continue; }
      ilk.sayi++;
      if (!ilk.tarih && k.tarih) { ilk.tarih = k.tarih; if (ilk.hatali === 'gecersiz_tarih') delete ilk.hatali; }
    }
    return isaretle(sira.map(k => kunyeKur(k, k.bas, k.son, k.ham)), hepsi.kesildi);
  }

  // ---- Yazımlar (sözleşme §4).
  const MAHKEMELER = new Set(['YARGITAY', 'DANISTAY', 'AYM', 'BAM']);
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const trTarih = iso => ISO.test(iso || '') ? iso.split('-').reverse().join('.') : '';
  const bireyselMi = k => k.mahkeme === 'AYM' && k.kararNo == null;
  const KISA = {
    'Hukuk Genel Kurulu': 'HGK', 'Ceza Genel Kurulu': 'CGK', 'Hukuk Daireleri Başkanlar Kurulu': 'HDBK', 'Ceza Daireleri Başkanlar Kurulu': 'CDBK',
    'Büyük Genel Kurul': 'BGK', 'İçtihadı Birleştirme Büyük Genel Kurulu': 'İBBGK', 'İdari Dava Daireleri Kurulu': 'İDDK',
    'Vergi Dava Daireleri Kurulu': 'VDDK', 'İçtihatları Birleştirme Kurulu': 'DİBK'
  };
  function kisaDaire(k) {
    const d = String(k.daire || ''), m = /^(\d{1,2})\. (?:(Hukuk|Ceza) )?Daire/.exec(d);
    const hc = m && (m[2] === 'Ceza' ? 'CD' : 'HD');
    if (k.mahkeme === 'YARGITAY') return m ? `Y. ${m[1]}. ${hc}` : KISA[d] || `Y. ${d}`;
    if (k.mahkeme === 'DANISTAY') return m ? `D. ${m[1]}. D.` : KISA[d] || `D. ${d}`;
    if (k.mahkeme === 'BAM') return `${k.il} BAM ${m ? `${m[1]}. ${hc}` : d}`;
    return 'AYM';
  }
  function kisaYazim(k) {
    if (!k || !MAHKEMELER.has(k.mahkeme)) return '';
    const parcalar = [kisaDaire(k)];
    if (bireyselMi(k)) parcalar.push(`B. No: ${k.esasNo}`); else parcalar.push(`E. ${k.esasNo}`, `K. ${k.kararNo}`);
    const t = trTarih(k.tarih);
    if (t) parcalar.push(t);
    return parcalar.join(' · ');
  }
  function tamYazim(k) {
    if (!k || !MAHKEMELER.has(k.mahkeme)) return '';
    const ad = k.mahkeme === 'YARGITAY' ? `Yargıtay ${k.daire}` : k.mahkeme === 'DANISTAY' ? `Danıştay ${k.daire}`
      : k.mahkeme === 'BAM' ? `${k.il} Bölge Adliye Mahkemesi ${k.daire}` : bireyselMi(k) ? 'Anayasa Mahkemesi' : 'Anayasa Mahkemesi (Norm denetimi)';
    const parcalar = [ad];
    if (bireyselMi(k)) parcalar.push(`B. No: ${k.esasNo}`); else parcalar.push(`E. ${k.esasNo}`, `K. ${k.kararNo}`);
    const t = trTarih(k.tarih);
    if (t) parcalar.push(`T. ${t}`);
    return parcalar.join(', ');
  }

  // ---- Sözleşme §2: dışarı çıkan tek biçim. ham, bas, son, sayi, anahtar asla eklenmez.
  function disaAktar(k) {
    if (!k || !MAHKEMELER.has(k.mahkeme) || typeof k.daire !== 'string' || typeof k.esasNo !== 'string') return null;
    const o = { mahkeme: k.mahkeme, daire: k.daire };
    if (k.mahkeme === 'BAM' && typeof k.il === 'string') o.il = k.il;
    o.esasNo = k.esasNo;
    o.kararNo = typeof k.kararNo === 'string' ? k.kararNo : null;
    if (ISO.test(k.tarih || '')) o.tarih = k.tarih;
    if (k.hatali === 'olmayan_daire' || k.hatali === 'gecersiz_tarih') o.hatali = k.hatali;
    return o;
  }
  const ALFABE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64url(bayt) {
    let out = '';
    for (let i = 0; i < bayt.length; i += 3) {
      const n = (bayt[i] << 16) | ((bayt[i + 1] || 0) << 8) | (bayt[i + 2] || 0);
      out += ALFABE[n >> 18 & 63] + ALFABE[n >> 12 & 63];
      if (i + 1 < bayt.length) out += ALFABE[n >> 6 & 63];
      if (i + 2 < bayt.length) out += ALFABE[n & 63];
    }
    return out;
  }
  function un64url(s) {
    if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
    const out = new Uint8Array(Math.floor(s.length * 3 / 4)), d = i => i < s.length ? ALFABE.indexOf(s[i]) : 0;
    let j = 0;
    for (let i = 0; i < s.length; i += 4) {
      const n = (d(i) << 18) | (d(i + 1) << 12) | (d(i + 2) << 6) | d(i + 3);
      out[j++] = n >> 16 & 255;
      if (i + 2 < s.length) out[j++] = n >> 8 & 255;
      if (i + 3 < s.length) out[j++] = n & 255;
    }
    return out;
  }
  // base64url(UTF-8 JSON {v:1,k:[…]}), dolgu (=) yok.
  function kodla(kunyeler) {
    const k = (Array.isArray(kunyeler) ? kunyeler : [kunyeler]).map(disaAktar).filter(Boolean);
    return b64url(new TextEncoder().encode(JSON.stringify({ v: 1, k })));
  }
  function coz(deger) {
    if (typeof deger !== 'string' || deger.length > ADRES_UZUNLUK + 3) return null;
    const bayt = un64url(deger.replace(/^#?(?:k=)?/, ''));
    if (!bayt) return null;
    try {
      const o = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bayt));
      return o && o.v === 1 && Array.isArray(o.k) ? o : null;
    } catch { return null; }
  }
  // Kullanıcının tıklayacağı "Tam metni aç" adresi: seçili künye başta, ardından diğerleri belge sırasıyla, en çok 10.
  function adres(kunyeler, secili = 0) {
    const taban = globalThis.UHD?.BRAND?.kararBul;
    if (typeof taban !== 'string' || !taban || !Array.isArray(kunyeler) || !kunyeler.length) return null;
    let i = typeof secili === 'number' ? secili : kunyeler.indexOf(secili);
    if (!Number.isInteger(i) || i < 0 || i >= kunyeler.length) i = 0;
    if (!disaAktar(kunyeler[i])) return null;
    const liste = [kunyeler[i], ...kunyeler.filter((k, j) => j !== i && disaAktar(k))].slice(0, SINIR.adres);
    let deger = kodla(liste);
    while (deger.length > ADRES_UZUNLUK && liste.length > 1) { liste.pop(); deger = kodla(liste); }
    return deger.length > ADRES_UZUNLUK ? null : `${taban}#k=${deger}`;
  }

  const api = Object.freeze({ SINIR, bul, ayikla, tekillestir, kisaYazim, tamYazim, disaAktar, kodla, coz, adres });
  globalThis.UHDKunye = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
