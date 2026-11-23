/* Shell nativa (Android): sesión conectada al plugin CodeIDETerminal. Solo se ofrece si el plugin existe. */
(function (root) {
  const T = root.CodeIDETerm, WebSession = T.WebSession;
  const plugin = () => (root.Capacitor && root.Capacitor.isPluginAvailable && root.Capacitor.isPluginAvailable('CodeIDETerminal')) ? root.Capacitor.Plugins.CodeIDETerminal : null;
  const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  class ShellSession {
    constructor() { this.P = plugin(); if (!this.P) throw new Error('La shell nativa no está disponible en esta versión'); this.onData = () => {}; this.onExit = () => {}; this.id = null; this.early = []; this.hs = []; }
    dispatch(k, e) { if (e.id !== this.id) return; if (k === 'd') this.onData(b64(e.data)); else this.onExit(e.code); }
    on(k, name) { return this.P.addListener(name, e => { if (this.id === null) this.early.push([k, e]); else this.dispatch(k, e); }); }
    async start(cols, rows) {
      this.hs.push(await this.on('d', 'data'), await this.on('x', 'exit'));
      this.id = (await this.P.start({ cols, rows })).id;
      const early = this.early; this.early = []; early.forEach(([k, e]) => this.dispatch(k, e));
    }
    input(d) { if (this.id !== null) this.P.write({ id: this.id, data: d }); }
    resize(c, r) { if (this.id !== null) this.P.resize({ id: this.id, cols: c, rows: r }); }
    kill() { if (this.id !== null) this.P.kill({ id: this.id }); this.hs.forEach(h => h && h.remove && h.remove()); }
  }
  T.ShellSession = ShellSession;
  T.shellAvailable = () => !!plugin();
  T.createSession = kind => kind === 'shell' ? new ShellSession() : new WebSession();
})(globalThis);
