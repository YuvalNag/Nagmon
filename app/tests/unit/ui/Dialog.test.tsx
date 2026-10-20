import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef, type MutableRefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, TYPE_CPS } from "../../../src/ui/Dialog";
import { ScreenTime } from "../../../src/ui/screenTime";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const PAGES = ["המוכר אבי: שלום! אני סופר את הכסף בקופה.", "אפשר לעזור לי עם חשבון קטן?"];

function setup() {
  const onDone = vi.fn();
  const advance = createRef<() => void>() as MutableRefObject<(() => void) | null>;
  const { container } = render(
    <ScreenTime>
      <Dialog pages={PAGES} onDone={onDone} advanceRef={advance} />
    </ScreenTime>,
  );
  const layer = () => container.querySelector("[data-screen=dialog]") as HTMLElement;
  const button = () => container.querySelector('[data-id="dialog"]') as HTMLButtonElement;
  const typed = () => (container.querySelector('[data-id="dialog_text"] > span') as HTMLElement).textContent;
  // a keyboard or switch press: no pointer, so no ScreenTime wait
  const tap = () => act(() => void fireEvent.click(button(), { detail: 0 }));
  return { onDone, advance, layer, button, typed, tap };
}

describe("the dialog", () => {
  it("types the page out in reading order, by the time gone", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    const d = setup();
    expect(d.layer().dataset.full).toBe("false");
    await act(async () => void vi.advanceTimersByTime(300));
    const part = d.typed()!;
    expect(part.length).toBeGreaterThan(0);
    expect(PAGES[0]!.startsWith(part)).toBe(true);
    await act(async () => void vi.advanceTimersByTime((PAGES[0]!.length / TYPE_CPS) * 1000 + 100));
    expect(d.typed()).toBe(PAGES[0]);
    expect(d.layer().dataset.full).toBe("true");
  });

  it("a tap while it types shows the whole page; the next turns the page; the last closes it", () => {
    const d = setup();
    expect(d.layer().dataset.full).toBe("false");
    d.tap();
    expect(d.layer().dataset.full).toBe("true");
    expect(d.layer().dataset.page).toBe("0");
    expect(d.typed()).toBe(PAGES[0]);
    d.tap();
    expect(d.layer().dataset.page).toBe("1");
    d.tap();
    d.tap();
    expect(d.onDone).toHaveBeenCalledTimes(1);
    // once closed, more taps do nothing
    d.tap();
    expect(d.onDone).toHaveBeenCalledTimes(1);
  });

  it("a turned page starts empty: a quick tap types it out, it never skips it", () => {
    const d = setup();
    d.tap();
    d.tap();
    expect(d.layer().dataset.page).toBe("1");
    expect(d.layer().dataset.full).toBe("false");
    d.tap();
    expect(d.layer().dataset.page).toBe("1");
    expect(d.layer().dataset.full).toBe("true");
  });

  it("Android's back does what a tap does", () => {
    const d = setup();
    act(() => d.advance.current!());
    expect(d.layer().dataset.full).toBe("true");
    act(() => d.advance.current!());
    expect(d.layer().dataset.page).toBe("1");
  });

  it("names the button with the whole page, for TalkBack, while it types", () => {
    const d = setup();
    expect(d.button().getAttribute("aria-label")).toBe(PAGES[0]);
  });

  it("a finger that comes down as the dialog appears presses nothing (ScreenTime)", () => {
    const d = setup();
    const b = d.button();
    b.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(b, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    expect(d.layer().dataset.full).toBe("false");
  });
});
