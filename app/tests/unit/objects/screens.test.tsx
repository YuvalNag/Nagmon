import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Play } from "../../../src/app/play";
import { addCreature } from "../../../src/core/game/collection";
import { encounterTables } from "../../../src/core/game/encounters";
import { facts } from "../../../src/core/game/facts";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { countOf, economy, give } from "../../../src/core/game/items";
import { mailData } from "../../../src/core/game/mail";
import { monsterTable } from "../../../src/core/game/monsters";
import { objectDefs } from "../../../src/core/game/objects";
import { readFact } from "../../../src/core/game/journal";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import { ObjectScreen } from "../../../src/ui/pc/ObjectScreen";
import { heObj } from "../../../src/ui/pc/words";
import { engineFor, gameJson, shipped } from "../game/helpers";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const SPECIES = ["heliobud", "lunibble", "terrabub", "rustip", "ringlet", "meteet", "heliolynx"];

function setup(object: string, o: { friends?: number; today?: string; configure?: (w: WorldState) => void } = {}) {
  const world = new WorldState();
  for (let i = 0; i < (o.friends ?? 7); i++) addCreature(world, SPECIES[i % SPECIES.length]!, 3 + i);
  const eco = economy(gameJson("economy.json"));
  o.configure?.(world);
  const day = { v: o.today ?? "2026-10-22" };
  const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));
  const play = {
    world,
    economy: eco,
    facts: facts(gameJson("facts.json")),
    objects: objectDefs(gameJson("objects.json")),
    mail: mailData(gameJson("mail.json")),
    monsters: monsterTable(gameJson("db/monsters.json")),
    encounters: encounterTables(gameJson("db/encounters.json")),
    subjects,
    engine: engineFor(shipped(), 2),
    profile: { grade: 2, name: "נועה", settings: {} },
    field: new FieldLog({ info: () => {} }),
    text: (id: string) => id,
    today: () => day.v,
    saveWorld: vi.fn(async () => {}),
  } as unknown as Play;
  const changed = vi.fn();
  const close = vi.fn();
  const def = play.objects[object]!;
  const r = render(<ObjectScreen play={play} def={def} onClose={close} onChanged={changed} />);
  const q = (id: string) => r.container.querySelector<HTMLElement>(`[data-id=${id}]`);
  const press = async (id: string) => {
    const el = q(id);
    if (!el) throw new Error(`no ${id}`);
    await act(async () => (el as HTMLButtonElement).click());
  };
  return { world, play, eco, q, press, changed, close, day, container: r.container, text: () => r.container.textContent ?? "" };
}

const ids = (w: WorldState) => w.creatures.map((c) => c.id).join();

