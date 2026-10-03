/* global module */
// Web Crypto dışında kripto uygulaması yok. Şifreleme, anahtarın bulunduğu profilin ele geçirilmesini önlemez.
(() => {
  'use strict';
  const APP = 'legaluga-uyap-asistani', ITERATIONS = 600000, MAX_BYTES = 48 * 1024 * 1024;
  const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
  const b64 = bytes => {
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(text);
  };
  function un64(text, max = MAX_BYTES + 16) {
    // Uzun şifreli planlarda tekrar eden Base64 grupları RegExp stackini taşırabilir.
    // Alphabet ve sondaki padding ayrı doğrulanır; atob'un boşluk kabulüne güvenilmez.
    if (typeof text !== 'string' || text.length > Math.ceil(max / 3) * 4 || text.length % 4 || /[^A-Za-z0-9+/=]/.test(text)) throw new Error('Şifreli veri biçimi geçersiz.');
    const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0, firstPadding = text.indexOf('=');
    if (firstPadding >= 0 && firstPadding !== text.length - padding) throw new Error('Şifreli veri biçimi geçersiz.');
    const binary = atob(text);
    if (binary.length > max) throw new Error('Şifreli veri sınırı aşıldı.');
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  const random = length => crypto.getRandomValues(new Uint8Array(length));
  const jsonBytes = value => {
    const bytes = enc.encode(JSON.stringify(value));
    if (bytes.length > MAX_BYTES) throw new Error('Veri 48 MiB şifreleme sınırını aşıyor.');
    return bytes;
  };
  async function encrypt(key, value, context) {
    const iv = random(12), bytes = jsonBytes(value);
    try {
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(context), tagLength: 128 }, key, bytes);
      return { iv: b64(iv), data: b64(new Uint8Array(data)) };
    } finally { bytes.fill(0); }
  }
  async function decrypt(key, value, context) {
    const iv = un64(value.iv, 12), bytes = un64(value.data);
    if (iv.length !== 12 || bytes.length < 16) throw new Error('Şifreli veri biçimi geçersiz.');
    let plain;
    try {
      plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(context), tagLength: 128 }, key, bytes));
      if (plain.length > MAX_BYTES) throw new Error('Şifreli veri sınırı aşıldı.');
      return JSON.parse(dec.decode(plain));
    } finally { plain?.fill(0); }
  }
  const isEnvelope = value => value?.uhdEncrypted === 1;
  async function seal(key, keyId, name, value, exists = true) {
    return { uhdEncrypted: 1, version: 1, keyId, ...await encrypt(key, { exists, ...(exists ? { value } : {}) }, `${APP}|local|1|${keyId}|${name}`) };
  }
  async function open(key, keyId, name, value) {
    if (!isEnvelope(value) || value.version !== 1 || value.keyId !== keyId) throw new Error('Yerel veri anahtarı veya biçimi uyuşmuyor. Veriler değiştirilmedi.');
    const decoded = await decrypt(key, value, `${APP}|local|1|${keyId}|${name}`);
    if (!decoded || typeof decoded.exists !== 'boolean') throw new Error('Şifreli yerel veri bozuk.');
    return decoded;
  }
  async function derive(password, salt) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('Yedek parolası 12–1024 karakter olmalı.');
    const bytes = enc.encode(password);
    try {
      const base = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
      return await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    } finally { bytes.fill(0); }
  }
  const backupContext = value => `${APP}|backup|2|AES-256-GCM|PBKDF2-SHA-256|${ITERATIONS}|${value.salt}`;
  async function encryptBackup(value, password) {
    const salt = random(16), key = await derive(password, salt);
    const header = { app: APP, format: 2, encrypted: true, algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', iterations: ITERATIONS, salt: b64(salt) };
    return { ...header, ...await encrypt(key, value, backupContext(header)) };
  }
  async function decryptBackup(value, password) {
    if (!value || value.app !== APP || value.format !== 2 || value.encrypted !== true || value.algorithm !== 'AES-256-GCM' || value.kdf !== 'PBKDF2-SHA-256' || value.iterations !== ITERATIONS) throw new Error('Şifreli yedek biçimi desteklenmiyor.');
    const salt = un64(value.salt, 16);
    if (salt.length !== 16) throw new Error('Şifreli yedek biçimi geçersiz.');
    const key = await derive(password, salt);
    try { return await decrypt(key, value, backupContext(value)); }
    catch { throw new Error('Yedek açılamadı. Parola yanlış veya dosya bozulmuş; mevcut veriler değiştirilmedi.'); }
  }
  const api = { MAX_BYTES, ITERATIONS, isEnvelope, seal, open, encryptBackup, decryptBackup };
  globalThis.UHDVaultCrypto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
