# CHANGELOG

## 0.3.0 — Entrega B: Linux (PRoot + Alpine)
Nuevo: pestaña «Linux» con Alpine Linux ejecutado por PRoot, todo local en el teléfono, sin root ni servidor.
- `scripts/fetch-linux.js`: durante la compilación en la nube descarga PRoot y talloc (paquetes oficiales de Termux) y el rootfs de Alpine, verifica las sumas SHA-256 y los deja en `build/linux/`. Si falla, la app se compila sin Linux y la pestaña explica el motivo.
- `native/cpp/tar_extract.c`: extractor de `.tar.gz` en C (GNU y PAX, enlaces, rutas largas) que rechaza rutas con `..` y escrituras a través de enlaces simbólicos. También lee `.tar` sin comprimir.
- `TerminalPlugin.java`: `linuxStatus` (con diagnóstico de lo que hay en el APK), `linuxInstall` (extrae Alpine la primera vez) y `start({kind:'linux'})`, que lanza PRoot con nuestro PTY (sin el servidor AXS de Acode). Montajes mínimos: /dev, /proc, /sys y una carpeta propia para /root y /home (no se monta /data ni /sdcard).
- `scripts/patch-android.js`: empaqueta las bibliotecas como `lib*.so` (únicas ejecutables en Android 10 o superior) y activa su extracción.
- Basado en la lectura directa del código de Acode (init-sandbox.sh y plugin.xml del plugin proot): mismas ideas (PRoot como `libproot-xed.so`, loader como `libproot.so`, enlace `libtalloc.so.2`), sin copiar sus binarios.

### Hallazgos de las pruebas en el teléfono
- prueba-6 y 7: la pestaña Linux avisaba que faltaba el rootfs. El diagnóstico mostró que PRoot, el loader y talloc sí estaban en el APK, pero Android había quitado el «.gz» del nombre de `rootfs-*.tar.gz`. Corregido en la prueba-8: se guarda como `rootfs-*.rootfs`.
- Instalación: «conflicto con un paquete existente», porque cada compilación firma el APK con una llave de depuración distinta. Solución provisional: la app de prueba usa el identificador `com.codeide.terminal.dev`. Pendiente: una llave de pruebas fija para poder actualizar encima sin desinstalar.
- El usuario informó que, con la prueba siguiente, todo funciona bien (incluida la pestaña Linux). No detalló qué comandos probó.

### Probado
- Extractor tar en Linux (`tests/native/test_tar.py`, 16 pruebas): tar GNU y PAX, ruta de más de 100 caracteres, enlaces, hardlink, permisos, y archivos maliciosos (`..`, symlink de escape, ruta absoluta, corrupto).
- `fetch-linux.js` con servidores simulados y .deb reales (`tests/linux/fetch-linux.test.js`, 8 pruebas; `tests/linux/fetch-error.test.js`, 2 pruebas).
- Cliente de la sesión Linux con plugin simulado (`tests/web/linux-session.test.js`, 7 pruebas) y pruebas anteriores (25 de la terminal web, 6 de la shell nativa).
- `patch-android.js` sobre una plantilla simulada, incluida la idempotencia.
- En el teléfono del usuario (según su informe): la compilación en la nube descarga y empaqueta PRoot y Alpine, y la pestaña Linux funciona.

### SIN CONFIRMAR
- Qué se probó exactamente dentro de Linux: instalar paquetes con `apk add`, acceso a internet y DNS.
- Otros teléfonos y la arquitectura de 32 bits (armv7); en algunos dispositivos Android bloquea PRoot.
- Cumplimiento de Google Play: el alineado de 16 KB de los binarios de Termux, y la licencia GPL/LGPL (ver `THIRD_PARTY_NOTICES.md`, borrador sin revisión legal).

### Limitaciones conocidas
- DNS fijo (8.8.8.8 y 1.1.1.1) escrito en `/etc/resolv.conf`.
- Sin modo de respaldo si PRoot falla; solo se explica el error en pantalla.
- El APK crece unos 10 MB por los dos rootfs y los binarios.
- Sin límites de memoria ni de procesos dentro de Linux (Entrega C).

## 0.2.0 — Entrega A: shell nativa
Nuevo: pestaña «Shell» con una shell real del sistema Android (`/system/bin/sh`) mediante un PTY nativo.
Archivos: `native/cpp/*` (C: PTY, señales, JNI, CMake), `native/java/*` (plugin Capacitor), `scripts/patch-android.js` (lo instala en el proyecto Android durante la compilación), `src/terminal/native.js` (cliente).

### Probado
- Motor PTY en C, en Linux (`tests/native/test_pty.c`, 6 pruebas): ejecuta comandos, directorio inicial, tamaño, resize, kill del grupo de procesos, código de salida, shell inexistente.
- Cliente `native.js` con un plugin simulado (`tests/web/shell-native.test.js`, 6 pruebas), incluida la carrera de datos que llegan antes de `start()`.
- `patch-android.js` sobre una plantilla simulada de Capacitor 6, incluida la idempotencia.
- Terminal web: 25 pruebas superadas. Terminal web y pestaña Shell probadas por el usuario en su teléfono (según su informe).

### Limitaciones conocidas
- La shell es la de Android (toybox/mksh): sin `apk`, `git` ni Python del sistema.
- La shell corre con los permisos de la propia app: puede leer los datos privados de la app. Aislamiento y límites: Entrega C.
- Solo arm64-v8a y armeabi-v7a. Máximo 4 sesiones de shell.
- Aún no cumple todos los requisitos de Google Play (nivel de API 36, firma, etc.): Entrega D.

## 0.1.0 — terminal web (JavaScript y Python)
Probada por el usuario en el teléfono con el APK de prueba 1.
