import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FRESH_MS, ScreenTime } from "../../../src/ui/screenTime";
import { Tap } from "../../../src/ui/Tap";

afterEach(cleanup);

/** The button sits at 100..200 x 100..160 on the screen. */
function place(button: HTMLElement) {
  button.getBoundingClientRect = () => ({ left: 100, top: 100, right: 200, bottom: 160, width: 100, height: 60, x: 100, y: 100, toJSON: () => ({}) });
}

function setup(props: { disabled?: boolean } = {}) {
  const onTap = vi.fn();
  const { container } = render(
    <Tap id="k" onTap={onTap} {...props}>
      k
    </Tap>,
  );
  const button = container.querySelector("button")!;
  place(button);
  return { onTap, button };
}

const at = (pointerId: number, x = 150, y = 130) => ({ pointerId, clientX: x, clientY: y, button: 0, pointerType: "touch" });

describe("Tap", () => {
  it("acts when the finger that went down on it comes up on it", () => {
    const { onTap, button } = setup();
    fireEvent.pointerDown(button, at(1));
    expect(onTap).not.toHaveBeenCalled();
    fireEvent.pointerUp(button, at(1));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("acts once per tap: the click after it does nothing", () => {
    const { onTap, button } = setup();
    fireEvent.pointerDown(button, at(1));
    fireEvent.pointerUp(button, at(1));
    fireEvent.click(button, { detail: 1 });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("acts on a tap whose finger drifted, while it is still on the button", () => {
    const { onTap, button } = setup();
    fireEvent.pointerDown(button, at(1, 150, 130));
    fireEvent.pointerMove(button, at(1, 170, 130));
    fireEvent.pointerUp(button, at(1, 172, 131));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the finger slid off before it came up", () => {
    const { onTap, button } = setup();
    fireEvent.pointerDown(button, at(1));
    fireEvent.pointerUp(button, at(1, 260, 130));
    expect(onTap).not.toHaveBeenCalled();
  });

  it("counts a tap while another finger rests elsewhere", () => {
    const { onTap, button } = setup();
    // finger 7 rests on the screen; it never touched this button
    fireEvent.pointerDown(button, at(2));
    fireEvent.pointerUp(button, at(2));
    fireEvent.pointerDown(button, at(3));
    fireEvent.pointerUp(button, at(3));
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("ignores a finger that went down somewhere else", () => {
    const { onTap, button } = setup();
    fireEvent.pointerDown(button, at(1));
    fireEvent.pointerUp(button, at(9));
    expect(onTap).not.toHaveBeenCalled();
  });

  it("does nothing after the system took the touch (pointercancel)", () => {
    const { onTap, button } = setup();
    fireEvent.pointerDown(button, at(1));
    fireEvent.pointerCancel(button, at(1));
    fireEvent.pointerUp(button, at(1));
    expect(onTap).not.toHaveBeenCalled();
  });

  it("acts on a keyboard or switch press (a click with no pointer)", () => {
    const { onTap, button } = setup();
    fireEvent.click(button, { detail: 0 });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled, even for pointer events", () => {
    const { onTap, button } = setup({ disabled: true });
    fireEvent.pointerDown(button, at(1));
    fireEvent.pointerUp(button, at(1));
    fireEvent.click(button, { detail: 0 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it("keeps its finger from scrolling or zooming the page", async () => {
    const css = await import("node:fs").then((fs) => fs.readFileSync("src/styles.css", "utf8"));
    expect(css).toMatch(/button\s*{[^}]*touch-action:\s*none/);
  });
});

describe("Tap on a screen that just appeared", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["performance"] }));
  afterEach(() => vi.useRealTimers());

  it(`ignores a press that began within ${FRESH_MS} ms (a double tap meant for the screen before)`, () => {
    const onTap = vi.fn();
    const { container } = render(
      <ScreenTime>
        <Tap onTap={onTap}>next</Tap>
      </ScreenTime>,
    );
    const button = container.querySelector("button")!;
    place(button);
    act(() => vi.advanceTimersByTime(FRESH_MS - 100));
    fireEvent.pointerDown(button, at(1));
    fireEvent.pointerUp(button, at(1));
    expect(onTap).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    fireEvent.pointerDown(button, at(2));
    fireEvent.pointerUp(button, at(2));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("tells the tests and the emulator check when the screen appeared", () => {
    render(
      <ScreenTime>
        <Tap onTap={() => {}}>x</Tap>
      </ScreenTime>,
    );
    expect((globalThis as { __screenShownAt?: number }).__screenShownAt).toBeTypeOf("number");
  });
});
