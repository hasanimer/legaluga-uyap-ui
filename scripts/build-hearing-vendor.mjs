import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

await build({
  entryPoints: ['scripts/hearing-pdfjs-entry.mjs'], outfile: 'src/extension/vendor/pdfjs-reader.js',
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
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'vendor/pdf-lib.min.js'],
  ['node_modules/pdf-lib/LICENSE.md', 'vendor/PDF-LIB.LICENSE'],
  ['node_modules/@pdf-lib/fontkit/dist/fontkit.umd.js', 'vendor/fontkit.umd.js'],
  ['node_modules/@pdf-lib/fontkit/README.md', 'vendor/FONTKIT.UPSTREAM.md'],
  ['node_modules/@pdf-lib/standard-fonts/LICENSE.md', 'vendor/PDF-STANDARD-FONTS.LICENSE'],
  ['node_modules/@pdf-lib/upng/LICENSE', 'vendor/PDF-UPNG.LICENSE'],
  ['node_modules/pako/LICENSE', 'vendor/PDF-PAKO.LICENSE']
];
sources.push(['node_modules/pdfjs-dist/LICENSE', 'vendor/PDFJS.LICENSE']);
const inventory = [];
for (const [source, destination] of sources) {
  const data = await readFile(source);
  if (destination.endsWith('.js') && /\beval\s*\(|new\s+Function\s*\(/.test(data.toString())) {
    throw new Error(`MV3 dynamic-code check failed: ${source}`);
  }
  await copyFile(source, 'src/extension/' + destination);
  inventory.push({ file: destination, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
const readerFile = 'vendor/pdfjs-reader.js', reader = await readFile('src/extension/' + readerFile);
if (/\beval\s*\(|new\s+Function\s*\(/.test(reader.toString())) throw new Error('PDF.js dynamic-code check failed.');
inventory.push({ file: readerFile, bytes: reader.length, sha256: createHash('sha256').update(reader).digest('hex') });
for (const name of (await readdir('src/extension/vendor/fonts')).sort()) {
  const file = `vendor/fonts/${name}`, data = await readFile('src/extension/' + file);
  inventory.push({ file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
await writeFile('src/extension/vendor/hearing-vendor.json', JSON.stringify({
  packages: { 'pdf-lib': '1.17.1', '@pdf-lib/fontkit': '1.1.1', 'pdfjs-dist': '6.3.289' },
  modifications: ['PDF.js worker automatic global-port bootstrap disabled; the hearing worker uses the local in-process handler.'],
  files: inventory
}, null, 2) + '\n');
