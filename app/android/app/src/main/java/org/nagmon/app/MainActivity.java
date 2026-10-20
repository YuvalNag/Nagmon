package org.nagmon.app;

import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * The whole screen is the game: no status bar, no navigation bar, and
 * the page draws into the camera cutout too (the first emulator run had
 * a black strip at the cutout and both bars showing). A swipe from an
 * edge shows the bars for a moment.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "NagmonShell";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppShellPlugin.class);
        super.onCreate(savedInstanceState);
        // the emulator check fails on "recreated=true": the page was reloaded
        Log.i(TAG, "activity created, recreated=" + (savedInstanceState != null));
        // The WebView's own text zoom grew some text and not other, and
        // broke the screens at a large system font. The page reads the
        // system's font size itself and scales all its text evenly
        // (src/platform/shell.ts), up to 130%.
        getBridge().getWebView().getSettings().setTextZoom(100);
        // The game has one look: Android's dark mode must not darken the
        // page by itself (the page also says color-scheme: light).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(getBridge().getWebView().getSettings(), false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemBars();
        getBridge().addWebViewListener(new RendererGone());
    }

    /**
     * The page's renderer is a process of its own, and Android may end it
     * (for memory) or it may crash. Unhandled, the WebView then kills the
     * whole app, with no crash report and no message. Here the activity
     * starts again with a new WebView: the child is back on who-plays, the
     * data on disk. The emulator check fails on this line all the same.
     */
    private class RendererGone extends WebViewListener {
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            boolean crashed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail.didCrash();
            int priority = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? detail.rendererPriorityAtExit() : -1;
            Log.w(TAG, "the page's renderer is gone: crashed=" + crashed + " priorityAtExit=" + priority + "; starting the page again");
            runOnUiThread(MainActivity.this::recreate);
            return true;
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // handled here, not by a new activity (configChanges); the page
        // reads the font size again when it comes to the front
        Log.i(TAG, "configuration changed, the page stays: " + newConfig);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // the bars come back after a dialog or the share sheet
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat bars =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.systemBars());
    }
}
