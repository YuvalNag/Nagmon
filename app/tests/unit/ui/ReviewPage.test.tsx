/**
 * "בדיקת ניסוח" (docs/app/TEXT_REVIEW.md §3): one line at a time, approve / correct / skip,
 * the progress, the filter, the guards on a correction, and what survives a restart.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReportDelivery } from "../../../src/core/fieldData/uploads";
import { ReviewStore, type ReviewItem } from "../../../src/core/review/review";
import { MemoryFileStore } from "../../../src/platform/storage";
import { ReviewPage } from "../../../src/ui/screens/parents/ReviewPage";

afterEach(cleanup);

const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

const ITEMS: ReviewItem[] = [
  { id: "npc:a:greet_first/0", type: "npc", src: "s", key: "k", he: "שלום שלום! הריח של הלחם מגיע עד אליכם.", ctx: "אופיר האופה · ברכה ראשונה ביום", hash: "h0" },
  { id: "quest:q:title/he", type: "quest", src: "s", key: "k", he: "כפול מתכון", en: "Double the recipe", ctx: "כפול מתכון · כותרת המשימה", hash: "h1" },
  { id: "mail:l:0", type: "mail", src: "s", key: "k", he: "שלום {name}! הינשוף מצא משהו.", ctx: "מאת הינשוף החכם · גלויה", hash: "h2" },
  { id: "fact:f:0", type: "fact", src: "s", key: "k", he: "ינשוף רואה היטב בלילה.", ctx: "עובדה במדעים", hash: "h3" },
];

async function open({ store = new ReviewStore(new MemoryFileStore()), items = ITEMS, names = ["דנה"], deliver = async () => "queued" as ReportDelivery } = {}) {
  const onBack = vi.fn();
  const delivered = vi.fn(deliver);
  const view = render(<ReviewPage store={store} deliver={delivered} names={async () => names} loadItems={async () => items} onBack={onBack} />);
  await settle();
  const el = (id: string) => view.container.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no ${id}`);
    fireEvent.click(b, { detail: 0 });
    await settle();
    await settle();
  };
  const line = () => el("review_line")?.textContent ?? null;
  return { ...view, store, el, press, line, onBack, delivered };
}

describe("one line at a time", () => {
  it("shows the first line with who says it, and the three buttons", async () => {
    const r = await open();
    expect(r.line()).toBe(ITEMS[0]!.he);
    expect(r.el("review_ctx")!.textContent).toBe("אופיר האופה · ברכה ראשונה ביום");
    expect(r.el("review_line")!.getAttribute("dir")).toBe("rtl");
    expect(r.el("review_approve")!.textContent).toBe("מאשר");
    expect(r.el("review_edit")!.textContent).toBe("לתקן");
    expect(r.el("review_skip")!.textContent).toBe("דלג");
    expect(r.el("review_progress")!.textContent).toBe("0 מתוך 4");
  });

  it("shows the English twin when there is one", async () => {
    const r = await open();
    expect(r.el("review_en")).toBeNull();
    await r.press("review_approve");
    expect(r.el("review_en")!.textContent).toBe("Double the recipe");
    expect(r.el("review_en")!.getAttribute("dir")).toBe("ltr");
  });

  it("approve keeps the decision, moves on, counts, and asks for the upload", async () => {
    const r = await open();
    await r.press("review_approve");
    expect(r.line()).toBe("כפול מתכון");
    expect(r.el("review_progress")!.textContent).toBe("1 מתוך 4");
    expect(await r.store.unsent()).toMatchObject([{ id: ITEMS[0]!.id, action: "approve", baseHash: "h0" }]);
    expect(r.delivered).toHaveBeenCalledTimes(1);
    expect(r.el("review_status")!.textContent).toBe("1 בתור לשליחה");
  });

  it("skip moves on and sends a skip", async () => {
    const r = await open();
    await r.press("review_skip");
    expect(r.line()).toBe("כפול מתכון");
    expect((await r.store.all())[ITEMS[0]!.id]!.action).toBe("skip");
  });

  it("says the work is done, and brings the skipped lines back on request", async () => {
    const r = await open({ items: ITEMS.slice(0, 2) });
    await r.press("review_skip");
    await r.press("review_approve");
    expect(r.el("review_done")!.textContent).toBe("סיימתם את כל השורות. תודה רבה!");
    expect(r.el("review_skipped_back")!.textContent).toBe("לחזור לשורות שדילגתי עליהן (1)");
    await r.press("review_skipped_back");
    expect(r.line()).toBe(ITEMS[0]!.he);
  });

  it("a restart keeps the decisions: the next line is the one not yet decided", async () => {
    const fs = new MemoryFileStore();
    const first = await open({ store: new ReviewStore(fs) });
    await first.press("review_approve");
    first.unmount();
    const again = await open({ store: new ReviewStore(fs) });
    expect(again.line()).toBe("כפול מתכון");
    expect(again.el("review_progress")!.textContent).toBe("1 מתוך 4");
  });
});

describe("the filter", () => {
  it("shows one type at a time, with its own progress", async () => {
    const r = await open();
    await r.press("review_filter_fact");
    expect(r.line()).toBe("ינשוף רואה היטב בלילה.");
    expect(r.el("review_progress")!.textContent).toBe("0 מתוך 1");
    expect(r.el("review_filter_fact")!.getAttribute("aria-pressed")).toBe("true");
    await r.press("review_filter_all");
    expect(r.line()).toBe(ITEMS[0]!.he);
    // no chip for a type with no lines
    expect(r.el("review_filter_ui")).toBeNull();
  });
});

describe("correcting", () => {
  async function editing(r: Awaited<ReturnType<typeof open>>) {
    await r.press("review_edit");
    const field = r.el("review_field") as HTMLTextAreaElement;
    return field;
  }
  const type = (field: HTMLTextAreaElement, text: string) => fireEvent.change(field, { target: { value: text } });

  it("opens a right-to-left field with the line prefilled, and the buttons", async () => {
    const r = await open();
    const field = await editing(r);
    expect(field.value).toBe(ITEMS[0]!.he);
    expect(field.getAttribute("dir")).toBe("rtl");
    expect(field.getAttribute("lang")).toBe("he");
    expect(r.el("review_save")).not.toBeNull();
    expect(r.el("review_approve")).toBeNull();
  });

  it("saves the corrected line as an edit", async () => {
    const r = await open();
    const field = await editing(r);
    type(field, "שלום וברוכים הבאים!");
    await r.press("review_save");
    expect(await r.store.unsent()).toMatchObject([{ id: ITEMS[0]!.id, action: "edit", newText: "שלום וברוכים הבאים!", baseHash: "h0" }]);
    expect(r.line()).toBe("כפול מתכון");
  });

  it("Enter saves too (the keyboard's done)", async () => {
    const r = await open();
    const field = await editing(r);
    type(field, "נוסח אחר");
    fireEvent.keyDown(field, { key: "Enter" });
    await settle();
    expect((await r.store.all())[ITEMS[0]!.id]).toMatchObject({ action: "edit", newText: "נוסח אחר" });
  });

  it("an unchanged line is an approval, an empty one is refused", async () => {
    const r = await open();
    const field = await editing(r);
    type(field, "   ");
    await r.press("review_save");
    expect(r.el("review_message")!.textContent).toBe("השורה ריקה.");
    expect(await r.store.unsent()).toEqual([]);
    type(field, ITEMS[0]!.he);
    await r.press("review_save");
    expect((await r.store.all())[ITEMS[0]!.id]!.action).toBe("approve");
  });

  it("cancel goes back to the line and keeps nothing", async () => {
    const r = await open();
    const field = await editing(r);
    type(field, "משהו");
    await r.press("review_cancel");
    expect(r.line()).toBe(ITEMS[0]!.he);
    expect(await r.store.unsent()).toEqual([]);
  });

  it("refuses a correction that loses a {placeholder}", async () => {
    const r = await open();
    await r.press("review_approve");
    await r.press("review_approve");
    expect(r.line()).toContain("{name}");
    const field = await editing(r);
    type(field, "שלום! הינשוף מצא משהו.");
    await r.press("review_save");
    expect(r.el("review_message")!.textContent).toBe("חסר בשורה {name}. צריך להשאיר את זה כמו שזה.");
    expect(r.el("review_field")).not.toBeNull();
    type(field, "היי {name}! הינשוף מצא משהו.");
    await r.press("review_save");
    expect((await r.store.all())["mail:l:0"]!.action).toBe("edit");
  });

  it("refuses a correction with a child's name in it", async () => {
    const r = await open({ names: ["דנה", "נועם"] });
    const field = await editing(r);
    type(field, "שלום נועם, הריח של הלחם מגיע עד אליכם.");
    await r.press("review_save");
    expect(r.el("review_message")!.textContent).toBe("אין לכתוב שם של ילד בשורה.");
    expect(await r.store.unsent()).toEqual([]);
  });

  it("keeps one line (a pasted new line becomes a space)", async () => {
    const r = await open();
    const field = await editing(r);
    type(field, "שורה אחת\nושורה שתיים");
    await r.press("review_save");
    expect((await r.store.all())[ITEMS[0]!.id]!.newText).toBe("שורה אחת ושורה שתיים");
  });
});

describe("loading", () => {
  it("says so when the lines cannot be loaded, and when there are none", async () => {
    const failing = render(<ReviewPage store={new ReviewStore(new MemoryFileStore())} deliver={async () => "off"} loadItems={async () => Promise.reject(new Error("x"))} onBack={() => undefined} />);
    await settle();
    expect(failing.container.textContent).toContain("אי אפשר לטעון את השורות");
    cleanup();
    const empty = await open({ items: [] });
    expect(empty.container.textContent).toContain("אין שורות לבדיקה כרגע.");
  });

  it("says when sending is off", async () => {
    const r = await open({ deliver: async () => "off" });
    await r.press("review_approve");
    expect(r.el("review_status")!.textContent).toBe("השליחה כבויה. אפשר לחבר את GitHub באזור ההורים.");
  });

  it("back leaves", async () => {
    const r = await open();
    await r.press("back");
    expect(r.onBack).toHaveBeenCalled();
  });
});
