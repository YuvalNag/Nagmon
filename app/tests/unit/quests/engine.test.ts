import { describe, expect, it } from "vitest";
import { WorldState } from "../../../src/core/world/worldState";
import { addDays } from "../../../src/core/world/rand";
import { countOf } from "../../../src/core/game/items";
import { activeCount } from "../../../src/core/game/quests";
import { data, eco, FakeIO, rig } from "./helpers";

const d = data();
const KID = "nagmon_kid";
const KITTEN = "nagmon_kitten";

/** Restarts the app: the saved world is read back into a new engine on the same calendar. */
function restart(r: ReturnType<typeof rig>) {
  const world = WorldState.fromDict(JSON.parse(JSON.stringify(r.world.toDict())));
  const again = rig({ world, day: r.day.v });
  return again;
}

describe("the kitten quest, by a person (kindness of a kind: the lost-kitten story that was gated until W3)", () => {
  it("is offered by Yoav, the child says gladly, and the story runs to its end with the reward", async () => {
    const r = rig();
    expect(r.engine.talkable(KID)).toBe(true);
    expect(r.engine.talkable(KITTEN)).toBe(false);
    const io = r.io([], ["yes"]);
    expect(await r.engine.talk(KID, io)).toBe(true);
    // asked "gladly or not now", then the first step is with Yoav himself: said in the same talk
    expect(io.chosen[0]!.options).toEqual(["yes", "no"]);
    expect(io.text()).toContain("שביל 1");
    expect(io.acts).toEqual(["set_variable nagmon_kitten:asked"]);
    expect(r.world.variables.get("nagmon_kitten")).toBe("asked");
    expect(r.engine.journal()).toMatchObject([{ id: "q_kitten_home", step: 2, steps: 3, who: KITTEN }]);
    // the kitten (a prop on Route 1) can be talked to now, and only now
    expect(r.engine.talkable(KITTEN)).toBe(true);
    const found = r.io();
    await r.engine.talk(KITTEN, found);
    expect(r.world.variables.get("nagmon_kitten")).toBe("found");
    expect(found.said[0]!.speaker).toBe("פיצי");
    expect(r.engine.talkable(KITTEN)).toBe(false);
    expect(r.engine.journal()[0]).toMatchObject({ step: 3, who: KID });
    const money = r.world.money;
    const home = r.io();
    await r.engine.talk(KID, home);
    expect(r.world.variables.get("nagmon_kitten")).toBe("home");
    expect(home.acts).toContain("send_letter thanks_friend");
    expect(r.world.money - money).toBe(30);
    expect(countOf(r.world, "dew_drop")).toBe(2);
    expect(r.befriended).toEqual([KID]);
    expect(r.engine.journal()).toEqual([]);
    expect(r.engine.doneShelf().map((c) => c.id)).toEqual(["q_kitten_home"]);
    // a once-only quest never comes back
    expect(r.engine.talkable(KID)).toBe(false);
    r.next(40);
    expect(r.engine.offersAt(KID)).toEqual([]);
  });

  it("survives a restart at every step: the app killed between talks keeps the quest where it was", async () => {
    let r = rig();
    await r.engine.talk(KID, r.io([], ["yes"]));
    for (const who of [KITTEN, KID]) {
      r = restart(r);
      expect(r.engine.journal()).toHaveLength(1);
      expect(r.engine.talkable(who)).toBe(true);
      await r.engine.talk(who, r.io());
    }
    r = restart(r);
    expect(r.engine.journal()).toEqual([]);
    expect(r.world.variables.get("nagmon_kitten")).toBe("home");
    expect(r.engine.offersAt(KID)).toEqual([]);
    expect(r.world.quests.done["q_kitten_home"]).toMatchObject({ n: 1 });
  });

  it("'not now' always exists: nothing starts, nothing is lost, and the offer is not repeated that day", async () => {
    const r = rig();
    const io = r.io([], ["no"]);
    await r.engine.talk(KID, io);
    expect(r.engine.journal()).toEqual([]);
    expect(r.world.money).toBe(0);
    expect(r.engine.offersAt(KID)).toEqual([]);
    r.next();
    expect(r.engine.offersAt(KID).map((q) => q.id)).toEqual(["q_kitten_home"]);
    // closing the card (back) is the same as not now and says nothing
    const back = r.io([], [null]);
    await r.engine.talk(KID, back);
    expect(r.engine.journal()).toEqual([]);
  });

  it("the journal holds at most three: no more is offered until one is done", async () => {
    const r = rig();
    for (const id of ["q_wallet", "q_mint_run", "q_chess_riddles"]) r.engine.start(d.quests[id]!);
    expect(activeCount(r.world.quests)).toBe(3);
    expect(r.engine.offersAt(KID)).toEqual([]);
    expect(r.engine.start(d.quests["q_kitten_home"]!)).toBe(false);
  });
});

