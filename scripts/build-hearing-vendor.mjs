// Duruşma paketi vendor dosyalarını kilitli npm paketlerinden src/extension/vendor/ altına üretir.
// Paketler bu betiğin konumundan çözülür (özel depoda kök node_modules); çalışma dizini önemsizdir.
//   node ui/scripts/build-hearing-vendor.mjs           vendor dosyalarını ve hearing-vendor.json'u yazar
//   node ui/scripts/build-hearing-vendor.mjs --check   geçici klasöre üretir, depodaki baytlarla karşılaştırır; fark varsa çıkış kodu 1
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url)), extension = path.join(here, '..', 'src', 'extension');
const resolve = createRequire(import.meta.url).resolve;
const fromPackage = (name, file) => path.join(path.dirname(resolve(name + '/package.json')), file);

export async function buildHearingVendor(out = extension) {
  await mkdir(path.join(out, 'vendor'), { recursive: true });
  await build({
    entryPoints: [path.join(here, 'hearing-pdfjs-entry.mjs')], outfile: path.join(out, 'vendor/pdfjs-reader.js'),
    bundle: true, format: 'iife', platform: 'browser', target: 'chrome120',
    minify: true, sourcemap: false, legalComments: 'eof',
    define: { process: 'undefined' },
    plugins: [{ name: 'hearing-worker-host', setup(builder) {
      builder.onLoad({ filter: /pdfjs-dist[\\/]build[\\/]pdf\.worker\.mjs$/ }, async args => {
        let source = await readFile(args.path, 'utf8');
        const needle = 'this.initializeFromPort(self);';
        if (source.split(needle).length !== 2) throw new Error('PDF.js worker bootstrap changed; review required.');
        source = source.replace(needle, '/* The hearing worker owns the outer message channel. */');
        return { contents: source, loader: 'js' };
      });
    } }]
  });

  // Deliberately copied local distributions; no remote code at runtime.
  // The unminified fontkit distribution preserves its third-party notices.
  const sources = [
    [fromPackage('pdf-lib', 'dist/pdf-lib.min.js'), 'vendor/pdf-lib.min.js'],
    [fromPackage('pdf-lib', 'LICENSE.md'), 'vendor/PDF-LIB.LICENSE'],
    [fromPackage('@pdf-lib/fontkit', 'dist/fontkit.umd.js'), 'vendor/fontkit.umd.js'],
    [fromPackage('@pdf-lib/fontkit', 'README.md'), 'vendor/FONTKIT.UPSTREAM.md'],
    [fromPackage('@pdf-lib/standard-fonts', 'LICENSE.md'), 'vendor/PDF-STANDARD-FONTS.LICENSE'],
    [fromPackage('@pdf-lib/upng', 'LICENSE'), 'vendor/PDF-UPNG.LICENSE'],
    [fromPackage('pako', 'LICENSE'), 'vendor/PDF-PAKO.LICENSE']
  ];
  sources.push([fromPackage('pdfjs-dist', 'LICENSE'), 'vendor/PDFJS.LICENSE']);
  const inventory = [];
  for (const [source, destination] of sources) {
    const data = await readFile(source);
    if (destination.endsWith('.js') && /\beval\s*\(|new\s+Function\s*\(/.test(data.toString())) {
      throw new Error(`MV3 dynamic-code check failed: ${source}`);
    }
    await copyFile(source, path.join(out, destination));
    inventory.push({ file: destination, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  }
  const readerFile = 'vendor/pdfjs-reader.js', reader = await readFile(path.join(out, readerFile));
  if (/\beval\s*\(|new\s+Function\s*\(/.test(reader.toString())) throw new Error('PDF.js dynamic-code check failed.');
  inventory.push({ file: readerFile, bytes: reader.length, sha256: createHash('sha256').update(reader).digest('hex') });
  // Yazı tipleri üretilmez; kaynaktaki dosyalar envantere yazılır.
  for (const name of (await readdir(path.join(extension, 'vendor/fonts'))).sort()) {
    const file = `vendor/fonts/${name}`, data = await readFile(path.join(extension, file));
    inventory.push({ file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  }
  await writeFile(path.join(out, 'vendor/hearing-vendor.json'), JSON.stringify({
    packages: { 'pdf-lib': '1.17.1', '@pdf-lib/fontkit': '1.1.1', 'pdfjs-dist': '6.3.289' },
    modifications: ['PDF.js worker automatic global-port bootstrap disabled; the hearing worker uses the local in-process handler.'],
    files: inventory
  }, null, 2) + '\n');
  return [...sources.map(([, destination]) => destination), readerFile, 'vendor/hearing-vendor.json'];
}

// Geçici klasöre üretip hedefteki (varsayılan src/extension) dosyalarla bayt bayt karşılaştırır; farkları döndürür.
export async function checkHearingVendor(target = extension) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'legaluga-vendor-'));
  try {
    const differences = [];
    for (const file of await buildHearingVendor(temp)) {
      if (!existsSync(path.join(target, file))) differences.push('eksik: ' + file);
      else if (!(await readFile(path.join(target, file))).equals(await readFile(path.join(temp, file)))) differences.push('farklı: ' + file);
    }
    return differences;
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const differences = await checkHearingVendor();
    if (differences.length) {
      console.error(differences.join('\n') + '\nDuruşma paketi vendor dosyaları kilitli paketlerden üretilenle aynı değil: npm ci ve npm run build:hearing.');
      process.exit(1);
    }
    console.log('Duruşma paketi vendor dosyaları kilitli paketlerden üretilenle aynı.');
  } else await buildHearingVendor();
}
