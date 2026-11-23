#define _GNU_SOURCE
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <signal.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include "pty_engine.h"

int pty_spawn(const char *shell, const char *cwd, char *const argv[], char *const envp[], int cols, int rows, int *out_fd, int *out_pid) {
  int m = posix_openpt(O_RDWR | O_NOCTTY);
  if (m < 0) return -errno;
  if (grantpt(m) < 0 || unlockpt(m) < 0) { int e = errno; close(m); return -e; }
  char sname[128];
  if (ptsname_r(m, sname, sizeof sname) != 0) { int e = errno; close(m); return -e; }
  struct winsize ws; memset(&ws, 0, sizeof ws); ws.ws_row = (unsigned short)rows; ws.ws_col = (unsigned short)cols;
  ioctl(m, TIOCSWINSZ, &ws);
  fcntl(m, F_SETFD, FD_CLOEXEC);
  pid_t pid = fork();
  if (pid < 0) { int e = errno; close(m); return -e; }
  if (pid == 0) {                       /* hijo: solo funciones seguras entre fork y exec */
    setsid();
    int s = open(sname, O_RDWR);
    if (s < 0) _exit(127);
    ioctl(s, TIOCSCTTY, 0);
    dup2(s, 0); dup2(s, 1); dup2(s, 2);
    for (int fd = 3; fd < 256; fd++) close(fd);
    if (cwd && chdir(cwd) != 0) { /* si falla, sigue en el directorio actual */ }
    execve(shell, argv, envp);
    _exit(127);
  }
  *out_fd = m; *out_pid = (int)pid;
  return 0;
}
int pty_resize(int fd, int cols, int rows) {
  struct winsize ws; memset(&ws, 0, sizeof ws); ws.ws_row = (unsigned short)rows; ws.ws_col = (unsigned short)cols;
  return ioctl(fd, TIOCSWINSZ, &ws);
}
int pty_kill(int pid, int sig) { return kill(-pid, sig); }
int pty_wait(int pid) {
  int st = 0; pid_t r;
  do { r = waitpid(pid, &st, 0); } while (r < 0 && errno == EINTR);
  if (r < 0) return -1;
  if (WIFEXITED(st)) return WEXITSTATUS(st);
  if (WIFSIGNALED(st)) return 128 + WTERMSIG(st);
  return -1;
}
