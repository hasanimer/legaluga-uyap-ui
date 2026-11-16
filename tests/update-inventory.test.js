const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {execFileSync,spawnSync}=require('node:child_process');
const api=()=>import('../scripts/update-inventory.mjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
// git'siz ortamda (ZIP olarak indirilmiş depo) git deposu kuran testler atlanır; betik orada ağacı dolaşır.
const GIT=(()=>{try{execFileSync('git',['--version'],{stdio:'ignore',windowsHide:true});return true;}catch{return false;}})();
const gitGerekir={skip:!GIT&&'git bulunamadı'};
// Süreç içi betik çağrıları da git keşfini geçici kökte durdurur: geçici dizin bir git deposunun içindeyse (TMPDIR) o deponun
// .gitignore'u sentetik kopyaya uygulanmasın.
process.env.GIT_CEILING_DIRECTORIES=fs.realpathSync(os.tmpdir());
// Geçici açık depo kopyası. Testin git komutları ve alt süreçteki betik k.env ile çalışır: git keşfi geçici kökte durur (üstteki
// bir depoya tırmanmaz), dıştaki git ortam değişkenleri (ör. kancadan gelen GIT_DIR) taşınmaz.
// macOS'ta /tmp bir symlink: betiğin ana blok koruması gerçek yolu beklediği için kök realpath ile alınır.
const kopya=()=>{
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'legaluga-envanter-')));
  const env={...process.env,GIT_CEILING_DIRECTORIES:path.dirname(dir)};
  for (const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE']) delete env[key];
  const yaz=(name,text)=>{fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});fs.writeFileSync(path.join(dir,name),text);};
  const oku=name=>fs.readFileSync(path.join(dir,name),'utf8');
  const git=(...args)=>execFileSync('git',['-c','safe.directory='+dir,'-C',dir,...args],{encoding:'utf8',env,windowsHide:true});
  return {dir,env,yaz,oku,git,sil:()=>fs.rmSync(dir,{recursive:true,force:true})};
};
const DOSYALAR={'.gitignore':'dist/\n*.log\n','README.md':'# Demo\n','src/c.js':'const c=3;\n','src/a.js':'const a=1;\n','src/silinen.js':'const s=0;\n',
  'src/fragments/demo/001.js.part':'const parca=1;\n','tests/z.test.js':'// z\n'};
const PARCALAR={schema:1,fragments:[{source:'demo.js',order:1,path:'src/fragments/demo/001.js.part',sha256:'',bytes:0,purpose:'Sentetik parça'}]};
const SIRA=['.gitignore','README.md','publication/FRAGMENTS.json','publication/PUBLIC-FILES.json','src/c.js','src/a.js','src/silinen.js','src/fragments/demo/001.js.part','tests/z.test.js'];
// Sentetik açık depo: dosyalar, parça kaydı (hash'i boş) ve SIRA düzeninde envanter; onek verilirse alt klasöre yazılır.
const kur=(k,onek='')=>{
  const icerik={...DOSYALAR,'publication/FRAGMENTS.json':json(PARCALAR)};
  for (const [name,text] of Object.entries(icerik)) k.yaz(onek+name,text);
  k.yaz(onek+'publication/PUBLIC-FILES.json',json({schema:1,model:'public-ui-private-core',files:SIRA.map(name=>({path:name,sha256:name==='publication/PUBLIC-FILES.json'?null:sha(icerik[name])}))}));
};

test('envanter git izlenen ve izlenmeyen dosyalardan kurulur: sıra korunur, yeni yol kardeşinin ardına girer, silinen çıkar, hash ve parça baytı yenilenir',gitGerekir,async()=>{
  const {updateInventory}=await api(),{validate}=await import('../scripts/validate-public.mjs'),k=kopya();
  try {
    kur(k);
    k.git('init','-q'); k.git('add','-A');
    fs.rmSync(path.join(k.dir,'src/silinen.js'));                 // izlenen ama silinmiş
    k.yaz('src/b.js','const b=2;\n'); k.yaz('tests/yeni/yardimci.js','// y\n');   // izlenmeyen yeni dosyalar
    k.yaz('dist/paket.zip','yok sayılır'); k.yaz('src/notlar.log','yok sayılır');   // .gitignore (ağaç dolaşma ikincisini eklerdi)
    k.yaz('README.md','# Demo\n\nDeğişti.\n'); k.yaz('src/fragments/demo/001.js.part','const parca=2;\n');
    const sonuc=updateInventory({root:k.dir});
    assert.equal(sonuc.agacDolasildi,false,'git kipi');
    assert.deepEqual(sonuc.eklenen,['src/b.js','tests/yeni/yardimci.js']); assert.deepEqual(sonuc.cikarilan,['src/silinen.js']);
    assert.deepEqual(sonuc.changed,['publication/FRAGMENTS.json','publication/PUBLIC-FILES.json']);
    assert.deepEqual(sonuc.yenilenen.sort(),['README.md','publication/FRAGMENTS.json','src/fragments/demo/001.js.part']);
    const envanter=JSON.parse(k.oku('publication/PUBLIC-FILES.json'));
    assert.deepEqual(envanter.files.map(e=>e.path),['.gitignore','README.md','publication/FRAGMENTS.json','publication/PUBLIC-FILES.json',
      'src/c.js','src/a.js','src/b.js','src/fragments/demo/001.js.part','tests/yeni/yardimci.js','tests/z.test.js']);
    for (const e of envanter.files) assert.equal(e.sha256,e.path==='publication/PUBLIC-FILES.json'?null:sha(fs.readFileSync(path.join(k.dir,e.path))),e.path);
    assert.equal(k.oku('publication/PUBLIC-FILES.json'),json(envanter),'biçim: iki boşluk girinti, sonda satır sonu');
    assert.deepEqual(JSON.parse(k.oku('publication/FRAGMENTS.json')).fragments[0],{...PARCALAR.fragments[0],sha256:sha('const parca=2;\n'),bytes:15});
    assert.deepEqual(updateInventory({root:k.dir}).changed,[],'ikinci çalıştırma değişiklik bulmaz');
    fs.rmSync(path.join(k.dir,'src/notlar.log'));                  // açık doğrulayıcı envanter dışı dosyayı reddeder
    k.git('add','-A'); k.git('-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','envanter');
    assert.equal(validate(k.dir).ok,true,'yenilenen envanter açık doğrulayıcıdan geçer');
  } finally {k.sil();}
});

