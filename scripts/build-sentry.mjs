import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';

await build({
  entryPoints: ['sentry-client.mjs'], outfile: 'vendor/sentry.bundle.js', bundle: true,
  format: 'iife', platform: 'browser', target: 'chrome120', minify: true,
  sourcemap: false, legalComments: 'eof', define: { __SENTRY_DEBUG__: 'false' }
});
await copyFile('node_modules/@sentry/browser/LICENSE', 'vendor/SENTRY.LICENSE');
