// Kurulum ve panel testlerinin sentetik DOM'u: düğüm ağacı, öznitelikler, olaylar, tıklama ve form değerleri. Seçici,
// sınıf listesi gibi eklentiler tarayiciEkleri ile ya da testin kendi düzeneğinde Node.prototype'a eklenir. Her çağrı yeni bir Node sınıfı verir;
// bir düzeneğin prototip eklentisi ötekine sızmaz. Hiçbir modül gerektirmez (açık depo npm'siz).
function domTaklidi() {
  class Node {
    constructor(tag, attrs, document) {
      this.tag = tag;
      this.attrs = {};
      this.kids = [];
      this.events = {};
      this.document = document;
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.hidden = false;
      for (const [key, value] of Object.entries(attrs || {})) {
        if (value === false || value == null) continue;
        if (key.startsWith('on')) this.addEventListener(key.slice(2), value);
        else this.setAttribute(key, value === true ? '' : value);
      }
    }
    setAttribute(key, value) {
      this.attrs[key] = String(value);
      if (key === 'value') this.value = String(value);
      if (key === 'hidden') this.hidden = true;
    }
    append(...kids) {
      for (const child of kids.flat(Infinity).filter(child => child != null && child !== false)) {
        this.kids.push(child);
        if (child instanceof Node) child.parentNode = this;
      }
    }
    replaceChildren(...kids) {
      for (const child of this.kids) if (child instanceof Node) child.parentNode = null;
      this.kids = [];
      this.append(...kids);
    }
    get textContent() { return this.kids.map(child => child instanceof Node ? child.textContent : String(child)).join(''); }
    set textContent(value) { this.replaceChildren(String(value)); }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    async fire(type) {
      if (this.disabled) return;
      const event = { target: this, preventDefault() {} };
      await Promise.all((this.events[type] || []).map(fn => fn(event)));
    }
    async click() {
      if (this.disabled) return;
      if (this.tag === 'input' && this.attrs.type === 'checkbox') { this.checked = !this.checked; await this.fire('change'); }
      await this.fire('click');
    }
    async choose(value) { this.value = value; await this.fire('change'); }
    async fill(value) { this.value = value; await this.fire('input'); }
    focus() { this.document.activeElement = this; }
    getRootNode() { return this.document; }
    contains(node) { return all(this).includes(node); }
    remove() { if (this.parentNode) this.parentNode.kids = this.parentNode.kids.filter(child => child !== this); this.parentNode = null; }
  }
  const all = root => [root, ...root.kids.filter(child => child instanceof Node).flatMap(all)];
  return { Node, all };
}

// Panel düzeneklerinin ortak eklentisi: sınıf listesi, dataset/style, basit seçiciler (etiket, .sınıf, [öznitelik], :not(),
// alt öğe) ve kök belge. Aynı çağrının Node sınıfına uygulanır.
domTaklidi.tarayiciEkleri = (Node, all, document) => {
  const originalSet = Node.prototype.setAttribute;
  Node.prototype.setAttribute = function (key, value) {
    originalSet.call(this, key, value);
    if (key === 'disabled') this.disabled = true;
    if (key === 'class') this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
  };
  Node.prototype.removeAttribute = function (key) { delete this.attrs[key]; if (key === 'hidden') this.hidden = false; };
  Object.defineProperties(Node.prototype, {
    ownerDocument: { get() { return this.document; } },
    childElementCount: { get() { return this.kids.filter(child => child instanceof Node).length; } },
    dataset: { get() { return this.data ||= {}; } },
    style: { get() { return this.inlineStyle ||= {}; } },
    classList: { get() {
      const classes = this.classes ||= new Set();
      return { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name),
        toggle(name, force) { const on = force === undefined ? !classes.has(name) : force; if (on) classes.add(name); else classes.delete(name); return on; } };
    } }
  });
  Node.prototype.matches = function (selector) {
    let pattern = selector;
    const exclusions = [...pattern.matchAll(/:not\(([^)]+)\)/g)].map(match => match[1]);
    if (exclusions.some(part => this.matches(part))) return false;
    pattern = pattern.replace(/:not\([^)]+\)/g, '');
    const tag = /^[a-z][a-z0-9-]*/i.exec(pattern)?.[0];
    if (tag && this.tag !== tag) return false;
    if ([...pattern.matchAll(/\.([\w-]+)/g)].some(match => !this.classList.contains(match[1]))) return false;
    for (const match of pattern.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
      const key = match[1];
      if (match[2] === undefined) { if (!(key in this.attrs) || key === 'hidden' && !this.hidden) return false; }
      else if (this.attrs[key] !== match[2]) return false;
    }
    return true;
  };
  Node.prototype.querySelectorAll = function (selector) {
    return all(this).slice(1).filter(node => selector.split(',').some(part => {
      const parts = part.trim().split(/\s+/);
      if (!node.matches(parts.pop())) return false;
      let ancestor = node.parentNode;
      while (parts.length) {
        const match = parts.pop();
        while (ancestor && !ancestor.matches(match)) ancestor = ancestor.parentNode;
        if (!ancestor) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    }));
  };
  Node.prototype.querySelector = function (selector) { return this.querySelectorAll(selector)[0] || null; };
  Node.prototype.getRootNode = () => document;
  Node.prototype.contains = function (node) { return all(this).includes(node); };
  Node.prototype.select = function () { this.selectionStart = 0; this.selectionEnd = this.value.length; };
};

module.exports = domTaklidi;