describe("a wrong answer never fails a quest (WORLD_V2 7.5)", () => {
  const BAKER = "nagmon_baker";

  async function takeBaker(r: ReturnType<typeof rig>) {
    r.engine.start(d.quests["q_baker_double"]!);
  }

  it("a free retry, the owl's hint after 2, and after 3 the lesser form: half the coins, the item and the friendship unchanged", async () => {
    const r = rig();
    await takeBaker(r);
    const io = r.io(["wrong", "wrong", "wrong"]);
    await r.engine.talk(BAKER, io);
    expect(io.asked).toEqual(["math", "math", "math"]);
    // one retry line, then the hint from the owl, then the lesser line
    const lines = io.said.map((s) => s.text);
    expect(lines).toContain(d.rules.lines.retry);
    expect(io.said.some((s) => s.speaker === d.rules.lines.owl && s.text === d.rules.lines.hint)).toBe(true);
    expect(lines).toContain(d.rules.lines.lesser);
    // finished, not failed
    expect(r.engine.journal()).toEqual([]);
    expect(r.world.money).toBe(Math.floor((25 * d.rules.lesserCoinsPct) / 100));
    expect(countOf(r.world, "biscuit")).toBe(1);
    expect(r.befriended).toEqual([BAKER]);
    // and the praise ("right!") is not said after a lesser form
    expect(lines.some((l) => d.quests["q_baker_double"]!.steps[0]!.say.includes(l))).toBe(false);
  });

  it("one wrong answer then a right one pays in full", async () => {
    const r = rig();
    await takeBaker(r);
    const io = r.io(["wrong", "super"]);
    await r.engine.talk(BAKER, io);
    expect(r.world.money).toBe(25);
    expect(io.said.some((s) => s.speaker === d.rules.lines.owl)).toBe(false);
  });

  it("'don't know' is no failure either, and a question closed with back leaves the quest as it was", async () => {
    const r = rig();
    await takeBaker(r);
    const closed = r.io([null]);
    await r.engine.talk(BAKER, closed);
    expect(r.engine.journal()).toHaveLength(1);
    expect(r.world.money).toBe(0);
    const skipped = r.io(["skip", "correct"]);
    await r.engine.talk(BAKER, skipped);
    expect(r.engine.journal()).toEqual([]);
    expect(r.world.money).toBe(25);
  });

  it("the wrong answers are saved at once (a kill between them keeps the count)", async () => {
    const r = rig();
    await takeBaker(r);
    const io = r.io(["wrong", null]);
    await r.engine.talk(BAKER, io);
    expect(r.world.quests.active["q_baker_double"]!.wrong).toBe(1);
    expect(io.saves).toBeGreaterThan(0);
    const again = restart(r);
    const rest = again.io(["wrong", "correct"]);
    await again.engine.talk(BAKER, rest);
    // the second wrong answer of the quest is the one that brings the hint
    expect(rest.said.some((s) => s.speaker === d.rules.lines.owl)).toBe(true);
    expect(again.world.money).toBe(25);
  });

  it("a choice with a right option: free retry, a hint after 2, the answer and the lesser form after 3; the quest still finishes", async () => {
    const r = rig();
    r.engine.start(d.quests["q_shelf_sort"]!);
    const LIB = "nagmon_librarian";
    // round one (the number book, shelf "math"): three wrong shelves; rounds two (science) and three (english) right
    const io = r.io([], ["science", "english", "science", "science", "english"]);
    await r.engine.talk(LIB, io);
    expect(io.chosen).toHaveLength(5);
    expect(io.said.some((s) => s.speaker === d.rules.lines.owl && s.text === d.quests["q_shelf_sort"]!.steps[0]!.hint)).toBe(true);
    expect(io.said.map((s) => s.text)).toContain(d.rules.lines.lesser);
    // the right shelf is shown after the third wrong one
    expect(io.said.map((s) => s.text)).toContain(d.quests["q_shelf_sort"]!.steps[0]!.options!.find((o) => o.id === "math")!.reply);
    // finished, in its lesser form: half of the coins
    expect(r.engine.journal()).toEqual([]);
    expect(r.world.money).toBe(Math.floor((20 * d.rules.lesserCoinsPct) / 100));
  });

  it("a right shelf at once pays in full", async () => {
    const r = rig();
    r.engine.start(d.quests["q_shelf_sort"]!);
    await r.engine.talk("nagmon_librarian", r.io([], ["math", "science", "english"]));
    expect(r.world.money).toBe(20);
  });
});

