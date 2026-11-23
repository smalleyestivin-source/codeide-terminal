#ifndef PTY_ENGINE_H
#define PTY_ENGINE_H
/* Devuelve 0 si fue bien (y rellena fd y pid) o -errno si falló. */
int pty_spawn(const char *shell, const char *cwd, char *const argv[], char *const envp[], int cols, int rows, int *out_fd, int *out_pid);
int pty_resize(int fd, int cols, int rows);
int pty_kill(int pid, int sig);   /* envía la señal a todo el grupo de procesos */
int pty_wait(int pid);            /* código de salida, o 128+señal */
#endif