describe("the PC", () => {
  it("has five tabs and opens on the boxes", () => {
    const m = setup("pc");
    for (const t of ["boxes", "items", "mail", "journal", "people"]) expect(m.q(`pc_tab_${t}`)).not.toBeNull();
    expect(m.q("boxes")).not.toBeNull();
  });

  it("swaps a friend of the party with one from a box; nobody is lost and the world is saved", async () => {
    const m = setup("pc");
    const before = [...m.world.creatures.map((c) => c.id)].sort();
    await m.press("box_party_c2");
    await m.press("box_friend_c5");
    expect(ids(m.world)).toBe("c1,c5,c3,c4,c2,c6,c7");
    expect([...m.world.creatures.map((c) => c.id)].sort()).toEqual(before);
    expect(m.play.saveWorld).toHaveBeenCalled();
    expect(m.changed).toHaveBeenCalled();
    expect(m.q("box_party_c5")).not.toBeNull();
    expect(m.q("box_friend_c2")).not.toBeNull();
  });

  it("two friends of the same side only change the choice", async () => {
    const m = setup("pc");
    await m.press("box_party_c2");
    await m.press("box_party_c3");
    expect(ids(m.world)).toBe("c1,c2,c3,c4,c5,c6,c7");
    expect(m.q("box_party_c3")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("has no way to release, delete or sell anything", () => {
    const m = setup("pc");
    expect(m.text()).not.toMatch(/שחרור|מחיקה|למכור|מכירה|לזרוק/);
  });

  it("stars a friend of a box", async () => {
    const m = setup("pc");
    await m.press("box_star_c6");
    expect(m.world.pc.fav).toEqual(["c6"]);
    expect(m.q("box_star_c6")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("with nine friends in the Meadow it has two boxes, named, and the second shows the rest", async () => {
    const m = setup("pc", { friends: 13 });
    expect(m.q("box_name_0")).not.toBeNull();
    await m.press("box_name_1");
    expect(m.q("box_grid")!.querySelectorAll("li").length).toBe(1);
  });

  it("moves items to the box and back in the Items tab", async () => {
    const m = setup("pc", { configure: (w) => give(w, economy(gameJson("economy.json")), "berry", 10) });
    await m.press("pc_tab_items");
    await m.press("items_in_all_berry");
    expect(countOf(m.world, "berry")).toBe(0);
    expect(m.world.pc.box["berry"]).toBe(10);
    await m.press("items_out_berry");
    expect(countOf(m.world, "berry")).toBe(1);
    expect(m.q("items_box_berry")!.textContent).toContain("9");
  });

  it("the Mail tab shows today's postcard and a badge until it is read", async () => {
    const m = setup("pc");
    expect(m.q("pc_tab_mail")!.getAttribute("data-unread")).toBe("1");
    await m.press("pc_tab_mail");
    expect(m.q("mail_list")!.getAttribute("data-count")).toBe("1");
    expect(m.world.mail.lastPostcard).toBe("2026-10-22");
  });

  it("the People tab is empty until someone is met, then shows hearts", async () => {
    const m = setup("pc");
    await m.press("pc_tab_people");
    expect(m.q("people_none")).not.toBeNull();
    cleanup();
    const n = setup("pc", { configure: (w) => (w.met["nagmon_cashier"] = { first: "2026-10-20", last: "2026-10-22", hearts: 2 }) });
    await n.press("pc_tab_people");
    expect(n.q("person_nagmon_cashier")!.getAttribute("data-hearts")).toBe("2");
  });

  it("the Journal lists the facts read by subject, in kind words; the Recap needs facts of the last 7 days and does not touch the learner", async () => {
    const m = setup("pc", { configure: (w) => { readFact(w, "math_zero", "2026-10-22"); readFact(w, "math_half", "2026-10-21"); readFact(w, "en_cat", "2026-10-01"); } });
    await m.press("pc_tab_journal");
    await m.press("journal_subject_math");
    expect(m.q("journal_fact_math_zero")).not.toBeNull();
    expect(m.q("journal_fact_en_cat")).toBeNull();
    expect(m.q("journal_words")!.textContent).not.toMatch(/\d|חלש|נמוך|ציון/);
    const learner = JSON.stringify(m.play.engine.save());
    await m.press("journal_recap");
    expect(m.q("recap")!.getAttribute("data-of")).toBe("2");
    await m.press("recall_choice_0");
    await m.press("recall_choice_1");
    await m.press("recall_choice_2");
    expect(JSON.stringify(m.play.engine.save())).toBe(learner);
  });

  it("the Recap is off when nothing was read lately", async () => {
    const m = setup("pc");
    await m.press("pc_tab_journal");
    expect((m.q("journal_recap") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the mailbox", () => {
  const withLetter = (w: WorldState) => {
    w.mail.items.push({ uid: "u1", id: "postcard_cashier", v: 0, from: "nagmon_cashier", kind: "postcard", day: "2026-10-21", read: false, claimed: false, gift: { coins: 10 } });
    w.mail.lastPostcard = "2026-10-22";
  };

  it("reads a letter: the child's name is put in, the fact shows, and it is marked read", async () => {
    const m = setup("mailbox", { configure: withLetter });
    await m.press("mail_item_u1");
    expect(m.q("letter_text")!.textContent).toContain("נועה");
    expect(m.q("letter_fact")).not.toBeNull();
    expect(m.world.mail.items[0]!.read).toBe(true);
  });

  it("the gift is taken once, then the button is gone", async () => {
    const m = setup("mailbox", { configure: withLetter });
    await m.press("mail_item_u1");
    await m.press("mail_take");
    expect(m.world.money).toBe(10);
    expect(m.q("mail_take")).toBeNull();
    expect(m.q("mail_taken")).not.toBeNull();
  });

  it("a recall question: a wrong line is greyed and the right one finishes, with no penalty", async () => {
    const m = setup("mailbox", { configure: withLetter });
    await m.press("mail_item_u1");
    await m.press("mail_recall");
    const right = m.q("recall")!;
    for (let i = 0; i < 3 && right.getAttribute("data-state") !== "right"; i++) await m.press(`recall_choice_${i}`);
    expect(right.getAttribute("data-state")).toBe("right");
    expect(m.world.money).toBe(0);
    await m.press("recall_ok");
    expect(m.q("letter_fact")).not.toBeNull();
  });

  it("with no letters it says so kindly", () => {
    const m = setup("mailbox", { configure: (w) => (w.mail.lastPostcard = "2026-10-22") });
    expect(m.q("mail_empty")).not.toBeNull();
  });
});

describe("the bookshelf", () => {
  it("three different books give one stamp; the facts go in the journal", async () => {
    const m = setup("bookshelf");
    const books = [...m.container.querySelectorAll<HTMLElement>("[data-id^=book_]")].map((b) => b.dataset["id"]!.replace("book_", ""));
    expect(books).toHaveLength(3);
    for (const b of books) {
      await m.press(`book_${b}`);
      expect(m.q("book_fact")!.textContent).toBe(m.play.facts[b]!.text);
      await m.press("book_back");
    }
    expect(m.world.journal.stamps).toBe(1);
    expect(Object.keys(m.world.journal.read).sort()).toEqual([...books].sort());
  });

  it("the library has a shelf for each of the six subjects", async () => {
    const m = setup("library");
    for (const s of ["math", "geometry", "english", "science", "logic", "hebrew"]) expect(m.q(`shelf_subject_${s}`)).not.toBeNull();
    await m.press("shelf_subject_english");
    expect(m.q("books")!.querySelectorAll("button").length).toBeGreaterThan(3);
  });
});

describe("the fridge", () => {
  it("one snack a day: the partner gets a heart, the second tap says tomorrow", async () => {
    const m = setup("fridge");
    const snacks = [...m.container.querySelectorAll<HTMLElement>("[data-id^=fridge_snack_]")];
    expect(snacks).toHaveLength(3);
    await act(async () => (snacks[0] as HTMLButtonElement).click());
    expect(m.world.creatures[0]!.hearts).toBe(1);
    await act(async () => (snacks[1] as HTMLButtonElement).click());
    expect(m.q("fridge_said")!.textContent).toBe(heObj.fridgeTomorrow);
    expect(m.world.creatures[0]!.hearts).toBe(1);
  });
});

describe("the TV", () => {
  it("is off until a channel is picked and shows the real moon of the date", async () => {
    const m = setup("tv", { today: "2026-10-26" });
    expect(m.q("tv")!.getAttribute("data-channel")).toBe("off");
    await m.press("tv_channel_sky");
    expect(m.q("tv_moon")!.textContent).toBe(heObj.moon_full);
  });

  it("shows three headlines and a creature of the day", async () => {
    const m = setup("tv");
    await m.press("tv_channel_news");
    expect(m.q("tv_news")!.querySelectorAll("li")).toHaveLength(3);
    await m.press("tv_channel_creature");
    expect(m.q("tv_creature")!.getAttribute("data-species")).toBeTruthy();
  });

  it("a channel plays for 25 seconds and then the set rests; a tap picks another", async () => {
    vi.useFakeTimers();
    const m = setup("tv");
    await m.press("tv_channel_news");
    expect(m.q("tv_timer")!.getAttribute("data-left")).toBe("25");
    await act(async () => void vi.advanceTimersByTime(24_000));
    expect(m.q("tv_news")).not.toBeNull();
    await act(async () => void vi.advanceTimersByTime(2_000));
    expect(m.q("tv_news")).toBeNull();
    expect(m.q("tv")!.getAttribute("data-ended")).toBe("true");
    await m.press("tv_channel_sky");
    expect(m.q("tv_sky")).not.toBeNull();
  });
});

describe("the notice board", () => {
  it("shows three cards (a fourth on Sunday) and accepting is free and kept", async () => {
    const m = setup("noticeboard", { today: "2026-10-22" });
    expect(m.q("board")!.getAttribute("data-count")).toBe("3");
    const first = m.container.querySelector<HTMLElement>("[data-id^=board_accept_]")!;
    await act(async () => (first as HTMLButtonElement).click());
    expect((first as HTMLButtonElement).disabled).toBe(true);
    expect(Object.keys(m.world.board.accepted)).toHaveLength(1);
    expect(m.world.money).toBe(0);
    cleanup();
    expect(setup("noticeboard", { today: "2026-10-25" }).q("board")!.getAttribute("data-count")).toBe("4");
  });
});

describe("the words", () => {
  it("are Hebrew and never say a score or ask for money", () => {
    for (const [k, text] of Object.entries(heObj)) {
      expect(text.replace(/\{\w+\}/g, ""), k).toMatch(/[֐-׿]/);
      expect(text, k).not.toMatch(/קנייה|לקנות|מחיר/);
    }
  });
});
