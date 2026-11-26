// node tests/linux/fetch-error.test.js — si no hay red, fetch-linux.js falla con un motivo escrito en build/linux-error.txt (usa un puerto local cerrado; no toca internet)
const assert = require('assert'), fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..', '..'), ef = path.join(root, 'build', 'linux-error.txt'), had = fs.existsSync(path.join(root, 'build'));
fs.rmSync(ef, { force: true });
const r = cp.spawnSync(process.execPath, [path.join(root, 'scripts', 'fetch-linux.js')], { env: { ...process.env, TERMUX_REPO: 'http://127.0.0.1:9', ALPINE_MIRROR: 'http://127.0.0.1:9' }, encoding: 'utf8' });
assert.strictEqual(r.status, 1); console.log('  ok  sale con error (código 1)');
assert.ok(fs.existsSync(ef) && fs.readFileSync(ef, 'utf8').length > 0); console.log('  ok  escribe el motivo en build/linux-error.txt: ' + fs.readFileSync(ef, 'utf8').slice(0, 80));
fs.rmSync(ef, { force: true }); if (!had) fs.rmSync(path.join(root, 'build'), { recursive: true, force: true });
