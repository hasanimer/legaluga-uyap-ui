# Legaluga UYAP Asistanı gizlilik politikası

Son güncelleme: **8 Ekim 2026** · **1.19.52** sürümü için hazırlanmıştır. Özellikler kurulu sürüme göre farklı olabilir.

Legaluga UYAP Asistanı, Av. Hasan İmer Akın tarafından meslektaşlarının ücretsiz kullanımı için geliştirilmiştir. UYAP'ta erişim yetkiniz bulunan dosyaları bulma, görüntüleme ve evraklarını yönetme amacıyla çalışır. T.C. Adalet Bakanlığı, UYAP veya PTT ile resmi bir bağlantısı yoktur. İletişim: **info@legaluga.com**.

## Hangi bilgiler işlenir?

Eklenti, seçtiğiniz özellik için gerekli UYAP dosya numarası, mahkeme/birim, dosya durumu, taraf ve vekil adları, hesapta görünen ad, duruşma ve evrak kayıtlarını işler. İcra dosyası hesabındaki tutarlar, borçlu banka listesi ve seçtiğiniz banka cevapları da finansal bilgi içerebilir. Seçtiğiniz evrak, kendisinin içerdiği kişi ve dosya bilgileriyle birlikte cihazınızda görüntülenir veya indirilir. Genel evrak görüntüleme dışında sağlık veya iletişim verilerinden profil çıkaran ayrı bir özellik yoktur.

Dosya indeksi, notlar, tercihler, son başarılı safahat, dosyada kalan tutar ve alınma tarihi, banka takip kayıtları ve indirme planı bu Chrome profilinde yerel saklanır. Kalan tutar kaydına yalnız dosyaya bağlı tutar ve alınma tarihi eklenir; ham Tahsilat/Reddiyat yanıtı kaydedilmez. Banka sorgusu kaydına ham yanıt, T.C. kimlik numarası, geçici UYAP kişi kimliği veya hesap/IBAN alanları kopyalanmaz. Eski sürümlerde kaydedilmiş kısa cevap/talep özetleri, yerel verilerinizi silene kadar profilinizde bulunabilir.

Belge baytları ve okunmuş metin, açık görünüm veya başlatılmış işlem için tarayıcı belleğinde işlenir; belge olarak geliştiricinin sunucusuna ya da yapay zekâ hizmetine yüklenmez. Kullanıcının **Tam metni aç / Kararı bul** bağlantısına tıklamasıyla aktarılan karar künyesi alanları aşağıda ayrıca açıklanmıştır. Parçalı indirmede o parçanın evrakları ZIP kaydedilene veya iş durana kadar bellekte tutulabilir. Tamamlanmış ZIP'ler kullanıcı seçimiyle cihazına kaydedilir. İndirme planında belge içeriği yerine evrak referansları, dosya kapsamı ve doğrulanmış parça ilerlemesi bulunur.

UYAP ve e-imza parolanız istenmez. Resmi UYAP istekleri, tarayıcının mevcut oturumunu kullanır; oturum çerezleri ve giriş belirteçleri dosya indeksine veya teknik rapora kopyalanmaz. Şifreli yedek oluştururken girdiğiniz **yedek parolası yalnız cihazınızda anahtar türetmek için kullanılır**; saklanmaz veya gönderilmez.

Genel web geçmişiniz okunmaz. Geçici iş koordinasyonu Chrome oturum alanını ve ilgili UYAP sekmesinin oturum depolamasını kullanabilir; bunlar belge içeriklerini veya giriş bilgilerini taşımaz.

## Ne zaman dış hizmetlere bağlanılır?

