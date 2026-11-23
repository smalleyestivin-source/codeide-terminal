package com.codeide.terminal;

final class NativePty {
    static { System.loadLibrary("codeide_pty"); }
    static native int[] spawn(String shell, String cwd, String[] env, int cols, int rows); // {rc, fd, pid}
    static native int read(int fd, byte[] buf);
    static native int write(int fd, byte[] buf, int len);
    static native int resize(int fd, int cols, int rows);
    static native int kill(int pid, int sig);
    static native int waitFor(int pid);
    static native int close(int fd);
}
