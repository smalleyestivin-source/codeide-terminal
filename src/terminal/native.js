/* Shell nativa y Linux (Android): sesiones conectadas al plugin CodeIDETerminal. Solo se ofrecen si el plugin existe. */
(function (root) {
  const T = root.CodeIDETerm, WebSession = T.WebSession;
  const plugin = () => (root.Capacitor && root.Capacitor.isPluginAvailable && root.Capacitor.isPluginAvailable('CodeIDETerminal')) ? root.Capacitor.Plugins.CodeIDETerminal : null;
  const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  class ShellSession {
    constructor(kind) { this.kind = kind || 'shell'; this.P = plugin(); if (!this.P) throw new Error('La shell nativa no está disponible en esta versión'); this.onData = () => {}; this.onExit = () => {}; this.id = null; this.early = []; this.hs = []; this.t0 = 0; }
    say(t, color) { this.onData(new TextEncoder().encode((color ? '\x1b[' + color + 'm' : '') + t + (color ? '\x1b[0m' : '') + '\r\n')); }
    dispatch(k, e) {
      if (e.id !== this.id) return;
      if (k === 'd') { this.onData(b64(e.data)); return; }
      if (this.kind === 'linux' && e.code !== 0 && Date.now() - this.t0 < 5000) this.say('PRoot terminó enseguida (código ' + e.code + '). Algunos teléfonos bloquean PRoot; cópiame el mensaje de arriba.', '33');
      this.onExit(e.code);
    }
    on(k, name) { return this.P.addListener(name, e => { if (this.id === null) this.early.push([k, e]); else this.dispatch(k, e); }); }
    async prepareLinux() {
      const st = await this.P.linuxStatus();
      if (!st.bundled) {
        let m = 'Esta versión no incluye Linux (faltan PRoot y Alpine dentro del APK).';
        const missing = ['rootfs', 'proot', 'loader'].filter(k => st[k] === false);
        if (missing.length) m += '\nFaltan en el APK: ' + missing.join(', ') + '.';
        if (st.fetchError) m += '\nMotivo al compilar: ' + st.fetchError;
        if (st.rootfsName) m += '\nEsperaba: ' + st.rootfsName + '. En linux/ hay: ' + st.assetsLinux + '.';
        if (st.nativeFiles) m += '\nLibrerías nativas: ' + st.nativeFiles + '.';
        throw new Error(m.replace(/\n/g, '\r\n'));
      }
      if (!st.installed) { this.say('Preparando Linux (solo la primera vez, puede tardar)…', '33'); await this.P.linuxInstall(); this.say('Linux listo.', '32'); }
    }
    async start(cols, rows) {
      this.hs.push(await this.on('d', 'data'), await this.on('x', 'exit'));
      if (this.kind === 'linux') await this.prepareLinux();
      this.t0 = Date.now();
      this.id = (await this.P.start({ cols, rows, kind: this.kind })).id;
      const early = this.early; this.early = []; early.forEach(([k, e]) => this.dispatch(k, e));
    }
    input(d) { if (this.id !== null) this.P.write({ id: this.id, data: d }); }
    resize(c, r) { if (this.id !== null) this.P.resize({ id: this.id, cols: c, rows: r }); }
    kill() { if (this.id !== null) this.P.kill({ id: this.id }); this.hs.forEach(h => h && h.remove && h.remove()); }
  }
  T.ShellSession = ShellSession;
  T.shellAvailable = () => !!plugin();
  T.createSession = kind => (kind === 'shell' || kind === 'linux') ? new ShellSession(kind) : new WebSession();
})(globalThis);
