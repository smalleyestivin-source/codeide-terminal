// Se ejecuta tras `cap sync` (hook capacitor:sync:after): copia el código nativo al proyecto Android generado y lo registra.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), app = path.join(root, 'android', 'app');
if (!fs.existsSync(app)) { console.log('patch-android: aún no hay proyecto android, nada que hacer'); process.exit(0); }
const cp = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); };
const main = path.join(app, 'src', 'main'), jdir = path.join(main, 'java', 'com', 'codeide', 'terminal');
for (const f of ['pty_engine.c', 'pty_engine.h', 'jni_bridge.c', 'CMakeLists.txt']) cp(path.join(root, 'native', 'cpp', f), path.join(main, 'cpp', f));
for (const f of ['NativePty.java', 'TerminalPlugin.java']) cp(path.join(root, 'native', 'java', f), path.join(jdir, f));

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
  g = g.replace(/^android\s*\{/m, 'android {\n    externalNativeBuild { cmake { path "src/main/cpp/CMakeLists.txt" } } // codeide-native');
  g = g.replace(/defaultConfig\s*\{/, "defaultConfig {\n        ndk { abiFilters 'arm64-v8a', 'armeabi-v7a' } // codeide-native");
  fs.writeFileSync(bg, g);
}
console.log('patch-android: código nativo instalado y registrado');
