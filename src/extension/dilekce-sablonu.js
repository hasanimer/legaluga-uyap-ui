'use strict';
// Dosyanın boş dilekçe şablonu: kayıtta zaten bulunan bilgiyle (birim, esas numarası, taraflar ve vekilleri) başlığı ve
// taraf bölümü yazılı, gövdesi boş bir UDF üretir ve indirir. UYAP'a istek atmaz, dilekçeyi göndermez ve imzalamaz.
// UDF yazımı, hitap, tarih ve imza satırı mazeret dilekçesi modülünden (mazeret-dilekcesi.js) gelir; o modül yoksa
// şablon kurulmaz.
(() => {
  const UHD = globalThis.UHD;
  if (!UHD || UHD.dilekceSablonu || !UHD.mazeretDilekcesi) return;
  const M = UHD.mazeretDilekcesi, { temiz, birim, esas, trTarih, baroSatiri, buyuk, YER } = M.ortak;

  const YER_BIRIM = '[MAHKEME / BİRİM ADI]', YER_ESAS = '[ESAS NO]', YER_SORUSTURMA = '[SORUŞTURMA NO]';
  // Müvekkil belirlenemezse imza sıfatı dosya türüne uygun yer tutucudur (yargiTuru: 0 ceza, 2 icra, 3 savcılık).
  const YER_SIFAT = { 0: '[KATILAN/SANIK]', 2: '[ALACAKLI/BORÇLU]', 3: '[MÜŞTEKİ/ŞÜPHELİ]' };
  // Sanık ve şüpheli avukatı vekil değil müdafidir.
  const vekilEki = rol => (/sanık|şüpheli|suça sürüklenen/.test(rol.toLocaleLowerCase('tr-TR')) ? 'Müdafii' : 'Vekili');

  // İcra dairesi müdürlüğe yazılır; "-lığı/-lüğü" ile biten makam (Başsavcılığı, Başkanlığı, Memurluğu) adında mahkeme ya
  // da Yargıtay geçse de yönelme ekini alır. Mahkeme ve daireler mazeret dilekçesinin kuralıyla (heyet → BAŞKANLIĞINA,
  // tek hâkim → HÂKİMLİĞİNE) yazılır. Tanınmayan birimde "MAKAMINA" her ada uyar.
  function hitap(birimAdi) {
    const ad = birim(birimAdi), kucuk = ad.toLocaleLowerCase('tr-TR');
    if (!ad) return YER_BIRIM;
    if (/(?:^|\s)icra (?:dairesi|müdürlüğü)$/.test(kucuk)) return `${buyuk(ad.slice(0, ad.lastIndexOf(' ')))} MÜDÜRLÜĞÜNE`;
    if (/ğ[ıiuü]$/.test(kucuk)) return `${buyuk(ad)}${/[ıu]$/.test(kucuk) ? 'NA' : 'NE'}`;
    if (/mahkeme|dairesi|yargıtay|danıştay/.test(kucuk)) return M.hitap(ad);
    return `${buyuk(ad)} MAKAMINA`;
  }

  // Savcılık dosyasının numarası esas değil soruşturma numarasıdır.
  const numara = k => (String(k.yargiTuru) === '3'
    ? { noEtiketi: 'SORUŞTURMA NO', dosyaNo: temiz(k.dosyaNo) || YER_SORUSTURMA }
    : { noEtiketi: 'DOSYA NO', dosyaNo: esas(k.dosyaNo) || `${YER_ESAS} Esas` });

  // kayit: dizindeki dosya kaydı ({ birimAdi, dosyaNo, yargiTuru, taraflar: [{ rol, adi, vekil: [] }] }). adlar: Ayarlar'daki
  // avukat adları ("Ad Soyad, Ad Soyad"); ilki imzaya yazılır, hepsi müvekkili bulmakta kullanılır.
  function alanlar(kayit, /** @type {{ adlar?: string, baro?: string, sicil?: string, bugun?: string }} */ { adlar, baro, sicil, bugun } = {}) {
    const { trTitle, myKeys, isClient } = UHD, k = kayit || {};
    const anahtarlar = myKeys(adlar), ad = s => trTitle(temiz(s));
    const gruplar = new Map();
    for (const p of Array.isArray(k.taraflar) ? k.taraflar : []) {
      if (!p || !temiz(p.adi)) continue;
      const rol = ad(p.rol) || 'Taraf';
      if (!gruplar.has(rol)) gruplar.set(rol, []);
      gruplar.get(rol).push({ rol, ad: ad(p.adi), muvekkil: isClient(p, anahtarlar),
        vekiller: (Array.isArray(p.vekil) ? p.vekil : []).map(v => ad(temiz(v).replace(/^av(?:\.\s*|\s+)/i, ''))).filter(Boolean) });
    }
    const taraflar = [...gruplar.values()].flat(), muvekkil = taraflar.find(t => t.muvekkil);
    const vekil = ad(String(adlar || '').split(/[,;]/)[0]);
    return {
      hitap: hitap(k.birimAdi),
      ...numara(k),
      yerSifat: YER_SIFAT[k.yargiTuru] || YER.sifat,
      taraflar,
      imza: muvekkil ? `${muvekkil.rol} ${vekilEki(muvekkil.rol)}` : `${YER_SIFAT[k.yargiTuru] || YER.sifat} Vekili`,
      vekil: vekil || YER.vekil,
      baro: baroSatiri(baro, sicil),
      duzenleme: trTarih(bugun === undefined && UHD.todayIso ? UHD.todayIso() : bugun)
    };
  }

  // Paragraf biçimi mazeret dilekçesininkiyle aynıdır: { hiza, parcalar: [{ metin, kalin }] }.
  function paragraflar(a) {
    const p = (hiza, ...parcalar) => ({ hiza, parcalar: parcalar.filter(x => x.metin) });
    const duz = metin => ({ metin, kalin: false }), kalin = metin => ({ metin, kalin: true });
    const satir = (etiket, deger) => p('left', kalin(etiket), duz(` : ${deger}`));
    const taraflar = a.taraflar.length
      ? a.taraflar.flatMap(t => [satir(buyuk(t.rol), t.ad), ...(t.vekiller.length ? [satir(buyuk(vekilEki(t.rol)), t.vekiller.map(v => `Av. ${v}`).join(', '))] : [])])
      : [satir(a.yerSifat, YER.vekil)];
    return [
      p('center', kalin(a.hitap)),
      p('left'),
      satir(a.noEtiketi, a.dosyaNo),
      p('left'),
      ...taraflar,
      p('left'),
      satir('KONU', ''),
      p('left'),
      p('center', kalin('AÇIKLAMALAR')),
      p('justify'), p('justify'), p('justify'),
      p('left'),
      satir('SONUÇ VE İSTEM', ''),
      p('left'),
      ...(a.duzenleme ? [p('right', duz(a.duzenleme))] : []),
      p('right', duz(a.imza)),
      p('right', duz(`Av. ${a.vekil}`)),
      p('right', duz(a.baro)),
      p('right', duz('(e-imzalıdır)'))
    ];
  }

  // "<birim kısa> <esas no> dilekçe.udf": "Mahkemesi" düşer; dosya sisteminde yasak karakterler tireye döner.
  function dosyaAdi(kayit) {
    const guvenli = s => temiz(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/^[\s.-]+|[\s.-]+$/g, '');
    const kisa = guvenli(birim(kayit && kayit.birimAdi).replace(/\s+(?:Mahkemesi|MAHKEMESİ)(?=\s|$)/g, '')).slice(0, 100).trim();
    const no = guvenli(kayit && kayit.dosyaNo).slice(0, 20);
    return [kisa, no, 'dilekçe.udf'].filter(Boolean).join(' ');
  }

  // indir verilmezse tarayıcının indirmesi kullanılır.
  async function indir({ kayit, adlar, baro, sicil, bugun, indir: kaydet = M.ortak.indir }) {
    const liste = paragraflar(alanlar(kayit, { adlar, baro, sicil, bugun }));
    await kaydet(await M.udf(liste), dosyaAdi(kayit));
  }

  globalThis.UHD.dilekceSablonu = Object.freeze({ hitap, alanlar, paragraflar, dosyaAdi, indir });
})();
