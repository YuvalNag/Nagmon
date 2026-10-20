/**
 * Sharing text (the log, a crash report): the Android share sheet on the
 * phone, a file download in the browser. Text that leaves the phone is
 * cleaned of keys and names right before it goes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ on: false, shared: [] as unknown[], fail: null as Error | null }));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.on },
}));

vi.mock("@capacitor/share", () => ({
  Share: {
    async share(options: unknown) {
      if (native.fail) throw native.fail;
      native.shared.push(options);
      return {};
    },
  },
}));

const { shareRedacted, shareText } = await import("../../../src/platform/share");

const TOKEN = "github_pat_TEST" + "abcdefghij".repeat(3);

beforeEach(() => {
  native.on = false;
  native.shared = [];
  native.fail = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("on Android", () => {
  it("opens the share sheet with the text", async () => {
    native.on = true;
    expect(await shareText("log text", { title: "יומן נגמון" })).toBe("shared");
    const title = "יומן נגמון";
    expect(native.shared).toEqual([{ title, text: "log text", dialogTitle: title }]);
  });

  it("a closed share sheet is not an error", async () => {
    native.on = true;
    native.fail = new Error("Share canceled");
    expect(await shareText("x")).toBe("cancelled");
  });

  it("other failures are reported", async () => {
    native.on = true;
    native.fail = new Error("No Activity found");
    await expect(shareText("x")).rejects.toThrow("No Activity found");
  });
});

describe("in the browser", () => {
  it("downloads the text as a UTF-8 file", async () => {
    const urls: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      urls.push(b);
      return "blob:fake";
    });
    URL.revokeObjectURL = vi.fn();
    const clicks: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    click.mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });
    expect(await shareText("שלום log", { fileName: "nagmon-log.txt" })).toBe("downloaded");
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.download).toBe("nagmon-log.txt");
    expect(clicks[0]!.href).toBe("blob:fake");
    expect(urls[0]!.type).toBe("text/plain;charset=utf-8");
    expect(await urls[0]!.text()).toBe("שלום log");
    expect(document.querySelector("a[download]")).toBeNull(); // cleaned up
  });
});

describe("shareRedacted", () => {
  it("cannot be called without the secrets and names", async () => {
    native.on = true;
    // @ts-expect-error: secrets and names are required
    await expect(shareRedacted("x", {})).rejects.toThrow(TypeError);
    // @ts-expect-error: the options are required
    await expect(shareRedacted("x")).rejects.toThrow(TypeError);
    expect(native.shared).toEqual([]);
  });

  it("hides keys and names right before the text leaves", async () => {
    native.on = true;
    await shareRedacted(`token ${TOKEN} key plainsecret123456 for נועה`, {
      secrets: ["plainsecret123456"],
      names: ["נועה"],
    });
    const { text } = native.shared[0] as { text: string };
    expect(text).not.toContain("TEST");
    expect(text).not.toContain("plainsecret123456");
    expect(text).not.toContain("נועה");
    expect(text).toContain("<child>");
  });
});
