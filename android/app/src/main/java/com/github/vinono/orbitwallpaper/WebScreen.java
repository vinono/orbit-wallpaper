package com.github.vinono.orbitwallpaper;

import android.app.Presentation;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ContextThemeWrapper;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.nio.ByteBuffer;

/**
 * Renders a web page offscreen.
 *
 * A WallpaperService has no window, so a plain View cannot paint. A private
 * virtual display gives the WebView a real window; its frames land in an
 * ImageReader, and the wallpaper blits the newest one onto the surface.
 *
 * If a device refuses to create the virtual display, we fall back to drawing
 * the WebView straight onto a software canvas.
 */
class WebScreen {
    private static final String TAG = "WebScreen";
    private static final String LOCAL_PAGE = "file:///android_asset/wallpaper.html";

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private WebView webView;
    private VirtualDisplay display;
    private Presentation presentation;
    private ImageReader reader;

    private int width = 1;
    private int height = 1;
    private int densityDpi = 320;

    private Bitmap frame;
    private Canvas frameCanvas;
    private ByteBuffer rowBuffer;
    private boolean softwareOnly = false;
    private String pendingUrl;

    WebScreen(Context context) {
        this.context = context;
    }

    /* ---------- setup ---------- */

    void setUrl(String url) {
        pendingUrl = url;
        handler.post(() -> {
            if (webView != null) webView.loadUrl(url == null ? LOCAL_PAGE : url);
        });
    }

    /** Called once the wallpaper surface has a size. */
    void start(int w, int h, int dpi) {
        if (w <= 0 || h <= 0) return;
        width = w;
        height = h;
        densityDpi = Math.max(160, dpi);
        handler.post(() -> {
            if (webView == null) createWebView(pendingUrl);
            else layoutWebView();
        });
    }

    void touch(MotionEvent event) {
        handler.post(() -> {
            if (webView == null) return;
            MotionEvent copy = MotionEvent.obtain(event);
            webView.dispatchTouchEvent(copy);
            copy.recycle();
        });
    }

    private WebSettings settings(WebView view) {
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        return s;
    }

    private void createWebView(String url) {
        String target = url == null || url.trim().isEmpty() ? LOCAL_PAGE : url;

        if (!softwareOnly) {
            try {
                reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3);
                DisplayManager dm = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
                display = dm.createVirtualDisplay(
                        "orbit-wallpaper", width, height, densityDpi, reader.getSurface(), 0);
                if (display == null) throw new IllegalStateException("no display");

                Context themed = new ContextThemeWrapper(context, android.R.style.Theme_Material_NoActionBar);
                presentation = new Presentation(themed, display.getDisplay());
                webView = new WebView(presentation.getContext());
                settings(webView);
                webView.setBackgroundColor(0xFF050807);
                webView.setWebViewClient(new BlockingClient(target));
                presentation.setContentView(webView, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                presentation.show();
                webView.loadUrl(target);
                Log.i(TAG, "virtual display " + width + "x" + height + " @" + densityDpi);
                return;
            } catch (Throwable t) {
                Log.w(TAG, "virtual display unavailable, falling back to software draw", t);
                releaseDisplay();
                softwareOnly = true;
            }
        }

        webView = new WebView(context);
        settings(webView);
        webView.setBackgroundColor(0xFF050807);
        webView.setWebViewClient(new BlockingClient(target));
        webView.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        layoutWebView();
        webView.loadUrl(target);
        Log.i(TAG, "software webview " + width + "x" + height);
    }

    private void layoutWebView() {
        if (webView == null) return;
        webView.measure(
                View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        webView.layout(0, 0, width, height);
    }

    /** Offline pages stay offline: the wallpaper never phones home. */
    private static class BlockingClient extends WebViewClient {
        private final byte[] empty = new byte[0];
        private final String page;

        BlockingClient(String page) {
            this.page = page;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            String u = request.getUrl().toString();
            boolean local = u.startsWith("file:") || u.startsWith("data:") || u.startsWith("about:");
            if (local) return null;
            if (page.startsWith("file:")) {
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(empty));
            }
            return null;
        }
    }

    /* ---------- frames ---------- */

    /** Newest frame as a Bitmap, or null when nothing new is ready. */
    Bitmap grab() {
        if (webView == null) return null;

        if (softwareOnly) {
            ensureFrame();
            frame.eraseColor(0xFF050807);
            webView.draw(frameCanvas);
            return frame;
        }

        if (reader == null) return null;
        Image image = null;
        try {
            image = reader.acquireLatestImage();
            if (image == null) return null;
            ensureFrame();
            copyImage(image, frame);
            return frame;
        } catch (Throwable t) {
            Log.w(TAG, "grab failed", t);
            return null;
        } finally {
            if (image != null) image.close();
        }
    }

    private void ensureFrame() {
        if (frame != null && frame.getWidth() == width && frame.getHeight() == height) return;
        frame = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        frameCanvas = new Canvas(frame);
    }

    private void copyImage(Image image, Bitmap target) {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int pixelStride = plane.getPixelStride();
        int rowStride = plane.getRowStride();
        int rowLength = width * pixelStride;

        if (rowStride == rowLength) {
            buffer.rewind();
            target.copyPixelsFromBuffer(buffer);
            return;
        }

        // Padded rows: repack into a tight buffer first.
        int size = rowLength * height;
        if (rowBuffer == null || rowBuffer.capacity() < size) rowBuffer = ByteBuffer.allocateDirect(size);
        rowBuffer.clear();
        byte[] row = new byte[rowStride];
        for (int y = 0; y < height; y++) {
            buffer.position(y * rowStride);
            buffer.get(row, 0, rowStride);
            rowBuffer.put(row, 0, rowLength);
        }
        rowBuffer.rewind();
        target.copyPixelsFromBuffer(rowBuffer);
    }

    /* ---------- lifecycle ---------- */

    void pause() {
        handler.post(() -> {
            if (webView != null) {
                webView.onPause();
                webView.pauseTimers();
            }
        });
    }

    void resume() {
        handler.post(() -> {
            if (webView != null) {
                webView.resumeTimers();
                webView.onResume();
            }
        });
    }

    void destroy() {
        handler.post(() -> {
            if (webView != null) {
                webView.stopLoading();
                webView.destroy();
                webView = null;
            }
            releaseDisplay();
        });
    }

    private void releaseDisplay() {
        if (presentation != null) {
            try {
                presentation.dismiss();
            } catch (Throwable ignored) {
            }
            presentation = null;
        }
        if (display != null) {
            display.release();
            display = null;
        }
        if (reader != null) {
            reader.close();
            reader = null;
        }
    }
}
