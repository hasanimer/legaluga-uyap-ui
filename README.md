# Legaluga UYAP Asistanı — açık arayüz ve genel araçlar

Bu eklenti, **Av. Hasan İmer Akın** tarafından meslektaşlarının ücretsiz kullanımı için geliştirilmiştir.

Legaluga UYAP Asistanı ücretsiz kullanılır. Bu depodaki arayüz, genel araçlar ve yerel şifreleme kodu **MIT lisansıyla açık kaynaklıdır**. UYAP işlem motoru özel kaynaklıdır. Tam eklentiyi [Chrome Web Mağazası'ndan](https://chromewebstore.google.com/detail/legaluga-uyap-asistan%C4%B1/aicknihmpdcbfgidifffinnbgbghkmcn?hl=tr) kurabilirsiniz.

## Açık kaynak kapsamı

- Panel, kurulum, ayarlar, evrak ve tebligat görünümleri, indirme ilerleme paneli.
- Genel arama ve normalizasyon yardımcıları, ZIP, UDF, TIFF, PDF ve duruşma paketi araçları.
- `vault-crypto.js` ve `storage.js`: Web Crypto ile yerel şifreleme, kayıt ve mesaj yetkilendirmesi.
- `fragments/`: karışık dosyalardan çıkarılmış gerçek görünüm ve yetki kontrolü bölümleri. Bunlar tek başına çalıştırılan betikler değildir; tam paket derlemesinde aynı sırayla özel motor bölümleriyle birleştirilir.
- `manifest.json`: tam eklentinin izinleri ve paket içi betik sırası. Bu depo tek başına kurulabilir bir UYAP eklentisi değildir.

Banka, tebligat, UYAP tarama/belge adaptörleri ve kalıcı indirme motoru bu depoda bulunmaz. `contracts.json` açık arayüzün bu motorlarla bağlantısını tanımlar. Tam paketin derlemesi, özel kaynak deposunda sabitlenmiş açık arayüz commit'iyle yapılır; çalışma anında uzak JavaScript indirilmez.

## Yerel demo ve testler

Node.js 22 veya üzeriyle, ek bağımlılık kurmadan:

```sh
npm test
npm run validate
npm run demo
```

`http://127.0.0.1:4173/demo/` adresindeki demo gerçek indirme panelini sentetik verilerle gösterir. UYAP'a bağlanmaz, belge indirmez ve gerçek dosya verisi kullanmaz. Tam eklentinin doğrulama testleri özel motor deposunda çalıştırılır.

## Gizlilik ve güvenlik

Eklentinin UYAP oturumu ve dosya kayıtları kullanıcının cihazında kalır. Şifreleme algoritmasının açık olması anahtarları açığa çıkarmaz; anahtar, parola, oturum kaydı ve gerçek dava belgeleri kaynaklara eklenmez. Şifreleme, ele geçirilmiş bir tarayıcı profilinden tam koruma sağlamaz.

Özel depo, dağıtılan Chrome eklentisinin JavaScript kodunu görünmez yapmaz. Daha önce yayımlanmış kaynak kopyaları ve açık forklar da geri alınamaz. Tam pakette özel motorun bulunması kullanıcıya teslim edilen kodun incelenebileceği anlamına gelir.

Güvenlik bildirimleri için [SECURITY.md](SECURITY.md), genel öneri ve hatalar için [Issues](https://github.com/hasanimer/legaluga-uyap-ui/issues) bölümünü kullanın. HAR, oturum bilgisi veya gerçek dava belgesi paylaşmayın.

## Lisans

Bu depodaki Hasan İmer Akın'a ait kaynaklar [MIT](LICENSE) kapsamındadır. `vendor/` içindeki üçüncü taraf bileşenler ve yazı tipleri yanlarındaki özgün lisanslarla dağıtılır; MIT bu lisansları değiştirmez. Özel motorun lisansı ayrı kalır. Daha önce yayımlanmış sürümler yayımlandıkları lisanslarla kullanılmaya devam eder.
