/* CodeIDE Terminal — núcleo. Backends: WebSession (probado en Node, lógica) y NativeSession (SIN PROBAR). */
(function (root) {
'use strict';
const CFG = root.CODEIDE_TERMINAL_CONFIG || {};

/* ---------- Sistema de archivos virtual (sin enlaces simbólicos) ---------- */
class VFS {
  constructor(store) { this.store = store || null; this.root = { type: 'dir', children: {} }; this.load(); }
  load() { try { const s = this.store && this.store.getItem(CFG.storageKey || 'codeide.fs'); if (s) this.root = JSON.parse(s); } catch (e) {} }
  save() { try { this.store && this.store.setItem(CFG.storageKey || 'codeide.fs', JSON.stringify(this.root)); } catch (e) { throw new Error('almacenamiento lleno o no disponible'); } }
  parts(p, cwd) { const out = p.startsWith('/') ? [] : cwd.split('/').filter(Boolean); for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); } return out; }
  abs(p, cwd) { return '/' + this.parts(p, cwd).join('/'); }
  get(p, cwd) { let n = this.root; for (const s of this.parts(p, cwd)) { if (n.type !== 'dir' || !(s in n.children)) return null; n = n.children[s]; } return n; }
  parent(p, cwd) { const ps = this.parts(p, cwd), name = ps.pop(); let n = this.root; for (const s of ps) { if (n.type !== 'dir' || !(s in n.children)) return {}; n = n.children[s]; } return n.type === 'dir' ? { dir: n, name } : {}; }
  read(p, cwd) { const n = this.get(p, cwd); if (!n) return null; if (n.type !== 'file') throw new Error(p + ': es un directorio'); return n.data; }
  write(p, cwd, data) { const { dir, name } = this.parent(p, cwd); if (!dir || !name) throw new Error(p + ': ruta no válida'); const ex = dir.children[name]; if (ex && ex.type === 'dir') throw new Error(p + ': es un directorio'); dir.children[name] = { type: 'file', data: String(data) }; this.save(); }
  mkdir(p, cwd, rec) {
    const ps = this.parts(p, cwd); let n = this.root;
    for (let i = 0; i < ps.length; i++) {
      const s = ps[i], last = i === ps.length - 1;
      if (!(s in n.children)) { if (!rec && !last) throw new Error(p + ': no existe el directorio padre (usa -p)'); n.children[s] = { type: 'dir', children: {} }; }
      else if (n.children[s].type !== 'dir') throw new Error(s + ': ya existe y no es un directorio');
      else if (last && !rec) throw new Error(p + ': ya existe');
      n = n.children[s];
    }
    this.save();
  }
  remove(p, cwd, rec) {
    if (!this.parts(p, cwd).length) throw new Error('no se puede borrar la raíz');
    const { dir, name } = this.parent(p, cwd), n = dir && dir.children[name];
    if (!n) throw new Error(p + ': no existe');
    if (n.type === 'dir' && Object.keys(n.children).length && !rec) throw new Error(p + ': directorio no vacío (usa -r)');
    delete dir.children[name]; this.save();
  }
}

/* ---------- Motores en Web Worker (se pueden detener con terminate) ---------- */
const JSSRC = `const f=v=>{if(typeof v==='string')return v;try{return typeof v==='function'?String(v):JSON.stringify(v,null,1)}catch(e){return String(v)}};
console.log=console.info=(...a)=>postMessage({t:'o',d:a.map(f).join(' ')});
console.error=console.warn=(...a)=>postMessage({t:'e',d:a.map(f).join(' ')});
onmessage=e=>{try{const r=(0,eval)(e.data.code);if(r!==undefined)postMessage({t:'o',d:f(r)})}catch(x){postMessage({t:'e',d:String(x)})}postMessage({t:'d'})}`;
const PYSRC = `let py=null;
onmessage=async e=>{const m=e.data;
 try{
  if(!py){importScripts(m.url);py=await loadPyodide();
   py.setStdout({batched:t=>postMessage({t:'o',d:t})});py.setStderr({batched:t=>postMessage({t:'e',d:t})});
   py.setStdin({stdin:()=>{throw new Error('input() aún no está soportado')}})}
  const r=await py.runPythonAsync(m.code);if(r!==undefined&&r!==null)postMessage({t:'o',d:String(r)});
 }catch(x){postMessage({t:'e',d:String(x.message||x).trim().split('\\n').slice(-4).join('\\n')})}
 postMessage({t:'d'})}`;

