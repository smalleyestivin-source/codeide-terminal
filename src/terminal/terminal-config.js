globalThis.CODEIDE_TERMINAL_CONFIG = {
  backend: 'web',          // 'web' = JavaScript/Python en el navegador | 'native' = plugin Android (SIN PROBAR)
  maxTabs: 6,
  jsTimeoutMs: 5000,
  pyTimeoutMs: 30000,      // incluye la primera carga de Pyodide
  fontSize: 14,
  scrollback: 2000,
  // En la APK empaqueta Pyodide localmente y cambia esta ruta (ej. 'pyodide/pyodide.js').
  pyodideUrl: 'https://cdn.jsdelivr.net/npm/pyodide@0.26.4/pyodide.js',
  storageKey: 'codeide.fs.v1',
  theme: { background: '#0f1115', foreground: '#d7dae0', cursor: '#79c0ff' }
};
