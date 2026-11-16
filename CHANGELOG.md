# Sürüm notları

Legaluga UYAP Asistanı sürüm notları; en yeni sürüm üsttedir. Mağazada yayımlanan sürüm ayrıca kontrol edilmelidir; buradaki yeni özelliklerin tamamı mağaza sürümünde henüz bulunmayabilir.

## 1.19.64

Toplu indirmede **Klasör düzeninde indir** seçeneği; UYAP ana sayfasında tanıtım kutularını gizleme ayarı ve Legaluga şeridi; UYAP penceresinde **Legaluga'da aç** ile Ödeme/Evrak Gönder geçişleri, Özet'te duruşma bilgisi. Takılan toplu indirme, Atıflar panelindeki geçici yeniden deneme hatası ve Vergi Takibi devrinin eşzamanlı alımlarda tek kullanımlık kalması düzeltildi; UYAP'ın dosya iznine uymayan veri artık gösterilmez.

## 1.19.63

Duruşma paketinde UDF evraktan PDF üretimi yaklaşık 2,6 kat hızlandı; üretilen PDF dosyaları ~%53 küçüldü (#122).

## 1.19.62

UYAP’ın kendi evrak ekranında açık evrak UDF ise Legaluga araçlarında **UDF olarak indir** görünür; UYAP’ın yüklediği özgün `.udf` dosyası yeniden istenmeden bu cihazdan kaydedilir. Türü belirsiz evrakta önce içeriğe bakılır, UDF değilse indirilmez. Legaluga görüntüleyicisinde de UYAP türünü veya adını bildirmese bile UDF olarak açılan evrakta **UDF olarak indir** çıkar.

## 1.19.61

**Legaluga ile aç** yeniden evrak listesini ve evrakları getirir. 1.19.59 ve 1.19.60'ta Evrak sekmesi, evrak açma, arama, Güncelle ve indirme UYAP'a istek göndermeden **UYAP kapısı kapandı** hatasıyla duruyordu; **Otomatik işlemleri yeniden aç** bunu düzeltmiyordu. Güncellemeden sonra UYAP sekmesini yenileyin.

## 1.19.60

Metin katmanı olmayan PDF, TIFF ve resimde Atıflar paneli **Taranmış belgede atıfı ara** düğmesini gösterir. Okuma yalnız bu düğmeyle, bu cihazda, paketlenmiş Türkçe modelle ve en çok 12 sayfayla yapılır. Görüntü ve metin makineden çıkmaz; sonuç yalnız o sayfa görünümünün belleğinde tutulur.

## 1.19.59

UYAP indirme ve işlem koruması (403/429/503, Retry-After, PRTL_GNL_1-1 veya doğrulama sayfası) bütün sekmelerdeki otomatik UYAP isteklerini durdurur; süre dolunca kendiliğinden devam etmez. Ayarlardaki **Otomatik işlemleri yeniden aç** yalnız kilidi kaldırır. İndirme ve sorgular tek kuyrukta, önceki sürümden yavaş aralıkla gider. **UYAP oturumunu koru** varsayılan olarak kapalıdır.

## 1.19.58

Atıf panelinde işaretlediğiniz künyeler **Seçilenleri aç** ile seçim sırasıyla tek sekmede açılır. Karar numarası olmayan künyeler (Anayasa Mahkemesi bireysel başvurusu hariç) seçilemez; en çok 10 künye gider, adres sığmazsa aktarılacak sayı yazılır.

## 1.19.57

Dar ve kısa pencerelerde popup, sekmeler, filtreler, ayarlar, indirme durumu ve bildirimlerin taşması giderildi. Uzun dosya numaraları ve tebligat bilgileri kutuya sığar; atıf menüsü pencere sınırında kalır. İndirme düğmeleri sözcükleri bölmeden satıra geçer. Koyu temada not biçimi ve paket sıra numaralarının okunabilirliği artırıldı.

## 1.19.56

UYAP’tan açılan tek belge görünümünde PDF/UDF/EYP önizlemesinin geniş pencerede 390 piksellik bir sütuna sıkışması düzeltildi. Belge mevcut pencere genişliğini kullanır.

## 1.19.55

UYAP’ın kendi evrak ekranındaki **Legaluga ile aç** ve **Atıfları bul** düğmeleri, UYAP’ın zaten yüklediği PDF/UDF/EYP belgeyi cihazda kullanır; belgeyi yeniden istemez. Görünüm yalnız belge ve karar atıflarını açar. EYP üst yazısı ve ekleri mevcut okuyucuda seçilebilir. **Cihazdan aç** ile yerel PDF/UDF/EYP seçilebilir. Güncellemeden sonra UYAP sekmesini yenileyip evrakı açın. Atıf taraması okunabilir metinle sınırlıdır; OCR yapılmaz.

## 1.19.54

UYAP, HTTP `200` yanıtında `PRTL_GNL_1-1` güvenlik engeli bildirdiğinde tarama ve otomatik oturum yoklaması durur. Kontrol noktası bu Chrome profilinde şifreli saklanır; kısıtlama kalktığında **Sürdür** ile devam edebilirsiniz. Aynı sekme ve oturumda başarıyla alınmış mahkeme liste kapsamları ve sayfaları atlanır. Yeni sekme, sayfa yenilemesi veya yeni oturumda dosya kimliklerini tazelemek için listeler yeniden alınır; güvenlik nedeniyle duraklamış iş kendiliğinden başlamaz.

## 1.19.53

`.eyp` paketindeki üst yazı otomatik açılır; üst yazı veya ek seçicisinden diğer belgeler görüntülenir. Birden fazla üst yazı varsa seçim istenir. **Aslını indir** özgün EYP paketini, **PDF indir** seçili belgeyi verir. UDF evraklarında **UDF olarak indir** özgün `.udf` dosyasını indirir; EYP içinden açılan UDF için de kullanılabilir. Paketteki PDF, UDF, TIFF, resim, HTML ve düz metin mevcut güvenli okuyucularda açılır; diğer biçimler indirilebilir. E-imza doğrulanmaz. Açılmış paket en fazla 64 MiB ve 200 girdi olabilir; bozuk, şifreli veya sınırı aşan pakette özgün indirme bağlantısı korunur. Paket cihazda açılır; belge içeriği sunucuya gönderilmez.

## 1.19.52

Yalnız **idare mahkemesi ve bölge idare mahkemesi dosyalarında**, tanınan Danıştay atıflarında **Danıştay’da ara** görünür. Mevcut **Tam metni aç** bağlantısının yanındadır. Resmî Danıştay sayfasını yeni sekmede açar; daire ile esas ve varsa karar numarası alanlarını hazırlar. **Ara** düğmesine siz basarsınız; istenirse sitenin doğrulamasını tamamlarsınız. Yalnız esas numaralı atıflarda karar numarası uydurulmaz. Belge, alıntı veya UYAP oturumu aktarılmaz. Form değişmişse ya da yazılmış ölçütlerle çelişiyorsa açıklama gösterilir; mevcut arama alanlarının üstüne yazılmaz. Bu özellik için yalnız `karararama.danistay.gov.tr` adresine erişim eklenmiştir.

## 1.19.51

**Atıflar** başlangıçta kapalıdır; düğmeye basınca belge alanının yüksekliğini değiştirmeyen bir panel açılır. Mahkeme veya numara ile listede arayın. Liste kendi içinde kayar; **×**, dışarı tıklama veya **Esc** ile kapanır. Her atıfta **Alıntıyı kopyala**, evraktaki ilk geçişin bulunduğu bölümü karar künyesiyle birlikte panoya kopyalar. Kısa önizleme bu bölümü gösterir; uzun bölümlerin kesilen uçları **…** ile belirtilir. Alıntı görüntüleyicinin okuduğu metinden alınır ve cihazınızda kalır; kararın özgün metniyle karşılaştırılmalıdır.

## 1.19.50

Evrak araç çubuğunda **Aslını indir** özgün dosyayı, **PDF indir** PDF kopyasını kaydeder. PDF olan evrakta tek **PDF indir** düğmesi bulunur ve kaynak baytlar değişmez. UDF, TIFF, JPEG, PNG, HTML, TXT ve XML dönüşümü cihazınızda yapılır; kapak veya içindekiler eklenmez. Desteklenmeyen ya da eksiksiz dönüştürülemeyen belgede asıl dosya indirilebilir. Belge değişince veya dosya penceresi kapanınca dönüşüm iptal edilir.
