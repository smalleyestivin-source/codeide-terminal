# python3 tests/native/test_tar.py  — prueba el extractor tar.gz en C con archivos tar reales (formatos GNU y PAX) y maliciosos
import os, subprocess, tarfile, tempfile, io, sys
HERE = os.path.dirname(os.path.abspath(__file__)); CLI = '/tmp/tar_cli'
subprocess.check_call(['gcc', '-Wall', '-Wextra', '-o', CLI, os.path.join(HERE, 'tar_cli.c'), '-lz'])
fails = 0
def check(c, m):
    global fails; print(('  ok  ' if c else 'FALLA ') + m); fails += 0 if c else 1
def make(path, fmt, build):
    with tarfile.open(path, 'w:gz', format=fmt) as t: build(t)
def add(t, name, data=b'', mode=0o644, typ=tarfile.REGTYPE, link=''):
    i = tarfile.TarInfo(name); i.mode = mode; i.type = typ; i.linkname = link; i.size = len(data) if typ == tarfile.REGTYPE else 0; t.addfile(i, io.BytesIO(data) if typ == tarfile.REGTYPE else None)
def run(tgz, dest):
    r = subprocess.run([CLI, tgz, dest], capture_output=True, text=True); return r.stdout.strip()
longname = 'usr/share/' + '/'.join(['carpeta_larga_numero_%d' % i for i in range(8)]) + '/archivo.txt'
for fmt, nombre in ((tarfile.GNU_FORMAT, 'GNU'), (tarfile.PAX_FORMAT, 'PAX')):
    d = tempfile.mkdtemp(); tgz = d + '/a.tar.gz'
    def build(t):
        add(t, './', typ=tarfile.DIRTYPE, mode=0o755); add(t, 'bin/', typ=tarfile.DIRTYPE, mode=0o755)
        add(t, 'bin/busybox', b'#!binario\n' * 1000, mode=0o755); add(t, 'bin/sh', typ=tarfile.SYMTYPE, link='/bin/busybox')
        add(t, 'bin/ls', typ=tarfile.SYMTYPE, link='busybox'); add(t, 'etc/hola.txt', b'hola\n', mode=0o600)
        add(t, 'bin/copia', typ=tarfile.LNKTYPE, link='bin/busybox'); add(t, longname, b'nombre largo\n')
        add(t, 'vacio.txt', b'')
    make(tgz, fmt, build); out = d + '/rootfs'; res = run(tgz, out)
    check(res.startswith('OK:'), f'[{nombre}] extrae sin errores ({res})')
    check(os.path.getsize(out + '/bin/busybox') == 10000 and os.access(out + '/bin/busybox', os.X_OK), f'[{nombre}] archivo grande y ejecutable')
    check(os.readlink(out + '/bin/sh') == '/bin/busybox' and os.readlink(out + '/bin/ls') == 'busybox', f'[{nombre}] enlaces simbólicos absolutos y relativos intactos')
    check(open(out + '/bin/copia', 'rb').read() == open(out + '/bin/busybox', 'rb').read(), f'[{nombre}] hardlink resuelto')
    check(open(out + '/' + longname).read() == 'nombre largo\n', f'[{nombre}] ruta de más de 100 caracteres')
    check(oct(os.stat(out + '/etc/hola.txt').st_mode & 0o777) == '0o600' and open(out + '/etc/hola.txt').read() == 'hola\n', f'[{nombre}] permisos y contenido')
d = tempfile.mkdtemp(); tgz = d + '/mal.tar.gz'
make(tgz, tarfile.GNU_FORMAT, lambda t: (add(t, 'ok.txt', b'x'), add(t, '../escape.txt', b'MAL')))
res = run(tgz, d + '/r'); check(res.startswith('ERR:') and not os.path.exists(d + '/escape.txt'), f'rechaza ".." en la ruta ({res})')
d = tempfile.mkdtemp(); tgz = d + '/mal2.tar.gz'; fuera = tempfile.mkdtemp()
make(tgz, tarfile.GNU_FORMAT, lambda t: (add(t, 'enlace', typ=tarfile.SYMTYPE, link=fuera), add(t, 'enlace/pwned.txt', b'MAL')))
res = run(tgz, d + '/r'); check(res.startswith('ERR:') and not os.path.exists(fuera + '/pwned.txt'), f'rechaza escribir a través de un symlink ({res})')
d = tempfile.mkdtemp(); tgz = d + '/mal3.tar.gz'
make(tgz, tarfile.GNU_FORMAT, lambda t: add(t, '/etc/absoluta.txt', b'x')); out = d + '/r'; res = run(tgz, out)
check(res.startswith('OK:') and os.path.exists(out + '/etc/absoluta.txt'), f'ruta absoluta queda DENTRO del destino ({res})')
open(d + '/roto.tar.gz', 'wb').write(b'esto no es un tar'); res = run(d + '/roto.tar.gz', d + '/r2')
check(not res.startswith('OK:') or res == 'OK:0', f'archivo corrupto no se acepta como válido ({res})')
print('\nHAY FALLAS' if fails else '\nTodas las pruebas superadas'); sys.exit(1 if fails else 0)
