#include <jni.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include "pty_engine.h"
#include "tar_extract.h"

#define FN(name) Java_com_codeide_terminal_NativePty_##name

/* Convierte String[] en un arreglo de char* terminado en NULL; 'first' (opcional) va en la posición 0. */
static char **jstrs(JNIEnv *env, jobjectArray a, const char *first, int *count) {
  int n = a ? (*env)->GetArrayLength(env, a) : 0, off = first ? 1 : 0;
  char **v = calloc((size_t)n + (size_t)off + 1, sizeof(char *));
  if (first) v[0] = strdup(first);
  for (int i = 0; i < n; i++) {
    jstring s = (jstring)(*env)->GetObjectArrayElement(env, a, i);
    const char *c = (*env)->GetStringUTFChars(env, s, NULL);
    v[i + off] = strdup(c);
    (*env)->ReleaseStringUTFChars(env, s, c);
    (*env)->DeleteLocalRef(env, s);
  }
  *count = n + off;
  return v;
}
static void jfree(char **v, int n) { for (int i = 0; i < n; i++) free(v[i]); free(v); }

JNIEXPORT jintArray JNICALL FN(spawn)(JNIEnv *env, jclass cls, jstring jshell, jobjectArray jargs, jstring jcwd, jobjectArray jenv, jint cols, jint rows) {
  const char *shell = (*env)->GetStringUTFChars(env, jshell, NULL);
  const char *cwd = jcwd ? (*env)->GetStringUTFChars(env, jcwd, NULL) : NULL;
  int na = 0, ne = 0;
  char **argv = jstrs(env, jargs, shell, &na), **envp = jstrs(env, jenv, NULL, &ne);
  int fd = -1, pid = -1;
  int rc = pty_spawn(shell, cwd, argv, envp, cols, rows, &fd, &pid);
  jfree(argv, na); jfree(envp, ne);
  (*env)->ReleaseStringUTFChars(env, jshell, shell);
  if (cwd) (*env)->ReleaseStringUTFChars(env, jcwd, cwd);
  jint v[3] = { rc, fd, pid };
  jintArray out = (*env)->NewIntArray(env, 3);
  (*env)->SetIntArrayRegion(env, out, 0, 3, v);
  return out;
}
JNIEXPORT jint JNICALL FN(read)(JNIEnv *env, jclass cls, jint fd, jbyteArray buf) {
  jbyte tmp[4096]; jsize len = (*env)->GetArrayLength(env, buf); if (len > 4096) len = 4096;
  ssize_t n; do { n = read(fd, tmp, (size_t)len); } while (n < 0 && errno == EINTR);
  if (n > 0) (*env)->SetByteArrayRegion(env, buf, 0, (jsize)n, tmp);
  return (jint)n;
}
JNIEXPORT jint JNICALL FN(write)(JNIEnv *env, jclass cls, jint fd, jbyteArray buf, jint len) {
  jbyte *p = (*env)->GetByteArrayElements(env, buf, NULL); int done = 0;
  while (done < len) { ssize_t w = write(fd, p + done, (size_t)(len - done)); if (w < 0) { if (errno == EINTR) continue; break; } done += (int)w; }
  (*env)->ReleaseByteArrayElements(env, buf, p, JNI_ABORT);
  return done;
}
JNIEXPORT jint JNICALL FN(resize)(JNIEnv *env, jclass cls, jint fd, jint cols, jint rows) { return pty_resize(fd, cols, rows); }
JNIEXPORT jint JNICALL FN(kill)(JNIEnv *env, jclass cls, jint pid, jint sig) { return pty_kill(pid, sig); }
JNIEXPORT jint JNICALL FN(waitFor)(JNIEnv *env, jclass cls, jint pid) { return pty_wait(pid); }
JNIEXPORT jint JNICALL FN(close)(JNIEnv *env, jclass cls, jint fd) { return close(fd); }

/* Devuelve "OK:<entradas>" o "ERR:<motivo>". */
JNIEXPORT jstring JNICALL FN(extractTar)(JNIEnv *env, jclass cls, jstring jgz, jstring jdest) {
  const char *gz = (*env)->GetStringUTFChars(env, jgz, NULL), *dest = (*env)->GetStringUTFChars(env, jdest, NULL);
  char err[256] = "", msg[300];
  int n = tar_extract_gz(gz, dest, err, sizeof err);
  (*env)->ReleaseStringUTFChars(env, jgz, gz); (*env)->ReleaseStringUTFChars(env, jdest, dest);
  if (n >= 0) snprintf(msg, sizeof msg, "OK:%d", n); else snprintf(msg, sizeof msg, "ERR:%s", err);
  return (*env)->NewStringUTF(env, msg);
}
