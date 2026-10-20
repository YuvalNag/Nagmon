import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_NAME_LEN } from "../../../src/core/family/profiles";
import { HEBREW_KEYS, LetterBoard } from "../../../src/ui/LetterBoard";

afterEach(cleanup);

function setup(props: { initial?: string; message?: string } = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(<LetterBoard title="איך קוראים לשחקן?" onDone={onDone} onCancel={onCancel} {...props} />);
  const key = (id: string) => container.querySelector(`[data-id="${id}"]`) as HTMLButtonElement;
  const press = (id: string) => fireEvent.click(key(id), { detail: 0 });
  const typed = () => key("typed").textContent;
  const message = () => container.querySelector(".message")!.textContent;
  return { container, onDone, onCancel, key, press, typed, message };
}

describe("LetterBoard", () => {
  it("has every Hebrew letter, final forms after their letter", () => {
    expect(HEBREW_KEYS.join("")).toBe("אבגדהוזחטיכךלמםנןסעפףצץקרשת");
    const { container } = setup();
    expect(container.querySelectorAll("[data-id^=letter_]")).toHaveLength(27);
  });

  it("adds exactly the letter tapped", () => {
    const { press, typed } = setup();
    for (const c of "נועה") press(`letter_${c}`);
    expect(typed()).toBe("נועה");
  });

  it("deletes the last letter", () => {
    const { press, typed } = setup({ initial: "דן" });
    press("board_delete");
    expect(typed()).toBe("ד");
  });

  it("stops at the longest name, and says so", () => {
    const { press, typed, message } = setup();
    for (let i = 0; i < MAX_NAME_LEN + 2; i++) press("letter_א");
    expect(typed()).toBe("א".repeat(MAX_NAME_LEN));
    expect(message()).not.toBe("");
  });

  it("refuses a space first or a second space, as it is typed", () => {
    const { press, typed, message } = setup();
    press("board_space");
    expect(typed()).toBe("");
    expect(message()).not.toBe("");
    press("letter_א");
    expect(message()).toBe("");
    press("board_space");
    press("board_space");
    expect(typed()).toBe("א ");
    expect(message()).not.toBe("");
  });

  it("can finish only with a letter in it", () => {
    const { press, key, onDone } = setup();
    expect(key("board_done").disabled).toBe(true);
    press("letter_ב");
    press("board_done");
    expect(onDone).toHaveBeenCalledWith("ב");
  });

  it("clears the message once the name changes", () => {
    const { press, message } = setup({ initial: "דן", message: "כבר יש שחקן בשם הזה." });
    expect(message()).toBe("כבר יש שחקן בשם הזה.");
    press("letter_י");
    expect(message()).toBe("");
  });

  it("keeps delete out of the letter grid, in the name bar at the far end from done", () => {
    const { container, key } = setup();
    expect(container.querySelector(".letters [data-id=board_delete]")).toBeNull();
    const bar = key("typed").parentElement!;
    expect(bar.contains(key("board_delete"))).toBe(true);
    // the name bar's last item: the far (left) end in right-to-left
    expect(bar.lastElementChild).toBe(key("board_delete"));
    expect(bar.contains(key("board_done"))).toBe(false);
  });

  it("goes back without a name", () => {
    const { press, onCancel } = setup();
    press("board_cancel");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
