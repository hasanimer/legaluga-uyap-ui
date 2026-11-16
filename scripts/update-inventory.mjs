// Açık dosya envanterini çalışma ağacından yeniler; yalnız node: modülleriyle çalışır, kurulum istemez.
//   publication/PUBLIC-FILES.json: git'in izlediği dosyalar ve izlenmeyen yeni dosyalar (.gitignore'dakiler hariç; git deposu
//   değilse ağaç dolaşılır ve bu bildirilir) envantere girer. Mevcut sıra korunur, yeni yol en yakın kardeşinin ardına eklenir,
//   silinen dosya çıkar, sha256 yeniden hesaplanır. Envanter kendi hash'ini taşımaz. Ağaçta validate-public.mjs'in reddedeceği
//   yol (özel veri uzantısı ya da klasörü, tam motor dosyası) varsa, envantere elle yazılmış olsa da, hiçbir şey yazılmaz.
//   publication/FRAGMENTS.json: kayıtlı açık parçaların sha256 ve bayt alanları yenilenir; yeni parçanın kaynak, sıra ve amaç
//   alanları elle yazılır.
// Özel depoda ui/ üzerinde de çalışır ve npm run sync ile aynı baytları yazar; kilit ve parça düzeni için ardından npm run sync.
// Kullanım: node scripts/update-inventory.mjs [--check]   (--check yazmaz; fark varsa bildirip 1 ile çıkar)
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {yolSorunu} from './validate-public.mjs';

const INVENTORY = 'publication/PUBLIC-FILES.json', FRAGMENTS = 'publication/FRAGMENTS.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value,null,2)+'\n';