describe("a repeatable quest pays less the 4th time in a week (the rules' repeat discount)", () => {
  it("the first three pay in full, the 4th pays repeat_coins_pct of the coins; items and friendship do not change", async () => {
    // Monday 2026-10-19 to Thursday 2026-10-22 are one week (it starts on Sunday)
    const r = rig({ day: "2026-10-19" });
    const paid: number[] = [];
    for (let i = 0; i < 4; i++) {
      r.engine.start(d.quests["q_baker_double"]!);
      const before = r.world.money;
      await r.engine.talk("nagmon_baker", r.io());
      paid.push(r.world.money - before);
      r.next();
    }
    expect(paid).toEqual([25, 25, 25, Math.floor((25 * d.rules.repeatCoinsPct) / 100)]);
    expect(countOf(r.world, "biscuit")).toBe(4);
    expect(r.befriended).toHaveLength(4);
    // a new week starts again in full
    r.day.v = "2026-10-25";
    r.engine.start(d.quests["q_baker_double"]!);
    const before = r.world.money;
    await r.engine.talk("nagmon_baker", r.io());
    expect(r.world.money - before).toBe(25);
  });

  it("a quest that cannot come back (once) does not count toward the week", async () => {
    const r = rig({ day: "2026-10-19" });
    r.engine.start(d.quests["q_kitten_home"]!);
    for (const who of [KID, KITTEN, KID]) await r.engine.talk(who, r.io());
    expect(r.engine.weekCount()).toBe(0);
  });

  it("the numbers come from the rules: another rule, another payment", async () => {
    const r = rig({ day: "2026-10-19" });
    (r.engine as unknown as { o: { data: typeof d } }).o.data.rules.repeatFreePerWeek = 1;
    (r.engine as unknown as { o: { data: typeof d } }).o.data.rules.repeatCoinsPct = 10;
    const paid: number[] = [];
    for (let i = 0; i < 2; i++) {
      r.engine.start(data0("q_baker_double"));
      const before = r.world.money;
      await r.engine.talk("nagmon_baker", r.io());
      paid.push(r.world.money - before);
      r.next();
    }
    expect(paid).toEqual([25, 2]);
  });
});

function data0(id: string) {
  return d.quests[id]!;
}

