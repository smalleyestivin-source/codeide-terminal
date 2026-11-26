// node tests/linux/fetch-linux.test.js — prueba la descarga/empaquetado con servidores SIMULADOS (no toca internet; necesita dpkg-deb)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const F = require('../../scripts/fetch-linux.js'); const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-')), w = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function deb(name, files, links = {}) {
  const r = path.join(tmp, name + '-root'); w(path.join(r, 'DEBIAN/control'), `Package: ${name}\nVersion: 1\nArchitecture: all\nMaintainer: t\nDescription: t\n`);
  for (const [p, c] of Object.entries(files)) w(path.join(r, 'data/data/com.termux/files/usr', p), c);
  for (const [p, t] of Object.entries(links)) fs.symlinkSync(t, path.join(r, 'data/data/com.termux/files/usr', p));
  const o = path.join(tmp, name + '.deb'); cp.execFileSync('dpkg-deb', ['--build', r, o], { stdio: 'ignore' }); return fs.readFileSync(o);
}
const prootDeb = deb('proot', { 'bin/proot': 'PROOT-BIN', 'libexec/proot/loader': 'LOADER', 'libexec/proot/loader32': 'LOADER32' });
const talloc = deb('libtalloc', { 'lib/libtalloc.so.2.4.3': 'TALLOC' }, { 'lib/libtalloc.so.2': 'libtalloc.so.2.4.3', 'lib/libtalloc.so': 'libtalloc.so.2' });
const tgz = Buffer.from('FAKE-ALPINE-TARBALL');
const T = 'https://packages.termux.dev/apt/termux-main', A = 'https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases';
const index = `Package: proot\nVersion: 5.1\nDepends: libtalloc, libc++ (>= 1)\nFilename: pool/p.deb\nSHA256: ${sha(prootDeb)}\n\nPackage: libtalloc\nVersion: 2.4\nFilename: pool/t.deb\nSHA256: ${sha(talloc)}\n`;
const files = (bad) => ({ [`${T}/dists/stable/main/binary-aarch64/Packages`]: index, [`${T}/dists/stable/main/binary-arm/Packages`]: index,
  [`${T}/pool/p.deb`]: prootDeb, [`${T}/pool/t.deb`]: talloc,
  [`${A}/aarch64/latest-releases.yaml`]: '- file: alpine-minirootfs-3.99.1-aarch64.tar.gz\n', [`${A}/aarch64/alpine-minirootfs-3.99.1-aarch64.tar.gz`]: tgz, [`${A}/aarch64/alpine-minirootfs-3.99.1-aarch64.tar.gz.sha256`]: (bad ? 'deadbeef' : sha(tgz)) + '  x\n',
  [`${A}/armhf/latest-releases.yaml`]: '- file: alpine-minirootfs-3.99.1-armhf.tar.gz\n', [`${A}/armhf/alpine-minirootfs-3.99.1-armhf.tar.gz`]: tgz, [`${A}/armhf/alpine-minirootfs-3.99.1-armhf.tar.gz.sha256`]: sha(tgz) + '  x\n' });
const mkget = m => async u => { if (!(u in m)) throw new Error(u + ': HTTP 404'); return Buffer.from(m[u]); };
(async () => {
  const out = path.join(tmp, 'out'), logs = [];
  const r = await F.run({ get: mkget(files(false)), out, log: s => logs.push(s) });
  const rd = p => fs.readFileSync(path.join(out, p), 'utf8');
  assert.strictEqual(rd('jniLibs/arm64-v8a/libproot-xed.so'), 'PROOT-BIN'); assert.strictEqual(rd('jniLibs/arm64-v8a/libproot.so'), 'LOADER'); assert.strictEqual(rd('jniLibs/armeabi-v7a/libproot32.so'), 'LOADER32');
  console.log('  ok  proot y loader quedan con los nombres lib*.so que Android exige');
  assert.strictEqual(rd('jniLibs/arm64-v8a/libtalloc.so'), 'TALLOC'); const map = rd('assets/linux/libmap.txt').trim().split('\n');
  assert.ok(map.includes('libtalloc.so.2=libtalloc.so') && map.includes('libtalloc.so.2.4.3=libtalloc.so')); console.log('  ok  libtalloc y la tabla de nombres (libtalloc.so.2 -> libtalloc.so)');
  assert.strictEqual(rd('assets/linux/rootfs-aarch64.rootfs'), 'FAKE-ALPINE-TARBALL'); assert.ok(fs.existsSync(path.join(out, 'assets/linux/rootfs-armv7.rootfs'))); assert.ok(!fs.readdirSync(path.join(out, 'assets/linux')).some(n => /\.gz$/.test(n))); console.log('  ok  rootfs de Alpine verificado, sin extensión .gz; armv7 cae a armhf si falta');
  assert.ok(logs.some(l => /libc\+\+/.test(l))); console.log('  ok  dependencia ausente en Termux: aviso y se omite');
  assert.match(rd('assets/linux/VERSIONS.txt'), /proot 5\.1 \(Termux\)/); console.log('  ok  VERSIONS.txt registra lo empaquetado');
  await assert.rejects(F.run({ get: mkget(files(true)), out, log() {} }), /checksum incorrecto/); console.log('  ok  checksum de Alpine incorrecto: la compilación falla');
  const f = files(false); f[`${T}/dists/stable/main/binary-aarch64/Packages`] = index.replace(sha(prootDeb), 'abc'); await assert.rejects(F.run({ get: mkget(f), out, log() {} }), /checksum incorrecto en el paquete/); console.log('  ok  checksum de Termux incorrecto: la compilación falla');
  const p = F.parsePackages('Package: a\nDepends: x (>= 1), y | z\nDescription: línea\n continuación\n\nPackage: b\nVersion: 2\n'); assert.deepStrictEqual(F.parseDepends(p.a.Depends), ['x', 'y']); assert.strictEqual(p.b.Version, '2'); console.log('  ok  lectura del índice apt');
})().catch(e => { console.log('FALLA', e.message); process.exit(1); });
