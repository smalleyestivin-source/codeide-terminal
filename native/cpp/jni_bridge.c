#include <jni.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include "pty_engine.h"

#define FN(name) Java_com_codeide_terminal_NativePty_##name

JNIEXPORT jintArray JNICALL FN(spawn)(JNIEnv *env, jclass cls, jstring jshell, jstring jcwd, jobjectArray jenv, jint cols, jint rows) {
  const char *shell = (*env)->GetStringUTFChars(env, jshell, NULL);
  const char *cwd = jcwd ? (*env)->GetStringUTFChars(env, jcwd, NULL) : NULL;
  int n = jenv ? (*env)->GetArrayLength(env, jenv) : 0;
  char **envp = calloc((size_t)n + 1, sizeof(char *));
  for (int i = 0; i < n; i++) {
    jstring s = (jstring)(*env)->GetObjectArrayElement(env, jenv, i);
    const char *c = (*env)->GetStringUTFChars(env, s, NULL);
    envp[i] = strdup(c);
    (*env)->ReleaseStringUTFChars(env, s, c);
    (*env)->DeleteLocalRef(env, s);
  }
  char *argv[2] = { (char *)shell, NULL };
  int fd = -1, pid = -1;
  int rc = pty_spawn(shell, cwd, argv, envp, cols, rows, &fd, &pid);
  for (int i = 0; i < n; i++) free(envp[i]);
  free(envp);
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
