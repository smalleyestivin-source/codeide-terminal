// node tests/web/linux-session.test.js — prueba la sesión «Linux» del cliente con un plugin SIMULADO (no es Android real)
const assert = require('assert'); require('../../src/terminal/terminal.js');
const txt = u => Buffer.from(u).toString();
function setup(status, installFails) {
  const h = {}, calls = [];
  globalThis.Capacitor = { isPluginAvailable: () => true, Plugins: { CodeIDETerminal: {
    addListener: async (n, f) => { h[n] = f; return { remove() {} }; },
    linuxStatus: async () => status, linuxInstall: async () => { calls.push('install'); if (installFails) throw new Error('disco lleno'); status.installed = true; },
    start: async o => { calls.push('start:' + o.kind); return { id: 7 }; }, write() {}, resize() {}, kill() {} } } };
  delete require.cache[require.resolve('../../src/terminal/native.js')]; require('../../src/terminal/native.js'); return { h, calls };
}
(async () => {
  const T = globalThis.CodeIDETerm; let out, s;
  let c = setup({ bundled: true, installed: false }); s = T.createSession('linux'); out = []; s.onData = d => out.push(txt(d));
  await s.start(80, 24); assert.deepStrictEqual(c.calls, ['install', 'start:linux']); assert.ok(out.join('').includes('Preparando Linux') && out.join('').includes('Linux listo'));
  console.log('  ok  primera vez: instala Linux, avisa al usuario y luego inicia');
  c = setup({ bundled: true, installed: true }); s = T.createSession('linux'); await s.start(80, 24); assert.deepStrictEqual(c.calls, ['start:linux']); console.log('  ok  si ya está instalado, no reinstala');
  c = setup({ bundled: false, installed: false }); s = T.createSession('linux'); await assert.rejects(s.start(80, 24), /no incluye Linux/); assert.deepStrictEqual(c.calls, []); console.log('  ok  APK sin PRoot/Alpine: error claro, no intenta iniciar');
  c = setup({ bundled: false, rootfs: false, proot: true, loader: true, installed: false, fetchError: 'Termux: HTTP 403', rootfsName: 'linux/rootfs-armv7.tar.gz', assetsLinux: 'libmap.txt, VERSIONS.txt', nativeFiles: 'libproot.so, libproot-xed.so' }); s = T.createSession('linux'); await assert.rejects(s.start(80, 24), e => /Faltan en el APK: rootfs/.test(e.message) && /Motivo al compilar: Termux: HTTP 403/.test(e.message) && /Esperaba: linux\/rootfs-armv7.tar.gz. En linux\/ hay: libmap.txt/.test(e.message) && /Librerías nativas: libproot.so/.test(e.message)); console.log('  ok  si falta algo, la app muestra qué falta y el motivo de la compilación');
  c = setup({ bundled: true, installed: false }, true); s = T.createSession('linux'); await assert.rejects(s.start(80, 24), /disco lleno/); assert.ok(!c.calls.includes('start:linux')); console.log('  ok  si falla la instalación, no inicia y propaga el error');
  c = setup({ bundled: true, installed: true }); s = T.createSession('linux'); out = []; let code = null; s.onData = d => out.push(txt(d)); s.onExit = x => { code = x; };
  await s.start(80, 24); c.h.exit({ id: 7, code: 126 }); assert.ok(out.join('').includes('PRoot terminó enseguida (código 126)') && code === 126); console.log('  ok  si PRoot muere al instante, explica qué pasó');
  c = setup({ bundled: true, installed: true }); s = T.createSession('shell'); await s.start(80, 24); assert.deepStrictEqual(c.calls, ['start:shell']); console.log('  ok  la pestaña Shell sigue funcionando igual');
})().catch(e => { console.log('FALLA', e.message); process.exit(1); });