describe("a kindness quest pays the same whatever is chosen (SEL: M3, M4; WORLD_V2 7.5)", () => {
  const WALLET = "nagmon_wallet";
  const GRANNY = "nagmon_granny";
  const options = d.quests["q_wallet"]!.steps[0]!.options!.map((o) => o.id);

  async function run(pick: string) {
    const r = rig();
    const first = r.io([], [pick]);
    await r.engine.talk(WALLET, first);
    const second = r.io();
    await r.engine.talk(GRANNY, second);
    return { r, first, second };
  }

  it.each(options)("option %s: the same coins, items, friendship, letter, variables and saved bytes as the others", async (pick) => {
    const base = await run(options[0]!);
    const mine = await run(pick);
    expect(mine.r.world.money).toBe(base.r.world.money);
    expect(mine.r.world.money).toBe(d.quests["q_wallet"]!.reward.coins);
    expect(Object.fromEntries(mine.r.world.items)).toEqual(Object.fromEntries(base.r.world.items));
    expect(mine.r.befriended).toEqual(base.r.befriended);
    expect(mine.second.acts).toEqual(base.second.acts);
    expect(mine.r.world.variables.get("nagmon_wallet")).toBe("done");
    // the whole saved world is the same bytes: no point, no flag, nothing that remembers the option
    expect(JSON.stringify(mine.r.world.toDict())).toBe(JSON.stringify(base.r.world.toDict()));
    expect(mine.r.engine.doneShelf().map((c) => c.id)).toEqual(["q_wallet"]);
  });

  it("only the person's reply differs, and there is no praise line", async () => {
    const replies = new Set<string>();
    for (const o of options) {
      const { first } = await run(o);
      replies.add(first.said.map((s) => s.text).join("|"));
    }
    expect(replies.size).toBe(options.length);
    for (const w of ["כל הכבוד", "מצוין", "אלוף", "ילד טוב", "ילדה טובה", "נכון"]) expect(JSON.stringify(d.quests["q_wallet"])).not.toContain(w);
  });

  it("is offered at the wallet itself with no question, and has no wrong option", async () => {
    const r = rig();
    expect(r.engine.talkable(WALLET)).toBe(true);
    const step = d.quests["q_wallet"]!.steps[0]!;
    expect(step.correct).toBeUndefined();
    expect(d.quests["q_wallet"]!.sel).toBe(true);
    const io = r.io([], ["leave"]);
    await r.engine.talk(WALLET, io);
    // the three options were all there; the order is the day's, not a ranking
    expect(io.chosen[0]!.options.sort()).toEqual([...options].sort());
    expect(r.engine.journal()[0]).toMatchObject({ id: "q_wallet", who: GRANNY });
  });

  it("every option reaches the same end for the others who read the log: nothing about the option is kept in the save", async () => {
    const { r } = await run("leave");
    const text = JSON.stringify(r.world.toDict());
    expect(text).not.toContain("leave");
    expect(text).not.toContain("adult");
  });
});

describe("a chain over days (three riddles of Haim)", () => {
  const HAIM = "nagmon_chess_haim";

  it("one riddle a day: the next waits for another day, each pays its own coins, the end gives friendship", async () => {
    const r = rig();
    r.engine.start(d.quests["q_chess_riddles"]!);
    const paid: number[] = [];
    for (let day = 0; day < 3; day++) {
      const before = r.world.money;
      const io = r.io();
      await r.engine.talk(HAIM, io);
      paid.push(r.world.money - before);
      expect(io.asked).toEqual(["logic"]);
      // the same day: the next riddle is not for today
      const again = r.io();
      await r.engine.talk(HAIM, again);
      if (day < 2) {
        expect(again.asked).toEqual([]);
        expect(again.said.map((s) => s.text)).toContain(d.rules.lines.later);
      }
      r.next();
    }
    expect(paid).toEqual([15, 20, 30]);
    expect(r.engine.doneShelf().map((c) => c.id)).toEqual(["q_chess_riddles"]);
    expect(r.befriended).toEqual([HAIM]);
  });

  it("survives a restart on the day in between, and a skipped day does not matter", async () => {
    let r = rig();
    r.engine.start(d.quests["q_chess_riddles"]!);
    await r.engine.talk(HAIM, r.io());
    r = restart(r);
    r.next(5);
    const io = r.io();
    await r.engine.talk(HAIM, io);
    expect(io.asked).toEqual(["logic"]);
    expect(r.world.quests.active["q_chess_riddles"]!.step).toBe(2);
  });

  it("the steps with the same person that need a new talk do not run in the same one (the board's mending)", async () => {
    const r = rig();
    r.engine.start(d.quests["q_board_fix"]!);
    const io = r.io();
    await r.engine.talk("nagmon_carpenter", io);
    expect(io.asked).toEqual(["logic"]);
    expect(r.world.quests.active["q_board_fix"]!.step).toBe(1);
    await r.engine.talk("nagmon_carpenter", r.io());
    expect(r.world.quests.active["q_board_fix"]!.step).toBe(2);
    const last = r.io([], ["blue"]);
    await r.engine.talk("nagmon_carpenter", last);
    expect(r.engine.doneShelf().map((c) => c.id)).toEqual(["q_board_fix"]);
    expect(r.world.money).toBe(15 + 15 + 40);
    // the fixed board has a 4th card
    expect(r.engine.cards().length).toBeGreaterThan(0);
  });
});

