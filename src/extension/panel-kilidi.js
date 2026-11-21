'use strict';
// Oturumsuz panel kilidi: UYAP oturumu yokken (giriş/çıkış sayfası ya da UYAP'ın giriş bayrağı kapalı) Legaluga paneli ve
// dosya ekranı dosya bilgisi göstermez. Kayıtlar cihazda şifreli durur ama aynı Chrome profilinde kendiliğinden açılır; bu
// kilit ekrana yansımayı (ekran paylaşımı, yandaki kişi) keser, profile erişen birine karşı şifreleme sağlamaz.
// Bağımlılıklar parametreyle gelir; content.js bağlar: giriş sayfası tanıma, paneli gizleme ve sabit paneli geri getirme.
(() => {
  if (globalThis.UHDPanelKilidi) return;
  const ILETI = 'Legaluga paneli UYAP’a giriş yaptıktan sonra açılır. Oturum yokken dosya bilgileriniz gösterilmez.';
  // Art arda DOM değişiklikleri tek denetimde toplanır.
  const GECIKME_MS = 100;
  // Kilidin gizlediği panel oturum dönünce bu kadar denetim boyunca geri getirilmeye çalışılır (portal menüsü geç çizilir).
  const GERI_DENEME = 50;

  // Ölçüt bekleyen dosya açmanınkiyle aynıdır: portal menüsü henüz çizilmemiş açık oturum kilitlenmez. Bayrak
  // okunamazsa güvenli tarafta kalınır.
  function kilitliMi(girisSayfasi, localStorage) {
    try { return girisSayfasi() || localStorage.getItem('loginState') !== 'true'; } catch { return true; }
  }

  // Sayfa ağacını, geçmiş gezinmesini ve başka sekmedeki giriş bayrağı değişikliğini izler. Kilitliyken paneli ve dosya
  // ekranını gizler (gizle); gizleme yalnız DOM işidir, eklenti bağlamı kapanmış olsa da yapılır ve geç açılan dosya ekranı
  // için her denetimde yinelenir. Kilitlenme anı bir kez bildirilir (kilitlenince: dosya bilgisi taşıyan bildirimler kapanır).
  // Kilit açılınca açılma anı bir kez bildirilir (kilitAcilinca) ve yalnız kilidin gizlediği panel geri getirilir
  // (geriGetir, kendi koşullarıyla).
  function izle({ document, window, MutationObserver, setTimeout, localStorage, girisSayfasi, aktif, panelAcik, gizle, kilitlenince, kilitAcilinca, geriGetir }) {
    const kilitli = () => kilitliMi(girisSayfasi, localStorage);
    let sirada = false, kilitliydi = false, geriKalan = 0;
    const denetle = () => {
      sirada = false;
      if (kilitli()) {
        if (panelAcik()) geriKalan = GERI_DENEME;
        if (!kilitliydi && kilitlenince) kilitlenince();
        kilitliydi = true;
        gizle();
        return;
      }
      const acildi = kilitliydi;
      kilitliydi = false;
      if (!aktif()) return;
      if (acildi && kilitAcilinca) kilitAcilinca();   // kilitliyken ertelenen işler (ör. günlük duruşma hatırlatması)
      if (geriKalan <= 0) return;
      geriKalan--;
      geriGetir();
      if (panelAcik()) geriKalan = 0;
    };
    const sirala = () => {
      if (sirada) return;
      sirada = true;
      setTimeout(denetle, GECIKME_MS);
    };
    new MutationObserver(sirala).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', sirala);
    window.addEventListener('storage', e => { if (e.key === null || e.key === 'loginState') sirala(); });
    sirala();
    return { kilitli };
  }

  globalThis.UHDPanelKilidi = Object.freeze({ ILETI, izle });
})();