- **İlk kurulum ve Güncelle:** UYAP bağlantısı kontrol edilir; seçtiğiniz kapsamın dosya, taraf ve duruşma listeleri alınır. Vekil adı boşsa hesapta görünen ad kullanılabilir. Otomatik güncelleme ve yeni evrak takibi başlangıçta kapalıdır; ayarlardan açılabilir. Evrak takibi açıksa evrak teyidi için dosyanın evrak listesinden yalnız evrak türü adları ve sayılar yerel indekse yazılır; evrak içeriği saklanmaz ve bu bilgi cihaz dışına çıkmaz.
- **Dosya ve evrak ekranı:** Açtığınız ekran için gerekli dosya bilgisi ve evrak listesi alınır. Bir evrakı açmak veya indirmek o belgeyi UYAP'tan getirir. Yerel arama için yeni UYAP isteği gerekmez.
- **Safahat:** Güncel liste yalnız ilgili düğmeye basıldığında alınır. Son başarılı kayıt, alınma tarihiyle şifreli saklanır. Aynı dosyada başarılı çekimler arasında en az 60 dakika beklenir; hata önceki kaydı silmez.
- **Dosyada kalan tutar:** Mahkeme ve icra dosyasının Özet ekranı açıldığında veya **Tutarları yenile** düğmesine basıldığında Tahsilat/Reddiyat bilgileri alınır. Kalan tutar ve alınma tarihi şifreli saklanır; kartta bu kayıt gösterilir. Dosya taraması tutarları topluca sorgulamaz. Kayıt şifreli yedeğe dahildir ve yerel verileri silince kaldırılır.
- **Banka:** Sorguyu kullanıcı başlatır. UYAP uygunluk ve ücret yanıtları kontrol edilir; ücret varsa ayrıca onay istenir. Dosya ve borçlu kapsamı doğrulanmadan sorgu sonucu kaydedilmez. Cevap başlıklarını listelemek veya bir cevabı açmak yeni ücretli banka sorgusu başlatmaz. Cevap metninden hukuki sonuç çıkarılmaz. Talep kontrolü ayrı kullanıcı işlemidir; talep göndermez ve tebliğ kanıtı oluşturmaz.
- **Tebligat:** Liste, dosyanın evrak kayıtlarını kullanır. Seçili tebligatı sorgulamak zarfı okuyup hizmet ve barkodu belirler. Kapalı fiziki tebligatta önce aynı dosyadaki barkodu eşleşen PTT sorgu PDF'i, e-tebligatta eşleşen mazbata aranır; belge ve olaylar cihazda okunur. Fiziki tebligat sorgusunda seçilen barkod resmi PTT hizmetine iletilir; bulunan PDF ve canlı sonuç ayrı kaynaklar olarak gösterilir. **Aç**, **Mazbatayı aç** ve **PTT sorgu PDF'sini aç**, özgün evrakı yalnız tıklandığında UYAP'tan alıp dosya ekranında önizler; görüntüleme kalıcı kayda yazılmaz. Kullanıcı resmi canlı sorguyu kontrol etmek istediğinde seçilen barkod `www.ptt.gov.tr` veya `ptt.etebligat.gov.tr` hizmetine iletilebilir. Hizmet giriş veya CAPTCHA isterse kullanıcı tamamlar; kontroller aşılmaz. Mazbata bulunmaması kendiliğinden UETS sekmesi açmaz. Barkod, okunmuş belge metni ve olay sonuçları açık sorgunun belleğindedir; kalıcı kayda veya hata raporuna eklenmez. Hukuki süre hesabı yapılmaz.
- **Karar atıfları:** Açılmış UDF, HTML, TXT/XML ve metin katmanlı PDF'in okunabilir metninden karar künyeleri cihazda tanınır. PDF sayfa metni paketlenmiş yerel işçide okunur; OCR yapılmaz. Metin katmanı olmayan PDF sayfaları, TIFF ve resim taranamaz. Kısmen okunabilen PDF'te metin katmanı bulunmayan ve metni okunamayan sayfalar ayrı uyarılır; okunamayan PDF, taranmış belge olarak sunulmaz. PDF taraması en çok 64 MB dosya, ilk 300 sayfa ve 2 MB metinle sınırlıdır; eksik kapsam ekranda belirtilir. Evrak değişince veya ekran kapanınca tarama iptal edilir. Başka bir belge işlemi PDF okuyucusunu kullanıyorsa kullanıcı **Yeniden dene** ile tekrar başlatabilir. **Evraktaki karar atıflarını işaretle** ayarı başlangıçta açıktır; kapatılırsa tarama ve arayüz çalışmaz. Atıf listesi, belge metni ve metin seçimi yerel kalıcı kayda veya hata raporuna eklenmez. **Tam metni aç** ya da künye içeren en çok 300 karakterlik UDF seçiminin yanındaki **Kararı bul** bağlantısını yalnız kullanıcı tıkladığında `https://mcp.legaluga.com/karar-bul` normal bir yeni sekmede açılır. `noopener noreferrer` ve `no-referrer` kullanılır. Adresin `#k=` bölümünde yalnız tanınmış künye alanları taşınır: mahkeme, daire, varsa il, esas/başvuru numarası, karar numarası, varsa tarih ve geçersiz tarih/daire uyarısı. Seçilen künye önce gelir; bağlantıda en çok 10 künye bulunabilir. Ham seçili metin, belge metni/baytları, belge içindeki taraf ve dosya bilgileri ile UYAP oturumu bu bağlantıya eklenmez; belge yüklenmez. URL parçası ilk HTTP isteğinin ve yönlendiren adres bilgisinin içinde yer almaz, ancak açılan sayfanın istemci kodu onu okuyup karar aramasında kullanabilir. Base64URL kodlaması şifreleme değildir; yeni sekmenin adresi ve tarayıcı geçmişi künye alanlarını içerebilir. Legaluga karar arama hizmetine bağlantı IP adresinizi gösterir; bu sayfanın sonraki veri işlemesi kendi hizmet koşullarına tabidir. Künye tanıma, kararın varlığını veya alıntının hukuken doğru olduğunu doğrulamaz.
- **Toplu indirme:** Kullanıcının seçtiği evraklar sıralı alınır ve ZIP parçaları olarak kaydedilir. Dosya penceresini kapatmak aktif parçalı işi durdurmak zorunda değildir. Sayfa yenilenirken kaydedilmiş parça ilerlemesi korunur; devam için geçerli UYAP oturumu gerekir. Kaydedilmemiş parça yeniden alınabilir. Sekme/tarayıcı tamamen kapanınca devam davranışı mevcut kaydedilmiş plan ve kullanıcı işlemiyle sınırlıdır.
- **Oturum koruma:** Ayarlardan açılıp kapatılır.