class WorkerEngine {
  constructor(src, timeout, extra) { this.src = src; this.timeout = timeout; this.extra = extra || {}; this.w = null; this._end = null; }
  kill() { if (this.w) { this.w.terminate(); this.w = null; } if (this._end) this._end(); }
  run(code, io) {
    return new Promise(res => {
      if (!this.w) {
        if (typeof Worker === 'undefined') { io.printErr('Web Workers no disponibles aquí'); return res(); }
        try { this.w = new Worker(URL.createObjectURL(new Blob([this.src], { type: 'text/javascript' }))); }
        catch (e) { io.printErr('No se pudo crear el Worker: ' + e.message); return res(); }
      }
      const w = this.w; let t;
      const end = () => { clearTimeout(t); this._end = null; res(); };
      this._end = end;
      t = setTimeout(() => { io.printErr('Tiempo agotado (' + this.timeout / 1000 + ' s): proceso detenido'); this.kill(); }, this.timeout);
      w.onmessage = e => { const m = e.data; if (m.t === 'd') end(); else if (m.t === 'o') io.print(m.d); else if (m.t === 'e') io.printErr(m.d); };
      w.onerror = e => { io.printErr('Error del motor: ' + (e.message || 'desconocido')); this.kill(); };
      w.postMessage(Object.assign({ code }, this.extra));
    });
  }
}

/* ---------- Intérprete de comandos del modo web (NO es Bash ni Linux) ---------- */
const HELP = ['Comandos (modo web):', '  ls, cd, pwd, cat, mkdir [-p], touch, rm [-r], echo (admite > y >>)',
  '  js <código|archivo.js>   JavaScript (contexto persistente; usa var)', '  py <código|archivo.py>   Python (Pyodide; se descarga la primera vez)',
  '  clear, date, help', 'Ctrl+C detiene el programa en ejecución.', 'Esto NO es Linux: son comandos propios del prototipo web.'].join('\n');

class ShellCore {
  constructor(vfs, engines, io) { this.fs = vfs; this.eng = engines || {}; this.io = io; this.cwd = '/home'; this.running = null; this.fs.mkdir('/home', '/', true); }
  tok(s) { const out = [], re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(s))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]); return out; }
  interrupt() { if (this.running) this.running.kill(); }
  async script(cmd, rest) {
    const eng = this.eng[cmd]; if (!eng) throw new Error(cmd + ': motor no disponible');
    let code = rest; const t = rest.trim();
    if (/^[\w./-]+\.(js|py)$/.test(t)) { const c = this.fs.read(t, this.cwd); if (c === null) throw new Error(t + ': no existe'); code = c; }
    if (!code.trim()) throw new Error('uso: ' + cmd + ' <código | archivo>');
    this.running = eng; try { await eng.run(code, this.io); } finally { this.running = null; }
  }
  async run(line) {
    const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(line); if (!m) return;
    const cmd = m[1], rest = m[2];
    try {
      if (cmd === 'js' || cmd === 'py') return await this.script(cmd, rest);
      let args = this.tok(rest), redir = null;
      const i = args.findIndex(a => a === '>' || a === '>>');
      if (i >= 0) { redir = { append: args[i] === '>>', path: args[i + 1] }; if (!redir.path) throw new Error('falta el archivo tras ' + args[i]); args = args.slice(0, i); }
      const f = this.cmds[cmd]; if (!f) throw new Error(cmd + ': comando no encontrado (escribe help)');
      const out = f.call(this, args);
      if (out === undefined || out === '') { if (redir) this.fs.write(redir.path, this.cwd, redir.append ? (this.fs.read(redir.path, this.cwd) || '') : ''); return; }
      if (redir) this.fs.write(redir.path, this.cwd, (redir.append ? (this.fs.read(redir.path, this.cwd) || '') : '') + out + '\n');
      else this.io.print(out);
    } catch (e) { this.io.printErr(e.message); }
  }
}
ShellCore.prototype.cmds = {
  help() { return HELP; },
  pwd() { return this.cwd; },
  cd(a) { const t = this.fs.abs(a[0] || '/home', this.cwd), n = this.fs.get(t, '/'); if (!n) throw new Error((a[0] || '/home') + ': no existe'); if (n.type !== 'dir') throw new Error(a[0] + ': no es un directorio'); this.cwd = t; },
  ls(a) { const n = this.fs.get(a[0] || '.', this.cwd); if (!n) throw new Error((a[0] || '.') + ': no existe'); if (n.type === 'file') return a[0]; return Object.keys(n.children).sort().map(k => n.children[k].type === 'dir' ? k + '/' : k).join('  '); },
  cat(a) { if (!a.length) throw new Error('uso: cat <archivo>'); return a.map(p => { const d = this.fs.read(p, this.cwd); if (d === null) throw new Error(p + ': no existe'); return d.replace(/\n$/, ''); }).join('\n'); },
  mkdir(a) { const r = a.includes('-p'), ps = a.filter(x => x !== '-p'); if (!ps.length) throw new Error('uso: mkdir [-p] <dir>'); ps.forEach(p => this.fs.mkdir(p, this.cwd, r)); },
  touch(a) { a.forEach(p => { if (this.fs.get(p, this.cwd) === null) this.fs.write(p, this.cwd, ''); }); },
  rm(a) {
    const r = a.includes('-r') || a.includes('-rf'), ps = a.filter(x => !x.startsWith('-')); if (!ps.length) throw new Error('uso: rm [-r] <ruta>');
    ps.forEach(p => { const t = this.fs.abs(p, this.cwd); if (t === '/' || (this.cwd + '/').startsWith(t + '/')) throw new Error(p + ': no se puede borrar (raíz o directorio actual)'); this.fs.remove(p, this.cwd, r); });
  },
  echo(a) { return a.join(' '); },
  date() { return new Date().toString(); },
  clear() { this.io.clear && this.io.clear(); }
};

