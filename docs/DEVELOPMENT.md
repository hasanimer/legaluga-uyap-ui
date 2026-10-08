# Geliştirici rehberi

Bu depo tam UYAP eklentisinin açık arayüz, genel araç ve şifreleme kaynaklarını içerir. Gerçek servis adaptörleri özel depoda derlenir. Kullanım adımları için [README](../README.md), güvenlik bildirimleri için [SECURITY](../SECURITY.md) dosyasına bakın.

## Dosya düzeni

```text
legaluga-uyap-ui/
├── README.md                  Kullanım rehberi
├── LICENSE / SECURITY.md      Lisans ve güvenlik bildirimi
├── src/
│   ├── extension/             Paket içi yerleşimi korunmuş açık kaynaklar
│   │   ├── ui.js / onboarding.js
│   │   ├── options.* / popup.*
│   │   ├── vault-crypto.js / storage.js
│   │   ├── indirme-panel.js / tebligat-ui.js
│   │   ├── durusma-paketi-* / udf.js / tiff.js
│   │   └── vendor/ / icons/
│   └── fragments/             Sıralı açık kaynak parçaları
├── publication/               Yayın sınırları ve envanter
├── docs/images/               Sentetik kullanım görselleri
├── demo/                      Gerçek indirme paneliyle yerel demo
├── tests/                     Sentetik UI ve güvenlik sınırı testleri
└── scripts/                   Demo sunucusu ve doğrulama araçları
```

`src/extension/` içindeki dosyalar tam pakette köke yazılır. Örneğin `src/extension/options.html` paket içinde `options.html`, vendor dosyaları `vendor/...` olur. HTML, worker ve betiklerin göreli bağlantıları bu yüzden aynı dizin düzeninde tutulur. Bu klasörü tek başına Chrome'a yüklemek özel motoru sağlamaz.

`src/fragments/` içindeki `.part` dosyaları bağımsız JavaScript modülleri değildir; kimi parça bir ifadenin ortasında başlayabilir veya bitebilir. [FRAGMENTS.json](../publication/FRAGMENTS.json) açık parçaların sırasını, kaynağını ve SHA256 değerini listeler. Özel derlemede açık ve özel parçalar araya karakter eklenmeden birleştirilir.

[contracts.json](../publication/contracts.json) arayüz ve motor arasındaki bağlantıları tanımlar. [PUBLIC-FILES.json](../publication/PUBLIC-FILES.json) yayımlanmasına izin verilen tüm dosyaları listeler. Envanter dışındaki dosyalar, tam motor dosyaları, gerçek ağ kayıtları ve anahtar dosyaları doğrulamadan geçmez. Envanter kendi hash'ini içermez.

## Demo ve doğrulama

Node.js 22 veya üzeriyle depo kökünde çalıştırın; bu üç komut ek paket kurulumu istemez:

```sh
npm test
npm run validate
npm run demo
```

Demo adresi: **http://127.0.0.1:4173/demo/**. Sunucuyu **Ctrl+C** ile kapatın. Sunucu yalnız demo için gereken dosyaları sunar; deponun tamamını HTTP üzerinden açmaz. Sentetik manager üzerinde duraklatma ve devam ettirme denenebilir; UYAP'a istek ve gerçek indirme yapılmaz.

Testler arayüz etkileşimlerini, saklama/kripto sınırlarını, demo dosyalarını ve açık yayın sınırını doğrular. `validate` ayrıca Git commit'indeki dosyaları checkout baytlarıyla karşılaştırır; henüz commit edilmemiş değişiklikleri yayımlanmış kaynak kabul etmez.

## Atıflar ve karar arama bağlantısı

`src/extension/atif-paneli.js`, görüntüleyicinin `UHDKunye` arayüzünü çağıran görünüm katmanıdır. `src/extension/kunye-ayikla.js`, metindeki künyeleri ayıklayan ve izinli künye alanlarından bağlantı üreten açık kaynak araçtır; DOM, ağ ve depolama işlemi yapmaz. Atıflar; UDF gövde modeli, temizlenmiş HTML veya genel metin modeli üzerinden bulunur. UDF alt çizgisi yalnız model metni ile gösterilen paragraf birebir eşleştiğinde eklenir. HTML çerçevesi betiksiz ve kökensiz kalır: işaretler görseldir, menü/listeden kaydırma çerçevenin içine eklenmez. TXT/XML ve PDF yalnız liste sağlar. UDF'de 300 karaktere kadar metin seçiminden bağlantı üretilebilir; seçimin ham metni bağlantıya aktarılmaz.

PDF taraması, normal PDF önizlemesi yerleştikten sonra görünmez paket motoru çerçevesi üzerinden başlar. `durusma-paketi-bridge.js` ile `EXTRACT_PDF_TEXT` / `PDF_TEXT_RESULT` mesajları ve paketlenmiş PDF.js işçisi kullanılır. Sonuç hem oturum hem iş kimliğiyle eşleştirilir. PDF işçisi, pdf.js yüklenmeden önce eksik `Promise.try` API’sini kendi çalışma ortamında sağlar; yerleşik API varsa değiştirmez. Geri dönüş çağrıyı eşzamanlı yapar ve fırlatılan hatayı reddedilen Promise olarak döndürür. Gerçek PDF testi Node 22’de bu üretim yolunu çalıştırır; test polyfill’i kullanmaz. Köprü başka belge işi tarafından kullanılıyorsa açılmaz; devam eden taramanın oturumu başka iş için kapanırsa **Yeniden dene** sunulur. Evrak değişimi ve ekran kapanışı `CANCEL_TEXT`, köprü kapatma ve çerçeve kaldırmayla işi bırakır; eski sonuç yeni evraka yazılmaz.

