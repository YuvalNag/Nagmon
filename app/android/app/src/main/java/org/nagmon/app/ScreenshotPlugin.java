package org.nagmon.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import android.util.Log;
import android.view.PixelCopy;
import android.view.View;
import android.view.Window;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;

/**
 * A picture of the game's own window, for a parent's "something is wrong"
 * report (src/platform/screenshot.ts). The page cannot take it: the map
 * is WebGL in a WebView. PixelCopy copies what the window shows (the
 * WebView's drawing too) without any permission, and never the soft
 * keyboard, which is a window of its own. The window is not marked
 * secure: this is the app's own screen, kept on the phone and sent only
 * from the parents' area.
 *
 * `take()` resolves with `{ image }`, a base64 JPEG (at most 1280 px
 * wide, about 150 KB), or with no `image` when the phone cannot do it
 * (below Android 8, the window not drawn yet, no memory): the report is
 * then written without a picture. It never rejects.
 */
@CapacitorPlugin(name = "Screenshot")
public class ScreenshotPlugin extends Plugin {

    private static final String TAG = "NagmonShell";
    private static final int MAX_WIDTH = 1280;
    /** The first quality, then lower ones until the picture is small enough. */
    private static final int[] QUALITIES = {70, 55, 40};
    private static final int MAX_BYTES = 150_000;

    private HandlerThread thread;
    private Handler handler;

    @PluginMethod
    public void take(PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            resolveWithout(call, "no activity");
            return;
        }
        // PixelCopy.request(Window, ...) is API 26; the app's minSdk is 24
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // the window's views are read on the UI thread
            activity.runOnUiThread(() -> capture(activity, call));
        } else {
            resolveWithout(call, "api " + Build.VERSION.SDK_INT);
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private void capture(Activity activity, PluginCall call) {
        try {
            final Window window = activity.getWindow();
            final View decor = window.getDecorView();
            final int width = decor.getWidth();
            final int height = decor.getHeight();
            if (width <= 0 || height <= 0) {
                resolveWithout(call, "window not drawn");
                return;
            }
            final Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            // the copy answers on the screenshot thread, which also does the JPEG: not the UI thread
            PixelCopy.request(window, bitmap, copyResult -> {
                try {
                    if (copyResult != PixelCopy.SUCCESS) {
                        resolveWithout(call, "PixelCopy result " + copyResult);
                        return;
                    }
                    resolveWithImage(call, bitmap);
                } catch (Throwable e) {
                    resolveWithout(call, e.toString());
                } finally {
                    bitmap.recycle();
                }
            }, handler());
        } catch (Throwable e) {
            // an invalid surface (IllegalArgumentException) or no memory for the bitmap
            resolveWithout(call, e.toString());
        }
    }

    private void resolveWithImage(PluginCall call, Bitmap source) {
        Bitmap shown = source;
        if (source.getWidth() > MAX_WIDTH) {
            int scaledHeight = Math.max(1, Math.round(source.getHeight() * (float) MAX_WIDTH / source.getWidth()));
            shown = Bitmap.createScaledBitmap(source, MAX_WIDTH, scaledHeight, true);
        }
        byte[] bytes = null;
        for (int quality : QUALITIES) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (!shown.compress(Bitmap.CompressFormat.JPEG, quality, out)) {
                resolveWithout(call, "JPEG not written");
                return;
            }
            bytes = out.toByteArray();
            if (bytes.length <= MAX_BYTES) break;
        }
        JSObject result = new JSObject();
        result.put("image", Base64.encodeToString(bytes, Base64.NO_WRAP));
        result.put("width", shown.getWidth());
        result.put("height", shown.getHeight());
        result.put("bytes", bytes.length);
        if (shown != source) shown.recycle();
        call.resolve(result);
    }

    /** The page records the report without a picture. */
    private void resolveWithout(PluginCall call, String why) {
        Log.w(TAG, "no screenshot: " + why);
        call.resolve(new JSObject());
    }

    private synchronized Handler handler() {
        if (handler == null) {
            thread = new HandlerThread("nagmon-screenshot");
            thread.start();
            handler = new Handler(thread.getLooper());
        }
        return handler;
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            if (thread != null) thread.quitSafely();
            thread = null;
            handler = null;
        }
        super.handleOnDestroy();
    }
}
