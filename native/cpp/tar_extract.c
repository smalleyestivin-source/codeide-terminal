#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <unistd.h>
#include <sys/stat.h>
#include <zlib.h>
#include "tar_extract.h"

static int rd(gzFile f, void *buf, unsigned n) { unsigned got = 0; while (got < n) { int r = gzread(f, (char *)buf + got, n - got); if (r <= 0) return -1; got += (unsigned)r; } return 0; }
static int skip(gzFile f, long n) { char tmp[4096]; while (n > 0) { unsigned c = n > 4096 ? 4096 : (unsigned)n; if (rd(f, tmp, c)) return -1; n -= c; } return 0; }
static long num(const char *p, int n) {
  if ((unsigned char)p[0] & 0x80) { long v = (unsigned char)p[0] & 0x7f; for (int i = 1; i < n; i++) v = (v << 8) | (unsigned char)p[i]; return v; }
  long v = 0; int i = 0; while (i < n && p[i] == ' ') i++;
  for (; i < n && p[i] >= '0' && p[i] <= '7'; i++) v = v * 8 + (p[i] - '0');
  return v;
}
static int clean_name(const char *in, char *out, size_t cap) {
  while (in[0] == '.' && in[1] == '/') in += 2;
  while (*in == '/') in++;
  if (strlen(in) >= cap) return -1;
  strcpy(out, in);
  size_t n = strlen(out); while (n > 0 && out[n - 1] == '/') out[--n] = 0;
  if (n == 1 && out[0] == '.') out[0] = 0;
  const char *p = out;
  while (*p) { const char *s = p; while (*p && *p != '/') p++; if (p - s == 2 && s[0] == '.' && s[1] == '.') return -1; if (*p) p++; }
  return 0;
}
/* Ningún componente intermedio puede ser un enlace simbólico (evita escribir fuera de dest). */
static int parents_ok(const char *dest, const char *rel) {
  char path[PATH_MAX]; size_t dl = strlen(dest); if (dl >= PATH_MAX) return -1; memcpy(path, dest, dl + 1);
  const char *p = rel;
  while (*p) {
    const char *s = p; while (*p && *p != '/') p++;
    if (!*p) break;
    size_t len = (size_t)(p - s); if (dl + 1 + len >= PATH_MAX) return -1;
    path[dl++] = '/'; memcpy(path + dl, s, len); dl += len; path[dl] = 0;
    struct stat st; if (lstat(path, &st) == 0 && S_ISLNK(st.st_mode)) return -1;
    p++;
  }
  return 0;
}
static void mkparents(char *path) { for (char *p = path + 1; *p; p++) if (*p == '/') { *p = 0; mkdir(path, 0755); *p = '/'; } }
static int copy_file(const char *from, const char *to, int mode) {
  int a = open(from, O_RDONLY); if (a < 0) return -1; int b = open(to, O_WRONLY | O_CREAT | O_TRUNC, mode | 0600); if (b < 0) { close(a); return -1; }
  char buf[8192]; ssize_t n; int rc = 0; while ((n = read(a, buf, sizeof buf)) > 0) if (write(b, buf, (size_t)n) != n) { rc = -1; break; }
  close(a); close(b); return rc;
}
static void pax(const char *d, long n, char *ln, char *ll, int *hl, int *hk) {
  long pos = 0;
  while (pos < n) {
    long len = 0, i = pos; while (i < n && d[i] >= '0' && d[i] <= '9') len = len * 10 + (d[i++] - '0');
    if (len <= 0 || pos + len > n || i >= n || d[i] != ' ') return;
    const char *kv = d + i + 1; long kvlen = len - (i + 1 - pos) - 1;      /* sin el \n final */
    const char *eq = kvlen > 0 ? memchr(kv, '=', (size_t)kvlen) : NULL;
    if (eq) {
      long kl = eq - kv, vl = kvlen - kl - 1; const char *val = eq + 1;
      if (kl == 4 && !memcmp(kv, "path", 4) && vl >= 0 && vl < PATH_MAX) { memcpy(ln, val, (size_t)vl); ln[vl] = 0; *hl = 1; }
      else if (kl == 8 && !memcmp(kv, "linkpath", 8) && vl >= 0 && vl < PATH_MAX) { memcpy(ll, val, (size_t)vl); ll[vl] = 0; *hk = 1; }
    }
    pos += len;
  }
}

