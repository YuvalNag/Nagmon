import { afterEach, describe, expect, it, vi } from "vitest";

const shot = vi.hoisted(() => ({ native: false, result: { image: "QUJD" } as { image?: string | null } | "hang" | "throw" }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => shot.native },
  registerPlugin: () => ({
    take: () => {
      if (shot.result === "throw") return Promise.reject(new Error("not implemented"));
      if (shot.result === "hang") return new Promise(() => {});
      return Promise.resolve(shot.result);
    },
  }),
}));
import { takeScreenshot } from "../../../src/platform/screenshot";

afterEach(() => {
  shot.native = false;
  shot.result = { image: "QUJD" };
});

describe("the screenshot", () => {
  it("in a browser (and in tests) there is none", async () => {
    expect(await takeScreenshot()).toBeNull();
  });

  it("on the phone it is the plugin's base64 JPEG", async () => {
    shot.native = true;
    expect(await takeScreenshot()).toBe("QUJD");
  });

  it("is null when the phone could not take it, refused, or was too slow", async () => {
    shot.native = true;
    shot.result = {};
    expect(await takeScreenshot()).toBeNull();
    shot.result = { image: "" };
    expect(await takeScreenshot()).toBeNull();
    shot.result = "throw";
    expect(await takeScreenshot()).toBeNull();
    shot.result = "hang";
    expect(await takeScreenshot(20)).toBeNull();
  });
});
