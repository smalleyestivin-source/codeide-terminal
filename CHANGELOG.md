# CHANGELOG

## 0.2.0 — Entrega A: shell nativa (en construcción)
Nuevo: pestaña «Shell» con una shell real del sistema Android (`/system/bin/sh`) mediante un PTY nativo.
Archivos: `native/cpp/*` (C: PTY, señales, JNI, CMake), `native/java/*` (plugin Capacitor), `scripts/patch-android.js` (lo instala en el proyecto Android durante la compilación), `src/terminal/native.js` (cliente).

### Probado
- Motor PTY en C, en Linux (`tests/native/test_pty.c`, 6 pruebas): ejecuta comandos, directorio inicial, tamaño, resize, kill del grupo de procesos, código de salida, shell inexistente.
- Cliente `native.js` con un plugin simulado (`tests/web/shell-native.test.js`, 6 pruebas), incluida la carrera de datos que llegan antes de `start()`.
- `patch-android.js` sobre una plantilla simulada de Capacitor 6, incluida la idempotencia.
- Prueba anterior de la terminal web: 25 pruebas superadas y comprobada por el usuario en su teléfono (APK de prueba 1).

### SIN PROBAR
- `jni_bridge.c`, `NativePty.java` y `TerminalPlugin.java`: no se pudieron compilar en el entorno de desarrollo (sin JDK ni Android SDK).
- Que el hook `capacitor:sync:after` de Capacitor ejecute `patch-android.js` en la compilación en la nube.
- Compilación con NDK/CMake, carga de `libcodeide_pty.so`, y toda la shell en un teléfono real.

### Limitaciones conocidas
- La shell es la de Android (toybox/mksh): sin `apk`, `git` ni Python del sistema. Linux completo (PRoot + Alpine) es la Entrega B.
- La shell corre con los permisos de la propia app: puede leer los datos privados de la app. Aislamiento y límites: Entrega C.
- Solo arm64-v8a y armeabi-v7a. Máximo 4 sesiones de shell.
- Aún no cumple todos los requisitos de Google Play (nivel de API 36, firma, etc.): Entrega D.

## 0.1.0 — terminal web (JavaScript y Python)
Probada por el usuario en el teléfono con el APK de prueba 1.
