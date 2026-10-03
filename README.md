# Legaluga UYAP Asistanı

UYAP Avukat Portalı'ndaki dosyalarınızı kişi adı, dosya numarası, mahkeme veya notla bulun; dosyayı ve evrakını aynı panelden açın.
Eklenti, **Av. Hasan İmer Akın** tarafından meslektaşlarının ücretsiz kullanımı için geliştirilmiştir.

**[Chrome Web Mağazası'ndan kurun](https://chromewebstore.google.com/detail/legaluga-uyap-asistan%C4%B1/aicknihmpdcbfgidifffinnbgbghkmcn?hl=tr)** · [Yerel demo](#geliştiriciler-için-demo-ve-testler) · [Hata ve öneriler](https://github.com/hasanimer/legaluga-uyap-ui/issues)

Bu depo arayüzü, genel araçları ve yerel şifreleme altyapısını **MIT lisansıyla** sunar. UYAP işlem motoru özel kaynaklıdır; tam eklenti mağazadan kurulur.

> Bu rehber, yerelde doğrulanmış **1.19.30** paketinin davranışlarını anlatır. Mağazada yayımlanan sürüm ayrıca kontrol edilmelidir; buradaki yeni özelliklerin tamamı mağaza sürümünde henüz bulunmayabilir.

## İlk kurulum

1. Mağaza bağlantısından **Chrome'a ekle**'ye basın; Legaluga simgesini araç çubuğuna sabitleyin.
2. [UYAP Avukat Portalı](https://avukat.uyap.gov.tr/)'nı açın. İlk kurulum **Legaluga Asistan** panelinde otomatik görünür; ayrı kurulum sekmesi açılmaz.
3. Önce bağlantı ve UYAP oturumu kontrol edilir. Giriş gerekiyorsa resmî UYAP ekranında tamamlayın; giriş bilgilerinizi Legaluga paneline yazmanız gerekmez.
4. İlk bağlantıda hesabınızdaki ad **vekil adı** alanına alınır. Bu adın vekil olarak geçtiği taraflar **Müvekkil** olarak gösterilir. Gerektiğinde adı düzenleyin; birden fazla adı virgülle ayırabilirsiniz.
5. Taranacak yargı türlerini, açık/kapalı dosya kapsamını ve gerekirse savcılık illerini seçin. Ardından görünüm, güncelleme ve bildirim ayarlarını belirleyin.
6. **Kaydet ve taramayı başlat** ilk taramayı başlatır. **Kurulumu tamamla** yalnız seçimlerinizi kaydeder.

Tarama başlatırken oturum hazır değilse istek bağlantıyı bekler. Giriş tamamlanıp bağlantı doğrulandığında seçtiğiniz kapsamda kendiliğinden başlar; yeniden **Güncelle**'ye basmanız gerekmez. Bekleyen isteği iptal edebilirsiniz. Bir bağlantı veya doğrulama hatası gösterilirse paneldeki yönlendirmeyi izleyin.

Yeni kurulumda mahkeme yargı türleri ile açık ve kapalı dosyalar seçilidir. Savcılık taraması, otomatik güncelleme, yeni evrak takibi ve teknik hata raporları başlangıçta kapalıdır. Kurulumdaki kapsam, UYAP dosyalarını seçer; bilgisayarınızdaki klasörleri taramaz.

Seçimleri daha sonra **Ayarlar** içinden değiştirebilir veya **Kurulum seçimlerini yeniden aç** ile bağlantı, kapsam ve ayar adımlarına dönebilirsiniz. Yeni kapsam sonraki taramada uygulanır; kapsam dışında kalan eski yerel kayıtlar korunur.

## Günlük kullanım

UYAP sekmesinde Legaluga simgesi veya **Alt+Shift+D** paneli açar. Paneli sabitleyebilir, genişliğini değiştirebilir ve açık/koyu temayı seçebilirsiniz. Başka bir sitedeyken simge hızlı arama penceresini açar; dosya açma işlemi UYAP sekmesinde yürür.

- **Güncelle:** Seçili kapsamın dosya listesini mevcut UYAP oturumunuzla yerel indekse alın.
- **Ara:** Ad, dosya numarası, mahkeme veya kendi notunuzu yazın. Türkçe karakter varyantları normalleştirilir; `2031/123` gibi dosya numaralarıyla da arayabilirsiniz.
- **Daralt:** Yargı türü, dosya durumu, müvekkil ve yeni evrak filtrelerini kullanın; sonuçları uygunluğa, açılış tarihine veya dosya numarasına göre sıralayın.
- **Aç:** **Dosya Görüntüle** dosya ekranını, **Evrak Görüntüle** doğrudan evrakları açar. Kişi adına tıklayarak aynı adın geçtiği dosyaları görebilirsiniz.
- **Takip et:** **Duruşmalarım** ve **Yeni evrak** görünümlerini kullanın. Yeni evrak takibini ayarlardan açın; ilk tarama başlangıç listesi oluşturur.

Arama kutusunda **↑ ↓** ile sonuç seçin, **Enter** ile açın, **Esc** ile geri dönün. Arama ve filtreler kayıtlı yerel veriler üzerinde çalışır. Güncelleme ve yeni belge okuma için UYAP bağlantısı gerekir.

Müvekkil etiketi, ayarlardaki vekil adıyla dosyanın taraf/vekil kaydının eşleşmesine dayanır. Etiket görünmüyorsa önce bu adı kontrol edin. Aynı adlı farklı kişiler otomatik olarak ayırt edilemeyebilir; savcılık dosyalarında UYAP taraf bilgisini vermediğinde müvekkil eşlemesi yapılamaz.

## Dosya ekranı

| Sekme | Ne gösterir? |
|---|---|
| **Özet** | Dosya bilgileri, son hareketler ve taraflar; icra dosyalarında UYAP'ın hesap ve tahsilat başlıkları ile tutarları. |
| **Evrak** | Gerçek UYAP evrak türlerine göre klasörler, ana evraklar ve ekleri; PDF, UDF ve TIFF görüntüleme. |
| **Banka sorgusu** | İcra dosyasında borçlu seçimi, banka sorgusu, talep kontrolü ve banka cevapları. |
| **Tebligat sorgusu** | Dosyanın tebligat/mazbataları, okunabilen içerik ve barkod, mazbata kayıtları ve isteğe bağlı resmî hizmet sorgusu. |
| **Safahat** | Son kaydedilmiş işlem listesi ve kullanıcı düğmeyle başlattığında güncel UYAP kaydı. |
| **Notlar / Toplu indir** | Dosyaya ait notlar ve seçtiğiniz evrakların özgün biçimleriyle indirilmesi. |

Masaüstünde **Özet** ana pencereye sığacak şekilde düzenlenir; uzun hesap veya taraf listeleri kendi bölümlerinde kaydırılır. Dar ekranda bölümler alt alta yerleşir. Tutarlar UYAP'tan geldiği gibi gösterilir; eklenti dosya borcu hesaplamaz.

**Evrak** klasöründeki sayı ana evrak ve eklerin toplamıdır. Ekler ana evrakın klasöründe kalır. Arama, tarih sırası ve klasör/düz liste görünümüyle listeyi daraltabilirsiniz. Klavyede **↑ ↓** ile gezin, **→ / ←** ile klasörü açıp kapatın, **Enter** ile belgeyi açın.

UDF ve TIFF önizlemesi belgeyi cihazınızda işler. UDF'nin sayfa düzeni resmî editörden farklı olabilir; e-imza doğrulaması yapılmaz. Okunamayan veya desteklenmeyen belgede özgün dosyayı indirip uygun araçla açın. Dosya ekranındaki özet ve önizlemeyi resmî belgeyi kontrol ederek kullanın.

**Safahat** sekmesini açmak yeni sorgu yapmaz. **Safahatı getir / Güncelle** son işlem listesini alır; son başarılı çekimin tarihi görünür. Kayıt bu Chrome profilinde şifreli saklanır. Aynı dosyada başarılı çekimden sonra **60 dakika** beklenir; hata veya iptal önceki kaydı silmez. Dosya listesini güncellemek safahatı otomatik sorgulamaz.

## Banka sorgusu ve cevapları

İcra dosyasında **Banka sorgusu → Borçluları getir** ile başlayın. Gerçek kişiyi adıyla, şirket veya kurumu unvanıyla seçin; ardından **Bankaları sorgula** düğmesine basın.

Önce UYAP'ın sorgu uygunluğu ve ücret bilgisi kontrol edilir. Ücret bildiriliyorsa tutar gösterilir ve ayrıca onayınız istenir. Uygunluk veya ücret yanıtı doğrulanamazsa sorgu başlatılmaz. Ücretli sorgu kendiliğinden tekrarlanmaz.

Şirket/kurum yanıtı seçili dosya ve borçluyla doğrulanır. Tek bir bilinen bankayla eşleşen unvan kısa adla gösterilir; tanınmayan veya çelişen unvan özgün hâliyle korunur. Kurum yanıtından EFT kodu üretilmez. Eksik ya da çelişen sonuç önceki kaydı değiştirmez; hesap ve IBAN alanları takip kaydına alınmaz.

**Cevapları oku**, gelen belgeleri inceler; ücretli banka sorgusu başlatmaz. Cevabın başlığı tek başına seçili borçluya ait olduğunu kanıtlamaz. Borçlu eşlemesi veya metin belirsizse **Cevabı aç** ile özgün belgeyi inceleyin; taranmış belgeler kesin sonuca dönüştürülemeyebilir.

**Talepleri kontrol et** kayıtlı sorguyu dosyanın ilgili evraklarıyla karşılaştırır. Talep göndermez; talebin gönderildiğini veya tebliğ edildiğini tek başına kanıtlamaz. Cevap bulunmaması da talep gönderilmediği anlamına gelmez.

Eklenti ücretsizdir. UYAP banka sorgusunun ücretleri, limitleri ve PTT/UETS hizmetlerinin koşulları ilgili resmî hizmete aittir; eklenti bu koşulları kaldırmaz.

## Tebligat ve UETS

Tebligat listesindeki belge adının yanında, mevcut açıklamadan veya okunmuş belgeden doğrulanabilen **İçerik** gösterilir. **İçerikleri oku** okunmamış belgeleri sırayla alır; **Durdur** ile bırakabilirsiniz. Sekmeyi açmak tüm belge içeriklerini kendiliğinden indirmez; belirsiz içerik tahmin edilmez.

**UETS / e-Tebligat → Dosyadan bul ve göster** açık UYAP dosyasının e-tebliğ mazbatasını okur. Seçili belge varsa o kullanılır; seçim yoksa aynı dosyanın en yeni uygun mazbatası bulunur ve kaynak adı gösterilir. Barkodu önceden girmeniz veya bu okuma için UETS'ye ayrıca giriş yapmanız gerekmez.

**Evraktan barkod ve kayıtları oku** seçili belgenin barkodunu okur. Tekil ve eşleşen mazbatada teslim, hesaba konulma, açılma ve okundu sayılma kayıtları belge üzerindeki tarihleriyle gösterilir. Farklı belge/gönderilerin kayıtları birleştirilmez; hukuki süre hesabı yapılmaz. Taranmış veya çok barkodlu belgede özgün mazbatayı inceleyin.

Güncel resmî sonuç için PTT'de **Sorgula**, UETS'de ayrı **UETS’den güncel sorgula** düğmesini kullanın. Resmî hizmet sekmesi hazırlanır; giriş veya güvenlik doğrulaması gerekiyorsa o sitede kendiniz tamamlayın. UETS'de **Gönderi Sorgulama** bölümüne geçmeniz gerekebilir. CAPTCHA ve oturum doğrulaması aşılmaz.

Yalnız seçtiğiniz barkod ilgili resmî hizmete gönderilir. **Durdur** veya dosya ekranını kapatma bekleyen tebligat sorgusunu iptal eder. Barkod, belge metni ve tebligat sonuçları açık ekranın belleğinde tutulur; kalıcı kayıt ve hata raporuna eklenmez.

## Toplu indirme ve ilerleme

**Toplu indir** içinde tüm evrakları, son 20'yi, yeni evrakları veya Evrak sekmesinde listelenenleri seçin. **Evrak türleri** filtresinde **Tüm türler**, **Yalnız seçtiklerim** veya **Seçtiklerimi hariç tut** seçeneklerini kullanın. Filtre UYAP belge türüne göre çalışır; PDF/UDF dosya biçimi filtresi değildir.

**Ekleri de indir** açıksa seçilen ana evrakın ekleri de alınır. Ana evrak dışlanırsa bağlı ekleri de çıkar; bir ekin türünü ayrıca dışlayabilirsiniz. Bu seçeneği kapatırsanız hiçbir ek alınmaz. Başlatmadan önce ana evrak, ek ve toplam sayısını kontrol edin.

100'den fazla evrakta parçalı indirme otomatik seçilir; küçük listelerde de açabilirsiniz. Parçalar en çok **100 evrak veya yaklaşık 32 MiB** olacak şekilde hazırlanır. Büyük bir evrak tek başına ayrı parçaya konabilir; **tek evrak 128 MiB'yi aşarsa** açıklamayla durulur. Dosyalar UYAP'tan alınan özgün biçim ve baytlarla ZIP'e yazılır.

**Parçalı indirme, dosya penceresi veya Legaluga paneli kapansa da UYAP sekmesi açıkken sürer.** **↓ İndirmeler** panelinden sıradaki işleri, kaydedilen evrakları ve mevcut parçayı izleyin; **Duraklat / Devam et** ile yönetin. İlerleme yüzdesi diske kaydı doğrulanmış evraklara dayanır; mevcut parçada alınanlar ayrıca gösterilir.

Sekme veya tarayıcı kapanırsa çalışmaya başlamış işin tamamlanan parçaları korunur. Aynı dosyada **Toplu indir → Kaldığı yerden devam et** ile sürdürün; henüz diske kaydedilmemiş parça yeniden alınabilir. Sekme kapanınca başlamamış kuyruk işlerini yeniden başlatın. Gerekirse **Dosyayı aç** ile duraklayan işin kaynağını yeniden bağlayın.

Devam edilen iş başlangıçta kaydedilen planı kullanır; sonradan değiştirdiğiniz kapsam ve tür seçimleri o planı değiştirmez. **Yeni indirme planı** ilerlemeyi onayınızla sıfırlar; bilgisayarınızdaki ZIP'leri silmez. **Son parçayı klasörde göster** tamamlanmış parçayı kaydedildiği klasörde gösterir.

## Verileriniz ve şifreleme

Dosya indeksi, notlar, tercihler, safahat ve banka takip özetleri bu Chrome profilinde yerel olarak saklanır. Oturum ve dosya belgeleri geliştiricinin sunucusuna aktarılmaz. Belge okuma UYAP'a, canlı tebligat sorgusu ilgili resmî hizmete bağlanır.

Yerel kayıtlar **AES-256-GCM** ile şifrelenir. Dışa aktarılamayan anahtar uzantının bu profildeki IndexedDB alanında tutulur. Şifreleme kodunun açık olması kullanıcı anahtarını veya belgelerini kaynak deposuna açmaz; ele geçirilmiş bir tarayıcı profilinden tam koruma garantisi de vermez.

**Şifreli yedekle** için kullanıcı parolası belirlenir; parola gönderilmez veya saklanmaz. Unutulan parola kurtarılamaz. Yanlış parola ya da bozuk yedek mevcut kayıtları değiştirmez. CSV dışa aktarımı şifresizdir; dosya bilgisi içeren çıktıları uygun yerde saklayın.

Teknik hata raporlama başlangıçta kapalıdır. Açarsanız izin verilen teknik hata ve sürüm bilgileri Sentry'ye gönderilir; kişi/dosya bilgileri, belgeler, ham UYAP yanıtı, çerez ve oturum bilgileri rapora eklenmez. Ayrıntılı sınırlar ve bildirim yolu [SECURITY.md](SECURITY.md) içindedir.

## Açık kaynak kapsamı ve depo yapısı

| Kaynak | Kapsam |
|---|---|
| `ui.js`, `onboarding.js`, `options.*`, `popup.*` | Panel, ilk kurulum, ayarlar ve hızlı arama arayüzü. |
| `tebligat-ui.js`, `indirme-panel.js` | Tebligat görünümü ve indirme ilerleme ekranı; motorlara callback/arayüz üzerinden bağlanır. |
| `vault-crypto.js`, `storage.js`, `tabs.js`, `telemetry.js` | Yerel şifreleme, kayıt doğrulama, mesaj yetkilendirmesi, sekme ve teknik rapor sınırları. |
| `evrak-zip.js`, `udf.js`, `tiff.js`, `durusma-paketi-*` | Genel ZIP ve yerel belge görüntüleme/dönüştürme araçları. |
| `fragments/`, `FRAGMENTS.json` | Karma dosyalardan ayrılmış açık görünüm/helper/yetki bölümleri; parça sırası ve hash bilgileri. |
| `contracts.json`, `manifest.json`, `PUBLIC-FILES.json` | Motor arayüzleri, tam paketin izin/betik sırası ve açık dosya envanteri. |
| `demo/`, `tests/`, `scripts/`, `vendor/` | Sentetik demo, açık kapsam testleri, doğrulama araçları ve lisansları korunmuş üçüncü taraf bileşenler. |

UYAP tarama ve belge adaptörleri, banka/tebligat ayrıştırıcıları ve kalıcı indirme motoru özel depodadır. Açık depo **tek başına kurulabilir tam UYAP eklentisi değildir**; `manifest.json` tam paketin izinlerini incelenebilir tutar, eksik özel motoru sağlamaz.

Tam paket özel depoda sabitlenmiş bir açık arayüz commit'iyle derlenir. Açık ve özel parçalar tanımlanan sırada byte olarak birleştirilir; parça aralarına karakter eklenmez. `contracts.json` dosya/borçlu/belge kapsamı, açık ücret onayı ve kaydedilen parça ilerlemesi gibi bağlantı kurallarını tarif eder. Çalışma anında uzaktan JavaScript indirilmez.

Kaynak deposunu özel tutmak, kullanıcıya dağıtılan Chrome paketindeki JavaScript'i görünmez yapmaz. Daha önce yayımlanmış kopyalar ve forklar da geri alınamaz. Bu yayın modeli açık kaynak arayüzün kapsamını belirler; kullanıcı anahtarlarını kod gizliliğine dayandırmaz.

## Geliştiriciler için demo ve testler

Depoyu bilgisayarınıza alın ve **Node.js 22 veya üzeri** ile kök dizinde çalışın. Bu komutlar için ek bağımlılık kurulması gerekmez:

```sh
npm test
npm run validate
npm run demo
```

`npm test` açık UI, kurulum, indirme paneli ve kripto sınırlarının sentetik testlerini çalıştırır. `npm run validate` açık dosya envanterini, hashleri ve yayın sınırlarını kontrol eder. Tam eklentinin UYAP entegrasyon testleri özel motor deposunda yürütülür.

`npm run demo` sonrası **http://127.0.0.1:4173/demo/** adresini açın; sunucuyu **Ctrl+C** ile kapatın. Demo gerçek indirme panelini sentetik işler üzerinde gösterir. UYAP'a bağlanmaz, belge veya indirme çalıştırmaz, gerçek dosya verisi kullanmaz; tam uygulamanın bütün ekranlarını temsil etmez.

`demo/common.js` özel motor fonksiyonları yerine `NOT_AVAILABLE` hatası veren stub'lar içerir. Katkı geliştirirken gerçek servis yerine sentetik callback/manager kullanın; görünümü kapatmanın motoru durdurmaması ve diske kaydedilen ilerleme ile geçici parça ilerlemesinin ayrı gösterilmesi gibi sözleşmeleri koruyun.

## Katkı, destek ve lisans

Genel hata ve öneriler için [Issues](https://github.com/hasanimer/legaluga-uyap-ui/issues) açın; sürüm, yeniden üretme adımları ve beklediğiniz davranışı yazın. Güvenlik bildirimlerini [SECURITY.md](SECURITY.md) içindeki özel kanaldan iletin. HAR, giriş bilgisi veya gerçek dava belgesi paylaşmayın; örnekleri sentetik verilerle hazırlayın.

Bu depodaki Hasan İmer Akın'a ait kaynaklar [MIT lisansı](LICENSE) kapsamındadır. `vendor/` bileşenleri ve fontlar kendi lisansları, bildirimleri ve atıflarıyla korunur; proje MIT lisansı onları değiştirmez. Özel motorun lisansı ayrıdır. Önceki açık sürümler, yayımlandıkları lisanslarla kullanılmaya devam eder.
