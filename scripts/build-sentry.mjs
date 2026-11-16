// Sentry SDK'sını src/extension/sentry-client.mjs girişinden src/extension/vendor/sentry.bundle.js içine paketler.
// Paketler bu betiğin konumundan çözülür (özel depoda kök node_modules); çalışma dizini önemsizdir.
//   node ui/scripts/build-sentry.mjs           sentry.bundle.js ve SENTRY.LICENSE dosyalarını yazar
//   node ui/scripts/build-sentry.mjs --check   geçici klasöre üretir, depodaki baytlarla karşılaştırır; fark varsa çıkış kodu 1
import { build } from 'esbuild';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), extension = path.join(here, '..', 'src', 'extension');
const sentryPackage = path.dirname(createRequire(import.meta.url).resolve('@sentry/browser/package.json'));

export async function buildSentry(out = extension) {
  await mkdir(path.join(out, 'vendor'), { recursive: true });
  await build({
    entryPoints: [path.join(extension, 'sentry-client.mjs')], outfile: path.join(out, 'vendor/sentry.bundle.js'), bundle: true,
    format: 'iife', platform: 'browser', target: 'chrome120', minify: true,
    sourcemap: false, legalComments: 'eof', define: { __SENTRY_DEBUG__: 'false' }
  });
  await copyFile(path.join(sentryPackage, 'LICENSE'), path.join(out, 'vendor/SENTRY.LICENSE'));
  return ['vendor/sentry.bundle.js', 'vendor/SENTRY.LICENSE'];
}

// Geçici klasöre üretip hedefteki (varsayılan src/extension) dosyalarla bayt bayt karşılaştırır; farkları döndürür.
export async function checkSentry(target = extension) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'legaluga-vendor-'));
  try {
    const differences = [];
    for (const file of await buildSentry(temp)) {
      if (!existsSync(path.join(target, file))) differences.push('eksik: ' + file);
      else if (!(await readFile(path.join(target, file))).equals(await readFile(path.join(temp, file)))) differences.push('farklı: ' + file);
    }
    return differences;
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const differences = await checkSentry();
    if (differences.length) {
      console.error(differences.join('\n') + '\nSentry paketi kilitli paketlerden üretilenle aynı değil: npm ci ve npm run build:sentry.');
      process.exit(1);
    }
    console.log('Sentry paketi kilitli paketlerden üretilenle aynı.');
  } else await buildSentry();
}
