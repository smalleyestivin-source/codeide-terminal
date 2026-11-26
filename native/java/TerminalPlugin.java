package com.codeide.terminal;

import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "CodeIDETerminal")
public class TerminalPlugin extends Plugin {
    private static final int MAX_SESSIONS = 4;
    private static class Sess { int id, fd, pid; }
    private final Map<Integer, Sess> sessions = new ConcurrentHashMap<>();
    private final AtomicInteger seq = new AtomicInteger();

    /* ---------- rutas de Linux (PRoot + Alpine) ---------- */
    private File linuxDir() { return new File(getContext().getFilesDir(), "linux"); }
    private File alpineDir() { return new File(linuxDir(), "alpine"); }
    private String nativeDir() { return getContext().getApplicationInfo().nativeLibraryDir; }
    private String rootfsAsset() { return android.os.Process.is64Bit() ? "linux/rootfs-aarch64.tar.gz" : "linux/rootfs-armv7.tar.gz"; }
    private String readAsset(String p) {
        try (InputStream in = getContext().getAssets().open(p)) {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); byte[] x = new byte[1024]; int n;
            while ((n = in.read(x)) > 0 && b.size() < 2000) b.write(x, 0, n);
            return b.toString("UTF-8");
        } catch (IOException e) { return ""; }
    }
    private boolean hasAsset(String p) { try (InputStream in = getContext().getAssets().open(p)) { return true; } catch (IOException e) { return false; } }

    @PluginMethod
    public void linuxStatus(PluginCall call) {
        JSObject o = new JSObject();
        boolean rootfs = hasAsset(rootfsAsset()), proot = new File(nativeDir(), "libproot-xed.so").exists(), loader = new File(nativeDir(), "libproot.so").exists();
        o.put("bundled", rootfs && proot && loader);
        o.put("rootfs", rootfs); o.put("proot", proot); o.put("loader", loader);
        o.put("installed", new File(linuxDir(), ".installed").exists());
        o.put("fetchError", readAsset("linux/FETCH_ERROR.txt"));
        call.resolve(o);
    }

    @PluginMethod
    public void linuxInstall(final PluginCall call) {
        new Thread(() -> {
            try { installLinux(); call.resolve(); }
            catch (Exception e) { call.reject("No se pudo instalar Linux: " + e.getMessage()); }
        }, "linux-install").start();
    }

    private void installLinux() throws Exception {
        File lx = linuxDir();
        for (String n : new String[]{"alpine", "lib", "tmp", ".installed"}) deleteRec(new File(lx, n));   // no toca "public" (archivos del usuario)
        File alpine = alpineDir();
        if (!alpine.mkdirs()) throw new IOException("no se pudo crear " + alpine);
        File tmp = new File(getContext().getCacheDir(), "rootfs.tar.gz");
        try (InputStream in = getContext().getAssets().open(rootfsAsset()); OutputStream out = new FileOutputStream(tmp)) {
            byte[] b = new byte[65536]; int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
        }
        String r = NativePty.extractTar(tmp.getAbsolutePath(), alpine.getAbsolutePath());
        tmp.delete();
        if (!r.startsWith("OK:")) throw new IOException(r);
        for (String d : new String[]{"tmp", "lib", "public"}) new File(lx, d).mkdirs();
        File etc = new File(alpine, "etc");
        etc.mkdirs();
        try (OutputStream out = new FileOutputStream(new File(etc, "resolv.conf"))) { out.write("nameserver 8.8.8.8\nnameserver 1.1.1.1\n".getBytes(StandardCharsets.UTF_8)); }
        new File(lx, ".installed").createNewFile();
    }

    /* Borra sin seguir enlaces simbólicos (el rootfs tiene enlaces absolutos que apuntarían fuera). */
    private static void deleteRec(File f) {
        try {
            boolean link = OsConstants.S_ISLNK(Os.lstat(f.getPath()).st_mode);
            if (!link && f.isDirectory()) { File[] kids = f.listFiles(); if (kids != null) for (File k : kids) deleteRec(k); }
        } catch (ErrnoException e) { return; }
        f.delete();
    }

    /* PRoot busca libtalloc.so.2, pero Android solo permite lib*.so: enlaces en files/linux/lib. */
    private void prepareLibs() throws Exception {
        File lib = new File(linuxDir(), "lib");
        lib.mkdirs();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(getContext().getAssets().open("linux/libmap.txt"), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                int i = line.indexOf('=');
                if (i <= 0) continue;
                File l = new File(lib, line.substring(0, i));
                l.delete();
                Os.symlink(nativeDir() + "/" + line.substring(i + 1), l.getAbsolutePath());
            }
        }
    }

    private String[] linuxArgs() {
        String a = alpineDir().getAbsolutePath(), pub = new File(linuxDir(), "public").getAbsolutePath();
        return new String[]{
            "--kill-on-exit", "-0", "--link2symlink", "--sysvipc", "-L", "-r", a,
            "-b", "/dev", "-b", "/proc", "-b", "/sys", "-b", "/dev/urandom:/dev/random",
            "-b", pub + ":/root", "-b", pub + ":/home", "-w", "/root", "/bin/sh", "-l"
        };
    }

    private String[] linuxEnv() {
        File lx = linuxDir(); String nd = nativeDir();
        List<String> e = new ArrayList<>(Arrays.asList(
            "HOME=/root", "TERM=xterm-256color", "LANG=C.UTF-8",
            "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "PROOT_TMP_DIR=" + new File(lx, "tmp").getAbsolutePath(), "PROOT_LOADER=" + nd + "/libproot.so",
            "LD_LIBRARY_PATH=" + new File(lx, "lib").getAbsolutePath()));
        if (new File(nd, "libproot32.so").exists()) e.add("PROOT_LOADER32=" + nd + "/libproot32.so");
        return e.toArray(new String[0]);
    }

    /* ---------- sesiones ---------- */
    @PluginMethod
    public void start(PluginCall call) {
        if (sessions.size() >= MAX_SESSIONS) { call.reject("Demasiadas sesiones (máximo " + MAX_SESSIONS + ")"); return; }
        int cols = call.getInt("cols", 80), rows = call.getInt("rows", 24);
        String kind = call.getString("kind", "shell");
        String shell; String[] args; String cwd; String[] env;
        if ("linux".equals(kind)) {
            if (!new File(linuxDir(), ".installed").exists()) { call.reject("Linux no está instalado"); return; }
            try { prepareLibs(); } catch (Exception e) { call.reject("No se pudo preparar Linux: " + e.getMessage()); return; }
            shell = nativeDir() + "/libproot-xed.so"; args = linuxArgs(); cwd = linuxDir().getAbsolutePath(); env = linuxEnv();
        } else {
            File home = new File(getContext().getFilesDir(), "home");
            home.mkdirs();
            shell = "/system/bin/sh"; args = new String[0]; cwd = home.getAbsolutePath();
            env = new String[]{
                "HOME=" + home.getAbsolutePath(), "TERM=xterm-256color", "LANG=en_US.UTF-8",
                "PATH=/system/bin:/system/xbin", "SHELL=/system/bin/sh", "TMPDIR=" + getContext().getCacheDir().getAbsolutePath()
            };
        }
        int[] r = NativePty.spawn(shell, args, cwd, env, cols, rows);
        if (r[0] != 0) { call.reject("No se pudo iniciar la shell (errno " + (-r[0]) + ")"); return; }
        final Sess s = new Sess();
        s.id = seq.incrementAndGet(); s.fd = r[1]; s.pid = r[2];
        sessions.put(s.id, s);
        Thread t = new Thread(() -> {
            byte[] buf = new byte[4096]; int n;
            while ((n = NativePty.read(s.fd, buf)) > 0) {
                JSObject e = new JSObject();
                e.put("id", s.id);
                e.put("data", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP));
                notifyListeners("data", e);
            }
            int code = NativePty.waitFor(s.pid);
            sessions.remove(s.id);
            NativePty.close(s.fd);
            JSObject e = new JSObject();
            e.put("id", s.id); e.put("code", code);
            notifyListeners("exit", e);
        }, "pty-" + s.id);
        t.setDaemon(true);
        t.start();
        JSObject out = new JSObject();
        out.put("id", s.id);
        call.resolve(out);
    }

    @PluginMethod
    public void write(PluginCall call) {
        Sess s = sessions.get(call.getInt("id", -1));
        String data = call.getString("data", "");
        if (s == null) { call.reject("Sesión no encontrada"); return; }
        byte[] b = data.getBytes(StandardCharsets.UTF_8);
        NativePty.write(s.fd, b, b.length);
        call.resolve();
    }

    @PluginMethod
    public void resize(PluginCall call) {
        Sess s = sessions.get(call.getInt("id", -1));
        if (s != null) NativePty.resize(s.fd, call.getInt("cols", 80), call.getInt("rows", 24));
        call.resolve();
    }

    @PluginMethod
    public void kill(PluginCall call) {
        Sess s = sessions.get(call.getInt("id", -1));
        if (s != null) stop(s);
        call.resolve();
    }

    private void stop(final Sess s) {
        NativePty.kill(s.pid, 1);                      // SIGHUP al grupo
        new Thread(() -> {
            try { Thread.sleep(1000); } catch (InterruptedException ignored) {}
            if (sessions.containsKey(s.id)) NativePty.kill(s.pid, 9);   // SIGKILL si sigue vivo
        }).start();
    }

    @Override
    protected void handleOnDestroy() {
        for (Sess s : sessions.values()) NativePty.kill(s.pid, 9);
    }
}
