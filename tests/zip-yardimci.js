// Testler için küçük ZIP yazıcı (stored ve deflate girdileri, UTF-8 adlar).
const zlib = require('node:zlib');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipYap(girdiler) {
  const yerel = [], merkez = [];
  let ofs = 0;
  for (const { ad, veri, sikistir } of girdiler) {
    const adB = Buffer.from(ad, 'utf8'), ham = Buffer.from(veri);
    const govde = sikistir ? zlib.deflateRawSync(ham) : ham;
    const crc = crc32(ham);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(sikistir ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(govde.length, 18); lh.writeUInt32LE(ham.length, 22); lh.writeUInt16LE(adB.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(sikistir ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(govde.length, 20); ch.writeUInt32LE(ham.length, 24); ch.writeUInt16LE(adB.length, 28); ch.writeUInt32LE(ofs, 42);
    yerel.push(lh, adB, govde); merkez.push(ch, adB);
    ofs += 30 + adB.length + govde.length;
  }
  const dizin = Buffer.concat(merkez), son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(girdiler.length, 8); son.writeUInt16LE(girdiler.length, 10);
  son.writeUInt32LE(dizin.length, 12); son.writeUInt32LE(ofs, 16);
  return new Uint8Array(Buffer.concat([...yerel, dizin, son]));
}

module.exports = { zipYap };
