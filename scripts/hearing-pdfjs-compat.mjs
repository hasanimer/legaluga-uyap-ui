// Small compatibility surface for the text reader in older Chrome workers.
// Loaded only inside the package worker, never in the UYAP page.
const add = (target, name, value) => {
  if (typeof target[name] !== 'function') Object.defineProperty(target, name, { value, configurable: true, writable: true });
};
add(Promise, 'withResolvers', function () {
  let resolve, reject;
  const promise = new this((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
});
for (const type of [Map, WeakMap]) {
  add(type.prototype, 'getOrInsertComputed', function (key, callback) {
    if (this.has(key)) return this.get(key);
    const value = callback(key); this.set(key, value); return value;
  });
  add(type.prototype, 'getOrInsert', function (key, value) {
    if (this.has(key)) return this.get(key);
    this.set(key, value); return value;
  });
}
add(Uint8Array.prototype, 'toHex', function () {
  let result = ''; for (const byte of this) result += byte.toString(16).padStart(2, '0'); return result;
});
add(Uint8Array.prototype, 'toBase64', function () {
  let binary = '';
  for (let i = 0; i < this.length; i += 32768) binary += String.fromCharCode(...this.subarray(i, i + 32768));
  return btoa(binary);
});
add(Uint8Array, 'fromBase64', function (input) {
  return Uint8Array.from(atob(input), char => char.charCodeAt(0));
});
add(Set.prototype, 'intersection', function (other) {
  const result = new Set(); for (const value of this) if (other.has(value)) result.add(value); return result;
});
add(ArrayBuffer.prototype, 'transferToFixedLength', function (size = this.byteLength) {
  const result = new ArrayBuffer(size);
  new Uint8Array(result).set(new Uint8Array(this, 0, Math.min(size, this.byteLength)));
  return result;
});
// Font and layout lengths in the reader are bounded, nonnegative sums.
add(Math, 'sumPrecise', function (values) {
  let sum = 0, correction = 0;
  for (const value of values) {
    const next = sum + value;
    if (!Number.isFinite(next)) { sum = next; correction = 0; continue; }
    correction += Math.abs(sum) >= Math.abs(value) ? (sum - next) + value : (value - next) + sum;
    sum = next;
  }
  return sum + correction;
});
