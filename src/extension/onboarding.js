// İlk kurulum tercihleri, kullanıcı tamamlayana kadar yalnız bu ekranda tutulur.
(() => {
  const { el, TURLER, ILLER, norm } = globalThis.UHD;
  const DEFAULTS = {
    taramaDurum: 'tum', savcilik: 'kapali', myName: '', tema: 'auto', panelSabit: true,
    acilisSekme: 'yok', evrakTakip: false, safahatTakipOptIn: false, otoGuncelle: 'kapali',
    durusmaBildirim: true, cakismaBildirim: true, duyuruBildirim: true, oturumAcik: false, hataRaporu: false
  };
  const OPTIONS = {
    taramaDurum: [['tum', 'Açık ve kapalı dosyalar'], ['acik', 'Yalnız açık dosyalar'], ['kapali', 'Yalnız kapalı dosyalar']],
    savcilik: [['kapali', 'Savcılık dosyalarını tarama'], ['otomatik', 'Dosyalarımın bulunduğu iller'], ['secili', 'Yalnız seçtiğim iller'], ['tum', 'Tüm iller (uzun sürebilir)']],
    tema: [['auto', 'Sistemle aynı'], ['light', 'Açık'], ['dark', 'Koyu']],
    acilisSekme: [['yok', 'Hiçbiri'], ['evrak', 'Evrak'], ['taraf', 'Taraf bilgileri']],
    otoGuncelle: [['kapali', 'Kapalı'], ['6s', '6 saatte bir'], ['gunluk', 'Günde bir']]
  };
  const labelOf = (key, value) => OPTIONS[key].find(([code]) => code === value)?.[1] || value;

  function mountOnboarding(container, { prefs = {}, hasFiles = false, onConnection, onOpenUyap, onComplete } = {}) {
    const draft = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (OPTIONS[key]) {
        if (OPTIONS[key].some(([value]) => value === prefs[key])) draft[key] = prefs[key];
      } else if (typeof prefs[key] === typeof DEFAULTS[key]) draft[key] = prefs[key];
    }
    const knownTypes = new Set(TURLER.map(type => type.kod));
    draft.taramaTurleri = Array.isArray(prefs.taramaTurleri)
      ? [...new Set(prefs.taramaTurleri.map(String).filter(code => knownTypes.has(code)))]
      : TURLER.map(type => type.kod);
    draft.savcilikIller = Array.isArray(prefs.savcilikIller)
      ? [...new Set(prefs.savcilikIller.map(Number).filter(code => Number.isInteger(code) && code >= 1 && code <= ILLER.length))]
      : [];

    const hasConnection = typeof onConnection === 'function';
    let step = hasConnection ? 0 : 1, busy = false, finished = false, destroyed = false, savedPrefs = null, completionPending = false;
    let connection = { ready: false, status: 'checking' }, checking = false, connectionRun = 0, nameEdited = false;
    let controls = [], heading, errorBox, nameInput = null, connectionBoxes = [];
    const root = el('section', { class: 'setup-content', 'aria-label': 'Legaluga ilk kurulumu' });
    const form = el('form', { novalidate: true });
    root.append(form);
    container.replaceChildren(root);
    const track = node => { controls.push(node); return node; };
    const changed = () => { if (!busy) savedPrefs = null; };
    const hint = text => el('p', { class: 'setup-hint' }, text);
    const group = (title, ...children) => el('fieldset', { class: 'setup-card' }, el('legend', null, title), ...children);
    const focus = () => { if (!destroyed) heading?.focus(); };
    const showError = text => {
      if (destroyed) return;
      errorBox.textContent = text;
      errorBox.hidden = !text;
      if (text) errorBox.focus();
    };
    const setBusy = value => {
      busy = value;
      form.setAttribute('aria-busy', String(value));
      for (const control of controls) control.disabled = value || finished || (step === 0 && checking);
    };
    const checkbox = (key, label, description) => {
      const input = track(el('input', { type: 'checkbox', name: key, 'data-pref': key }));
      input.checked = draft[key];
      input.addEventListener('change', () => { draft[key] = input.checked; changed(); });
      return el('label', { class: 'setup-choice' }, input, el('span', null, el('span', null, label), description ? hint(description) : null));
    };
    const select = (key, label, description, onChange) => {
      const input = track(el('select', { name: key, 'data-pref': key }, OPTIONS[key].map(([value, text]) => el('option', { value }, text))));
      input.value = draft[key];
      input.addEventListener('change', () => { draft[key] = input.value; changed(); if (onChange) onChange(); });
      return el('label', { class: 'setup-field' }, el('span', null, label), input, description ? hint(description) : null);
    };
    const button = (text, click, primary = false) => {
      const node = track(el('button', { type: 'button', class: primary ? 'btn primary' : 'btn' }, text));
      node.addEventListener('click', click);
      return node;
    };
    const validScope = () => {
      if (!draft.taramaTurleri.length && draft.savcilik === 'kapali') {
        showError('Taranacak en az bir dosya türü seçin veya savcılık taramasını açın.');
        return false;
      }
      if (draft.savcilik === 'secili' && !draft.savcilikIller.length) {
        showError('Savcılık taraması için en az bir il seçin.');
        return false;
      }
      if (!hasFiles && !draft.taramaTurleri.length && draft.savcilik === 'otomatik' && !draft.savcilikIller.length) {
        showError('İlleri bulmak için bir mahkeme dosyası türü seçin veya savcılık için il ekleyin.');
        return false;
      }
      showError('');
      return true;
    };

    const connectionText = () => {
      if (checking || connection.status === 'checking') return 'UYAP oturumunuz kontrol ediliyor…';
      if (connection.ready) return connection.name ? `UYAP’a bağlı · ${connection.name}` : 'UYAP oturumunuz açık.';
      const messages = {
        'missing-tab': 'UYAP bağlantısı bulunamadı. UYAP’ı açıp avukat hesabınızla giriş yapın.',
        login: 'UYAP oturumunuz açık değil. UYAP’a giriş yaptığınızda kuruluma buradan devam edebilirsiniz.',
        unresponsive: 'UYAP sayfasına ulaşılamadı. UYAP sayfasını yenileyip bağlantıyı kontrol edin.',
        offline: 'UYAP’a bağlanılamadı. İnternet bağlantınızı kontrol edin.',
        blocked: 'UYAP bağlantısı doğrulanamadı. UYAP’taki güvenlik doğrulamasını tamamlayın; ardından bağlantıyı kontrol edin.'
      };
      return messages[connection.status] || 'UYAP bağlantısı kontrol edilemedi. UYAP’ı açıp bağlantıyı yeniden kontrol edin.';
    };
    const connectionStatus = () => {
      const node = el('p', { class: 'setup-connection', role: 'status', 'aria-live': 'polite' }, connectionText());
      connectionBoxes.push(node);
      return node;
    };

    function setConnection(value) {
      if (destroyed || finished) return;
      const next = { ready: value?.ready === true, status: value?.status || 'error',
        name: typeof value?.name === 'string' ? value.name.trim() : '' };
      if (!checking && next.ready === connection.ready && next.status === connection.status && next.name === connection.name) return;
      connectionRun++;
      checking = false;
      connection = next;
      if (connection.ready && connection.name && !nameEdited && !draft.myName.trim()) {
        draft.myName = connection.name;
        changed();
        if (nameInput && !busy) nameInput.value = draft.myName;
      }
      const advance = connection.ready && step === 0;
      if (advance) step = 1;
      if (step === 0 || advance) { render(); if (advance) focus(); }
      else for (const box of connectionBoxes) box.textContent = connectionText();
    }

    async function checkConnection(manual = false) {
      if (!hasConnection || checking || busy || finished || destroyed) return;
      const run = ++connectionRun;
      checking = true;
      connection = { ...connection, status: 'checking' };
      render();
      try {
        const result = await onConnection({ manual });
        if (!destroyed && run === connectionRun) setConnection(result);
      } catch {
        if (!destroyed && run === connectionRun) setConnection({ ready: false, status: 'error' });
      }
    }

    async function openUyap() {
      if (busy || checking || finished || destroyed) return;
      setBusy(true);
      try {
        if (typeof onOpenUyap !== 'function') throw new Error('UYAP bağlantısı açılamadı');
        const result = await onOpenUyap();
        if (result?.ok === false) throw new Error('UYAP bağlantısı açılamadı');
      } catch { showError('UYAP açılamadı. Tarayıcınızda avukat.uyap.gov.tr adresini açıp giriş yapın.'); }
      finally { if (!destroyed) setBusy(false); }
    }

    function connectionFields() {
      return [group('UYAP’a bağlanın', connectionStatus(),
        hint('Bu panel UYAP’ın içinde açılır. Giriş tamamlandığında bağlantı ve hesabınızdaki vekil adı otomatik alınır.'),
        el('ol', { class: 'setup-guide' }, el('li', null, 'UYAP Avukat Portal’ı açın.'),
          el('li', null, 'UYAP’ın kendi giriş ekranından hesabınıza giriş yapın.'),
          el('li', null, 'Legaluga panelinde dosya türlerini ve başlangıç ayarlarını seçin.')),
        hint('Giriş bilgilerinizi bu panele yazmanız gerekmez. Henüz giriş yapamıyorsanız ayarlarınızı seçebilirsiniz; tarama UYAP bağlantısını bekler.'))];
    }

    function scopeFields() {
      const types = TURLER.map(type => {
        const input = track(el('input', { type: 'checkbox', name: 'taramaTurleri', value: type.kod, 'data-tur': type.kod }));
        input.checked = draft.taramaTurleri.includes(type.kod);
        input.addEventListener('change', () => {
          const selected = new Set(draft.taramaTurleri);
          if (input.checked) selected.add(type.kod); else selected.delete(type.kod);
          draft.taramaTurleri = TURLER.filter(type => selected.has(type.kod)).map(type => type.kod);
          changed();
        });
        return el('label', { class: 'setup-choice' }, input, type.ad);
      });
      const search = track(el('input', { type: 'search', name: 'ilArama', placeholder: 'İl adıyla ara', autocomplete: 'off' }));
      const cities = ILLER.map((name, index) => ({ name, code: index + 1 })).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(city => {
        const input = track(el('input', { type: 'checkbox', name: 'savcilikIller', value: String(city.code), 'data-il': String(city.code) }));
        input.checked = draft.savcilikIller.includes(city.code);
        input.addEventListener('change', () => {
          const selected = new Set(draft.savcilikIller);
          if (input.checked) selected.add(city.code); else selected.delete(city.code);
          draft.savcilikIller = [...selected].sort((a, b) => a - b);
          changed();
        });
        return { name: city.name, row: el('label', { class: 'setup-choice' }, input, city.name) };
      });
      const empty = hint('Aramayla eşleşen il yok.');
      empty.hidden = true;
      search.addEventListener('input', () => {
        const query = norm(search.value).trim();
        let count = 0;
        for (const city of cities) { city.row.hidden = !norm(city.name).includes(query); if (!city.row.hidden) count++; }
        empty.hidden = count > 0;
      });
      const cityHelp = hint('');
      const cityGroup = group('İl seçimi', cityHelp, el('label', { class: 'setup-field' }, 'İl ara', search),
        el('div', { class: 'setup-cities' }, cities.map(city => city.row), empty));
      const cbsHelp = hint('');
      const updateCities = () => {
        cityGroup.hidden = !['secili', 'otomatik'].includes(draft.savcilik);
        cityHelp.textContent = draft.savcilik === 'otomatik'
          ? 'Dosyalarınızın bulunduğu iller otomatik bulunur. İsterseniz taramaya başka iller ekleyin.'
          : 'Seçtiğiniz illerin bütün başsavcılıkları taranır. En az bir il seçin.';
        cbsHelp.textContent = draft.savcilik === 'kapali'
          ? 'Savcılık taraması başlangıçta kapalıdır. Ayarlardan daha sonra açabilirsiniz.'
          : 'Savcılık dosyaları il ve başsavcılık bazında sorgulanır; il sayısı arttıkça tarama uzar.';
      };
      const cbsSelect = select('savcilik', 'Savcılık dosyaları', null, updateCities);
      updateCities();
      return [group('Dosya türleri', hint('Taramak istediğiniz yargı türlerini seçin. Seçimleriniz daha sonra Ayarlar’dan değiştirilebilir.'), el('div', { class: 'setup-grid' }, types)),
        group('Tarama kapsamı', select('taramaDurum', 'Dosya durumu'), cbsSelect, cbsHelp), cityGroup];
    }

    function settingsFields() {
      const name = track(el('input', { type: 'text', name: 'myName', autocomplete: 'name', placeholder: 'UYAP hesabından alınır', 'data-pref': 'myName' }));
      nameInput = name;
      name.value = draft.myName;
      name.addEventListener('input', () => { draft.myName = name.value; nameEdited = true; changed(); });
      return [group('Görünüm ve dosya açma',
        el('label', { class: 'setup-field' }, 'Vekil adınız', name,
          hint('İlk UYAP bağlantısında hesabınızın adı otomatik alınır. Bu adın vekil olduğu taraflar “Müvekkil” olarak gösterilir. Gerekirse değiştirebilir veya birden fazla adı virgülle ayırabilirsiniz.')),
        select('tema', 'Tema'), checkbox('panelSabit', 'UYAP panelini sabit tut', 'Panel UYAP’ın yanına yerleşir ve siz kapatıncaya kadar açık kalır.'),
        select('acilisSekme', 'Dosya açılınca geçilecek sekme')),
      group('Güncelleme',
        checkbox('evrakTakip', 'Yeni evrakları bul', 'Her açık dosya için ek UYAP isteği yapılır; tarama uzayabilir.'),
        checkbox('safahatTakipOptIn', 'Son işlemi (safahat) kartta göster', 'Son elle çekilip kaydedilen safahattan en yeni işlemi gösterir. Tarama safahat sorgusu yapmaz; Safahat sekmesindeki düğmeyle güncellenir.'),
        select('otoGuncelle', 'Otomatik güncelleme', 'Yalnız UYAP sekmesi açıkken çalışır.')),
      group('Bildirimler ve oturum',
        checkbox('durusmaBildirim', 'Yaklaşan duruşmaları hatırlat', 'Bugün ve yarınki duruşmalar için bildirim gösterir.'),
        checkbox('cakismaBildirim', 'Duruşma çakışmalarını bildir', 'Çakışma taramasını Duruşmalarım bölümünden açtığınızda uyarılar gösterilir.'),
        checkbox('duyuruBildirim', 'UYAP duyurularını göster'),
        checkbox('oturumAcik', 'UYAP oturumunu koru', 'Varsayılan kapalıdır. Açılırsa eklenti, siz işlem yapmasanız da aralıklarla UYAP’a küçük bir okuma isteği gönderir.')),
      group('Hata raporlama', checkbox('hataRaporu', 'Teknik hata raporlarını Sentry’ye gönder',
        'Varsayılan olarak kapalıdır. Açıldığında hata türü, işlem, uzantı sürümü ve kod satırı gönderilir. Dosya numarası, kişi adı, evrak, hata metni, sayfa adresi ve oturum bilgileri gönderilmez. Sentry bağlantısı ağ adresinizi görür; rapora kullanıcı bilgisi eklenmez.')),
      group('Tarama seçiminiz', el('div', { class: 'setup-summary' },
        el('p', null, el('strong', null, 'Dosya türleri: '), draft.taramaTurleri.length ? TURLER.filter(type => draft.taramaTurleri.includes(type.kod)).map(type => type.ad).join(', ') : 'Yalnız savcılık'),
        el('p', null, el('strong', null, 'Dosya durumu: '), labelOf('taramaDurum', draft.taramaDurum)),
        el('p', null, el('strong', null, 'Savcılık: '), labelOf('savcilik', draft.savcilik)),
        ['secili', 'otomatik'].includes(draft.savcilik) && draft.savcilikIller.length
          ? el('p', null, el('strong', null, draft.savcilik === 'otomatik' ? 'Ek iller: ' : 'İller: '), draft.savcilikIller.map(code => ILLER[code - 1]).join(', ')) : null)),
      hint('“Kurulumu tamamla” seçimlerinizi kaydeder. “Kaydet ve taramayı başlat” seçtiğiniz kapsamı tarar; oturum henüz açık değilse giriş yaptığınızda otomatik başlar. Ayarları daha sonra değiştirebilirsiniz.')];
    }

    async function finish(startScan) {
      if (busy || finished || destroyed || !validScope()) return;
      completionPending = true;
      setBusy(true);
      let saved = Boolean(savedPrefs);
      try {
        if (!savedPrefs) {
          const patch = { ...draft, myName: draft.myName.trim(), taramaTurleri: [...draft.taramaTurleri],
            savcilikIller: [...draft.savcilikIller], kurulumTamamlandi: true, kurulumSurumu: 1,
            kurulumVekilBekliyor: !draft.myName.trim() };
          if (globalThis.UHDStorage?.patchPrefs) savedPrefs = await globalThis.UHDStorage.patchPrefs(patch);
          else {
            const { uhdPrefs = {} } = await chrome.storage.local.get('uhdPrefs');
            savedPrefs = { ...uhdPrefs, ...patch };
            await chrome.storage.local.set({ uhdPrefs: savedPrefs });
          }
          savedPrefs = { ...prefs, ...patch, ...(savedPrefs || {}) };
          saved = true;
        }
        if (!destroyed && onComplete) await onComplete(savedPrefs, startScan);
        finished = true;
        completionPending = false;
        showError('');
      } catch {
        // Başarısız kaydı yeniden denemek gerekir; callback hatasında kayıt zaten tamamlanmıştır.
        if (!saved) savedPrefs = null;
        showError(saved
          ? 'Ayarlarınız kaydedildi, ancak kurulumu açma veya taramayı başlatma işlemi tamamlanamadı. Devam etmek için tekrar deneyin.'
          : 'Ayarlar kaydedilemedi. Seçimleriniz bu ekranda korunuyor; tekrar deneyin.');
      } finally { if (!destroyed) setBusy(false); }
    }

    function render() {
      controls = [];
      nameInput = null;
      connectionBoxes = [];
      heading = el('h1', { tabindex: '-1' }, step === 0 ? 'UYAP bağlantısı' : step === 1 ? 'Hangi dosyalar taransın?' : 'Başlangıç ayarları');
      errorBox = el('div', { class: 'setup-error', role: 'alert', 'aria-live': 'assertive', tabindex: '-1', hidden: true });
      const actions = step === 0
        ? [button(connection.status === 'login' ? 'UYAP girişini aç' : 'UYAP’ı aç', openUyap, true),
          button('Bağlantıyı yeniden kontrol et', () => checkConnection(true)),
          button('Ayarları şimdi seç', () => { if (busy || checking) return; step = 1; render(); focus(); })]
        : step === 1
          ? [button('Devam et', () => { if (busy || !validScope()) return; step = 2; render(); focus(); }, true),
            hasConnection ? button('Bağlantıyı kontrol et', () => { if (busy) return; step = 0; return checkConnection(true); }) : null]
        : [button('Geri', () => { if (busy) return; step = 1; render(); focus(); }),
          button('Kurulumu tamamla', () => finish(false)), button('Kaydet ve taramayı başlat', () => finish(true), true)];
      form.replaceChildren(el('div', { class: 'setup-head' }, el('p', { class: 'setup-step' }, `İlk kurulum · ${hasConnection ? step + 1 : step} / ${hasConnection ? 3 : 2}`), heading,
        hint(step === 0 ? 'Önce UYAP bağlantısını kontrol edelim.' : 'Dosya taraması başlamadan önce kapsamı ve başlangıç ayarlarınızı seçin.'),
        hasConnection && step > 0 ? connectionStatus() : null),
      ...(step === 0 ? connectionFields() : step === 1 ? scopeFields() : settingsFields()), errorBox, el('div', { class: 'setup-actions' }, actions));
      setBusy(busy);
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (busy || finished || destroyed) return;
      if (step === 0) return checkConnection(true);
      if (step === 1) { if (validScope()) { step = 2; render(); focus(); } }
      else return finish(false);
    });
    render();
    if (hasConnection) checkConnection();
    return { focus, setConnection, isSaving: () => busy || completionPending,
      destroy() { destroyed = true; connectionRun++; root.remove(); } };
  }

  globalThis.UHD.mountOnboarding = mountOnboarding;
})();
