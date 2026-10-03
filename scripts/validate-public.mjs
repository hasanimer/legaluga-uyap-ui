import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const sha = value => createHash('sha256').update(value).digest('hex');
export function validate(root) {
  const inventory = JSON.parse(fs.readFileSync(path.join(root,'PUBLIC-FILES.json'),'utf8'));
  if (inventory.schema!==1 || !Array.isArray(inventory.files)) throw Error('Açık dosya envanteri geçersiz.');
  const expected = new Map(inventory.files.map(e=>[e.path,e.sha256]));
  if (expected.size!==inventory.files.length || !expected.has('PUBLIC-FILES.json')) throw Error('Envanter tekrarlı veya eksik.');
  const seen = new Set();
  const excluded = new Set(['.git','node_modules','dist']);
  const walk = (dir, prefix='') => {
    for (const item of fs.readdirSync(dir,{withFileTypes:true})) {
      if (!prefix && excluded.has(item.name)) continue;
      const name = prefix+item.name;
      if (item.isSymbolicLink()) throw Error('Açık depoda symlink yasak: '+name);
      if (item.isDirectory()) {walk(path.join(dir,item.name),name+'/');continue;}
      if (!expected.has(name)) throw Error('Envanter dışı dosya: '+name);
      if (/\.(har|pdf|xlsx|pem|key|p12|pfx|zip|map)$/i.test(name) || /(^|\/)(\.env(?:\..*)?|core|private|\.private)(\/|$)/i.test(name)) throw Error('Özel veri/çıktı yolu: '+name);
      if (/^(content|background|common|banka-api|banka-takip|tebligat-barkod|tebligat-ptt|ptt-content|evrak-indirme|evrak-indirme-motoru)\.js$/.test(name)) throw Error('Tam motor dosyası açık depoya eklenemez: '+name);
      const bytes = fs.readFileSync(path.join(dir,item.name));
      if (expected.get(name) && sha(bytes)!==expected.get(name)) throw Error('Envanter hash uyuşmazlığı: '+name);
      if (/\.(js|mjs|part)$/.test(name) && !name.startsWith('vendor/')) {
        const text = bytes.toString('utf8');
        if (/\.ajx(?:[?"'`\s]|$)/i.test(text)) throw Error('UYAP endpoint adaptörü açık kaynakta: '+name);
        if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) throw Error('Özel anahtar: '+name);
      }
      seen.add(name);
    }
  };
  walk(root);
  for (const name of expected.keys()) if (!seen.has(name)) throw Error('Envanter dosyası bulunamadı: '+name);
  if (fs.existsSync(path.join(root,'.git'))) {
    const git=args=>execFileSync('git',['-c','safe.directory='+path.resolve(root),'-C',root,...args],{encoding:'utf8',windowsHide:true}).trim();
    const algorithm=git(['rev-parse','--show-object-format']);
    const committed=git(['ls-tree','-r','-z','HEAD']).split('\0').filter(Boolean);
    if (committed.length!==expected.size) throw Error('Git commit envanteri farklı.');
    for (const row of committed) {
      const [metadata,name]=row.split('\t');
      if (!expected.has(name) || !/^100644 blob /.test(metadata)) throw Error('Git ağacında kapsam dışı kaynak: '+name);
      const bytes=fs.readFileSync(path.join(root,name));
      const hash=createHash(algorithm).update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
      if (metadata.split(' ')[2]!==hash) throw Error('Git commit/checkout baytları farklı: '+name);
    }
  }
  return {ok:true,files:seen.size,model:inventory.model};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  console.log(JSON.stringify(validate(root)));
}