int tar_extract_gz(const char *gzpath, const char *dest, char *err, size_t errlen) {
  gzFile f = gzopen(gzpath, "rb");
  if (!f) { snprintf(err, errlen, "no se pudo abrir %s", gzpath); return -1; }
  char hdr[512], ln[PATH_MAX] = "", ll[PATH_MAX] = ""; int hl = 0, hk = 0, count = 0;
  mkdir(dest, 0755);
  for (;;) {
    if (rd(f, hdr, 512) || hdr[0] == 0) break;
    long size = num(hdr + 124, 12); char type = hdr[156]; int mode = (int)num(hdr + 100, 8) & 0777;
    long pad = (512 - size % 512) % 512;
    if (type == 'L' || type == 'K' || type == 'x' || type == 'g') {
      if (size < 0 || size > 1 << 20) { snprintf(err, errlen, "cabecera extendida demasiado grande"); gzclose(f); return -1; }
      char *d = malloc((size_t)size + 1); if (!d || rd(f, d, (unsigned)size) || skip(f, pad)) { free(d); snprintf(err, errlen, "tar truncado"); gzclose(f); return -1; }
      d[size] = 0;
      if (type == 'L' && size < PATH_MAX) { strcpy(ln, d); hl = 1; }
      else if (type == 'K' && size < PATH_MAX) { strcpy(ll, d); hk = 1; }
      else if (type == 'x') pax(d, size, ln, ll, &hl, &hk);
      free(d); continue;
    }
    char raw[PATH_MAX], rawl[PATH_MAX];
    if (hl) strcpy(raw, ln); else { char nm[101], pf[156]; memcpy(nm, hdr, 100); nm[100] = 0; memcpy(pf, hdr + 345, 155); pf[155] = 0;
      if (!memcmp(hdr + 257, "ustar", 5) && pf[0]) snprintf(raw, sizeof raw, "%s/%s", pf, nm); else snprintf(raw, sizeof raw, "%s", nm); }
    if (hk) strcpy(rawl, ll); else { memcpy(rawl, hdr + 157, 100); rawl[100] = 0; }
    hl = hk = 0;
    char rel[PATH_MAX];
    if (clean_name(raw, rel, sizeof rel)) { snprintf(err, errlen, "entrada rechazada: %.200s", raw); gzclose(f); return -1; }
    if (!rel[0]) { if (skip(f, size + pad)) break; continue; }
    if (parents_ok(dest, rel)) { snprintf(err, errlen, "entrada a través de enlace simbólico: %.200s", rel); gzclose(f); return -1; }
    char full[PATH_MAX]; if ((size_t)snprintf(full, sizeof full, "%s/%s", dest, rel) >= sizeof full) { snprintf(err, errlen, "ruta demasiado larga"); gzclose(f); return -1; }
    mkparents(full);
    if (type == '5') { mkdir(full, 0755); chmod(full, (mode_t)(mode | 0700)); count++; }
    else if (type == '2') { unlink(full); if (symlink(rawl, full)) { snprintf(err, errlen, "symlink %.150s: %s", rel, strerror(errno)); gzclose(f); return -1; } count++; }
    else if (type == '1') {
      char tr[PATH_MAX], tf[PATH_MAX];
      if (clean_name(rawl, tr, sizeof tr) || snprintf(tf, sizeof tf, "%s/%s", dest, tr) >= (int)sizeof tf) { snprintf(err, errlen, "hardlink rechazado: %.200s", rawl); gzclose(f); return -1; }
      unlink(full); if (link(tf, full) && copy_file(tf, full, mode)) { snprintf(err, errlen, "hardlink %.150s: %s", rel, strerror(errno)); gzclose(f); return -1; } count++;
    }
    else if (type == '0' || type == 0 || type == '7') {
      unlink(full); int fd = open(full, O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW, mode | 0600);
      if (fd < 0) { snprintf(err, errlen, "crear %.150s: %s", rel, strerror(errno)); gzclose(f); return -1; }
      long left = size; char buf[8192];
      while (left > 0) { unsigned c = left > (long)sizeof buf ? (unsigned)sizeof buf : (unsigned)left; if (rd(f, buf, c) || write(fd, buf, c) != (ssize_t)c) { close(fd); snprintf(err, errlen, "escribir %.150s", rel); gzclose(f); return -1; } left -= c; }
      close(fd); chmod(full, (mode_t)(mode | 0600)); if (skip(f, pad)) break; count++;
    }
    else { if (skip(f, size + pad)) break; }    /* dispositivos, fifos...: se omiten */
  }
  gzclose(f); err[0] = 0; return count;
}
