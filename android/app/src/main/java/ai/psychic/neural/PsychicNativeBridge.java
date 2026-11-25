package ai.psychic.neural;

import android.app.ActivityManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

public class PsychicNativeBridge {
    private final Context context;
    private final WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, HttpURLConnection> activeRequests = new ConcurrentHashMap<>();
    private final File rootDir;

    public PsychicNativeBridge(Context context, WebView webView) {
        this.context = context.getApplicationContext();
        this.webView = webView;
        File ext = this.context.getExternalFilesDir(null);
        this.rootDir = (ext != null) ? ext : this.context.getFilesDir();
        ensureBaseDirs();
    }

    private void ensureBaseDirs() {
        new File(rootDir, "PSYCHIC Workspace").mkdirs();
        new File(rootDir, "media/images").mkdirs();
        new File(rootDir, "media/music").mkdirs();
        new File(rootDir, "media/videos").mkdirs();
        new File(rootDir, "skills").mkdirs();
        new File(rootDir, "Documents").mkdirs();
        new File(rootDir, "Downloads").mkdirs();
    }

    private void emitEvent(JSONObject payload) {
        final String json = payload.toString();
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.__psychicNativeEvent && window.__psychicNativeEvent(" + json + ");",
                    null
                );
            }
        });
    }

    @JavascriptInterface
    public void streamHttp(
        final String reqId,
        final String urlStr,
        final String method,
        final String headersJson,
        final String body
    ) {
        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                activeRequests.put(reqId, conn);
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(25000);
                conn.setReadTimeout(180000);
                String verb = (method == null || method.isEmpty()) ? "GET" : method.toUpperCase();
                conn.setRequestMethod(verb);

                if (headersJson != null && !headersJson.isEmpty()) {
                    JSONObject headers = new JSONObject(headersJson);
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        String v = headers.optString(k, "");
                        if (!v.isEmpty()) {
                            conn.setRequestProperty(k, v);
                        }
                    }
                }

                if (body != null && !body.isEmpty() && !"GET".equals(verb) && !"HEAD".equals(verb)) {
                    conn.setDoOutput(true);
                    byte[] outBytes = body.getBytes(StandardCharsets.UTF_8);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(outBytes);
                        os.flush();
                    }
                }

                int status = conn.getResponseCode();
                String contentType = conn.getContentType();
                if (contentType == null) contentType = "";

                InputStream stream = (status >= 400) ? conn.getErrorStream() : conn.getInputStream();
                if (stream == null) {
                    JSONObject end = new JSONObject();
                    end.put("reqId", reqId);
                    end.put("event", status >= 400 ? "error" : "end");
                    end.put("status", status);
                    end.put("data", status >= 400 ? ("HTTP " + status) : "");
                    emitEvent(end);
                    return;
                }

                String lowerType = contentType.toLowerCase();
                boolean isBinary = lowerType.startsWith("image/")
                    || lowerType.startsWith("audio/")
                    || lowerType.startsWith("video/")
                    || lowerType.startsWith("application/octet-stream");

                if (status < 400 && isBinary) {
                    byte[] bytes = readAllBytes(stream);
                    String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                    String mime = contentType.split(";")[0].trim();
                    JSONObject bin = new JSONObject();
                    bin.put("reqId", reqId);
                    bin.put("event", "binary");
                    bin.put("status", status);
                    bin.put("mime", mime);
                    bin.put("data", b64);
                    emitEvent(bin);
                    return;
                }

                if (status >= 400) {
                    byte[] errBytes = readAllBytes(stream);
                    String errText = new String(errBytes, StandardCharsets.UTF_8);
                    JSONObject err = new JSONObject();
                    err.put("reqId", reqId);
                    err.put("event", "error");
                    err.put("status", status);
                    err.put("data", errText);
                    emitEvent(err);
                    return;
                }

                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    char[] buf = new char[2048];
                    int read;
                    while ((read = reader.read(buf)) != -1) {
                        JSONObject chunk = new JSONObject();
                        chunk.put("reqId", reqId);
                        chunk.put("event", "chunk");
                        chunk.put("status", status);
                        chunk.put("data", new String(buf, 0, read));
                        emitEvent(chunk);
                    }
                }

                JSONObject done = new JSONObject();
                done.put("reqId", reqId);
                done.put("event", "end");
                done.put("status", status);
                emitEvent(done);
            } catch (Exception e) {
                try {
                    JSONObject err = new JSONObject();
                    err.put("reqId", reqId);
                    err.put("event", "error");
                    err.put("status", 0);
                    err.put("data", e.getMessage() != null ? e.getMessage() : e.toString());
                    emitEvent(err);
                } catch (Exception ignored) {}
            } finally {
                activeRequests.remove(reqId);
                if (conn != null) {
                    try { conn.disconnect(); } catch (Exception ignored) {}
                }
            }
        });
    }

    @JavascriptInterface
    public void abortHttp(final String reqId) {
        final HttpURLConnection conn = activeRequests.remove(reqId);
        if (conn != null) {
            executor.execute(() -> {
                try { conn.disconnect(); } catch (Exception ignored) {}
            });
        }
    }

    @JavascriptInterface
    public void writeClipboard(final String text) {
        mainHandler.post(() -> {
            try {
                ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("PSYCHIC", text != null ? text : ""));
                }
            } catch (Exception ignored) {}
        });
    }

    @JavascriptInterface
    public String readClipboard() {
        final AtomicReference<String> result = new AtomicReference<>("");
        if (Looper.myLooper() == Looper.getMainLooper()) {
            result.set(readClipboardInternal());
            return result.get();
        }
        final Object lock = new Object();
        mainHandler.post(() -> {
            synchronized (lock) {
                result.set(readClipboardInternal());
                lock.notifyAll();
            }
        });
        synchronized (lock) {
            try { lock.wait(800); } catch (InterruptedException ignored) {}
        }
        return result.get();
    }

    private String readClipboardInternal() {
        try {
            ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip() != null && cm.getPrimaryClip().getItemCount() > 0) {
                CharSequence cs = cm.getPrimaryClip().getItemAt(0).coerceToText(context);
                return cs != null ? cs.toString() : "";
            }
        } catch (Exception ignored) {}
        return "";
    }

    @JavascriptInterface
    public boolean openExternal(final String url) {
        if (url == null || (!url.startsWith("http://") && !url.startsWith("https://"))) {
            return false;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String getDeviceStats() {
        try {
            JSONObject out = new JSONObject();
            String brand = Build.MANUFACTURER != null ? Build.MANUFACTURER : "Android";
            String model = Build.MODEL != null ? Build.MODEL : "Phone";
            out.put("hostname", (brand + " " + model).trim());
            out.put("platform", "android");
            out.put("release", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
            out.put("arch", Build.SUPPORTED_ABIS != null && Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "arm64-v8a");
            out.put("cores", Runtime.getRuntime().availableProcessors());
            out.put("cpuModel", Build.HARDWARE != null ? (brand + " · " + Build.HARDWARE) : model);

            ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
            if (am != null) am.getMemoryInfo(memInfo);
            long totalMem = memInfo.totalMem > 0 ? memInfo.totalMem : Runtime.getRuntime().maxMemory();
            long freeMem = memInfo.availMem > 0 ? memInfo.availMem : Runtime.getRuntime().freeMemory();
            long usedMem = Math.max(0L, totalMem - freeMem);
            int memPct = totalMem > 0 ? (int) Math.round((usedMem * 100.0) / totalMem) : 0;

            JSONObject mem = new JSONObject();
            mem.put("total", totalMem);
            mem.put("free", freeMem);
            mem.put("used", usedMem);
            mem.put("percent", memPct);
            out.put("memory", mem);

            StatFs statFs = new StatFs(rootDir.getAbsolutePath());
            long totalDisk = statFs.getTotalBytes();
            long freeDisk = statFs.getAvailableBytes();
            long usedDisk = Math.max(0L, totalDisk - freeDisk);
            int diskPct = totalDisk > 0 ? (int) Math.round((usedDisk * 100.0) / totalDisk) : 0;

            JSONObject disk = new JSONObject();
            disk.put("path", "/storage");
            disk.put("total", totalDisk);
            disk.put("free", freeDisk);
            disk.put("used", usedDisk);
            disk.put("percent", diskPct);
            JSONArray disks = new JSONArray();
            disks.put(disk);
            out.put("disks", disks);

            BatteryManager bm = (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
            if (bm != null) {
                int bat = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                if (bat >= 0 && bat <= 100) out.put("battery", bat);
            }

            JSONArray nets = new JSONArray();
            try {
                for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                    if (!nif.isUp() || nif.isLoopback()) continue;
                    for (InetAddress addr : Collections.list(nif.getInetAddresses())) {
                        if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                            JSONObject n = new JSONObject();
                            n.put("name", nif.getDisplayName());
                            n.put("address", addr.getHostAddress());
                            n.put("family", "IPv4");
                            nets.put(n);
                        }
                    }
                }
            } catch (Exception ignored) {}
            out.put("network", nets);
            return out.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private File resolveSafeFile(String rawPath) throws IOException {
        if (rawPath == null || rawPath.trim().isEmpty() || ".".equals(rawPath.trim())) {
            return new File(rootDir, "PSYCHIC Workspace").getCanonicalFile();
        }
        String p = rawPath.trim();
        File candidate = p.startsWith("/") ? new File(p) : new File(new File(rootDir, "PSYCHIC Workspace"), p);
        File rootCanon = rootDir.getCanonicalFile();
        File candCanon;
        try {
            candCanon = candidate.getCanonicalFile();
        } catch (IOException e) {
            candCanon = new File(rootCanon, p.replaceAll("^/+", "")).getCanonicalFile();
        }
        if (!candCanon.getPath().startsWith(rootCanon.getPath())) {
            // Map virtual paths like /workspace/... inside rootDir safely
            String rel = p.replaceAll("^/+", "");
            candCanon = new File(rootCanon, rel).getCanonicalFile();
            if (!candCanon.getPath().startsWith(rootCanon.getPath())) {
                throw new IOException("Доступ разрешён только внутри папки приложения");
            }
        }
        return candCanon;
    }

    @JavascriptInterface
    public String fsPaths() {
        try {
            ensureBaseDirs();
            JSONObject p = new JSONObject();
            String base = rootDir.getCanonicalPath();
            p.put("home", base);
            p.put("userData", base);
            p.put("config", base);
            p.put("workspace", new File(rootDir, "PSYCHIC Workspace").getCanonicalPath());
            p.put("media", new File(rootDir, "media").getCanonicalPath());
            p.put("images", new File(rootDir, "media/images").getCanonicalPath());
            p.put("music", new File(rootDir, "media/music").getCanonicalPath());
            p.put("musicLibrary", new File(rootDir, "media/music").getCanonicalPath());
            p.put("videos", new File(rootDir, "media/videos").getCanonicalPath());
            p.put("skills", new File(rootDir, "skills").getCanonicalPath());
            p.put("documents", new File(rootDir, "Documents").getCanonicalPath());
            p.put("downloads", new File(rootDir, "Downloads").getCanonicalPath());
            p.put("desktop", new File(rootDir, "PSYCHIC Workspace").getCanonicalPath());
            return p.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public String fsList(String dirPath, boolean showHidden) {
        try {
            File dir = resolveSafeFile(dirPath);
            JSONObject res = new JSONObject();
            res.put("path", dir.getAbsolutePath());
            JSONArray entries = new JSONArray();
            File[] children = dir.listFiles();
            if (children != null) {
                for (File f : children) {
                    if (!showHidden && f.getName().startsWith(".")) continue;
                    JSONObject item = new JSONObject();
                    item.put("name", f.getName());
                    item.put("path", f.getAbsolutePath());
                    item.put("type", f.isDirectory() ? "directory" : "file");
                    item.put("size", f.isFile() ? f.length() : 0);
                    item.put("modified", f.lastModified());
                    entries.put(item);
                }
            }
            res.put("entries", entries);
            return res.toString();
        } catch (Exception e) {
            return "{\"entries\":[]}";
        }
    }

    @JavascriptInterface
    public String fsReadText(String filePath) {
        try {
            File f = resolveSafeFile(filePath);
            if (!f.exists() || !f.isFile()) return "";
            try (InputStream is = new FileInputStream(f)) {
                return new String(readAllBytes(is), StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public boolean fsWriteText(String filePath, String content) {
        try {
            File f = resolveSafeFile(filePath);
            File parent = f.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            try (OutputStream os = new FileOutputStream(f, false)) {
                os.write((content != null ? content : "").getBytes(StandardCharsets.UTF_8));
                os.flush();
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String fsReadBase64(String filePath) {
        try {
            File f = resolveSafeFile(filePath);
            if (!f.exists() || !f.isFile()) return "";
            try (InputStream is = new FileInputStream(f)) {
                return Base64.encodeToString(readAllBytes(is), Base64.NO_WRAP);
            }
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public String fsWriteBase64(String filePath, String b64) {
        try {
            File f = resolveSafeFile(filePath);
            File parent = f.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            byte[] data = Base64.decode(b64, Base64.DEFAULT);
            try (OutputStream os = new FileOutputStream(f, false)) {
                os.write(data);
                os.flush();
            }
            return f.getAbsolutePath();
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public boolean fsMkdir(String dirPath) {
        try {
            File d = resolveSafeFile(dirPath);
            return d.exists() || d.mkdirs();
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean fsDelete(String targetPath) {
        try {
            File f = resolveSafeFile(targetPath);
            if (f.equals(rootDir.getCanonicalFile())) return false;
            return deleteRecursively(f);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean deleteRecursively(File f) {
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) {
                for (File k : kids) deleteRecursively(k);
            }
        }
        return !f.exists() || f.delete();
    }

    private static byte[] readAllBytes(InputStream is) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) != -1) {
            bos.write(buf, 0, n);
        }
        return bos.toByteArray();
    }
}
