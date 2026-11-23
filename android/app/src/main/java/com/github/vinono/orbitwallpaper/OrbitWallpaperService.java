package com.github.vinono.orbitwallpaper;

import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.service.wallpaper.WallpaperService;
import android.view.MotionEvent;
import android.view.SurfaceHolder;

/**
 * The live wallpaper: an offscreen web page, polled a few times a second and
 * blitted onto the wallpaper surface. Nothing here depends on a window, which
 * is what a wallpaper engine can never have.
 */
public class OrbitWallpaperService extends WallpaperService {

    @Override
    public Engine onCreateEngine() {
        return new ClockEngine();
    }

    private class ClockEngine extends Engine {
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
        private final Rect dst = new Rect();
        private WebScreen screen;
        private SharedPreferences prefs;
        private int fps = 2;
        private boolean visible = false;
        private boolean ticking = false;

        private final Runnable tick = new Runnable() {
            @Override
            public void run() {
                if (!visible || screen == null) {
                    ticking = false;
                    return;
                }
                Bitmap frame = screen.grab();
                if (frame != null) blit(frame);
                handler.postDelayed(this, Math.max(100, 1000 / fps));
            }
        };

        @Override
        public void onCreate(SurfaceHolder surfaceHolder) {
            super.onCreate(surfaceHolder);
            prefs = getSharedPreferences("orbit", MODE_PRIVATE);
            fps = prefs.getInt("fps", 2);
            screen = new WebScreen(OrbitWallpaperService.this);
            screen.setUrl(prefs.getString("url", null));
            setOffsetNotificationsEnabled(false);
        }

        @Override
        public void onDestroy() {
            handler.removeCallbacksAndMessages(null);
            if (screen != null) {
                screen.destroy();
                screen = null;
            }
            super.onDestroy();
        }

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height);
            if (screen != null) {
                screen.start(width, height, getResources().getDisplayMetrics().densityDpi);
            }
            startTicking();
        }

        @Override
        public void onVisibilityChanged(boolean isVisible) {
            super.onVisibilityChanged(isVisible);
            visible = isVisible;
            if (screen == null) return;
            if (isVisible) {
                screen.resume();
                startTicking();
            } else {
                handler.removeCallbacks(tick);
                ticking = false;
                screen.pause();
            }
        }

        @Override
        public void onTouchEvent(MotionEvent event) {
            if (screen != null) screen.touch(event);
            super.onTouchEvent(event);
        }

        private void startTicking() {
            if (ticking || !visible) return;
            ticking = true;
            handler.post(tick);
        }

        private void blit(Bitmap frame) {
            SurfaceHolder holder = getSurfaceHolder();
            Canvas canvas = null;
            try {
                canvas = holder.lockCanvas();
                if (canvas == null) return;
                canvas.drawColor(Color.BLACK);
                dst.set(0, 0, canvas.getWidth(), canvas.getHeight());
                canvas.drawBitmap(frame, null, dst, paint);
            } catch (Throwable ignored) {
                // A surface can disappear between lock and draw.
            } finally {
                if (canvas != null) {
                    try {
                        holder.unlockCanvasAndPost(canvas);
                    } catch (Throwable ignored) {
                    }
                }
            }
        }
    }
}
