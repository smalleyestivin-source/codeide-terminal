// node tests/web/shell-native.test.js  — prueba el cliente con un plugin simulado (NO es el plugin real de Android)
const assert = require('assert'); require('../../src/terminal/terminal.js');
let h = {}, calls = [];
globalThis.Capacitor = { isPluginAvailable: n => n === 'CodeIDETerminal', Plugins: { CodeIDETerminal: {
  addListener: async (n, f) => { h[n] = f; return { remove() { calls.push('remove:' + n); } }; },
  start: async o => { calls.push('start:' + o.cols + 'x' + o.rows); h.data({ id: 1, data: Buffer.from('hola').toString('base64') }); return { id: 1 }; },
  write: o => calls.push('write:' + o.id + ':' + o.data), resize: o => calls.push('resize:' + o.cols + 'x' + o.rows), kill: o => calls.push('kill:' + o.id) } } };
require('../../src/terminal/native.js');
(async () => {
  const T = globalThis.CodeIDETerm; assert.ok(T.shellAvailable());
  const s = T.createSession('shell'); const got = []; let exit = null; s.onData = d => got.push(Buffer.from(d).toString()); s.onExit = c => { exit = c; };
  await s.start(80, 24);
  assert.deepStrictEqual(got, ['hola']); console.log('  ok  datos llegados antes de start() no se pierden');
  h.data({ id: 2, data: 'eHg=' }); assert.deepStrictEqual(got, ['hola']); console.log('  ok  ignora datos de otras sesiones');
  h.exit({ id: 1, code: 0 }); assert.strictEqual(exit, 0); console.log('  ok  evento exit');
  s.input('ls\r'); s.resize(100, 40); s.kill();
  assert.deepStrictEqual(calls, ['start:80x24', 'write:1:ls\r', 'resize:100x40', 'kill:1', 'remove:data', 'remove:exit']); console.log('  ok  input, resize y kill llegan al plugin');
  delete globalThis.Capacitor; assert.ok(!T.shellAvailable()); assert.throws(() => T.createSession('shell'), /no está disponible/); console.log('  ok  sin plugin: no ofrece shell y falla con mensaje claro');
  assert.ok(T.createSession() instanceof T.WebSession); console.log('  ok  la terminal web sigue siendo la sesión por defecto');
})().catch(e => { console.log('FALLA', e.message); process.exit(1); });
