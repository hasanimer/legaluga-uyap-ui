const {test} = require('node:test');
const assert = require('node:assert/strict');
const vault = require('../vault-crypto.js');
const key = () => crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
test('yerel anahtar dışa aktarılamaz ve kayıt açılabilir',async () => {
  const k=await key();assert.equal(k.extractable,false);
  const sealed=await vault.seal(k,'demo-key','demo-record',{title:'Sentetik'});
  assert.deepEqual(await vault.open(k,'demo-key','demo-record',sealed),{exists:true,value:{title:'Sentetik'}});
  await assert.rejects(crypto.subtle.exportKey('raw',k));
});
test('aynı kayıt yeniden şifrelendiğinde farklı IV üretir',async () => {
  const k=await key();const a=await vault.seal(k,'demo-key','demo-record',1);const b=await vault.seal(k,'demo-key','demo-record',1);
  assert.notEqual(a.iv,b.iv);assert.notEqual(a.data,b.data);
});
test('yanlış anahtar, kayıt adı, anahtar kimliği ve değişmiş şifreli veri reddedilir',async () => {
  const k=await key();const sealed=await vault.seal(k,'demo-key','demo-record',1);
  await assert.rejects(vault.open(await key(),'demo-key','demo-record',sealed));
  await assert.rejects(vault.open(k,'demo-key','another-record',sealed));
  await assert.rejects(vault.open(k,'another-key','demo-record',sealed));
  const bytes=Buffer.from(sealed.data,'base64');bytes[0]^=1;
  await assert.rejects(vault.open(k,'demo-key','demo-record',{...sealed,data:bytes.toString('base64')}));
});
