const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('demo gerçek panel CSS ile aynı ve CSP ile uyumlu',()=>{
  assert.equal(fs.readFileSync(path.join(__dirname,'../demo/panel.css'),'utf8'),require('../src/extension/indirme-panel.js').CSS);
  const html=fs.readFileSync(path.join(__dirname,'../demo/index.html'),'utf8');
  assert.match(html,/connect-src 'none'/);assert.match(html,/href="panel.css"/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../demo/demo.js'),'utf8'),/fetch\(|XMLHttpRequest|createElement\('style'\)/);
});
test('demodaki özel motor fonksiyonları sessizce işlem yapamaz',()=>{
  require('../demo/common.js');
  for (const name of ['openPath','bankaAdi','bankaCevabi','parseEvraklar']) assert.throws(()=>globalThis.UHD[name]({}),/Özel işlem motoru/);
});
