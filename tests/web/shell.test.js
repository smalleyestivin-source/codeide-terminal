// Ejecutar: node tests/web/shell.test.js   (prueba la lógica; NO prueba xterm, Workers reales ni Pyodide)
const assert = require('assert'), vm = require('vm');
const { VFS, ShellCore, JSSRC } = require('../../src/terminal/terminal.js');
let pass = 0; const ok = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('FALLA ' + n + ': ' + e.message); process.exitCode = 1; } };
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const mk = (store, eng) => { const out = [], err = []; const io = { print: t => out.push(t), printErr: t => err.push(t) }; const fs = new VFS(store || mem()); return { sh: new ShellCore(fs, eng, io), out, err, fs }; };

(async () => {
  console.log('Sistema de archivos y comandos');
  const t = mk();
  await t.sh.run('pwd');                         ok('pwd inicial /home', () => assert.deepStrictEqual(t.out, ['/home']));
  await t.sh.run('mkdir proj'); await t.sh.run('cd proj'); await t.sh.run('echo hola mundo > a.txt');
  t.out.length = 0; await t.sh.run('cat a.txt');  ok('echo > y cat', () => assert.deepStrictEqual(t.out, ['hola mundo']));
  await t.sh.run('echo otra >> a.txt'); t.out.length = 0; await t.sh.run('cat a.txt'); ok('>> añade', () => assert.deepStrictEqual(t.out, ['hola mundo\notra']));
  t.out.length = 0; await t.sh.run('ls');         ok('ls', () => assert.deepStrictEqual(t.out, ['a.txt']));
  await t.sh.run('cd ..'); t.err.length = 0; await t.sh.run('rm proj'); ok('rm dir no vacío sin -r falla', () => assert.match(t.err[0], /no vacío/));
  t.err.length = 0; await t.sh.run('rm -r /'); ok('rm -r / bloqueado', () => assert.match(t.err[0], /no se puede borrar/));
  t.err.length = 0; await t.sh.run('rm -r /home'); ok('no borra el directorio actual', () => assert.match(t.err[0], /no se puede borrar/));
  await t.sh.run('rm -r proj'); t.err.length = 0; await t.sh.run('cd proj'); ok('rm -r borra', () => assert.match(t.err[0], /no existe/));
  await t.sh.run('cd ../../../..'); t.out.length = 0; await t.sh.run('pwd'); ok('.. no sale de la raíz', () => assert.deepStrictEqual(t.out, ['/']));
  t.err.length = 0; await t.sh.run('cat ../etc/passwd'); ok('no existe fuera del FS virtual', () => assert.match(t.err[0], /no existe/));
  t.err.length = 0; await t.sh.run('ls_inventado'); ok('comando desconocido da error real', () => assert.match(t.err[0], /no encontrado/));
  const store = mem(); const a = mk(store); await a.sh.run('echo persiste > /home/p.txt'); const b = mk(store);
  ok('persistencia entre instancias', () => assert.strictEqual(b.fs.read('/home/p.txt', '/'), 'persiste\n'));

  console.log('js/py: se pasa el código sin alterar y los archivos se leen');
  const calls = []; const fake = { run: async (c, io) => { calls.push(c); io.print('ran'); }, kill() { calls.push('KILL'); } };
  const e = mk(null, { js: fake, py: fake });
  await e.sh.run('js console.log("a   b")');      ok('js recibe el texto crudo', () => assert.strictEqual(calls[0], 'console.log("a   b")'));
  await e.sh.run('echo "print(1)" > x.py'); await e.sh.run('py x.py'); ok('py archivo.py lee el archivo', () => assert.strictEqual(calls[1], 'print(1)\n'));
  e.err.length = 0; await e.sh.run('js nada.js'); ok('archivo inexistente: error y no ejecuta nada', () => { assert.match(e.err[0], /no existe/); assert.strictEqual(calls.length, 2); });
  let release; const hang = { run: () => new Promise(r => { release = r; }), kill() { calls.push('KILL'); release(); } };
  const h = mk(null, { js: hang }); const pr = h.sh.run('js while(1){}'); h.sh.interrupt(); await pr;
  ok('interrupt detiene un programa colgado (Ctrl+C)', () => assert.ok(calls.includes('KILL')));

  console.log('Motor JS (fuente del Worker ejecutada en vm)');
  const out = []; const ctx = vm.createContext({ postMessage: m => out.push(m) }); vm.runInContext(JSSRC, ctx);
  const send = code => { out.length = 0; ctx.onmessage({ data: { code } }); return JSON.parse(JSON.stringify(out)); };
  ok('2**10 = 1024', () => assert.deepStrictEqual(send('2**10'), [{ t: 'o', d: '1024' }, { t: 'd' }]));
  send('var x = 5'); ok('var persiste entre ejecuciones', () => assert.deepStrictEqual(send('x*2'), [{ t: 'o', d: '10' }, { t: 'd' }]));
  ok('console.log capturado', () => assert.deepStrictEqual(send('console.log("hola",1)')[0], { t: 'o', d: 'hola 1' }));
  ok('error real del motor', () => assert.match(send('foo()')[0].d, /ReferenceError/));
  send('let y = 1'); ok('LIMITACIÓN: let no persiste (documentada)', () => assert.match(send('y')[0].d, /ReferenceError/));

  console.log('WebSession (edición de línea)');
  const WS = globalThis.CodeIDETerm.WebSession; const s = new WS(); let o = ''; s.onData = d => { o += d; };
  await s.start(); o = ''; s.input('echo hi\r'); await new Promise(r => setTimeout(r, 20));
  ok('ejecuta una línea y muestra salida + prompt', () => { assert.ok(o.includes('hi\r\n')); assert.ok(o.includes('codeide')); });
  o = ''; s.input('abc'); s.input('\x7f'); ok('backspace borra', () => assert.strictEqual(o, 'abc\b \b')); s.input('\x03');
  o = ''; s.input('echo uno\recho dos\r'); await new Promise(r => setTimeout(r, 40));
  ok('pegar varias líneas ejecuta todas', () => assert.ok(o.includes('uno') && o.includes('dos')));
  o = ''; s.input('js 1+1\r'); await new Promise(r => setTimeout(r, 20));
  ok('sin Worker (Node) falla con mensaje claro', () => assert.ok(o.includes('Workers no disponibles')));

  console.log(`\n${pass} pruebas superadas` + (process.exitCode ? ' — HAY FALLAS' : ''));
})();
