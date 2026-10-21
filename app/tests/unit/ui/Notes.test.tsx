import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type LessonSave, type NoteUse, noLessonSave } from "../../../src/core/game/lessons";
import { Notes, type NotesProps } from "../../../src/ui/tutor/Notes";

afterEach(cleanup);

const note = { emoji: "1f311", text: "הירח מקיף את כדור הארץ, ולכן הצד המואר שרואים משתנה.", textEn: null };

function setup(props: Partial<NotesProps> = {}) {
  const uses: NoteUse[] = [];
  const base: NotesProps = { note, skill: "science.space.moon", questionKey: "q1", save: noLessonSave(), freeUsed: false, onUse: (u) => void uses.push(u) };
  const r = render(<Notes {...base} {...props} />);
  const q = (id: string) => r.container.querySelector<HTMLButtonElement>(`[data-id=${id}]`);
  const press = async (id: string) => act(async () => q(id)!.click());
  return { r, uses, q, press, again: (p: Partial<NotesProps>) => r.rerender(<Notes {...base} {...props} {...p} />) };
}

describe("the Notes button and sheet", () => {
  it("shows nothing for a skill with no note", () => {
    const m = setup({ note: null });
    expect(m.q("notes_open")).toBeNull();
  });

  it("opens a sheet with the idea card; the first use is free", async () => {
    const m = setup();
    expect(m.q("notes_text")).toBeNull();
    await m.press("notes_open");
    expect(m.q("notes_text")!.textContent).toBe(note.text);
    expect(m.r.container.querySelector("img.notes-picture")?.getAttribute("src")).toBe("game/emoji/1f311.svg");
    expect(m.uses).toHaveLength(1);
    expect(m.uses[0]).toMatchObject({ ok: true, free: true });
  });

  it("closes with the X and with a tap outside", async () => {
    const m = setup();
    await m.press("notes_open");
    await m.press("notes_close");
    expect(m.q("notes_text")).toBeNull();
    await m.press("notes_open");
    expect(m.q("notes_text")).not.toBeNull();
    await m.press("notes_outside");
    expect(m.q("notes_text")).toBeNull();
  });

  it("opening it again on the same question costs nothing more", async () => {
    const save: LessonSave = { ...noLessonSave(), charges: 2 };
    const m = setup({ freeUsed: true, save });
    await m.press("notes_open");
    expect(m.uses).toHaveLength(1);
    expect(m.uses[0]).toMatchObject({ ok: true, free: false });
    expect(m.uses[0]!.state.charges).toBe(1);
    await m.press("notes_close");
    await m.press("notes_open");
    expect(m.uses).toHaveLength(1);
    expect(m.q("notes_text")).not.toBeNull();
  });

  it("after the free use it costs a charge, and with none left the button is off and nothing opens", async () => {
    const m = setup({ freeUsed: true, save: { ...noLessonSave(), charges: 1 } });
    expect(m.q("notes_open")!.textContent).toContain("1");
    const none = setup({ freeUsed: true });
    const buttons = none.r.container.querySelectorAll<HTMLButtonElement>("[data-id=notes_open]");
    expect(buttons[0]!.disabled).toBe(true);
    await act(async () => buttons[0]!.click());
    expect(none.uses).toHaveLength(0);
    expect(none.r.container.querySelector("[data-id=notes_text]")).toBeNull();
  });

  it("is off in the lesson's own practice", () => {
    const m = setup({ disabled: true });
    expect(m.q("notes_open")!.disabled).toBe(true);
  });

  it("the sheet closes by itself when the next question comes", async () => {
    const m = setup();
    await m.press("notes_open");
    m.again({ questionKey: "q2", freeUsed: true });
    expect(m.q("notes_text")).toBeNull();
  });
});
