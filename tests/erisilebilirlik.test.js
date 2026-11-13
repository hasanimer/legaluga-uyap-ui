// Panel (ui.js) ve sayfa kabuğu (content.js PAGE_CSS) CSS'inin erişilebilirlik sözleşmesi: tema simgelerinden metin/zemin
// kontrastı (WCAG 2 göreli parlaklık), zorunlu renk kipinde (Windows Yüksek Karşıtlık) seçili durumlar, azaltılmış hareket
// tercihi ve koyu temada simgeden gelen vurgu rengi. CSS üretimdeki şablon metninden gerçek marka renkleriyle kurulur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const kok = path.join(__dirname, '..');
const oku = ad => fs.readFileSync(path.join(kok, ad), 'utf8');
const { BRAND } = (() => { const context = vm.createContext({}); vm.runInContext(require('./common-taklidi.js').commonKaynagi(), context); return context.UHD; })();

// Şablon metni üretimdeki gibi değerlendirilir: ${BRAND.*} marka rengine, sonradan eklenen modül CSS'leri boş metne çözülür.
function sablonCss(metin, bas) {
  const i = metin.indexOf(bas);
  assert.ok(i >= 0 && metin.indexOf(bas, i + 1) < 0, `${bas} tek olmalı`);
  return vm.runInNewContext(metin.slice(i + bas.length - 1, metin.indexOf('\n`;', i) + 2), { BRAND, UHD: {} });
}
const sayfaParcasi = JSON.parse(oku('publication/FRAGMENTS.json')).fragments
  .filter(p => p.source === 'content.js').map(p => oku(p.path)).filter(m => m.includes('const PAGE_CSS = `'));
assert.equal(sayfaParcasi.length, 1, 'PAGE_CSS tek açık content parçasında olmalı');
const CSS = { panel: sablonCss(oku('src/extension/ui.js'), 'const CSS = `'), 'sayfa kabuğu': sablonCss(sayfaParcasi[0], 'const PAGE_CSS = `') };

// Ayraçla (en dış düzeyde, parantez içi hariç) bölünmüş liste.
function bol(metin, ayrac = ',') {
  const out = [];
  let derinlik = 0, bas = 0;
  for (let i = 0; i < metin.length; i++) {
    if (metin[i] === '(') derinlik++;
    else if (metin[i] === ')') derinlik--;
    else if (metin[i] === ayrac && !derinlik) { out.push(metin.slice(bas, i).trim()); bas = i + 1; }
  }
  out.push(metin.slice(bas).trim());
  return out.filter(Boolean);
}
// Her seçici ayrı kural: { kosul: '@media(...)' ya da null, secici, govde }. Yorumlar atılır, @keyframes içi sayılmaz.
function kurallar(css, kosul = null, out = []) {
  const metin = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let i = 0, ac; (ac = metin.indexOf('{', i)) >= 0;) {
    let j = ac + 1;
    for (let derinlik = 1; derinlik && j < metin.length; j++) derinlik += metin[j] === '{' ? 1 : metin[j] === '}' ? -1 : 0;
    const bas = metin.slice(i, ac).trim(), ic = metin.slice(ac + 1, j - 1);
    if (!bas.startsWith('@')) for (const secici of bol(bas)) out.push({ kosul, secici, govde: ic });
    else if (!bas.startsWith('@keyframes')) kurallar(ic, bas.replace(/\s*([:(),])\s*/g, '$1'), out);
    i = j;
  }
  return out;
}
const bildirimler = govde => new Map(bol(govde, ';').map(b => [b.slice(0, b.indexOf(':')).trim(), b.slice(b.indexOf(':') + 1).trim()]));
const PANEL = kurallar(CSS.panel), SAYFA = kurallar(CSS['sayfa kabuğu']);

