// Descarga, SOLO durante la compilación, PRoot y sus bibliotecas (paquetes oficiales de Termux) y el rootfs de Alpine.
// Todo queda en build/linux/ y se empaqueta dentro del APK: la app nunca descarga código ejecutable al usarse.
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), crypto = require('crypto'), cp = require('child_process');
const TERMUX = process.env.TERMUX_REPO || 'https://packages.termux.dev/apt/termux-main';
const ALPINE = process.env.ALPINE_MIRROR || 'https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases';
const ARCHS = [
  { abi: 'arm64-v8a', termux: 'aarch64', alpine: ['aarch64'], name: 'aarch64' },
  { abi: 'armeabi-v7a', termux: 'arm', alpine: ['armv7', 'armhf'], name: 'armv7' }
];
const httpGet = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + ': HTTP ' + r.status); return Buffer.from(await r.arrayBuffer()); };
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

function parsePackages(text) {
  const out = {};
  for (const block of text.split(/\n\s*\n/)) {
    const f = {}; let k = null;
    for (const line of block.split('\n')) { const m = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(line); if (m) { k = m[1]; f[k] = m[2]; } else if (k && /^\s/.test(line)) f[k] += ' ' + line.trim(); }
    if (f.Package) out[f.Package] = f;
  }
  return out;
}
const parseDepends = s => (s || '').split(',').map(x => x.split('|')[0].replace(/\(.*\)/, '').trim()).filter(Boolean);
const parseAlpineYaml = (text, arch) => { const m = new RegExp('alpine-minirootfs-[0-9.]+-' + arch + '\\.tar\\.gz').exec(text); return m ? m[0] : null; };

function walk(root, fn) { for (const e of fs.readdirSync(root, { withFileTypes: true })) { const p = path.join(root, e.name); if (e.isDirectory()) walk(p, fn); else fn(p, e); } }
function resolveBase(dir, name) { for (let i = 0; i < 6; i++) { const p = path.join(dir, name); if (!fs.lstatSync(p).isSymbolicLink()) return name; name = path.basename(fs.readlinkSync(p)); } return name; }

async function fetchDeb(get, pk, name, tmp) {
  const e = pk[name]; if (!e) return null;
  const buf = await get(`${TERMUX}/${e.Filename}`);
  if (sha256(buf) !== e.SHA256) throw new Error('checksum incorrecto en el paquete de Termux: ' + name);
  const dir = path.join(tmp, name); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'p.deb'), buf); cp.execFileSync('dpkg-deb', ['-x', path.join(dir, 'p.deb'), path.join(dir, 'x')]);
  return { dir: path.join(dir, 'x'), version: e.Version, depends: parseDepends(e.Depends) };
}
async function packagesFor(get, arch) {
  const base = `${TERMUX}/dists/stable/main/binary-${arch}/Packages`;
  try { return parsePackages((await get(base)).toString()); } catch (e) { return parsePackages(zlib.gunzipSync(await get(base + '.gz')).toString()); }
}

async function run(opts = {}) {
  const get = opts.get || httpGet, out = opts.out || path.join(__dirname, '..', 'build', 'linux'), archs = opts.archs || ARCHS, log = opts.log || console.log;
  fs.rmSync(out, { recursive: true, force: true });
  const assets = path.join(out, 'assets', 'linux'); fs.mkdirSync(assets, { recursive: true });
  const versions = [], libmap = new Set(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-'));
  for (const A of archs) {
    const pk = await packagesFor(get, A.termux), proot = await fetchDeb(get, pk, 'proot', tmp);
    if (!proot) throw new Error('Termux no tiene el paquete proot para ' + A.termux);
    const jni = path.join(out, 'jniLibs', A.abi); fs.mkdirSync(jni, { recursive: true });
    const found = {}; walk(proot.dir, (p, e) => { if (e.isFile()) { if (/\/bin\/proot$/.test(p)) found.bin = p; else if (/\/libexec\/proot\/loader$/.test(p)) found.loader = p; else if (/\/libexec\/proot\/loader32$/.test(p)) found.loader32 = p; } });
    if (!found.bin || !found.loader) throw new Error('el paquete proot no trae bin/proot o libexec/proot/loader');
    fs.copyFileSync(found.bin, path.join(jni, 'libproot-xed.so')); fs.copyFileSync(found.loader, path.join(jni, 'libproot.so'));
    if (found.loader32) fs.copyFileSync(found.loader32, path.join(jni, 'libproot32.so'));
    versions.push(`${A.abi}: proot ${proot.version} (Termux)`);
    try { log(cp.execFileSync('readelf', ['-d', found.bin]).toString().split('\n').filter(l => /NEEDED|RUNPATH|RPATH/.test(l)).join('\n')); } catch (e) { /* readelf es opcional */ }
    for (const dep of proot.depends) {
      const d = await fetchDeb(get, pk, dep, tmp);
      if (!d) { log(`aviso: dependencia ${dep} no está en Termux; se omite`); continue; }
      walk(d.dir, (p, e) => {
        const dirp = path.dirname(p), base = path.basename(p); if (!/^lib.*\.so(\.[0-9]+)*$/.test(base) || !/\/lib$/.test(dirp)) return;
        if (e.isFile()) { const stem = base.replace(/\.so.*$/, ''); fs.copyFileSync(p, path.join(jni, stem + '.so')); }
      });
      walk(d.dir, (p) => { // nombres (sonames) que apuntan a cada archivo real
        const dirp = path.dirname(p), base = path.basename(p); if (!/^lib.*\.so(\.[0-9]+)*$/.test(base) || !/\/lib$/.test(dirp)) return;
        libmap.add(`${base}=${resolveBase(dirp, base).replace(/\.so.*$/, '')}.so`);
      });
      versions.push(`${A.abi}: ${dep} ${d.version} (Termux)`);
    }
    let file = null, arch = null;
    for (const cand of A.alpine) {
      try { file = parseAlpineYaml((await get(`${ALPINE}/${cand}/latest-releases.yaml`)).toString(), cand); } catch (e) { log(`aviso: Alpine ${cand}: ${e.message}`); }
      if (file) { arch = cand; break; }
    }
    if (!file) throw new Error('no se encontró el rootfs de Alpine para ' + A.name);
    const tgz = await get(`${ALPINE}/${arch}/${file}`), want = (await get(`${ALPINE}/${arch}/${file}.sha256`)).toString().trim().split(/\s+/)[0];
    if (sha256(tgz) !== want) throw new Error('checksum incorrecto en ' + file);
    fs.writeFileSync(path.join(assets, `rootfs-${A.name}.tar.gz`), tgz); versions.push(`${A.abi}: ${file} (Alpine)`);
  }
  fs.writeFileSync(path.join(assets, 'libmap.txt'), [...libmap].sort().join('\n') + '\n');
  fs.writeFileSync(path.join(assets, 'VERSIONS.txt'), versions.join('\n') + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  return { out, versions };
}
module.exports = { run, parsePackages, parseDepends, parseAlpineYaml };
if (require.main === module) run().then(r => console.log('fetch-linux listo:\n' + r.versions.join('\n'))).catch(e => { console.error('fetch-linux FALLÓ: ' + e.message); process.exit(1); });