UYAP, PTT ve UETS kendi hizmet ve gizlilik koşulları kapsamında istekleri işler; ağ adresinizi görürler. Başlamış bir isteği sonradan durdurmak alıcıya ulaşmış bilgiyi geri alamaz. Dosya belgeleri, ham belge metni ve UYAP oturum bilgileri geliştiricinin sunucusuna gönderilmez. Kullanıcının karar arama bağlantısıyla aktardığı sınırlı künye alanları ve isteğe bağlı teknik hata raporları yukarıdaki açıklamalara tabidir.

## Resmî Danıştay araması

**Resmî Danıştay araması:** Yalnız idare mahkemesi ve bölge idare mahkemesi dosyalarındaki tanınmış Danıştay atıflarında **Danıştay’da ara** bulunur. Tıklayınca `https://karararama.danistay.gov.tr/` açılır. Adresin `#legaluga=` bölümünde yalnız mahkeme, daire, esas numarası ve varsa karar numarası bulunur; belge, alıntı, dosya/taraf bilgisi ve UYAP oturumu yoktur. Paketlenmiş içerik betiği bu tek künyeyi doğrular ve resmî sayfanın arama formunu doldurur. Arama gönderilmez; kullanıcı **Ara** düğmesine basar ve gerekirse sitenin doğrulamasını tamamlar. Künye yerel depolamaya veya hata raporuna eklenmez. Form doldurulunca kullanılan URL parçası kaldırılır; tarayıcı önceki adresi geçmişinde tutmuş olabilir. Resmî siteye bağlantı IP adresinizi gösterir; kullanıcı arama yaptığında daire ve numaralar Danıştay’ın kendi hizmetine gönderilir. Site kendi hizmet ve gizlilik koşulları kapsamında çalışır.

## Yerel şifreleme ve dışa aktarma

Kalıcı kullanıcı kayıtları **AES-256-GCM** ile şifrelenir. Dışa aktarılamayan `CryptoKey`, uzantının bu Chrome profilindeki IndexedDB alanında tutulur. Şifreleme kaynak kodunun açık olması anahtarınızı paylaşmaz. Ele geçirilmiş veya kilidi açık bir tarayıcı profilinden tam koruma garantisi vermez.

Parola korumalı yedekte PBKDF2-SHA-256 ile 600.000 yineleme ve AES-256-GCM kullanılır. Yedek parolası unutulursa kurtarılamaz. Yanlış parola veya bozuk yedek mevcut kayıtları değiştirmez. **CSV, indirdiğiniz evrak ve ZIP çıktıları şifresiz dosyalardır.** Bunların korunması ve silinmesi kullanıcıya aittir.

## İsteğe bağlı teknik hata raporları

Teknik hata raporlama başlangıçta **kapalıdır**. Ayarlardan açarsanız sınırlı teknik hata raporları **Sentry / Functional Software, Inc.** hizmetine, `o4511620723703808.ingest.de.sentry.io` adresine HTTPS ile gönderilir. Legaluga projesinin yetkili yöneticileri teknik raporlara erişebilir.

