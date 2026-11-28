// Se ejecuta tras `cap sync` (hook capacitor:sync:after): instala el código nativo y Linux (PRoot + Alpine) en el proyecto Android generado.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..'), app = path.join(root, 'android', 'app');
if (!fs.existsSync(app)) { console.log('patch-android: aún no hay proyecto android, nada que hacer'); process.exit(0); }
const copy = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); };
const copyDir = (a, b) => { for (const e of fs.readdirSync(a, { withFileTypes: true })) { const s = path.join(a, e.name), d = path.join(b, e.name); if (e.isDirectory()) copyDir(s, d); else copy(s, d); } };
const copyText = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
const main = path.join(app, 'src', 'main'), jdir = path.join(main, 'java', 'com', 'codeide', 'terminal');
for (const f of ['pty_engine.c', 'pty_engine.h', 'tar_extract.c', 'tar_extract.h', 'jni_bridge.c', 'CMakeLists.txt']) copy(path.join(root, 'native', 'cpp', f), path.join(main, 'cpp', f));
for (const f of ['NativePty.java', 'TerminalPlugin.java']) copy(path.join(root, 'native', 'java', f), path.join(jdir, f));

// Linux: PRoot, talloc y Alpine, descargados (y verificados) solo durante la compilación y empaquetados en el APK.
const lin = path.join(root, 'build', 'linux');
if (!fs.existsSync(lin) && !process.env.SKIP_LINUX) {
  try { cp.execFileSync(process.execPath, [path.join(__dirname, 'fetch-linux.js')], { stdio: 'inherit' }); }
  catch (e) {
    console.warn('patch-android: AVISO — no se pudo preparar Linux; la app se compila SIN Linux (la pestaña lo avisará).');
    const ef = path.join(root, 'build', 'linux-error.txt');   // el motivo viaja dentro del APK para mostrarlo en la app
    copyText(path.join(main, 'assets', 'linux', 'FETCH_ERROR.txt'), fs.existsSync(ef) ? fs.readFileSync(ef, 'utf8') : String(e.message).slice(0, 800));
    fs.rmSync(lin, { recursive: true, force: true });          // nada a medias: o se incluye todo Linux o nada
  }
}
if (fs.existsSync(lin)) {
  copyDir(path.join(lin, 'jniLibs'), path.join(main, 'jniLibs')); copyDir(path.join(lin, 'assets'), path.join(main, 'assets'));
  const notices = path.join(root, 'THIRD_PARTY_NOTICES.md'); if (fs.existsSync(notices)) copy(notices, path.join(main, 'assets', 'linux', 'NOTICES.md'));
  console.log('patch-android: Linux incluido en el APK');
}

const ma = path.join(jdir, 'MainActivity.java');
let s = fs.readFileSync(ma, 'utf8');
if (!s.includes('registerPlugin(TerminalPlugin.class)')) {
  s = s.replace(/public class MainActivity extends BridgeActivity\s*\{\s*\}/,
    'public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(TerminalPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}');
  if (!s.includes('registerPlugin(TerminalPlugin.class)')) throw new Error('patch-android: no se pudo modificar MainActivity.java');
  fs.writeFileSync(ma, s);
}
const bg = path.join(app, 'build.gradle');
let g = fs.readFileSync(bg, 'utf8');
if (!g.includes('codeide-native')) {
  if (!/^android\s*\{/m.test(g) || !/defaultConfig\s*\{/.test(g)) throw new Error('patch-android: build.gradle con formato inesperado');
  // useLegacyPackaging: Android extrae las .so a nativeLibraryDir (PRoot se ejecuta desde ahí); keepDebugSymbols: no modificar los binarios.
  g = g.replace(/^android\s*\{/m, 'android {\n    externalNativeBuild { cmake { path "src/main/cpp/CMakeLists.txt" } } // codeide-native\n    packaging { jniLibs { useLegacyPackaging = true; keepDebugSymbols.add("**/*.so") } } // codeide-native');
  g = g.replace(/defaultConfig\s*\{/, "defaultConfig {\n        ndk { abiFilters 'arm64-v8a', 'armeabi-v7a' } // codeide-native");
  fs.writeFileSync(bg, g);
}
// Identidad propia de las pruebas: evita el «conflicto con un paquete existente» con instalaciones anteriores firmadas con otra llave.
if (!g.includes('codeide-appid')) {
  if (!/applicationId\s+"[^"]*"/.test(g)) throw new Error('patch-android: no se encontró applicationId en build.gradle');
  g = g.replace(/applicationId\s+"[^"]*"/, 'applicationId "com.codeide.terminal.dev" // codeide-appid');
  fs.writeFileSync(bg, g);
}
console.log('patch-android: código nativo instalado y registrado');
