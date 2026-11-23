// Genera www/index.html a partir de src/terminal/ (se ejecuta en la compilación en la nube).
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'src', 'terminal'), out = path.join(__dirname, '..', 'www');
const rd = f => fs.readFileSync(path.join(src, f), 'utf8');
const re = /pyodideUrl: '[^']*',/;
let cfg = rd('terminal-config.js');
if (!re.test(cfg)) throw new Error('No se encontró pyodideUrl en terminal-config.js');
cfg = cfg.replace(re, "pyodideUrl: new URL('vendor/pyodide/pyodide.js', location.href).href,");
const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>CodeIDE Terminal</title>
<link rel="stylesheet" href="vendor/xterm.css">
<style>:root{color-scheme:dark}
${rd('terminal.css')}</style>
<script src="vendor/xterm.js"></script>
<script src="vendor/addon-fit.js"></script>
</head>
<body><div id="app"><div id="tabs"></div><div id="host"></div><div id="keys"></div></div>
<script>${cfg}</script>
<script>${rd('terminal.js')}</script>
<script>${rd('native.js')}</script>
<script>${rd('keyboard.js')}</script>
<script>${rd('tabs.js')}</script>
</body></html>`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('www/index.html generado (' + html.length + ' caracteres)');
