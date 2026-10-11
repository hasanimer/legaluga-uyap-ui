# Tesseract (yerel OCR)

Bu dizin, taranmış evrak atıfı için paketlenmiş tanıma motorudur. Çalışma anında indirilmez.

| Dosya | Kaynak | Sürüm |
|---|---|---|
| `tesseract.min.js`, `worker.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) `dist/` | 5.1.1 |
| `tesseract-core-simd-lstm.wasm.js` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) SIMD LSTM çekirdeği (WASM gömülü) | 5.1.1 |
| `tur.traineddata.gz` | [@tesseract.js-data/tur](https://github.com/naptha/tesseract.js-data) `4.0.0_best_int` | 1.0.0 |

Lisans: tesseract.js, tesseract.js-core ve tessdata `tur` eğitilmiş verisi Apache-2.0. Çekirdek lisansı `TESSERACT-CORE.LICENSE` dosyasındadır. `tesseract.min.js` ve `worker.min.js` içindeki üçüncü taraf satırlar yanlarındaki `.LICENSE.txt` dosyalarındadır.

Uzantı `createWorker` çağrısında `workerPath`, `corePath` ve `langPath` değerlerini `chrome-extension://` adreslerine sabitler. `workerBlobURL: false` ve `cacheMethod: 'none'` kullanılır. Varsayılan jsDelivr yolları çalışmaz; evrak görüntüsü ve OCR metni makineden çıkmaz.
