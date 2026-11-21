/* Barra de teclas extra para móvil (Esc, Tab, Ctrl, flechas, símbolos). */
(function () {
  const bar = document.getElementById('keys'); let ctrl = false, send = () => {};
  const KEYS = [['Esc', '\x1b'], ['Tab', '\t'], ['Ctrl', 'ctrl'], ['^C', '\x03'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['←', '\x1b[D'], ['→', '\x1b[C'], ['|', '|'], ['/', '/'], ['~', '~'], ['-', '-'], ['_', '_']];
  function build() {
    KEYS.forEach(([label, v]) => {
      const b = document.createElement('button'); b.textContent = label;
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (v === 'ctrl') { ctrl = !ctrl; b.classList.toggle('on', ctrl); } else send(v); });
      bar.appendChild(b);
    });
  }
  window.CodeIDEKeys = {
    init(fn) { send = fn; build(); },
    transform(d) {
      if (ctrl && d.length === 1) { const c = d.toUpperCase().charCodeAt(0); if (c >= 64 && c <= 95) { ctrl = false; const on = bar.querySelector('.on'); if (on) on.classList.remove('on'); return String.fromCharCode(c - 64); } }
      return d;
    }
  };
})();
