/* Pestañas: cada una con su xterm.js y su sesión (web o nativa). */
(function () {
  const CFG = window.CODEIDE_TERMINAL_CONFIG, T = window.CodeIDETerm;
  const tabsEl = document.getElementById('tabs'), host = document.getElementById('host');
  const tabs = []; let active = null, seq = 0;
  const load = src => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  async function ensureXterm() {
    if (typeof Terminal !== 'undefined') return;
    try { await load('vendor/xterm.js'); await load('vendor/addon-fit.js'); const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'vendor/xterm.css'; document.head.appendChild(l); }
    catch (e) { // Solo para desarrollo en navegador; en la APK empaqueta vendor/ localmente.
      const B = 'https://cdn.jsdelivr.net/npm/', l = document.createElement('link'); l.rel = 'stylesheet'; l.href = B + '@xterm/xterm@5.5.0/css/xterm.css'; document.head.appendChild(l);
      await load(B + '@xterm/xterm@5.5.0/lib/xterm.js'); await load(B + '@xterm/addon-fit@0.10.0/lib/addon-fit.js');
    }
  }
  function render() {
    tabsEl.innerHTML = '';
    tabs.forEach(t => {
      const b = document.createElement('button'); b.className = 'tab' + (t === active ? ' on' : ''); b.textContent = (t.kind === 'linux' ? 'Linux ' : t.kind === 'shell' ? 'Shell ' : 'Terminal ') + t.id;
      const x = document.createElement('span'); x.textContent = ' ×'; x.onclick = e => { e.stopPropagation(); closeTab(t); };
      b.appendChild(x); b.onclick = () => activate(t); tabsEl.appendChild(b);
    });
    const p = document.createElement('button'); p.className = 'tab add'; p.textContent = '+'; p.onclick = () => addTab(); tabsEl.appendChild(p);
    if (T.shellAvailable && T.shellAvailable()) { for (const k of ['shell', 'linux']) { const q = document.createElement('button'); q.className = 'tab add'; q.textContent = k === 'linux' ? 'Linux' : 'Shell'; q.style.fontSize = '13px'; q.onclick = () => addTab(k); tabsEl.appendChild(q); } }
  }
  function activate(t) {
    tabs.forEach(o => { o.pane.style.display = o === t ? 'block' : 'none'; }); active = t; render();
    requestAnimationFrame(() => { t.fit.fit(); t.term.focus(); });
  }
  function closeTab(t) {
    if (t.session) t.session.kill(); t.term.dispose(); t.pane.remove(); tabs.splice(tabs.indexOf(t), 1);
    if (!tabs.length) addTab(); else activate(tabs[tabs.length - 1]);
  }
  async function addTab(kind) {
    if (tabs.length >= CFG.maxTabs) return;
    const pane = document.createElement('div'); pane.className = 'pane'; host.appendChild(pane);
    const term = new Terminal({ fontSize: CFG.fontSize, scrollback: CFG.scrollback, theme: CFG.theme, cursorBlink: true, fontFamily: 'ui-monospace,Menlo,Consolas,monospace' });
    const fit = new FitAddon.FitAddon(); term.loadAddon(fit);
    const tab = { id: ++seq, pane, term, fit, session: null, kind };
    tabs.push(tab); activate(tab); term.open(pane); fit.fit();
    try { tab.session = T.createSession(kind); } catch (e) { term.write('\x1b[31m' + e.message + '\x1b[0m\r\n'); return; }
    const s = tab.session;
    s.onData = d => term.write(d); s.onExit = c => term.write('\r\n[proceso terminado' + (c !== undefined ? ', código ' + c : '') + ']\r\n');
    term.onData(d => s.input(window.CodeIDEKeys.transform(d)));
    term.onResize(({ cols, rows }) => s.resize(cols, rows));
    try { await s.start(term.cols, term.rows); } catch (e) { term.write('\x1b[31m' + e.message + '\x1b[0m\r\n'); }
  }
  window.addEventListener('resize', () => active && active.fit.fit());
  (async () => {
    await ensureXterm();
    window.CodeIDEKeys.init(d => active && active.session && active.session.input(d));
    addTab();
  })();
})();
