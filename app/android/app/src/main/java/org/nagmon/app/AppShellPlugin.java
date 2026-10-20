package org.nagmon.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * What the page needs from the app around it (src/platform/shell.ts):
 * the system's font size, which the page applies itself, and the moment
 * "who plays" is on the screen, for Android's own start time.
 */
@CapacitorPlugin(name = "AppShell")
public class AppShellPlugin extends Plugin {

    @PluginMethod
    public void fontScale(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", getContext().getResources().getConfiguration().fontScale);
        call.resolve(ret);
    }

    /**
     * Logged by the system as "Fully drawn org.nagmon.app/.MainActivity:
     * +N ms", the cold start time the emulator check reads.
     */
    @PluginMethod
    public void fullyDrawn(PluginCall call) {
        getActivity().runOnUiThread(() -> getActivity().reportFullyDrawn());
        call.resolve();
    }
}
