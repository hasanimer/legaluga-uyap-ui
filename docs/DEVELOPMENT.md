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

## Katkı akışı

1. İlgili `src/extension/` kaynağını veya açık parçayı değiştirin. Çıktı ZIP'leri ve tam motor kaynaklarını bu depoya eklemeyin.
2. Davranış değiştiyse ilgili sentetik testleri çalıştırın. Demo panel CSS'i, gerçek `indirme-panel.js` içindeki `CSS` metniyle aynı olmalıdır.
3. Parça değiştiyse `FRAGMENTS.json` içindeki SHA256 ve bayt sayısını; eklenen/değişen dosyalar için `PUBLIC-FILES.json` envanterini güncelleyin. Kaynak ve envanteri aynı commit'e alın.
4. `npm test` ve `npm run validate` kontrollerini tamamlayın; değişikliği pull request olarak önerin. UYAP entegrasyonu gerekiyorsa tam paket özel depoda ayrıca doğrulanır ve yeni açık kaynak commit'ine sabitlenir.

`scripts/build-sentry.mjs` ve `scripts/build-hearing-vendor.mjs` mevcut vendor üretiminin bakım betikleridir; varsayılan demo/test akışında çalışmazlar. Gerekli üretim bağımlılıkları özel derleme ortamında sürüm sabitlemesiyle yönetilir. Vendor yenilemesi lisansları, paket içi yolları, hash envanterini ve MV3 kısıtlarını birlikte gözden geçirmeyi gerektirir.

Gerçek isim, dosya numarası, HAR, oturum verisi veya dava belgesi içeren örnekleri eklemeyin. README görselleri sentetik verilerle hazırlanır; çalışma kaynaklarının ve özel servislerin sınırlarını değiştirmez.
