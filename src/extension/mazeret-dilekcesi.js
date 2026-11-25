'use strict';
// Duruşma çakışması için mazeret dilekçesi taslağı. Eklentide zaten bulunan bilgiyle (birim, esas numarası, duruşma günü
// ve saati, çakışan öteki duruşma) dilekçe iskeletini doldurur, düzenlenebilir bir pencerede gösterir ve UDF olarak
// indirir ya da metnini kopyalar. Dilekçeyi göndermez, imzalamaz, UYAP'a istek atmaz, süre hesaplamaz; müvekkil adı
// yazmaz. Metin iskelettir: köşeli ayraçlı yer tutucuları ve ekini avukat tamamlar.
// UDF (UYAP Doküman Formatı) bir zip paketidir; içindeki content.xml bütün metni tek havuzda (CDATA) tutar, paragraf
// parçaları havuzu startOffset/length ile gösterir. Yazıcı yalnız düz paragraf üretir (hiza, kalın).
(() => {
  if (!globalThis.UHD || globalThis.UHD.mazeretDilekcesi) return;

  const YER = Object.freeze({ sifat: '[DAVACI/DAVALI]', vekil: '[AD SOYAD]', baro: '[BARO]', sicil: '[SİCİL NO]' });
  const NOT = 'Legaluga dilekçeyi göndermez ve imzalamaz. Dosyayı UYAP Doküman Editörü’nde açıp kontrol edin, köşeli ayraçlı '
    + 'yerleri tamamlayın; ek sunacaksanız belgeyi siz eklersiniz. İmzalama ve gönderme sizde kalır.';
  // Heyet hâlinde çalışan birimlerde hitap başkanlığadır; öteki mahkemelerde hâkimliğe. Alan pencerede düzenlenebilir.
  const HEYET = /ticaret|ağır ceza|idare|vergi|bölge|dairesi|yargıtay|danıştay/;

  // Tek satır: satır sonu, denetim karakteri ve UDF'nin gömülü nesne işareti (U+FFFC) metne taşınmaz.
  const DENETIM = new RegExp('[\\x00-\\x1f\\x7f' + String.fromCharCode(0xfffc) + ']+', 'g');
  const temiz = s => String(s == null ? '' : s).replace(DENETIM, ' ').replace(/\s+/g, ' ').trim();
  const buyuk = s => s.toLocaleUpperCase('tr-TR');
  const ilkBuyuk = s => (s ? buyuk(s.charAt(0)) + s.slice(1) : s);
  // Yalnız cümle düzeniyle yazılmış metnin ("Duruşma tutanağı") ilk harfi küçülür; başka büyük harf taşıyan metin
  // kısaltma ya da özel adla başlıyor olabilir ("UYAP çıktısı", "Örnekköy 2. İş Mahkemesi zaptı"), yazıldığı gibi kalır.
  const ilkKucuk = s => (s && s.slice(1) === s.slice(1).toLocaleLowerCase('tr-TR') ? s.charAt(0).toLocaleLowerCase('tr-TR') + s.slice(1) : s);
  // "(Kapatılan) X Mahkemesi" ve "X Mahkemesi (kapatılan)" → "X Mahkemesi"
  const birim = ad => temiz(ad).replace(/^\([^)]*\)\s*/, '').replace(/\s*\([^)]*\)$/, '');
  const esas = no => (temiz(no) ? `${temiz(no)} Esas` : '');
  const trTarih = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };

  // İmza satırı: Ayarlar'da kayıtlı baro ve sicil; eksik olan yer tutucu kalır. "X Barosu" yazılmışsa ek yinelenmez.
  const baroSatiri = (baro, sicil) => `${temiz(baro).replace(/\s*barosu$/i, '') || YER.baro} Barosu — Sicil ${temiz(sicil) || YER.sicil}`;

  function hitap(birimAdi) {
    const ad = birim(birimAdi);
    // Adı zaten hâkimlik olan birimde ("… Sulh Ceza Hâkimliği") ek yinelenmez, ad yönelme hâline girer.
    if (/h[âa]kimliği$/.test(ad.toLocaleLowerCase('tr-TR'))) return `${buyuk(ad)}NE`;
    return ad ? `${buyuk(ad)} ${HEYET.test(ad.toLocaleLowerCase('tr-TR')) ? 'BAŞKANLIĞINA' : 'HÂKİMLİĞİNE'}` : '';
  }

  // Düzenlenebilir alanlar. cakisanlar: durusmaCakismalari'nin bu duruşma için verdiği liste ([{ d }]).
  function alanlar(/** @type {{ durusma?: any, cakisanlar?: any[], sifat?: string, vekil?: string, baro?: string, sicil?: string, bugun?: string }} */ { durusma, cakisanlar, sifat, vekil, baro, sicil, bugun } = {}) {
    const liste = (cakisanlar || []).map(c => c && c.d).filter(Boolean);
    if (!durusma || !liste.length) return null;
    const yerler = liste.map(d => `${birim(d.birimAdi)} ${esas(d.dosyaNo)} sayılı dosyasında (saat ${temiz(d.saat)})`);
    return {
      hitap: hitap(durusma.birimAdi),
      dosyaNo: esas(durusma.dosyaNo),
      sifat: temiz(sifat) || YER.sifat,
      vekil: temiz(vekil) || YER.vekil,
      tarih: trTarih(durusma.tarih),
      saat: temiz(durusma.saat),
      gerekce: `${yerler.join(' ve ')} ${liste.length > 1 ? 'duruşmalarım' : 'duruşmam'} bulunması`,
      ek: '',   // ek anılmaz; avukat belge ekleyecekse adını yazar
      baro: baroSatiri(baro, sicil),
      duzenleme: trTarih(bugun)
    };
  }

  // Dilekçe iskeleti: paragraf = { hiza, parcalar: [{ metin, kalin }] }. Numaralar düz metindir; liste kullanılmaz.
  // Metin her yargı kolunda kullanılabilsin diye kanun maddesi anmaz ve baştan sona birinci tekil kişiyle yazılır. Ek alanı
  // boşsa dilekçe eke atıf yapmaz: ek cümlesi ve EK satırı birlikte gelir ya da birlikte kalkar.
  function paragraflar(a) {
    const t = Object.fromEntries(Object.entries(a || {}).map(([k, v]) => [k, temiz(v)]));
    const p = (hiza, ...parcalar) => ({ hiza, parcalar: parcalar.filter(x => x.metin) });
    const duz = metin => ({ metin, kalin: false }), kalin = metin => ({ metin, kalin: true });
    const bos = () => p('left');
    const cogul = /duruşmalarım/.test(t.gerekce);
    const belge = t.ek ? `Mazeretimi gösteren ${ilkKucuk(t.ek)} dilekçem ekinde sunulmuştur.`
      : `${cogul ? 'Anılan duruşmalar' : 'Anılan duruşma'} UYAP kayıtlarında yer almaktadır.`;
    return [
      p('center', kalin(t.hitap)),
      bos(),
      p('left', kalin('DOSYA NO'), duz(` : ${t.dosyaNo}`)),
      p('left', kalin('MAZERET BİLDİREN'), duz(` : ${t.sifat} vekili Av. ${t.vekil}`)),
      p('left', kalin('KONU'), duz(` : ${t.tarih} tarihli duruşmaya ilişkin mazeretin bildirilmesi ve duruşmanın başka bir güne bırakılması istemidir.`)),
      bos(),
      p('center', kalin('AÇIKLAMALAR')),
      p('justify', duz(`1. Yukarıda esas numarası yazılı dosyanın duruşması ${t.tarih} günü saat ${t.saat} olarak belirlenmiştir.`)),
      p('justify', duz(`2. Aynı gün ${t.gerekce} nedeniyle ${cogul ? 'bu duruşmaların tümünde' : 'her iki duruşmada birlikte'} hazır bulunmam mümkün değildir. ${belge}`)),
      p('justify', duz('3. Bu nedenle mazeretimin kabulünü ve duruşmanın başka bir güne bırakılmasını talep etme zorunluluğu doğmuştur.')),
      bos(),
      p('justify', kalin('SONUÇ VE İSTEM'), duz(' : Yukarıda açıklanan nedenlerle mazeretimin '), kalin('KABULÜ'),
        duz(' ile duruşmanın başka bir güne bırakılmasına ve yeni duruşma gününün tarafıma bildirilmesine karar verilmesini saygıyla arz ve talep ederim.')),
      ...(t.ek ? [p('left', kalin('EK'), duz(` : ${ilkBuyuk(t.ek)}`))] : []),
      bos(),
      ...(t.duzenleme ? [p('right', duz(t.duzenleme))] : []),
      p('right', duz(`${t.sifat} Vekili`)),
      p('right', duz(`Av. ${t.vekil}`)),
      p('right', duz(t.baro)),
      p('right', duz('(e-imzalıdır)'))
    ];
  }

  const paragrafMetni = p => p.parcalar.map(x => x.metin).join('');
  const duzMetin = liste => liste.map(paragrafMetni).join('\n');

  // ---------------------------------------------------------------- UDF
  const HIZA = { left: '0', center: '1', right: '2', justify: '3' };

  // Havuz: her paragrafın metni + '\n', sonda hiçbir parçanın kapsamadığı bir '\n' daha. Paragrafın son parçası kendi
  // satır sonunu da kapsar (length + 1); boş paragraf yalnız satır sonunu kapsayan tek parçadır.
  function icerikXml(liste) {
    let havuz = '', govde = '';
    for (const par of liste) {
      const parcalar = par.parcalar.length ? par.parcalar : [{ metin: '', kalin: false }];
      let icerik = '';
      parcalar.forEach((x, i) => {
        const metin = String(x.metin).replace(DENETIM, ' '), son = i === parcalar.length - 1;
        icerik += `<content resolver="hvl-default"${x.kalin ? ' bold="true"' : ''} startOffset="${havuz.length}" length="${metin.length + (son ? 1 : 0)}" />`;
        havuz += metin;
      });
      havuz += '\n';
      govde += `<paragraph Alignment="${HIZA[par.hiza] || '0'}" resolver="hvl-default" LeftIndent="0" RightIndent="0" FirstLineIndent="0" `
        + `LineSpacing="0" SpaceAbove="1" SpaceBelow="1" Hanging="0.0">${icerik}</paragraph>`;
    }
    havuz += '\n';
    return '<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >\n'
      + `<content><![CDATA[${havuz.replaceAll(']]>', ']]]]><![CDATA[>')}]]></content>\n`
      + '<properties><pageFormat mediaSizeName="1" leftMargin="42.52" rightMargin="28.35" topMargin="42.52" bottomMargin="14.17" '
      + 'paperOrientation="1" headerFOffset="15" footerFOffset="60" /></properties>\n'
      + `<elements >\n${govde}\n</elements>\n`
      + '<styles><style name="default" size="12" description="Geçerli" RightIndent="15.0" foreground="-16777216" family="Dialog" italic="false" bold="false" />'
      + '<style name="hvl-default" size="12" LineSpacing="0.0" description="Gövde" LeftIndent="0.0" SpaceAbove="0.0" RightIndent="0.0" Alignment="0" '
      + 'family="Times New Roman" SpaceBelow="0.0" /></styles>\n</template>\n';
  }

  // Tek girdili zip: content.xml, DEFLATE. UYAP'ın kendi dosyalarındaki gibi mimetype girdisi yoktur. Tarih sabittir.
  // CRC-32 bu dosyadan önce yüklenen ZIP okuyucusundan (DurusmaPaketiZip) gelir.
  async function udf(liste) {
    const ham = new TextEncoder().encode(icerikXml(liste)), ad = new TextEncoder().encode('content.xml');
    const sikisik = new Uint8Array(await new Response(new Blob([ham]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const baslik = (imza, uz, merkezi) => {
      const b = new Uint8Array(uz), dv = new DataView(b.buffer);
      let o = 0;
      dv.setUint32(o, imza, true); o += 4;
      if (merkezi) { dv.setUint16(o, 20, true); o += 2; }
      dv.setUint16(o, 20, true); dv.setUint16(o + 2, 0, true); dv.setUint16(o + 4, 8, true);
      dv.setUint16(o + 6, 0, true); dv.setUint16(o + 8, 0x21, true);   // 01.01.1980 00:00
      dv.setUint32(o + 10, globalThis.DurusmaPaketiZip.crc32(ham), true); dv.setUint32(o + 14, sikisik.length, true); dv.setUint32(o + 18, ham.length, true);
      dv.setUint16(o + 22, ad.length, true);
      b.set(ad, uz - ad.length);
      return b;
    };
    const yerel = baslik(0x04034b50, 30 + ad.length, false), merkezi = baslik(0x02014b50, 46 + ad.length, true);
    const son = new Uint8Array(22), dv = new DataView(son.buffer);
    dv.setUint32(0, 0x06054b50, true); dv.setUint16(8, 1, true); dv.setUint16(10, 1, true);
    dv.setUint32(12, merkezi.length, true); dv.setUint32(16, yerel.length + sikisik.length, true);
    return new Blob([yerel, sikisik, merkezi, son], { type: 'application/octet-stream' });
  }

  function dosyaAdi(durusma) {
    const no = temiz(durusma && durusma.dosyaNo).replace(/[^0-9A-Za-z]+/g, '-').replace(/^-+|-+$/g, '');
    return `mazeret-dilekcesi${no ? '-' + no : ''}.udf`;
  }

  // ---------------------------------------------------------------- taslak penceresi
  function tarayiciIndir(blob, ad) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.setAttribute('href', url); a.setAttribute('download', ad);
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // [alan, etiket, ipucu]
  const DUZEN = [['hitap', 'Hitap', 'Heyetli birimde BAŞKANLIĞINA, tek hâkimli mahkemede HÂKİMLİĞİNE.'],
    ['sifat', 'Vekili olduğunuz tarafın sıfatı', 'Örnek: Davacı, Davalı, Katılan.'], ['vekil', 'Avukat adı soyadı'],
    ['gerekce', 'Mazeret gerekçesi', 'Cümlede “Aynı gün … nedeniyle” arasına girer.'],
    ['ek', 'Ek (isteğe bağlı)', 'Belge ekleyecekseniz adını yazın. Boş bırakılırsa dilekçe eke atıf yapmaz.'],
    ['baro', 'Baro ve sicil', 'Ayarlar’a yazarsanız her taslakta kendiliğinden dolar.'], ['duzenleme', 'Dilekçe tarihi']];
  const ISTEGE_BAGLI = new Set(['ek', 'duzenleme']);

  // kok: pencerenin ekleneceği öğe (panelin kökü). indir/kopyala verilmezse tarayıcınınki kullanılır.
  function ac({ kok, durusma, cakisanlar, sifat, vekil, baro, sicil, bugun, indir = tarayiciIndir, kopyala = metin => navigator.clipboard.writeText(metin) }) {
    const a = alanlar({ durusma, cakisanlar, sifat, vekil, baro, sicil, bugun });
    if (!a || !kok) return null;
    const E = (tag, oz, ...kids) => {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(oz || {})) if (v != null) e.setAttribute(k, v);
      e.append(...kids.filter(k => k != null));
      return e;
    };
    const onizleme = E('div', { class: 'mazeret-kagit', 'data-alan': 'onizleme', 'aria-label': 'Dilekçe önizlemesi' });
    const durum = E('p', { class: 'mazeret-durum', role: 'status' });
    const eksik = E('p', { class: 'mazeret-eksik' });
    // Doldurulmayı bekleyen köşeli ayraçlı yer tutucular önizlemede ve alanında işaretlenir.
    const YER_TUTUCU = /(\[[^\]]*\])/;
    const parca = x => E(x.kalin ? 'b' : 'span', null, ...x.metin.split(YER_TUTUCU).filter(Boolean).map(m => (YER_TUTUCU.test(m) ? E('mark', null, m) : m)));
    const girdiler = new Map();
    const ciz = () => {
      onizleme.replaceChildren(...paragraflar(a).map(par => {
        const satir = E('p', null, ...(par.parcalar.length ? par.parcalar.map(parca) : [String.fromCharCode(160)]));
        satir.style.textAlign = par.hiza;
        return satir;
      }));
      let n = 0;
      for (const [ad, girdi] of girdiler) {
        const bos = (!temiz(a[ad]) && !ISTEGE_BAGLI.has(ad)) || YER_TUTUCU.test(a[ad]);
        if (bos) n++;
        girdi.setAttribute('class', bos ? 'eksik' : '');
      }
      eksik.replaceChildren(n ? `${n} alan doldurulmayı bekliyor.` : '');
      eksik.hidden = !n;
    };
    const alan = ([ad, etiket, ipucu]) => {
      const satir = { hitap: '2', gerekce: '4' }[ad];
      const girdi = E(satir ? 'textarea' : 'input', { 'data-alan': ad, ...(satir ? { rows: satir } : { type: 'text' }) });
      girdi.value = a[ad];
      girdi.addEventListener('input', () => { a[ad] = girdi.value; durum.replaceChildren(); ciz(); });
      girdiler.set(ad, girdi);
      return E('label', { class: 'mazeret-alan' }, E('span', null, etiket), girdi, ipucu ? E('small', null, ipucu) : null);
    };
    const dugme = (is, sinif, yazi, oz) => E('button', { type: 'button', class: sinif, 'data-is': is, ...oz }, yazi);
    const btnIndir = dugme('indir', 'btn primary', 'UDF indir'), btnKopyala = dugme('kopyala', 'btn', 'Metni kopyala');
    const btnKapat = dugme('kapat', 'x', '×', { title: 'Kapat', 'aria-label': 'Taslağı kapat' });
    const baslikId = 'uhd-mazeret-baslik';
    const pencere = E('dialog', { class: 'mazeret', 'aria-labelledby': baslikId },
      E('header', { class: 'mazeret-ust' },
        E('div', null,
          E('h3', { id: baslikId }, 'Mazeret dilekçesi taslağı'),
          E('p', null, E('b', null, `${a.tarih} ${a.saat}`), ` · ${birim(durusma.birimAdi)} · ${esas(durusma.dosyaNo)}`)),
        btnKapat),
      E('div', { class: 'mazeret-govde' },
        E('div', { class: 'mazeret-alanlar' }, E('h4', null, 'Dilekçe bilgileri'), ...DUZEN.map(alan), eksik),
        E('div', { class: 'mazeret-onizleme' }, E('h4', null, 'Önizleme'), onizleme)),
      E('footer', { class: 'mazeret-alt' },
        E('p', { class: 'mazeret-not' }, NOT),
        E('div', { class: 'mazeret-isler' }, durum, btnKopyala, btnIndir)));
    const bildir = (yazi, hata) => { durum.setAttribute('class', 'mazeret-durum' + (hata ? ' hata' : '')); durum.replaceChildren(yazi); };
    let mesgul = false;
    const yap = async (is, tamam, hata) => {
      if (mesgul) return;
      mesgul = true;
      try { await is(); bildir(tamam); } catch { bildir(hata, true); } finally { mesgul = false; }
    };
    btnIndir.addEventListener('click', () => yap(async () => indir(await udf(paragraflar(a)), dosyaAdi(durusma)),
      'Dilekçe indirildi. UYAP Doküman Editörü’nde açıp kontrol edin.', 'Dilekçe hazırlanamadı. Tekrar deneyin.'));
    btnKopyala.addEventListener('click', () => yap(() => kopyala(duzMetin(paragraflar(a))), 'Metin kopyalandı.', 'Metin kopyalanamadı. Tekrar deneyin.'));
    btnKapat.addEventListener('click', () => pencere.close());
    // Panelin klavye kısayolları pencerenin içindeki yazıya karışmaz.
    pencere.addEventListener('keydown', e => e.stopPropagation());
    pencere.addEventListener('close', () => pencere.remove());
    ciz();
    kok.append(pencere);
    pencere.showModal();
    return pencere;
  }

  globalThis.UHD.mazeretDilekcesi = Object.freeze({ hitap, alanlar, paragraflar, duzMetin, icerikXml, udf, dosyaAdi, ac, NOT });
})();