// Envantere aday dosyalar: izlenen ve izlenmeyen yeni dosyalardan çalışma ağacında duranlar (izlenip silinen girmez).
// agacDolasildi: git listesi kullanılamadı, ağaç dolaşıldı (.gitignore uygulanmadı).
export function workingFiles(root) {
  let names, agacDolasildi = false;
  try {
    // -C kökü belirler; git kancasından gelen GIT_DIR/GIT_WORK_TREE başka bir ağacı listeletmesin.
    const env = {...process.env};
    for (const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE']) delete env[key];
    names = execFileSync('git',['-c','safe.directory='+path.resolve(root),'-C',root,'ls-files','-z','--cached','--others','--exclude-standard'],
      {encoding:'utf8',env,stdio:['ignore','pipe','pipe'],windowsHide:true}).split('\0').filter(Boolean);
    // Envanter listede yoksa kök bir checkout değildir (ör. üst depoda yok sayılan klasördeki kopya): liste boşaltmasın.
    if (!names.includes(INVENTORY)) throw Error('git listesi envanteri içermiyor');
  } catch (error) {
    // Kökte .git varsa gerçek bir checkout'tur: git hatası (git kurulu değil, güvenilmeyen sahiplik, bozuk indeks) ağaç dolaşmayla
    // örtülmez, yoksa .gitignore'daki dosyalar envantere girerdi.
    // İletide git'in kendi nedeni (stderr'in ilk satırı) yer alır; git hiç çalışmadıysa (ENOENT) hata iletisi.
    const neden = String(error.stderr || '').trim().split('\n')[0] || String(error.message).split('\n')[0];
    if (fs.existsSync(path.join(root,'.git'))) throw Error('git dosya listesi alınamadı ('+neden+'); envanter yazılmadı.',{cause:error});
    // Git dışı kopya (ör. ZIP olarak indirilmiş depo): validate-public.mjs ile aynı klasörler dışarıda kalır.
    names = [];
    agacDolasildi = true;
    const walk = (dir, prefix='') => {
      for (const item of fs.readdirSync(dir,{withFileTypes:true})) {
        if (!prefix && ['.git','node_modules','dist'].includes(item.name)) continue;
        if (item.isDirectory()) walk(path.join(dir,item.name),prefix+item.name+'/'); else names.push(prefix+item.name);
      }
    };
    walk(root);
  }
  const files = new Set();
  for (const name of names) {
    let stat;
    try { stat = fs.lstatSync(path.join(root,name)); } catch { continue; }
    if (stat.isSymbolicLink()) throw Error('Açık depoda symlink yasak: '+name);
    if (stat.isFile()) files.add(name);
  }
  return {files:[...files].sort(),agacDolasildi};
}

// Yeni yolun yeri: aynı klasördeki dosyalar, yoksa klasörün alt ağacı, o da yoksa bir üst klasör grubu. Grupta yoldan küçük en
// büyük yolun ardına, yoksa yoldan büyük en küçük yolun önüne girer; elle kurulmuş sıra bozulmaz.
function place(files, entry) {
  for (let dir = path.posix.dirname(entry.path);; dir = path.posix.dirname(dir)) {
    const top = dir==='.';
    let group = files.filter(e => path.posix.dirname(e.path)===dir);
    if (!group.length) group = files.filter(e => top || e.path.startsWith(dir+'/'));
    if (!group.length && !top) continue;
    const before = group.filter(e => e.path<entry.path), after = group.filter(e => e.path>entry.path);
    const at = before.length ? files.indexOf(before.reduce((a,b) => b.path>a.path ? b : a))+1
      : after.length ? files.indexOf(after.reduce((a,b) => b.path<a.path ? b : a)) : files.length;
    files.splice(at,0,entry);
    return;
  }
}

export function updateInventory({root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),check=false}={}) {
  const {files,agacDolasildi} = workingFiles(root), present = new Set(files), refreshed = new Set();
  const text = name => fs.readFileSync(path.join(root,name),'utf8');
  const fragments = JSON.parse(text(FRAGMENTS));
  const registered = new Set(fragments.fragments.map(item => item.path));
  const unregistered = files.filter(name => name.startsWith('src/fragments/') && name.endsWith('.part') && !registered.has(name));
  if (unregistered.length) throw Error('FRAGMENTS.json kaydı olmayan açık parça: '+unregistered.join(', ')+'. Kaynak, sıra ve amaç alanlarıyla ekleyin (sha256 boş).');
  for (const item of fragments.fragments) {
    if (!present.has(item.path)) throw Error('FRAGMENTS.json parçası bulunamadı: '+item.path);
    const bytes = fs.readFileSync(path.join(root,item.path));
    if (item.sha256!==sha(bytes) || item.bytes!==bytes.length) refreshed.add(item.path);
    item.sha256 = sha(bytes); item.bytes = bytes.length;
  }
  const next = new Map([[FRAGMENTS,json(fragments)]]);
  const inventory = JSON.parse(text(INVENTORY));
  if (inventory.schema!==1 || !Array.isArray(inventory.files)) throw Error('Açık dosya envanteri geçersiz.');
  const listed = new Set(inventory.files.map(e => e.path));
  if (listed.size!==inventory.files.length) throw Error('Envanter tekrarlı yol içeriyor.');
  const removed = inventory.files.filter(e => !present.has(e.path)).map(e => e.path);
  const added = files.filter(name => !listed.has(name));
  // Ağaçtaki her envanter yolu (elle kaydedilmiş olanlar da) doğrulayıcının yol kurallarına uymalı.
  const sorunlar = files.map(yolSorunu).filter(Boolean);
  if (sorunlar.length) throw Error(sorunlar.join('\n')+'\nDosyayı ui/ dışına alın ya da silin; envanter yazılmadı.');
  inventory.files = inventory.files.filter(e => present.has(e.path));
  for (const name of added) place(inventory.files,{path:name,sha256:name===INVENTORY ? null : ''});
  for (const item of inventory.files) {
    if (item.path===INVENTORY) continue;   // envanter kendi hash'ini taşımaz
    const hash = sha(next.has(item.path) ? next.get(item.path) : fs.readFileSync(path.join(root,item.path)));
    if (item.sha256!==hash && !added.includes(item.path)) refreshed.add(item.path);
    item.sha256 = hash;
  }
  next.set(INVENTORY,json(inventory));
  const changed = [...next.keys()].filter(name => next.get(name)!==text(name));
  if (!check) for (const name of changed) fs.writeFileSync(path.join(root,name),next.get(name));
  return {changed,eklenen:added,cikarilan:removed,yenilenen:[...refreshed],agacDolasildi};
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let check;
  try { ({check} = parseArgs({options:{check:{type:'boolean'}},strict:true}).values); }
  catch (error) { console.error(error.message+'\nKullanım: node scripts/update-inventory.mjs [--check]'); process.exit(2); }
  try {
    const {changed,eklenen,cikarilan,yenilenen,agacDolasildi} = updateInventory({check});
    if (agacDolasildi) console.log('git listesi yok: ağaç dolaşıldı (.gitignore uygulanmadı)');
    const detail = [...eklenen.map(f => (check ? 'eklenecek: ' : 'eklendi: ')+f), ...cikarilan.map(f => (check ? 'çıkarılacak: ' : 'çıkarıldı: ')+f),
      ...yenilenen.map(f => 'hash: '+f)].map(line => '\n  '+line).join('');
    if (!changed.length) console.log('envanter güncel');
    else if (check) { console.error('envanter güncel değil:'+detail+'\nYenilemek için: node scripts/update-inventory.mjs'); process.exit(1); }
    else console.log('güncellendi: '+changed.join(', ')+detail);
  } catch (error) { console.error(error.message); process.exit(1); }
}
