/* gcc -o /tmp/test_pty tests/native/test_pty.c && /tmp/test_pty   (prueba el motor PTY en Linux; NO es una prueba en Android) */
#define _GNU_SOURCE
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <poll.h>
#include "../../native/cpp/pty_engine.c"
static int fails = 0;
#define CHECK(c, m) do { if (c) printf("  ok  %s\n", m); else { printf("FALLA %s\n", m); fails++; } } while (0)
static void readall(int fd, char *buf, int cap, int ms) { int n = 0; struct pollfd p = { fd, POLLIN, 0 }; while (n < cap - 1 && poll(&p, 1, ms) > 0) { int r = (int)read(fd, buf + n, cap - 1 - n); if (r <= 0) break; n += r; } buf[n] = 0; }
int main(void) {
  char *argv[] = { "/bin/sh", NULL }; char *envp[] = { "TERM=xterm", "PATH=/usr/bin:/bin", "HOME=/tmp", NULL };
  int fd, pid, rc = pty_spawn("/bin/sh", "/tmp", argv, envp, 100, 30, &fd, &pid);
  CHECK(rc == 0, "pty_spawn devuelve 0");
  const char *c1 = "echo hola-pty; pwd; stty size\n"; write(fd, c1, strlen(c1));
  char buf[8192]; readall(fd, buf, sizeof buf, 600);
  CHECK(strstr(buf, "hola-pty\r\n/tmp\r\n30 100\r\n") != NULL, "ejecuta comandos, respeta el directorio y el tamaño inicial 30x100");
  pty_resize(fd, 50, 40); const char *c2 = "stty size\n"; write(fd, c2, strlen(c2)); readall(fd, buf, sizeof buf, 600);
  CHECK(strstr(buf, "40 50\r\n") != NULL, "resize cambia el tamaño a 40x50");
  const char *c3 = "sleep 100\n"; write(fd, c3, strlen(c3)); usleep(300000);
  pty_kill(pid, SIGKILL);
  CHECK(pty_wait(pid) == 137, "kill detiene el grupo de procesos (137 = SIGKILL)");
  close(fd);
  int fd2, pid2; char *argv2[] = { "/bin/sh", "-c", "exit 7", NULL };
  pty_spawn("/bin/sh", "/tmp", argv2, envp, 80, 24, &fd2, &pid2);
  CHECK(pty_wait(pid2) == 7, "devuelve el código de salida real (7)");
  close(fd2);
  CHECK(pty_spawn("/no/existe", NULL, argv, envp, 80, 24, &fd2, &pid2) == 0 && pty_wait(pid2) == 127, "shell inexistente termina con 127 (no se cuelga)");
  close(fd2);
  printf(fails ? "\nHAY FALLAS\n" : "\nTodas las pruebas superadas\n"); return fails ? 1 : 0;
}