// WCAG 2 göreli parlaklık ve kontrast oranı.
const kanal = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function parlaklik(hex) {
  const h = hex.length === 4 ? [...hex.slice(1)].map(x => x + x).join('') : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map(k => kanal(parseInt(h.slice(k, k + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const kontrast = (a, b) => { const [x, y] = [parlaklik(a), parlaklik(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// var(--x[,yedek]) zinciri temanın simgeleriyle çözülür; saydamlık taşıyan ya da renk olmayan değer null döner.
function renk(deger, simgeler) {
  let v = deger?.replace(/!important$/, '').trim();
  for (let m; v && (m = /^var\(--([\w-]+)(?:,(.+))?\)$/.exec(v));) v = simgeler.get(m[1]) ?? m[2]?.trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v || '') ? v.toLowerCase() : null;
}

const KOYU = '.uhd[data-theme=dark]';
function simgeBlogu(secici) {
  const blok = PANEL.filter(r => !r.kosul && r.secici === secici);
  assert.equal(blok.length, 1, `${secici} simge bloğu tek olmalı`);
  return [...bildirimler(blok[0].govde)].filter(([ad]) => ad.startsWith('--')).map(([ad, v]) => [ad.slice(2), v]);
}
const TEMALAR = { açık: new Map(simgeBlogu('.uhd')), koyu: new Map([...simgeBlogu('.uhd'), ...simgeBlogu(KOYU)]) };
// Koyu tema kuralı taban kuralın seçicisini (.uhd'den sonrası) aynen ya da :is() listesinde yineler.
function koyuDeger(secici, ozellik) {
  const alt = secici.slice('.uhd '.length);
  let deger;
  for (const r of PANEL.filter(r => !r.kosul && r.secici.startsWith(KOYU + ' '))) {
    const hedef = r.secici.slice(KOYU.length + 1), liste = /^:is\((.*)\)$/.exec(hedef);
    if ((liste ? bol(liste[1]) : [hedef]).includes(alt)) deger = bildirimler(r.govde).get(ozellik) ?? deger;
  }
  return deger;
}
// Kendi zemini olmayan metin panelin iki yüzeyinden (sayfa, kart) birinde durur.
const ZEMINSIZ_METIN = ['text', 'text2', 'muted', 'accent-text', 'red', 'amber'], YUZEYLER = ['bg', 'card'];
// Yalnız SVG simgesi taşıyan .ib düğmesi grafik nesnesidir: WCAG 1.4.11 eşiği 3:1, metinler 1.4.3 gereği 4,5:1.
const esik = secici => /\.ib(?![\w-])\S*$/.test(secici) ? 3 : 4.5;

test('panel tema simgelerindeki metin/zemin çiftleri açık ve koyu temada WCAG AA kontrastını karşılar', () => {
  const ciftler = [];
  for (const r of PANEL) {
    const b = bildirimler(r.govde), zemin = b.get('background-color') ?? b.get('background');
    if (r.kosul || !r.secici.startsWith('.uhd') || r.secici.startsWith(KOYU) || !b.has('color') || !zemin) continue;
    for (const [tema, simgeler] of Object.entries(TEMALAR)) {
      const koyu = tema === 'koyu' && r.secici !== '.uhd';
      const metin = renk((koyu && koyuDeger(r.secici, 'color')) || b.get('color'), simgeler);
      const arka = renk((koyu && koyuDeger(r.secici, 'background')) || zemin, simgeler);
      if (metin && arka) ciftler.push({ ad: `${tema} ${r.secici}`, metin, arka, esik: esik(r.secici) });
    }
  }
  for (const secici of ['.uhd', '.uhd .pill.st', '.uhd .pill.st.closed', '.uhd .tag.auto', '.uhd .notice', '.uhd .view.on'])
    assert.equal(ciftler.filter(c => c.ad.endsWith(' ' + secici)).length, 2, `${secici} iki temada da sınanmalı`);
  for (const [tema, simgeler] of Object.entries(TEMALAR))
    for (const m of ZEMINSIZ_METIN) for (const z of YUZEYLER)
      ciftler.push({ ad: `${tema} --${m} / --${z}`, metin: renk(`var(--${m})`, simgeler), arka: renk(`var(--${z})`, simgeler), esik: 4.5 });
  const dusuk = ciftler.map(c => ({ ...c, oran: kontrast(c.metin, c.arka) })).filter(c => !(c.oran >= c.esik))
    .map(c => `${c.ad}: ${c.metin} / ${c.arka} = ${c.oran.toFixed(2)}:1 (en az ${c.esik}:1)`);
  assert.deepEqual(dusuk, []);
});

test('koyu temada vurgu rengi elle yazılmaz; kurallar rengi tema simgesinden alır', () => {
  const elle = PANEL.filter(r => r.secici.startsWith(KOYU + ' ') && /#[0-9a-f]{3,8}\b/i.test(r.govde)).map(r => `${r.secici}{${r.govde}}`);
  assert.deepEqual(elle, []);
});

// Zorunlu renk kipinde zemin, kenar ve gölge renkleri sistem paletine zorlanır (box-shadow kalkar); seçim yalnız bu renklerle
// gösteriliyorsa kaybolur. Durum kuralı: son bileşiği .on/.sel ya da aria-pressed/aria-selected=true olup bunlardan birini
// boyayan kural. Kapsayan kural aynı kökten (.uhd, .viewer, .panel) başlar ve son bileşiği durum kuralınınkinin alt kümesidir.
const DURUM = /\.(?:on|sel)(?![\w-])|\[aria-(?:pressed|selected)=true\]/;
const BOYA = /^(?:background|color|border|box-shadow|outline)/;
const SISTEM_RENGI = /\b(?:Highlight|HighlightText|SelectedItem|SelectedItemText|CanvasText)\b/;
const bilesikler = secici => secici.replace(/"/g, '').replace(/\s*([>+~])\s*/g, ' ').trim().split(/\s+/);
const parcalar = bilesik => new Set(bilesik.match(/[.#][\w-]+|\[[^\]]+\]|::?[\w-]+(?:\([^)]*\))?|^[a-z][\w-]*/gi) || []);
function isAc(secici) {
  const i = secici.indexOf(':is(');
  if (i < 0) return [secici];
  let j = i + 4;
  for (let derinlik = 1; derinlik; j++) derinlik += secici[j] === '(' ? 1 : secici[j] === ')' ? -1 : 0;
  return bol(secici.slice(i + 4, j - 1)).flatMap(arg => isAc(secici.slice(0, i) + arg + secici.slice(j)));
}
function kapsar(genel, ozel) {
  const g = bilesikler(genel), o = bilesikler(ozel), og = parcalar(o.at(-1));
  return g[0] === o[0] && [...parcalar(g.at(-1))].every(p => og.has(p));
}

for (const [ad, liste] of [['panel', PANEL], ['sayfa kabuğu', SAYFA]]) {
  test(`${ad}: seçili durumlar zorunlu renk kipinde sistem vurgu rengiyle ayrışır`, () => {
    const durumlar = liste.filter(r => !r.kosul && DURUM.test(bilesikler(r.secici).at(-1))
      && [...bildirimler(r.govde).keys()].some(o => BOYA.test(o)));
    const zorunlu = liste.filter(r => r.kosul === '@media(forced-colors:active)');
    assert.ok(durumlar.length >= 5, `${ad}: durum kuralları bulunamadı`);
    assert.deepEqual(durumlar.filter(d => !zorunlu.some(z => isAc(z.secici).some(s => kapsar(s, d.secici)))).map(d => d.secici), []);
    // Daha özgül renk kuralı (ör. .chip.new.on) kazanırsa değeri Canvas'a zorlanır ve seçim yine kaybolur: bildirimler !important.
    for (const z of zorunlu) {
      const degerler = [...bildirimler(z.govde).values()];
      assert.ok(degerler.some(v => SISTEM_RENGI.test(v)), `${z.secici}: sistem rengi yok`);
      assert.deepEqual(degerler.filter(v => !v.endsWith('!important')), [], `${z.secici}: !important olmayan bildirim`);
    }
  });

  test(`${ad}: her geçiş ve animasyon azaltılmış hareket tercihinde kapanır`, () => {
    const azalt = liste.filter(r => r.kosul === '@media(prefers-reduced-motion:reduce)');
    const kapsayan = (secici, ozellik) => azalt.some(r => /^none\b/.test(bildirimler(r.govde).get(ozellik) || '')
      && (r.secici === secici || (r.secici.endsWith(' *') && secici.startsWith(r.secici.slice(0, -1)))));
    const eksik = [];
    for (const r of liste.filter(r => !r.kosul)) {
      for (const [ozellik, deger] of bildirimler(r.govde))
        if (/^(?:transition|animation)$/.test(ozellik) && !/^none\b/.test(deger) && !kapsayan(r.secici, ozellik)) eksik.push(`${r.secici}{${ozellik}:${deger}}`);
    }
    assert.deepEqual(eksik, []);
  });
}
