# CodeIDE Terminal

Terminal de ejecución de código (JavaScript y Python) para Android, con Capacitor. Todo corre en el teléfono, sin servidor.

**Estado:** prototipo. Aún NO es una terminal Linux (PRoot y Alpine se añadirán después).

- Código fuente de la interfaz y los motores: `src/terminal/`
- `scripts/build-www.js` genera `www/index.html` durante la compilación.
- `.github/workflows/android.yml` compila el APK de prueba en GitHub Actions y lo publica en Releases.
- Cada cambio de estado, prueba y limitación conocida se documenta aquí y en el CHANGELOG cuando exista.
