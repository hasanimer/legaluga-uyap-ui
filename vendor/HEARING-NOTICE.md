# Duruşma paketi yerel bağımlılıkları

- `pdf-lib` 1.17.1 — MIT; `PDF-LIB.LICENSE`.
- `pdfjs-dist` 6.3.289 — Apache 2.0; `PDFJS.LICENSE`.
  Okuyucu ve worker kodu, paket worker'ı içinde çalışacak tek bir yerel
  dosyaya derlenir. Üst worker'ın mesaj kanalına kendiliğinden bağlanmasını
  önleyen değişiklik ve uyumluluk yardımcıları
  `scripts/build-hearing-vendor.mjs` içinde kayıtlıdır. Yeniden derleme,
  beklenen kaynak satırı değişirse hata verir. Özgün kaynak:
  <https://github.com/mozilla/pdf.js/releases/tag/v6.3.289>.
- `@pdf-lib/fontkit` 1.1.1 — npm paketi ve upstream README MIT bildirir.
  Upstream: <https://github.com/Hopding/fontkit>; özgün proje:
  <https://github.com/foliojs/fontkit>. Dağıtımın kendi copyright/lisans
  yorumları `fontkit.umd.js` içinde değiştirilmeden korunur. Paketin upstream
  README'si `FONTKIT.UPSTREAM.md` olarak yer alır. MIT izin metni
  `FONTKIT-MIT.LICENSE`, içindeki Brotli kodunun Apache 2.0 lisansı
  `FONTKIT-APACHE-2.0.LICENSE` içinde yer alır.
- `@pdf-lib/standard-fonts`, `@pdf-lib/upng` ve `pako` — birlikte gelen
  lisanslar `PDF-STANDARD-FONTS.LICENSE`, `PDF-UPNG.LICENSE`,
  `PDF-PAKO.LICENSE` içinde yer alır.
- Liberation Fonts 2.1.5 — SIL Open Font License 1.1;
  `fonts/LICENSE`. Resmî yayın:
  <https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5>.

`npm run build:hearing` kilitli npm paketlerinden yerel dosyaları kopyalar,
dinamik kod yürütme desenlerini denetler ve SHA-256 değerlerini
`hearing-vendor.json` içine kaydeder. Paket oluşturulurken CDN veya uzaktan
JavaScript/font yüklenmez. Bu araçlar ana UYAP content script listesine eklenmez.
