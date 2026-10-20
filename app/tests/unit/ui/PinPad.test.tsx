import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PinPad } from "../../../src/ui/PinPad";

afterEach(cleanup);

function setup() {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const { container, rerender } = render(<PinPad title="קוד" hint="ארבע ספרות" onDone={onDone} onCancel={onCancel} />);
  const key = (id: string) => container.querySelector(`[data-id="${id}"]`) as HTMLButtonElement;
  // a keyboard press: the same path as a switch or a test
  const press = (id: string) => fireEvent.click(key(id), { detail: 0 });
  const dots = () => container.querySelector('[data-id="pin_dots"]')!.getAttribute("data-count");
  return { container, rerender, onDone, onCancel, key, press, dots };
}

describe("PinPad", () => {
  it("shows dots, never the digits", () => {
    const { container, press, dots } = setup();
    press("key_9");
    press("key_7");
    expect(dots()).toBe("2");
    expect(container.querySelector('[data-id="pin_dots"]')!.textContent).toBe("");
  });

  it("gives the 4 digits once, then waits for the answer", () => {
    const { press, onDone, key } = setup();
    for (const d of "12345") press(`key_${d}`);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("1234");
    expect(key("key_5").disabled).toBe(true);
    expect(key("key_delete").disabled).toBe(true);
  });

  it("cannot be left while the code is being checked", () => {
    const { press, onCancel, key } = setup();
    for (const d of "1234") press(`key_${d}`);
    expect(key("pin_cancel").disabled).toBe(true);
    press("pin_cancel");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("can be left before the last digit", () => {
    const { press, onCancel } = setup();
    press("key_1");
    press("pin_cancel");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("takes one digit back with delete", () => {
    const { press, dots } = setup();
    press("key_1");
    press("key_2");
    press("key_delete");
    expect(dots()).toBe("1");
  });

  it("shows the message it is given", () => {
    const { container } = render(<PinPad title="קוד" hint="h" message="נשארו 3 ניסיונות" onDone={() => {}} onCancel={() => {}} />);
    expect(container.querySelector(".message")!.textContent).toBe("נשארו 3 ניסיונות");
  });

  it("puts delete in the bottom row, away from the digits 1-9", () => {
    const { container } = setup();
    const keys = [...container.querySelectorAll(".pad > *")];
    expect(keys.map((k) => (k as HTMLElement).dataset.id ?? "")).toEqual(
      ["key_1", "key_2", "key_3", "key_4", "key_5", "key_6", "key_7", "key_8", "key_9", "", "key_0", "key_delete"],
    );
  });
});
