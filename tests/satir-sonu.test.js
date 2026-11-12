const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// Kaynaklar LF satır sonuyla tutulur (.editorconfig). Yalnız özgün baytları doğrulanamayan dört üçüncü taraf dosyası CRLF kalır;
// LF hâli npm paketiyle ya da hearing-vendor.json kaydıyla birebir eşleşen vendor dosyaları LF'dir.
const root = path.join(__dirname, '..');
const CRLF_KALIR = new Set(['UTIF.js', 'UTIF.LICENSE', 'FONTKIT-APACHE-2.0.LICENSE', 'FONTKIT-MIT.LICENSE'].map(n => 'src/extension/vendor/' + n));

function dosyalar() {
  try {
    return execFileSync('git', ['-c', 'safe.directory=' + root, '-C', root, 'ls-files', '-z'], { encoding: 'utf8', windowsHide: true })
      .split('\0').filter(name => name && fs.existsSync(path.join(root, name)));
  } catch {
    // Git dışı kopya (ör. ZIP olarak indirilmiş depo): ağaç dolaşılır.
    const out = [];
    const walk = (dir, prefix = '') => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!prefix && ['.git', 'node_modules', 'dist'].includes(item.name)) continue;
        if (item.isDirectory()) walk(path.join(dir, item.name), prefix + item.name + '/');
        else if (item.isFile()) out.push(prefix + item.name);
      }
    };
    walk(root);
    return out;
  }
}

test('metin dosyalarında CR yok; yalnız doğrulanamayan dört vendor dosyası CRLF kalır', () => {
  const crli = [];
  for (const name of dosyalar()) {
    const bytes = fs.readFileSync(path.join(root, name));
    if (bytes.includes(0) || !bytes.includes(13)) continue;   // ikili dosyalar (yazı tipi, görsel, wasm) denetlenmez
    if (!CRLF_KALIR.has(name)) crli.push(name);
  }
  assert.deepEqual(crli, [], 'CR içeren dosyaları LF’ye çevirin');
  for (const name of CRLF_KALIR) assert.ok(fs.existsSync(path.join(root, name)), name + ': istisna listesi güncel olmalı');
});

test('hearing-vendor.json kayıtları vendor baytlarıyla eşleşir', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/extension/vendor/hearing-vendor.json'), 'utf8'));
  assert.ok(manifest.files.length > 0);
  for (const { file, bytes, sha256 } of manifest.files) {
    const data = fs.readFileSync(path.join(root, 'src/extension', file));
    assert.equal(data.length, bytes, file);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), sha256, file);
  }
});