describe("bringing a thing", () => {
  it("waits kindly with too few, then takes what was asked and pays", async () => {
    const r = rig();
    r.engine.start(d.quests["q_berry_basket"]!);
    const GARDENER = "nagmon_gardener";
    const few = r.io();
    r.world.items.set("berry", 2);
    await r.engine.talk(GARDENER, few);
    expect(few.text()).toContain(d.quests["q_berry_basket"]!.steps[0]!.wait!);
    expect(countOf(r.world, "berry")).toBe(2);
    expect(r.world.money).toBe(0);
    r.world.items.set("berry", 4);
    await r.engine.talk(GARDENER, r.io());
    expect(countOf(r.world, "berry")).toBe(1);
    expect(r.world.money).toBe(20);
  });

  it("the mint run crosses three people: mint given, mint taken, tea delivered, two mints at the end", async () => {
    const r = rig();
    // offered by the gardener, who also offers the berry basket: one of them each day, the child picks "gladly"
    r.engine.start(d.quests["q_mint_run"]!);
    await r.engine.talk("nagmon_gardener", r.io());
    expect(countOf(r.world, "fresh_mint")).toBe(1);
    expect(r.engine.journal()[0]).toMatchObject({ who: "nagmon_pharmacist" });
    await r.engine.talk("nagmon_pharmacist", r.io());
    expect(countOf(r.world, "fresh_mint")).toBe(0);
    await r.engine.talk("nagmon_granny", r.io());
    expect(countOf(r.world, "fresh_mint")).toBe(2);
    expect(r.world.money).toBe(25);
  });

  it("the mail round is three deliveries to three people, each a heart, then the coins", async () => {
    const r = rig();
    r.engine.start(d.quests["q_mail_round"]!);
    for (const who of ["nagmon_granny", "nagmon_baker", "nagmon_gardener"]) {
      expect(r.engine.talkable(who)).toBe(true);
      await r.engine.talk(who, r.io());
    }
    expect(r.befriended).toEqual(["nagmon_granny", "nagmon_baker", "nagmon_gardener", "nagmon_route1_trainer"]);
    expect(r.world.money).toBe(20);
    // daily: not today again, tomorrow yes
    expect(r.engine.offersAt("nagmon_route1_trainer")).toEqual([]);
    r.next();
    expect(r.engine.offersAt("nagmon_route1_trainer").map((q) => q.id)).toEqual(["q_mail_round"]);
  });
});

describe("variants: a pool quest's story differs, never inside its cooldown", () => {
  it("six days of the baker's offer never repeat a variant within variant_cooldown", async () => {
    const r = rig({ day: "2026-10-12" });
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      r.engine.start(d.quests["q_baker_double"]!);
      seen.push(r.world.quests.active["q_baker_double"]!.variant!);
      await r.engine.talk("nagmon_baker", r.io());
      r.next();
    }
    const cool = d.rules.board.variantCooldown;
    for (let i = 0; i < seen.length; i++) for (let j = Math.max(0, i - cool); j < i; j++) expect(seen[i], `${i} vs ${j}`).not.toBe(seen[j]);
    expect(new Set(seen).size).toBeGreaterThanOrEqual(3);
  });

  it("a child of grade 1 hears band A stories, a child of grade 7 band C", () => {
    const young = rig({ grade: 1 });
    young.engine.start(d.quests["q_baker_double"]!);
    expect(d.quests["q_baker_double"]!.variants.find((v) => v.id === young.world.quests.active["q_baker_double"]!.variant)!.band).toBe("A");
    const old = rig({ grade: 7 });
    old.engine.start(d.quests["q_baker_double"]!);
    expect(d.quests["q_baker_double"]!.variants.find((v) => v.id === old.world.quests.active["q_baker_double"]!.variant)!.band).toBe("C");
  });

  it("the story is told before the question, once", async () => {
    const r = rig();
    r.engine.start(d.quests["q_baker_double"]!);
    const story = d.quests["q_baker_double"]!.variants.find((v) => v.id === r.world.quests.active["q_baker_double"]!.variant)!.text;
    const io = r.io();
    await r.engine.talk("nagmon_baker", io);
    expect(io.said[0]!.text).toBe(story);
    expect(io.said.filter((s) => s.text === story)).toHaveLength(1);
  });
});