test('kayıtsız açık parça, bulunmayan parça kaydı ve symlink yazmadan reddedilir',async()=>{
  const {updateInventory}=await api(),k=kopya();
  try {
    kur(k);
    const once=[k.oku('publication/PUBLIC-FILES.json'),k.oku('publication/FRAGMENTS.json')];
    k.yaz('src/fragments/demo/002.js.part','const yeni=1;\n');
    assert.throws(()=>updateInventory({root:k.dir}),/FRAGMENTS\.json kaydı olmayan açık parça: src\/fragments\/demo\/002\.js\.part/);
    fs.rmSync(path.join(k.dir,'src/fragments/demo/002.js.part')); fs.rmSync(path.join(k.dir,'src/fragments/demo/001.js.part'));
    assert.throws(()=>updateInventory({root:k.dir}),/FRAGMENTS\.json parçası bulunamadı: src\/fragments\/demo\/001\.js\.part/);
    k.yaz('src/fragments/demo/001.js.part','const parca=1;\n'); fs.symlinkSync('a.js',path.join(k.dir,'src/bag.js'));
    assert.throws(()=>updateInventory({root:k.dir}),/symlink yasak: src\/bag\.js/);
    assert.deepEqual([k.oku('publication/PUBLIC-FILES.json'),k.oku('publication/FRAGMENTS.json')],once,'hiçbir kayıt yazılmaz');
  } finally {k.sil();}
});

test('açık doğrulayıcının reddedeceği yol (özel veri uzantısı, tam motor dosyası) yazmadan reddedilir',async()=>{
  const {updateInventory}=await api(),k=kopya();
  try {
    kur(k);
    const once=[k.oku('publication/PUBLIC-FILES.json'),k.oku('publication/FRAGMENTS.json')];
    for (const [yol,hata] of [['src/extension/banka-api.js',/Tam motor dosyası açık depoya eklenemez: src\/extension\/banka-api\.js/],
      ['tests/fixtures/ornek.har',/Özel veri\/çıktı yolu: tests\/fixtures\/ornek\.har/]]) {
      k.yaz(yol,'// sentetik\n');
      for (const check of [false,true]) assert.throws(()=>updateInventory({root:k.dir,check}),hata,yol);
      fs.rmSync(path.join(k.dir,yol));
    }
    assert.deepEqual([k.oku('publication/PUBLIC-FILES.json'),k.oku('publication/FRAGMENTS.json')],once,'hiçbir kayıt yazılmaz');
    // Envantere elle yazılmış yasak yol da reddedilir: betik 'güncel' deyip doğrulayıcının reddedeceği ağacı onaylamaz.
    const envanter=JSON.parse(once[0]);
    envanter.files.push({path:'src/extension/banka-api.js',sha256:''});
    k.yaz('publication/PUBLIC-FILES.json',json(envanter)); k.yaz('src/extension/banka-api.js','// sentetik\n');
    for (const check of [false,true]) assert.throws(()=>updateInventory({root:k.dir,check}),/Tam motor dosyası açık depoya eklenemez/);
  } finally {k.sil();}
});