Rapor, izin verilen sabit işlem adı, hata türü/kodu ve HTTP durumu, uzantı kaynak dosyası/satırı, sürüm, olay kimliği/zamanı ve teknik SDK/ortam bilgileriyle sınırlıdır. Ham hata mesajı, kişi/dosya bilgisi, UYAP yanıtı, belge, barkod, sayfa adresi, çerez veya oturum bilgisi rapora eklenmez. Otomatik gezinme, davranış analitiği, ekran/oturum kaydı ve performans izleme kapalıdır.

**Ağ bağlantısı Sentry'ye IP adresinizi gösterir.** SDK olayına kullanıcı/IP alanı eklenmez; bu durum raporların tamamen anonim olduğu garantisi değildir. İstekler saat başına en fazla 20 denemeyle sınırlıdır; aynı hata kısa aralıklarla tekrar gönderilmez. Hizmetteki raporların saklama süresi Sentry proje ve plan ayarlarına bağlıdır; eklenti bunları otomatik sildirmez. İlgili talepler için `info@legaluga.com` adresine başvurabilirsiniz.

Raporlamayı kapatmak sonraki gönderimleri durdurur; başlamış isteği veya önceden gönderilen raporları silmez. Yerel verileri silmek de Sentry'deki önceki raporları silmez.

## İzinlerin amacı

| İzin | Kullanım |
|---|---|
| `storage` | Yerel kullanıcı kayıtları ve geçici işlem koordinasyonu. |
| `unlimitedStorage` | Büyük dosya indeksi ve şifreli indirme planlarında depolama kotasına takılmama. |
| `downloads` | Kullanıcının başlattığı ZIP parçalarını kaydetme ve yalnız ilgili işe ait tamamlanmayı doğrulama; genel indirme geçmişini analiz etmez. |
| `scripting` | İzinli UYAP/PTT/UETS sekmelerinde paketlenmiş içerik betiklerini çalıştırma. |
| `offscreen` | Kullanıcının başlattığı resmi PTT sorgusunu geçici görünmeyen belgede yürütme. |
| `declarativeNetRequestWithHostAccess` | Yalnız geçici PTT sorgu çerçevesinin yüklenmesi için gerekli yanıt başlıklarını sorgu boyunca düzenleme. |
| `avukat.uyap.gov.tr` | Yetkili resmi oturumla dosya ve evrak işlemleri. |
| `www.ptt.gov.tr`, `ptt.etebligat.gov.tr` | Kullanıcının seçtiği tebligatın resmi sorgusu. |
| `karararama.danistay.gov.tr` | Kullanıcının açtığı künye bağlantısında resmî Danıştay arama formunu hazırlama; otomatik arama göndermez. |
| İzinli Sentry adresi | Yalnız kullanıcı hata raporlamasını açarsa teknik rapor gönderme. |

Uzantının JavaScript kodu paket içindedir; uzantıda çalıştırılmak üzere uzak kod indirilmez. Gömülen resmi PTT sayfası kendi site kodunu çalıştırır. Diğer sitelerin içeriğine genel erişim yoktur. Kullanıcının karar arama bağlantısıyla açtığı Legaluga sayfası normal bir web sekmesidir; eklenti bu site için içerik veya ağ erişim izni istemez.

## Saklama, silme ve sınırlı kullanım

Yerel kayıtlar, kullanıcı bunları silene veya profil/uzantı kaldırılana kadar bu profilde bulunabilir. **Ayarlar → Tüm verileri sil**, uzantının yerel kullanıcı kayıtlarını temizler; cihazınıza indirdiğiniz dosyaları, dışa aktardığınız yedekleri ve önceden gönderilmiş Sentry raporlarını silmez.

Veriler satılmaz; reklam, kullanıcı profili oluşturma, kredi vermeye uygunluk veya ürünün tek amacıyla ilgisiz amaçlar için kullanılmaz. Geliştiriciye gerçek dava belgesi, HAR, giriş bilgisi veya kimlik/finansal bilgi içeren dosyaları göndermeyin. Destek örneklerini kurgusal verilerle hazırlayın. Özel güvenlik bildirimi için [SECURITY.md](../SECURITY.md) içindeki iletişim yolunu kullanın.

Legaluga UYAP Asistanı'nın kullanıcı verilerini kullanımı, [Sınırlı Kullanım şartları](https://developer.chrome.com/docs/webstore/program-policies/limited-use) dahil [Chrome Web Mağazası Kullanıcı Verileri Politikası](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) kapsamında açıklanan amaçlarla sınırlıdır.