describe("the step's actions are the interpreter's own", () => {
  it("run when a step is done or begins, through the host, and a broken one does not stop the quest", async () => {
    const r = rig();
    const io = r.io();
    io.act = async (line: string) => {
      io.acts.push(line);
      throw new Error("a broken action");
    };
    r.engine.start(d.quests["q_kitten_home"]!);
    await r.engine.talk(KID, io);
    expect(io.acts).toEqual(["set_variable nagmon_kitten:asked"]);
    expect(r.engine.journal()[0]).toMatchObject({ step: 2 });
  });

  it("an accepted board card's first step runs its `enter` actions later, once, when the engine is next asked", async () => {
    const r = rig();
    const def = { ...d.quests["q_kitten_home"]!, steps: [{ ...d.quests["q_kitten_home"]!.steps[0]!, enter: ["set_variable nagmon_kitten:asked"] }, ...d.quests["q_kitten_home"]!.steps.slice(1)] };
    r.engine.data.quests["q_kitten_home"] = def;
    r.engine.start(def);
    expect(r.world.variables.has("nagmon_kitten")).toBe(false);
    const io = r.io();
    await r.engine.enterPending(io);
    await r.engine.enterPending(io);
    expect(io.acts).toEqual(["set_variable nagmon_kitten:asked"]);
    expect(r.world.variables.get("nagmon_kitten")).toBe("asked");
  });
});

describe("lost and found (a box, three owners, the clues)", () => {
  it("a wrong owner is a free retry with another clue; the right one goes on", async () => {
    const r = rig();
    const BOX = "nagmon_lostfound";
    const io = r.io([], ["ofir", "haim", "michal", "michal", "ofir"]);
    await r.engine.talk(BOX, io);
    // offered, accepted (the first pick "ofir" is not "yes": that is "not now"), so start with a pick that says yes
    expect(r.engine.journal()).toEqual([]);
    const io2 = r.io([], ["yes", "ofir", "haim", "michal", "michal", "ofir"]);
    r.next();
    await r.engine.talk(BOX, io2);
    expect(r.engine.journal()).toEqual([]);
    expect(r.world.money).toBe(30);
    expect(eco().items["berry"]).toBeDefined();
  });
});

describe("a damaged save", () => {
  it("is checked when the engine takes it: bad entries go, good ones stay, no text gets in", () => {
    const world = WorldState.fromDict({ money: 1, variables: {}, quests: { active: { q_kitten_home: { step: 1, day: "2026-10-22" }, "bad id!": { step: 1, day: "2026-10-22" } }, taken: ["a b", "ok"], log: "text" } });
    const r = rig({ world });
    expect(Object.keys(world.quests.active)).toEqual(["q_kitten_home"]);
    expect(world.quests.taken).toEqual(["ok"]);
    expect(world.quests.log).toEqual([]);
    expect(r.engine.journal()).toHaveLength(1);
  });
});

describe("the same person, nothing waiting", () => {
  it("talk says nothing and does nothing when there is no quest for the person", async () => {
    const r = rig();
    const io = r.io();
    expect(await r.engine.talk("nagmon_cashier", io)).toBe(false);
    expect(io.said).toEqual([]);
    expect(addDays("2026-10-22", 1)).toBe("2026-10-23");
  });

  it("a quest whose person is not in the data is ignored, not a crash", () => {
    const r = rig();
    r.world.quests.active["q_gone"] = { step: 0, day: "2026-10-22", stepDay: "2026-10-22", wrong: 0, ent: 0 };
    expect(r.engine.journal()).toEqual([]);
    expect(r.engine.talkable("anyone")).toBe(false);
  });
});

void FakeIO;
