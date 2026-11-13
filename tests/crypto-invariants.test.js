const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const vault = require('../src/extension/vault-crypto.js');
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

// Altın vektör: sentetik içerik ve bilinen parolayla bugünkü biçimde şifrelenmiş yedek dosyası, indirildiği baytlarla.
const yedekMetni = fs.readFileSync(path.join(__dirname,'fixtures','yedek-v2.json'),'utf8'), yedek = JSON.parse(yedekMetni);
const parola = 'sentetik-altin-vektor';
const acik = {app:'legaluga-uyap-asistani',format:1,version:'0.0.0',exportedAt:'2026-01-01T00:00:00.000Z',
  data:{uhdNotes:{'sentetik-dosya':'Sentetik not: çğıöşü ÇĞİÖŞÜ'},uhdPrefs:{tema:'dark'}}};
test('yedek-v2 altın vektörü bilinen parolayla açılır, başka parolayla açılmaz',async () => {
  assert.deepEqual(await vault.decryptBackup(yedek,parola),acik);
  await assert.rejects(vault.decryptBackup(yedek,parola+'-yanlis'),/Parola yanlış/);
});
test('yedek-v2 altın vektörü yalnız WebCrypto ve açık AAD dizgesiyle bağımsız çözülür',async () => {
  assert.deepEqual(Object.keys(yedek),['app','format','encrypted','algorithm','kdf','iterations','salt','iv','data']);
  const salt=Buffer.from(yedek.salt,'base64'),iv=Buffer.from(yedek.iv,'base64');
  assert.equal(salt.length,16);assert.equal(iv.length,12);
  const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(parola),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
  const aad=`legaluga-uyap-asistani|backup|2|AES-256-GCM|PBKDF2-SHA-256|600000|${yedek.salt}`;
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad),tagLength:128},key,Buffer.from(yedek.data,'base64'));
  assert.equal(new TextDecoder().decode(plain),JSON.stringify(acik));
});
test('aynı tuz ve IV ile şifreli yedek altın vektörle bayt bayt aynıdır',async () => {
  const sira=[Buffer.from(yedek.salt,'base64'),Buffer.from(yedek.iv,'base64')];
  const getRandomValues=out=>{const next=sira.shift();assert.equal(out.length,next.length);out.set(next);return out;};
  const context=vm.createContext({TextEncoder,TextDecoder,btoa,atob,crypto:{subtle:crypto.subtle,getRandomValues}});
  vm.runInContext(fs.readFileSync(require.resolve('../src/extension/vault-crypto.js'),'utf8'),context);
  assert.equal(JSON.stringify(await context.UHDVaultCrypto.encryptBackup(acik,parola))+'\n',yedekMetni);
  assert.equal(sira.length,0);
});
test('yineleme sayısı açık kümede değilse yedek reddedilir',async () => {
  for (const iterations of [600001,'600000',1e9,0,undefined]) await assert.rejects(vault.decryptBackup({...yedek,iterations},parola),/desteklenmiyor/);
});
test('README yedek parolası alt sınırını yazma sabitiyle aynı anar',() => {
  const metin=fs.readFileSync(path.join(__dirname,'..','README.md'),'utf8');
  const sinirlar=[...metin.matchAll(/en az (\d+) karakterli (?:kullanıcı )?parola/g)].map(m=>Number(m[1]));
  assert.ok(sinirlar.length>0,'README yedek parolasının alt sınırını anmalı');
  assert.deepEqual(sinirlar,sinirlar.map(()=>vault.BACKUP_PASSWORD_MIN_LENGTH));
});
