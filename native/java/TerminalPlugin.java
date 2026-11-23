package com.codeide.terminal;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "CodeIDETerminal")
public class TerminalPlugin extends Plugin {
    private static final int MAX_SESSIONS = 4;
    private static class Sess { int id, fd, pid; }
    private final Map<Integer, Sess> sessions = new ConcurrentHashMap<>();
    private final AtomicInteger seq = new AtomicInteger();

    @PluginMethod
    public void start(PluginCall call) {
        if (sessions.size() >= MAX_SESSIONS) { call.reject("Demasiadas sesiones (máximo " + MAX_SESSIONS + ")"); return; }
        int cols = call.getInt("cols", 80), rows = call.getInt("rows", 24);
        File home = new File(getContext().getFilesDir(), "home");
        home.mkdirs();
        String[] env = {
            "HOME=" + home.getAbsolutePath(), "TERM=xterm-256color", "LANG=en_US.UTF-8",
            "PATH=/system/bin:/system/xbin", "SHELL=/system/bin/sh", "TMPDIR=" + getContext().getCacheDir().getAbsolutePath()
        };
        int[] r = NativePty.spawn("/system/bin/sh", home.getAbsolutePath(), env, cols, rows);
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
