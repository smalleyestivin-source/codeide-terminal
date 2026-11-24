# Avisos de terceros (BORRADOR — sin revisión legal)

CodeIDE Terminal incluye dentro del APK los siguientes componentes. Las licencias indicadas son las que conozco de cada proyecto;
**deben verificarse antes de publicar la app** (sobre todo en Google Play).

| Componente | Licencia | Código fuente |
|---|---|---|
| PRoot (compilado por Termux) | GPL-2.0 o posterior | https://github.com/proot-me/proot · https://github.com/termux/termux-packages |
| talloc (compilado por Termux) | LGPL-3.0 o posterior | https://talloc.samba.org |
| Alpine Linux minirootfs (musl: MIT; BusyBox: GPL-2.0; otros paquetes con su propia licencia) | varias | https://git.alpinelinux.org · https://dl-cdn.alpinelinux.org |
| xterm.js | MIT | https://github.com/xtermjs/xterm.js |
| Pyodide | MPL-2.0 | https://github.com/pyodide/pyodide |
| Capacitor | MIT | https://github.com/ionic-team/capacitor |

Las versiones exactas empaquetadas en cada APK quedan registradas en `assets/linux/VERSIONS.txt`.

## Oferta de código fuente (GPL/LGPL)
El código fuente correspondiente a PRoot, talloc y a los paquetes de Alpine incluidos puede obtenerse en los enlaces de la tabla,
usando la versión indicada en `VERSIONS.txt`. Los binarios de PRoot y talloc no se modifican: se toman tal cual de los paquetes oficiales de Termux
(verificados con su suma SHA-256) y se renombran a `lib*.so` para que Android permita ejecutarlos desde el APK.
