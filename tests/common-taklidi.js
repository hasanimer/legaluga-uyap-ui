// Açık testlerin common.js'i: açık common parçaları publication/FRAGMENTS.json sırasıyla birleşir; özel parçaların
// yerine, o parçanın tanımladığı ve açık parçaların kullandığı işlevler NOT_AVAILABLE hatası veren stub olarak girer.
// Elle tutulan bir kopya olmadığından parçalardan geri kalmaz. Tam depo gerçek common.js yolunu LEGALUGA_COMMON_JS ile verir.
const fs = require('node:fs');
const path = require('node:path');

const kok = path.join(__dirname, '..');
// Özel parçanın sırası → stub'ı yazılan adlar. Özel parça eklenir, kaldırılır ya da ad değişirse burası da değişir.
const OZEL_ISLEVLER = new Map([
  [2, ['openPath']], [4, ['evrakKey']], [6, ['parseEvraklar', 'evrakKilidi']], [8, ['parseDurusma']],
  [10, ['ihbarCevabiMi', 'bankaAdi', 'bankaUnvanAdi', 'bankaCevabi', 'bankaBelgeleri']], [12, ['parseSafahat']], [14, ['ekleriYerlestir']]
]);
const stub = ad => `  function ${ad}() { throw Object.assign(new Error('Özel işlem motoru açık depoda bulunmuyor.'), { code: 'NOT_AVAILABLE', feature: '${ad}' }); }\n`;

function commonTaklidi() {
  const parcalar = JSON.parse(fs.readFileSync(path.join(kok, 'publication/FRAGMENTS.json'), 'utf8')).fragments
    .filter(p => p.source === 'common.js').sort((a, b) => a.order - b.order);
  const bosluklar = [];
  let metin = '';
  for (const [i, parca] of parcalar.entries()) {
    for (let sira = i ? parcalar[i - 1].order + 1 : 1; sira < parca.order; sira++) {
      if (!OZEL_ISLEVLER.has(sira)) throw new Error(`common.js: ${sira}. sıradaki özel parçanın stub listesi yok`);
      bosluklar.push(sira);
      metin += OZEL_ISLEVLER.get(sira).map(stub).join('');
    }
    metin += fs.readFileSync(path.join(kok, parca.path), 'utf8');
  }
  const fazla = [...OZEL_ISLEVLER.keys()].filter(sira => !bosluklar.includes(sira));
  if (fazla.length) throw new Error(`common.js: ${fazla.join(', ')}. sırada özel parça yok; stub listesinden çıkarın`);
  return metin;
}

const commonKaynagi = () => process.env.LEGALUGA_COMMON_JS ? fs.readFileSync(process.env.LEGALUGA_COMMON_JS, 'utf8') : commonTaklidi();

module.exports = { OZEL_ISLEVLER, commonTaklidi, commonKaynagi };