test('kökte .git varken git listesi alınamazsa ağaç dolaşılmaz: hata bildirilir, kayıt yazılmaz',async()=>{
  const {updateInventory}=await api(),k=kopya();
  try {
    kur(k); k.yaz('.git','gitdir: '+path.join(k.dir,'yok-boyle-bir-git-dizini')+'\n'); k.yaz('a.har','yok sayılırdı');
    const once=k.oku('publication/PUBLIC-FILES.json');
    // İletide git'in kendi nedeni (dilden bağımsız: komut satırı değil) yer alır.
    assert.throws(()=>updateInventory({root:k.dir}),GIT?/git dosya listesi alınamadı \((?!Command failed)/:/git dosya listesi alınamadı/,'git\'in nedeni iletide');
    assert.equal(k.oku('publication/PUBLIC-FILES.json'),once);
  } finally {k.sil();}
});

test('üst depoda yok sayılan klasördeki kopyada envanter boşaltılmaz: git listesinde envanter yoksa ağaç dolaşılır',gitGerekir,async()=>{
  const {updateInventory}=await api(),k=kopya();
  try {
    k.git('init','-q'); k.yaz('.gitignore','kopya/\n'); kur(k,'kopya/');
    const sonuc=updateInventory({root:path.join(k.dir,'kopya')});
    assert.deepEqual([sonuc.eklenen,sonuc.cikarilan,sonuc.agacDolasildi],[[],[],true]);
    assert.deepEqual(JSON.parse(k.oku('kopya/publication/PUBLIC-FILES.json')).files.map(e=>e.path),SIRA);
  } finally {k.sil();}
});

test('--check yazmadan farkı bildirip 1, güncel envanterde 0, bilinmeyen seçenekte 2 ile çıkar; git dışı kopyada ağaç dolaşılır',()=>{
  const k=kopya(),script=path.join(k.dir,'scripts/update-inventory.mjs'),dogrulayici=path.join(k.dir,'scripts/validate-public.mjs');
  try {
    fs.mkdirSync(path.dirname(script)); fs.copyFileSync(path.join(__dirname,'../scripts/update-inventory.mjs'),script);
    fs.copyFileSync(path.join(__dirname,'../scripts/validate-public.mjs'),dogrulayici);   // yol kurallarını oradan alır
    k.yaz('a.txt','yeni içerik\n'); k.yaz('yeni.txt','eklendi\n'); k.yaz('node_modules/paket/index.js','x'); k.yaz('dist/paket.zip','x');
    k.yaz('publication/FRAGMENTS.json',json({schema:1,fragments:[]}));
    k.yaz('publication/PUBLIC-FILES.json',json({schema:1,files:[{path:'a.txt',sha256:sha('eski içerik\n')},{path:'publication/FRAGMENTS.json',sha256:sha(json({schema:1,fragments:[]}))},
      {path:'publication/PUBLIC-FILES.json',sha256:null},{path:'scripts/update-inventory.mjs',sha256:sha(fs.readFileSync(script))},
      {path:'scripts/validate-public.mjs',sha256:sha(fs.readFileSync(dogrulayici))}]}));
    const once=k.oku('publication/PUBLIC-FILES.json');
    const calistir=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:k.env,windowsHide:true});
    let r=calistir('--check');
    assert.equal(r.status,1,r.stderr); assert.match(r.stderr,/eklenecek: yeni\.txt/); assert.match(r.stderr,/hash: a\.txt/);
    assert.match(r.stdout,/git listesi yok: ağaç dolaşıldı/,'kip bildirilir');
    assert.doesNotMatch(r.stderr,/node_modules|dist/); assert.equal(k.oku('publication/PUBLIC-FILES.json'),once,'--check yazmaz');
    for (const args of [['--chek'],['--check','fazla'],['--check=evet']]) {
      r=calistir(...args); assert.equal(r.status,2,args.join(' ')+': '+r.stderr); assert.match(r.stderr,/Kullanım: node scripts\/update-inventory\.mjs \[--check\]/);
    }
    assert.equal(k.oku('publication/PUBLIC-FILES.json'),once,'hatalı seçenekte yazılmaz');
    r=calistir(); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/güncellendi: publication\/PUBLIC-FILES\.json/);
    assert.deepEqual(JSON.parse(k.oku('publication/PUBLIC-FILES.json')).files.map(e=>e.path),['a.txt','yeni.txt','publication/FRAGMENTS.json','publication/PUBLIC-FILES.json','scripts/update-inventory.mjs','scripts/validate-public.mjs']);
    r=calistir('--check'); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/envanter güncel/);
  } finally {k.sil();}
});

// Git checkout'unda (kökte .git) betik git ister; git'siz ZIP kopyasında ağaç dolaşılır.
test('depodaki açık envanter güncel: betik farksız çıkar (özel depoda npm run sync çıktısıyla bayt-özdeş)',{skip:!GIT&&fs.existsSync(path.join(__dirname,'..','.git'))&&'git bulunamadı'},async()=>{
  const {updateInventory}=await api();
  const {agacDolasildi,...fark}=updateInventory({root:path.join(__dirname,'..'),check:true});
  assert.equal(typeof agacDolasildi,'boolean');
  assert.deepEqual(fark,{changed:[],eklenen:[],cikarilan:[],yenilenen:[]},'node scripts/update-inventory.mjs ile yenileyin');
});