/* ---------- Sesión web: edición de línea local (no hay PTY en el navegador) ---------- */
let sharedFS = null;
function getFS() { if (!sharedFS) { let st = null; try { st = root.localStorage || null; } catch (e) {} sharedFS = new VFS(st); } return sharedFS; }

class WebSession {
  constructor() {
    this.onData = () => {}; this.onExit = () => {}; this.buf = ''; this.hist = []; this.hi = 0; this.busy = false; this.queue = '';
    const out = s => this.onData(String(s).replace(/\r?\n/g, '\r\n'));
    this.io = { print: t => out(t + '\n'), printErr: t => out('\x1b[31m' + t + '\x1b[0m\n'), clear: () => this.onData('\x1b[2J\x1b[3J\x1b[H') };
    this.sh = new ShellCore(getFS(), { js: new WorkerEngine(JSSRC, CFG.jsTimeoutMs || 5000), py: new WorkerEngine(PYSRC, CFG.pyTimeoutMs || 30000, { url: CFG.pyodideUrl }) }, this.io);
  }
  async start() { this.onData('CodeIDE Terminal (modo web: JavaScript y Python; no es Linux)\r\nEscribe help\r\n'); this.prompt(); }
  prompt() { this.onData('\x1b[32mcodeide\x1b[0m:\x1b[34m' + this.sh.cwd + '\x1b[0m$ '); }
  resize() {}
  kill() { this.sh.interrupt(); }
  setBuf(s) { this.onData('\b \b'.repeat(this.buf.length)); this.buf = s; this.onData(s); }
  input(d) {
    if (this.busy) { if (d === '\x03') { this.queue = ''; this.onData('^C\r\n'); this.sh.interrupt(); } else this.queue += d; return; }
    if (d.length > 1 && d[0] === '\x1b') {
      if (d === '\x1b[A' && this.hi > 0) this.setBuf(this.hist[--this.hi]);
      else if (d === '\x1b[B' && this.hi < this.hist.length) { this.hi++; this.setBuf(this.hist[this.hi] || ''); }
      return;
    }
    this.feed(d);
  }
  feed(d) { for (let i = 0; i < d.length; i++) { if (this.busy) { this.queue += d.slice(i); return; } this.key(d[i]); } }
  key(c) {
    if (c === '\r' || c === '\n') { this.onData('\r\n'); const l = this.buf; this.buf = ''; if (l.trim()) this.hist.push(l); this.hi = this.hist.length; this.exec(l); }
    else if (c === '\x7f' || c === '\b') { if (this.buf) { this.buf = this.buf.slice(0, -1); this.onData('\b \b'); } }
    else if (c === '\x03') { this.buf = ''; this.onData('^C\r\n'); this.prompt(); }
    else if (c === '\x0c') { this.io.clear(); this.prompt(); this.onData(this.buf); }
    else if (c >= ' ') { this.buf += c; this.onData(c); }
  }
  async exec(line) {
    this.busy = true;
    try { await this.sh.run(line); } catch (e) { this.io.printErr(String(e)); }
    this.busy = false; this.prompt();
    const q = this.queue; this.queue = ''; if (q) this.feed(q);
  }
}

/* ---------- Sesión nativa: contrato con el plugin Kotlin. SIN IMPLEMENTAR NI PROBAR. ---------- */
class NativeSession {
  constructor() {
    const P = root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.CodeIDETerminal;
    if (!P) throw new Error('Plugin nativo CodeIDETerminal no disponible (pendiente de implementar y probar en Android)');
    this.P = P; this.onData = () => {}; this.onExit = () => {};
  }
  async start(cols, rows) {
    const r = await this.P.start({ cols, rows }); this.id = r.id;
    this.l1 = await this.P.addListener('data', e => { if (e.id === this.id) this.onData(e.data); });
    this.l2 = await this.P.addListener('exit', e => { if (e.id === this.id) this.onExit(e.code); });
  }
  input(d) { this.P.write({ id: this.id, data: d }); }
  resize(c, r) { this.P.resize({ id: this.id, cols: c, rows: r }); }
  kill() { this.P.kill({ id: this.id }); this.l1 && this.l1.remove(); this.l2 && this.l2.remove(); }
}

function createSession() { return CFG.backend === 'native' ? new NativeSession() : new WebSession(); }

root.CodeIDETerm = { createSession, VFS, ShellCore, WebSession, NativeSession, WorkerEngine };
if (typeof module !== 'undefined' && module.exports) module.exports = { VFS, ShellCore, JSSRC };
})(globalThis);
