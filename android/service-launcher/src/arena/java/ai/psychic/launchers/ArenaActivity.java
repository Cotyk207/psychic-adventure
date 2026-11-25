package ai.psychic.launchers;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

/** An isolated browser for the live Arena website, not a copy of its backend or API. */
public final class ArenaActivity extends Activity {
    private static final int FILE_CHOOSER = 10;
    private static final int MEDIA_PERMISSIONS = 11;
    private FrameLayout container;
    private final List<WebView> windows = new ArrayList<>();
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest mediaRequest;
    private String[] mediaResources;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        container = new FrameLayout(this);
        setContentView(container);
        CookieManager.getInstance().setAcceptCookie(true);
        WebView web = createWebView();
        showWindow(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl(BuildConfig.SERVICE_URL);
    }

    private WebView createWebView() {
        WebView web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setAllowFileAccess(false);
        // Content URIs are needed for the Android document picker; file:// stays disabled.
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme())) return false;
                Toast.makeText(ArenaActivity.this, "Разрешены только защищённые HTTPS-ссылки", Toast.LENGTH_SHORT).show();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message result) {
                if (!userGesture || windows.size() >= 4) return false;
                WebView popup = createWebView();
                showWindow(popup);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) result.obj;
                transport.setWebView(popup);
                result.sendToTarget();
                return true;
            }
            @Override public void onCloseWindow(WebView window) { closeWindow(window); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_CHOOSER); return true; }
                catch (ActivityNotFoundException e) { fileCallback = null; callback.onReceiveValue(null); return false; }
            }
            @Override public void onPermissionRequest(PermissionRequest request) { requestMedia(request); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (mediaRequest == request) { mediaRequest = null; mediaResources = null; }
            }
        });
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (!"https".equalsIgnoreCase(Uri.parse(url).getScheme())) {
                Toast.makeText(this, "Этот тип загрузки не поддерживается", Toast.LENGTH_LONG).show();
                return;
            }
            try {
                DownloadManager.Request download = new DownloadManager.Request(Uri.parse(url));
                download.setMimeType(mimeType);
                download.setTitle(android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType));
                download.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(download);
                Toast.makeText(this, "Загрузка началась", Toast.LENGTH_SHORT).show();
            } catch (RuntimeException e) { Toast.makeText(this, "Не удалось начать загрузку", Toast.LENGTH_LONG).show(); }
        });
        return web;
    }

    private void showWindow(WebView web) {
        if (!windows.isEmpty()) windows.get(windows.size() - 1).setVisibility(android.view.View.GONE);
        windows.add(web);
        container.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }
    private void closeWindow(WebView web) {
        if (windows.size() <= 1 || !windows.remove(web)) return;
        container.removeView(web);
        web.destroy();
        windows.get(windows.size() - 1).setVisibility(android.view.View.VISIBLE);
    }
    private boolean isArena(Uri origin) {
        if (origin == null || !"https".equalsIgnoreCase(origin.getScheme()) || origin.getHost() == null) return false;
        String host = origin.getHost().toLowerCase(java.util.Locale.ROOT);
        return host.equals("arena.ai") || host.endsWith(".arena.ai");
    }
    private void requestMedia(PermissionRequest request) {
        if (!isArena(request.getOrigin()) || mediaRequest != null) { request.deny(); return; }
        List<String> permissions = new ArrayList<>();
        List<String> resources = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) { permissions.add(Manifest.permission.RECORD_AUDIO); resources.add(resource); }
            else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) { permissions.add(Manifest.permission.CAMERA); resources.add(resource); }
            else { request.deny(); return; }
        }
        if (resources.isEmpty()) { request.deny(); return; }
        mediaRequest = request;
        mediaResources = resources.toArray(new String[0]);
        new AlertDialog.Builder(this).setTitle("Доступ к устройству")
            .setMessage("Разрешить Arena.ai использовать микрофон и/или камеру по запросу сайта?")
            .setPositiveButton("Разрешить", (dialog, which) -> {
                if (mediaRequest != request) return;
                if (android.os.Build.VERSION.SDK_INT < 23) {
                    request.grant(mediaResources);
                    mediaRequest = null;
                    mediaResources = null;
                } else requestPermissions(permissions.toArray(new String[0]), MEDIA_PERMISSIONS);
            })
            .setNegativeButton("Отказать", (dialog, which) -> denyMedia())
            .setOnCancelListener(dialog -> denyMedia()).show();
    }
    private void denyMedia() {
        if (mediaRequest != null) mediaRequest.deny();
        mediaRequest = null;
        mediaResources = null;
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != MEDIA_PERMISSIONS || mediaRequest == null) return;
        boolean granted = results.length > 0;
        for (int result : results) granted &= result == PackageManager.PERMISSION_GRANTED;
        if (granted) mediaRequest.grant(mediaResources); else mediaRequest.deny();
        mediaRequest = null;
        mediaResources = null;
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FILE_CHOOSER && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }
    @Override public void onBackPressed() {
        WebView web = windows.get(windows.size() - 1);
        if (web.canGoBack()) web.goBack();
        else if (windows.size() > 1) closeWindow(web);
        else super.onBackPressed();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (!windows.isEmpty()) windows.get(0).saveState(state);
    }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        denyMedia();
        for (WebView web : windows) { container.removeView(web); web.destroy(); }
        windows.clear();
        super.onDestroy();
    }
}
