const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const fixture=(name='safe.js',code='const demo=1;')=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legaluga-public-'));
  fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});
  fs.mkdirSync(path.join(dir,'publication'),{recursive:true});
  fs.writeFileSync(path.join(dir,name),code);
  fs.writeFileSync(path.join(dir,'publication/PUBLIC-FILES.json'),JSON.stringify({schema:1,files:[{path:name,sha256:createHash('sha256').update(code).digest('hex')},{path:'publication/PUBLIC-FILES.json',sha256:null}]}));
  return dir;
};
test('açık kaynak envanteri bilinmeyen dosya ve değiştirilmiş kaynağı reddeder',async()=>{
  const {validate}=await import('../scripts/validate-public.mjs');const dir=fixture();
  try{
    assert.equal(validate(dir).ok,true);fs.writeFileSync(path.join(dir,'extra.js'),'extra');
    assert.throws(()=>validate(dir),/Envanter dışı/);fs.unlinkSync(path.join(dir,'extra.js'));
    fs.writeFileSync(path.join(dir,'safe.js'),'tampered');assert.throws(()=>validate(dir),/hash uyuşmazlığı/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('özel motor dosyası ve gerçek ağ kayıtlarının yolları açık kapsama alınamaz',async()=>{
  const {validate}=await import('../scripts/validate-public.mjs');
  for(const name of ['content.js','evrak-indirme-motoru.js','danistay-content.js','session.har','secret.key','src/extension/content.js','src/extension/danistay-content.js','src/fragments/background.js','docs/nested/banka-api.js']){
    const dir=fixture(name);try{assert.throws(()=>validate(dir),/Özel veri|Tam motor/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
});
test('adı genel görünen dosyanın içindeki servis adaptörü de reddedilir',async()=>{
  const {validate}=await import('../scripts/validate-public.mjs');const dir=fixture('helper.js',"fetch('/synthetic."+'ajx'+"')");
  try{assert.throws(()=>validate(dir),/endpoint adaptörü/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
