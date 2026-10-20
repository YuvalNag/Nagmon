/**
 * A small DevTools client for the app's WebView on a phone or emulator.
 * Playwright's own Android and CDP modes did not attach to Capacitor's
 * WebView, so this speaks the protocol directly: read the page with
 * Runtime.evaluate, touch it with Input.dispatchTouchEvent (real touch
 * events, the way a finger arrives).
 */
import { execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** No DevTools call, adb call or socket open may wait longer than this. */
export const CALL_TIMEOUT_MS = 20_000;

/** adb, with a time limit; "" when it fails (pidof exits 1 while the app is still starting). */
function adbOrEmpty(...a) {
  try {
    return execFileSync("adb", a, { encoding: "utf8", timeout: CALL_TIMEOUT_MS }).trim();
  } catch {
    return "";
  }
}

/** `promise`, or a clear error after `ms`: nothing here may hang the run. */
function within(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DevTools: ${what} did not answer within ${ms} ms`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** A dropped or closed socket, which one reconnect may fix. */
class SocketDropped extends Error {}

/** Chromium's notes when WebGL is drawn in software: not the app's (tests/e2e/fixtures.ts). */
export const ALLOWED = [/GPU stall due to ReadPixels/, /GL Driver Message/];

export class WebViewPage {
  #ws = null;
  #next = 1;
  #waiting = new Map();
  #pkg;
  #port;
  #seen = new Set();
  /** The app's process the socket belongs to, now and when first opened. */
  pid = "";
  firstPid = "";
  /** How often the socket dropped and was opened again. */
  reconnects = 0;
  /** Uncaught errors and console errors and warnings, as the page reported them. */
  problems = [];

  constructor(pkg, port) {
    this.#pkg = pkg;
    this.#port = port;
  }

  static async attach(pkg, { port = 9222, timeoutMs = 60_000 } = {}) {
    const self = new WebViewPage(pkg, port);
    await self.#connect(timeoutMs);
    return self;
  }

  /**
   * Finds the app's WebView socket (`webview_devtools_remote_<pid>`; the
   * pid is new after every start), forwards it, and opens its page.
   */
  async #connect(timeoutMs) {
    const end = Date.now() + timeoutMs;
    let pid = "";
    let last = "";
    while (Date.now() < end) {
      pid = adbOrEmpty("shell", "pidof", this.#pkg);
      if (pid && adbOrEmpty("shell", "cat", "/proc/net/unix").includes(`webview_devtools_remote_${pid}`)) {
        try {
          adbOrEmpty("forward", `tcp:${this.#port}`, `localabstract:webview_devtools_remote_${pid}`);
          const res = await fetch(`http://127.0.0.1:${this.#port}/json`, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
          const pages = await res.json();
          const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
          if (page) {
            await within(this.#open(page.webSocketDebuggerUrl), CALL_TIMEOUT_MS, "opening the socket");
            this.pid = pid;
            this.firstPid ||= pid;
            // the console from the page's start: Runtime.enable replays what
            // was logged before DevTools attached
            await this.send("Runtime.enable");
            return;
          }
          last = "no page yet";
        } catch (e) {
          // the WebView is still starting, or the socket went with the process
          last = String(e).split("\n")[0];
        }
      }
      await sleep(1000);
    }
    const sockets = adbOrEmpty("shell", "cat", "/proc/net/unix")
      .split("\n")
      .filter((l) => l.includes("devtools_remote"))
      .map((l) => l.trim().split(/\s+/).pop());
    throw new Error(
      `no WebView DevTools page for ${this.#pkg} (pid "${pid}", DevTools sockets: ${sockets.join(" ") || "none"}${last ? `, last: ${last}` : ""})`,
    );
  }

  #open(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.#ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(new SocketDropped(`DevTools socket: ${e.message ?? e.type}`));
      ws.onclose = () => {
        reject(new SocketDropped("DevTools socket closed before it opened"));
        if (this.#ws !== ws) return;
        this.#ws = null;
        // every call still waiting would never be answered: fail them now
        for (const done of this.#waiting.values()) done.reject(new SocketDropped("DevTools socket closed"));
        this.#waiting.clear();
      };
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.method) return this.#event(msg.method, msg.params);
        const done = this.#waiting.get(msg.id);
        if (!done) return;
        this.#waiting.delete(msg.id);
        if (msg.error) done.reject(new Error(msg.error.message));
        else done.resolve(msg.result);
      };
    });
  }

  #problem(text) {
    // Chromium's own notes on software-drawn WebGL (as tests/e2e/fixtures.ts)
    if (ALLOWED.some((a) => a.test(text))) return;
    // a reconnect replays the console: each message once
    if (this.#seen.has(text)) return;
    this.#seen.add(text);
    this.problems.push(text);
  }

  #event(method, params) {
    if (method === "Runtime.exceptionThrown") {
      const d = params.exceptionDetails;
      this.#problem(`uncaught: ${d.exception?.description ?? d.text}`);
    } else if (method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(params.type)) {
      const show = (a) =>
        a.preview?.properties
          ? `${a.description ?? a.className ?? "Object"} ${JSON.stringify(Object.fromEntries(a.preview.properties.map((p) => [p.name, p.value])))}`
          : (a.value ?? a.description ?? a.type);
      const where = params.stackTrace?.callFrames?.[0];
      const text = params.args.map(show).join(" ") + (where ? ` (at ${where.url.split("/").pop()}:${where.lineNumber + 1})` : "");
      this.#problem(`console.${params.type}: ${text}`);
    }
  }

  /** One DevTools call, answered within the time limit. */
  send(method, params = {}) {
    const ws = this.#ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new SocketDropped("DevTools socket is not open"));
    const id = this.#next++;
    const answer = new Promise((resolve, reject) => this.#waiting.set(id, { resolve, reject }));
    ws.send(JSON.stringify({ id, method, params }));
    return within(answer, CALL_TIMEOUT_MS, method).finally(() => this.#waiting.delete(id));
  }

  /** The socket dropped: find the WebView again (its pid may be new) and open it. */
  async reconnect() {
    const was = this.pid;
    try {
      this.#ws?.close();
    } catch {
      // already gone
    }
    this.#ws = null;
    await this.#connect(30_000);
    this.reconnects++;
    console.log(`DevTools socket dropped; opened again (pid ${was} -> ${this.pid})`);
  }

  /** Runs an expression in the page and returns its (JSON) value; one retry on a dropped socket. */
  async eval(expression) {
    let r;
    try {
      r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    } catch (e) {
      if (!(e instanceof SocketDropped)) throw e;
      await this.reconnect();
      r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    }
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

  /** Where the page starts on the screen, in device pixels (calibrate()). */
  offset = { x: 0, y: 0 };

  /**
   * Finds where the page sits on the screen: one real tap on an empty
   * spot, and where the page saw it. Taps are then placed exactly, and
   * the offset itself says whether the page covers the screen.
   */
  async calibrate(screenX, screenY) {
    await this.eval(`(() => {
      window.__cal = null;
      addEventListener("pointerdown", (e) => (window.__cal = { x: e.clientX, y: e.clientY, dpr: devicePixelRatio }), { once: true, capture: true });
      return true;
    })()`);
    execFileSync("adb", ["shell", "input", "tap", String(screenX), String(screenY)], { timeout: CALL_TIMEOUT_MS });
    await this.waitFor("window.__cal", { what: "the calibration tap" });
    const cal = await this.eval("window.__cal");
    this.offset = { x: screenX - cal.x * cal.dpr, y: screenY - cal.y * cal.dpr };
    return this.offset;
  }

  /**
   * A finger on the element's middle, held like a child's tap. It goes
   * through Android's own input (`adb shell input swipe` in place), so
   * anything the system draws on top, such as its full-screen notice,
   * gets the touch as it would from a real finger. Touch events sent over
   * DevTools went straight into the page and passed under that notice.
   */
  async touch(selector, holdMs = 120, { settle = true } = {}) {
    // a press right as a screen appears is ignored (src/ui/screenTime.tsx):
    // wait, like a child would, until the screen has been up a moment;
    // `settle: false` taps at once (a parent typing on in one rhythm)
    if (settle) {
      await this.waitFor("performance.now() - (window.__screenShownAt ?? -1e9) >= 300", {
        what: "the screen to settle",
      });
    }
    const box = await this.eval(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: (r.x + r.width / 2) * devicePixelRatio, y: (r.y + r.height / 2) * devicePixelRatio };
    })()`);
    if (!box) throw new Error(`nothing to touch: ${selector}`);
    const x = String(Math.round(box.x + this.offset.x));
    const y = String(Math.round(box.y + this.offset.y));
    execFileSync("adb", ["shell", "input", "swipe", x, y, x, y, String(holdMs)], { timeout: CALL_TIMEOUT_MS });
    await sleep(80);
  }

  close() {
    const ws = this.#ws;
    this.#ws = null;
    try {
      ws?.close();
    } catch {
      // already gone
    }
  }
}