Tarama sınırları `UHDAtifPaneli.SINIR` içinde tanımlıdır: HTML/TXT/XML dosyası 10 × 1024² bayt; PDF 64 × 1024² bayt ve ilk 300 sayfa; metin 2 × 1024² JavaScript dize birimi. Kullanıcıya bunlar **10 MB**, **64 MB** ve **2 MB metin** olarak gösterilir. UDF yalnız okunabilen görüntüleyici modelini tarar. Sınır ve eksik model sonuçla birlikte açıklanır. PDF sonuçlarında `bosSayfa`, metin katmanı bulunmayan sayfaları; `hataSayfa`, metni okunamayan sayfaları ayrı sayar. Kısmi sonuçta iki uyarı ayrı verilir; hiçbir metin okunamıyor ve hatalı sayfa varsa sonuç `code: "pdf-text"` ile okuma hatasıdır, taranmış PDF sonucu değildir. Birbirini izlemeyen okunabilir sayfaların arasına çift satır sonu konur; eksik sayfanın öncesi ve sonrası tek künye oluşturamaz. Ardışık sayfalara taşan künye tanınabilir. OCR, PDF üzerine işaretleme veya atıf satırından PDF sayfasına atlama yoktur. Ayar kapalıysa tarama, işaretleme ve arayüz oluşmaz. Açık dosya ekranında ayar değişince `applyPagePrefs`, görüntüleyicinin `atifAyariniUygula` metodunu çağırır; `ayarDegisti` PDF işini hemen iptal eder, listeyi ve UDF işaretlerini temizler. HTML aynı Blob’dan yeniden temizlenerek sandbox çerçevesine yazılır; yeni UYAP isteği yapılmaz. Yeniden açılan ayar eldeki evrakı tekrar tarar.

Tam metin ve seçim bağlantıları `UHDKunye.adres()` ile `https://mcp.legaluga.com/karar-bul#k=…` biçiminde üretilir. `#k=` değeri, dolgusuz Base64URL kodlanmış UTF-8 JSON `{v:1,k:[…]}`'dir; şifreleme değildir. Seçilen künye önce gelir, en çok 10 künye aktarılır ve kodlanmış değer 4096 karakteri aşamaz. İzinli alanlar `mahkeme`, `daire`, `il?`, `esasNo`, `kararNo` (bireysel başvuruda `null`), `tarih?`, `hatali?` ile sınırlıdır. `ham`, metindeki `bas`/`son`, `anahtar`, tekrar sayısı, belge, seçimin ham metni, taraf/dosya bilgisi ve oturum verisini eklemeyin. Bağlantı yalnız kullanıcı işlemiyle normal bir yeni sekmede açılır; `target="_blank"`, `rel="noopener noreferrer"` ve `referrerpolicy="no-referrer"` korunur. Künye tanıma, kararın varlığını veya alıntının doğruluğunu doğrulamaz.

Sentetik doğrulamada atıf tekilleştirme, UDF metin eşleme, HTML sandbox sınırı, seçim ve klavye işlemleri, PDF motoru iptal/meşgul durumları ve yalnız izinli künye alanlarının aktarılması korunmalıdır. Açık UI ve tam motor testlerini kendi depolarında çalıştırın; gerçek evrak, oturum veya ham seçim metnini test/log/rapora eklemeyin. Kullanıcı açıklaması [README'deki Atıflar bölümü](../README.md#evraktaki-karar-atıfları), dış hizmet veri akışı [gizlilik politikası](PRIVACY.md) içindedir.

## Katkı akışı

1. İlgili `src/extension/` kaynağını veya açık parçayı değiştirin. Çıktı ZIP'leri ve tam motor kaynaklarını bu depoya eklemeyin.
2. Davranış değiştiyse ilgili sentetik testleri çalıştırın. Demo panel CSS'i, gerçek `indirme-panel.js` içindeki `CSS` metniyle aynı olmalıdır.
3. Parça değiştiyse `FRAGMENTS.json` içindeki SHA256 ve bayt sayısını; eklenen/değişen dosyalar için `PUBLIC-FILES.json` envanterini güncelleyin. Kaynak ve envanteri aynı commit'e alın.
4. `npm test` ve `npm run validate` kontrollerini tamamlayın; değişikliği pull request olarak önerin. UYAP entegrasyonu gerekiyorsa tam paket özel depoda ayrıca doğrulanır ve yeni açık kaynak commit'ine sabitlenir.

`scripts/build-sentry.mjs` ve `scripts/build-hearing-vendor.mjs` mevcut vendor üretiminin bakım betikleridir; varsayılan demo/test akışında çalışmazlar. Gerekli üretim bağımlılıkları özel derleme ortamında sürüm sabitlemesiyle yönetilir. Vendor yenilemesi lisansları, paket içi yolları, hash envanterini ve MV3 kısıtlarını birlikte gözden geçirmeyi gerektirir.

Gerçek isim, dosya numarası, HAR, oturum verisi veya dava belgesi içeren örnekleri eklemeyin. README görselleri sentetik verilerle hazırlanır; çalışma kaynaklarının ve özel servislerin sınırlarını değiştirmez.
