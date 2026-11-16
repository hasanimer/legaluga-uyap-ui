const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('demo gerçek panel CSS ile aynı ve CSP ile uyumlu',()=>{
  assert.equal(fs.readFileSync(path.join(__dirname,'../demo/panel.css'),'utf8'),require('../src/extension/indirme-panel.js').CSS);
  const html=fs.readFileSync(path.join(__dirname,'../demo/index.html'),'utf8');
  assert.match(html,/connect-src 'none'/);assert.match(html,/href="panel.css"/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../demo/demo.js'),'utf8'),/fetch\(|XMLHttpRequest|createElement\('style'\)/);
});
const {OZEL_ISLEVLER,commonTaklidi}=require('./common-taklidi.js');
const taklit=()=>{const metin=commonTaklidi(),context=vm.createContext({});vm.runInContext(metin,context);return {metin,UHD:context.UHD};};
test('açık testlerin common.js taklidindeki özel motor işlevleri sessizce işlem yapamaz',()=>{
  const {UHD}=taklit();
  for (const ad of [...OZEL_ISLEVLER.values()].flat())
    assert.throws(()=>UHD[ad]({}),e=>e.code==='NOT_AVAILABLE'&&e.feature===ad&&/Özel işlem motoru/.test(e.message),ad);
});
test('açık testlerin common.js taklidi gerçek common parçalarındaki dışa aktarımın her adını tanımlar',()=>{
  const {metin,UHD}=taklit();
  const adlar=/globalThis\.UHD = \{([^}]*)\};/.exec(metin)[1].split(',').map(ad=>ad.trim());
  assert.ok(adlar.length>50);
  assert.deepEqual(adlar.filter(ad=>UHD[ad]===undefined),[]);
});
