/**
 * A small DevTools client for the app's WebView on a phone or emulator.
 * Playwright's own Android and CDP modes did not attach to Capacitor's
 * WebView, so this speaks the protocol directly: read the page with
 * Runtime.evaluate, touch it with Input.dispatchTouchEvent (real touch
 * events, the way a finger arrives).
 */
import { execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class WebViewPage {
  #ws;
  #next = 1;
  #waiting = new Map();

  static async attach(pkg, { port = 9222, timeoutMs = 60_000 } = {}) {
    const adb = (...a) => execFileSync("adb", a, { encoding: "utf8" }).trim();
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const pid = adb("shell", "pidof", pkg);
      if (pid && adb("shell", "cat", "/proc/net/unix").includes(`webview_devtools_remote_${pid}`)) {
        adb("forward", `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
        const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
        if (page) {
          const self = new WebViewPage();
          await self.#open(page.webSocketDebuggerUrl);
          return self;
        }
      }
      await sleep(1000);
    }
    throw new Error(`no WebView DevTools page for ${pkg}`);
  }

  #open(url) {
    return new Promise((resolve, reject) => {
      this.#ws = new WebSocket(url);
      this.#ws.onopen = () => resolve();
      this.#ws.onerror = (e) => reject(new Error(`DevTools socket: ${e.message ?? e.type}`));
      this.#ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        const done = this.#waiting.get(msg.id);
        if (!done) return;
        this.#waiting.delete(msg.id);
        if (msg.error) done.reject(new Error(msg.error.message));
        else done.resolve(msg.result);
      };
    });
  }

  send(method, params = {}) {
    const id = this.#next++;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.#waiting.set(id, { resolve, reject }));
  }

  /** Runs an expression in the page and returns its (JSON) value. */
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }

  /** Waits until the expression is truthy. */
  async waitFor(expression, { timeoutMs = 15_000, what = expression } = {}) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await this.eval(`Boolean(${expression})`)) return;
      await sleep(100);
    }
    throw new Error(`timed out waiting for: ${what}`);
  }

  /** A finger on the element's middle, held like a child's tap. */
  async touch(selector, holdMs = 120) {
    const box = await this.eval(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!box) throw new Error(`nothing to touch: ${selector}`);
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [box] });
    await sleep(holdMs);
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  close() {
    this.#ws?.close();
  }
}
