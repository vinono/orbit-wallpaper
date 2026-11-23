package com.github.vinono.orbitwallpaper;

import android.app.WallpaperManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import java.io.ByteArrayInputStream;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "MainActivity";

    private EditText urlInput;
    private WebView preview;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        prefs = getSharedPreferences("orbit", MODE_PRIVATE);

        urlInput = findViewById(R.id.url);
        urlInput.setText(prefs.getString("url", ""));

        preview = findViewById(R.id.preview);
        WebSettings s = preview.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        preview.setBackgroundColor(0xFF050807);
        preview.setWebViewClient(new WebViewClient() {
            private final byte[] empty = new byte[0];

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String u = request.getUrl().toString();
                if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("about:")) return null;
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(empty));
            }
        });

        Button apply = findViewById(R.id.apply);
        Button setWallpaper = findViewById(R.id.set_wallpaper);
        TextView status = findViewById(R.id.status);

        apply.setOnClickListener(v -> {
            String url = urlInput.getText().toString().trim();
            if (!url.isEmpty() && !url.startsWith("file:") && !url.startsWith("http") && !url.startsWith("orbitwall")) {
                url = "https://" + url;
            }
            prefs.edit().putString("url", url).apply();
            loadPreview(url);
            status.setText(R.string.status_saved);
            Toast.makeText(this, R.string.status_saved, Toast.LENGTH_SHORT).show();
        });

        setWallpaper.setOnClickListener(v -> {
            String url = urlInput.getText().toString().trim();
            if (!url.isEmpty() && !url.startsWith("file:") && !url.startsWith("http") && !url.startsWith("orbitwall")) {
                url = "https://" + url;
            }
            prefs.edit().putString("url", url).apply();
            startWallpaperPicker();
        });

        handleDeepLink(getIntent());
        loadPreview(prefs.getString("url", null));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleDeepLink(intent);
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri data = intent.getData();
        if (!"orbitwall".equals(data.getScheme())) return;
        String u = data.getQueryParameter("u");
        if (u == null) return;
        // Only local files or this project's pages; anything else must be confirmed by the user in the field.
        urlInput.setText(u);
        prefs.edit().putString("url", u).apply();
        Log.i(TAG, "deep link url: " + u);
        Toast.makeText(this, R.string.status_saved, Toast.LENGTH_SHORT).show();
    }

    private void loadPreview(String url) {
        String target = url == null || url.trim().isEmpty()
                ? "file:///android_asset/wallpaper.html"
                : url;
        preview.loadUrl(target);
    }

    private void startWallpaperPicker() {
        Intent pick = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
        pick.putExtra(
                WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                new ComponentName(this, OrbitWallpaperService.class));
        try {
            startActivity(pick);
        } catch (ActivityNotFoundException e) {
            // Older devices only offer the full picker.
            try {
                startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER));
                Toast.makeText(this, R.string.status_pick, Toast.LENGTH_LONG).show();
            } catch (ActivityNotFoundException e2) {
                Toast.makeText(this, R.string.status_no_picker, Toast.LENGTH_LONG).show();
            }
        }
        hideKeyboard();
    }

    private void hideKeyboard() {
        View view = getCurrentFocus();
        if (view == null) return;
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(view.getWindowToken(), 0);
    }
}
