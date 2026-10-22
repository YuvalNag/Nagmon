import { describe, expect, it } from "vitest";
import { claimGift, COINS_PER_WEEK, deliver, inbox, MAIL_KEEP, mailData, markRead, parseMail, queueEvent, unreadCount } from "../../../src/core/game/mail";
import { countOf } from "../../../src/core/game/items";
import { WorldState } from "../../../src/core/world/worldState";
import { days, eco, smallMail, worldWith } from "./helpers";

describe("the daily postcard", () => {
  it("arrives once a day, however many times the mail is checked", () => {
    const w = worldWith();
    const data = smallMail();
    expect(deliver(w, data, "2026-10-22")).toHaveLength(1);
    expect(deliver(w, data, "2026-10-22")).toHaveLength(0);
    expect(deliver(w, data, "2026-10-22")).toHaveLength(0);
    expect(w.mail.items).toHaveLength(1);
    expect(deliver(w, data, "2026-10-23")).toHaveLength(1);
    expect(w.mail.items).toHaveLength(2);
  });

  it("comes from the people the child knows: the owl at first, a neighbour once met", () => {
    const w = worldWith();
    const data = smallMail();
    for (const d of days("2026-10-01", 6)) deliver(w, data, d);
    expect(new Set(w.mail.items.map((i) => i.from))).toEqual(new Set(["nagmon_owl"]));
    w.met["nagmon_granny"] = { first: "2026-10-07", last: "2026-10-07", hearts: 0 };
    for (const d of days("2026-10-07", 6)) deliver(w, data, d);
    expect(new Set(w.mail.items.map((i) => i.from))).toEqual(new Set(["nagmon_owl", "nagmon_granny"]));
  });

  it("rotates the sender and never gives the same variant of a letter twice in a row", () => {
    const w = worldWith();
    w.met["nagmon_granny"] = { first: "2026-10-01", last: "2026-10-01", hearts: 0 };
    const data = smallMail();
    for (const d of days("2026-10-01", 40)) deliver(w, data, d);
    const items = w.mail.items;
    for (const id of ["pc_owl", "pc_granny"]) {
      const mine = items.filter((i) => i.id === id);
      expect(mine.length).toBeGreaterThan(5);
      for (let k = 1; k < mine.length; k++) expect(mine[k]!.v, `${id} ${k}`).not.toBe(mine[k - 1]!.v);
    }
    const senders = items.slice(-6).map((i) => i.from);
    expect(new Set(senders).size).toBe(2);
  });

  it("is the same on any phone: the same day and the same save give the same letter", () => {
    const a = worldWith();
    const b = worldWith();
    deliver(a, smallMail(), "2026-10-22");
    deliver(b, smallMail(), "2026-10-22");
    expect(a.mail).toEqual(b.mail);
  });

  it("carries a gift on about one postcard in four", () => {
    const w = worldWith();
    const data = smallMail();
    let gifts = 0;
    const n = 240;
    for (const d of days("2026-01-01", n)) {
      gifts += deliver(w, data, d).filter((i) => i.gift).length;
      for (const i of w.mail.items) i.read = true;
    }
    expect(gifts).toBeGreaterThan(n / 4 - 20);
    expect(gifts).toBeLessThan(n / 4 + 20);
  });
});

describe("event letters", () => {
  it("arrive the next morning, not the same day", () => {
    const w = worldWith();
    const data = smallMail();
    expect(queueEvent(w, data, "thanks", "2026-10-22")).toBe(true);
    deliver(w, data, "2026-10-22");
    expect(w.mail.items.filter((i) => i.kind === "event")).toHaveLength(0);
    deliver(w, data, "2026-10-23");
    expect(w.mail.items.filter((i) => i.kind === "event")).toHaveLength(1);
    expect(w.mail.pending).toHaveLength(0);
  });

  it("are at most three a day: the rest wait for the next morning, none is lost", () => {
    const w = worldWith();
    const data = smallMail();
    for (let k = 0; k < 5; k++) w.mail.pending.push({ id: "thanks", after: "2026-10-21" });
    deliver(w, data, "2026-10-22");
    expect(w.mail.items.filter((i) => i.kind === "event")).toHaveLength(3);
    expect(w.mail.pending).toHaveLength(2);
    deliver(w, data, "2026-10-22");
    expect(w.mail.items.filter((i) => i.kind === "event")).toHaveLength(3);
    deliver(w, data, "2026-10-23");
    expect(w.mail.items.filter((i) => i.kind === "event")).toHaveLength(5);
    expect(w.mail.pending).toHaveLength(0);
  });

  it("refuses a letter that does not exist or is a postcard", () => {
    const w = worldWith();
    expect(queueEvent(w, smallMail(), "nope", "2026-10-22")).toBe(false);
    expect(queueEvent(w, smallMail(), "pc_owl", "2026-10-22")).toBe(false);
  });
});

describe("the mail box keeps 30", () => {
  it("drops the oldest read letters first and keeps the unread ones", () => {
    const w = worldWith();
    const data = smallMail();
    for (const d of days("2026-01-01", 29)) deliver(w, data, d);
    expect(w.mail.items).toHaveLength(29);
    // the first three are read; the rest are not
    for (const i of w.mail.items.slice(0, 3)) i.read = true;
    for (const d of days("2026-02-01", 5)) deliver(w, data, d);
    expect(w.mail.items).toHaveLength(MAIL_KEEP);
    expect(w.mail.items.filter((i) => i.read)).toHaveLength(0);
    // 34 arrived, 3 read ones fell off, then the oldest unread one
    expect(unreadCount(w)).toBe(MAIL_KEEP);
  });

  it("never holds more than 30 even when all are unread, and the newest is always kept", () => {
    const w = worldWith();
    const data = smallMail();
    for (const d of days("2026-01-01", 80)) deliver(w, data, d);
    expect(w.mail.items).toHaveLength(MAIL_KEEP);
    expect(inbox(w)[0]!.day).toBe("2026-03-21");
  });

  it("keeps a read letter whose gift was not taken, as long as something else can go", () => {
    const w = worldWith();
    const data = smallMail();
    for (const d of days("2026-01-01", 30)) deliver(w, data, d);
    w.mail.items[0]!.read = true;
    w.mail.items[0]!.gift = { item: "berry", n: 1 };
    w.mail.items[1]!.read = true;
    deliver(w, data, "2026-02-01");
    expect(w.mail.items.find((i) => i.uid === w.mail.items[0]!.uid)).toBeDefined();
    expect(w.mail.items.some((i) => i.day === "2026-01-02")).toBe(false);
  });
});

describe("gifts", () => {
  const withGift = (gift: { coins?: number; item?: string; n?: number }) => {
    const w = worldWith();
    const data = smallMail();
    deliver(w, data, "2026-10-22");
    w.mail.items[0]!.gift = gift;
    return { w, data, uid: w.mail.items[0]!.uid };
  };

  it("is taken once", () => {
    const { w, data, uid } = withGift({ coins: 10 });
    const first = claimGift(w, eco(), data, uid, "2026-10-22");
    expect(first.taken).toBe(true);
    expect(w.money).toBe(10);
    expect(claimGift(w, eco(), data, uid, "2026-10-22").taken).toBe(false);
    expect(w.money).toBe(10);
  });

  it("an item goes into the Bag", () => {
    const { w, data, uid } = withGift({ item: "berry", n: 2 });
    claimGift(w, eco(), data, uid, "2026-10-22");
    expect(countOf(w, "berry")).toBe(2);
    expect(w.money).toBe(0);
  });

  it("at most 20 coins a week come from mail: the third coin gift of a week is a berry instead", () => {
    const w = worldWith();
    const data = smallMail();
    const give = (day: string) => {
      deliver(w, data, day);
      const item = w.mail.items[w.mail.items.length - 1]!;
      item.gift = { coins: 10 };
      return claimGift(w, eco(), data, item.uid, day);
    };
    // 2026-10-25 is a Sunday: the 25th to the 31st is one week
    expect(give("2026-10-25").prize?.coins).toBe(10);
    expect(give("2026-10-26").prize?.coins).toBe(10);
    const third = give("2026-10-27");
    expect(third.taken).toBe(true);
    expect(third.prize?.coins).toBe(0);
    expect(third.prize?.item).toBe("berry");
    expect(w.money).toBe(COINS_PER_WEEK);
    // the next week starts again
    expect(give("2026-11-01").prize?.coins).toBe(10);
    expect(w.money).toBe(COINS_PER_WEEK + 10);
  });
});

describe("reading and saving", () => {
  it("marks a letter read once", () => {
    const w = worldWith();
    deliver(w, smallMail(), "2026-10-22");
    const uid = w.mail.items[0]!.uid;
    expect(unreadCount(w)).toBe(1);
    expect(markRead(w, uid)).toBe(true);
    expect(markRead(w, uid)).toBe(false);
    expect(unreadCount(w)).toBe(0);
  });

  it("is saved with the world and read back the same", () => {
    const w = worldWith(2);
    const data = smallMail();
    deliver(w, data, "2026-10-22");
    queueEvent(w, data, "thanks", "2026-10-22");
    markRead(w, w.mail.items[0]!.uid);
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.mail).toEqual(w.mail);
  });

  it("leaves no child name or free text in the save", () => {
    const w = worldWith();
    deliver(w, smallMail(), "2026-10-22");
    const text = JSON.stringify(w.toDict());
    expect(text).not.toContain("אחת");
    expect(text).not.toContain("סבתא");
  });

  it("an unreadable box is an empty one", () => {
    expect(parseMail("junk").items).toEqual([]);
    expect(parseMail({ items: [{ uid: 1 }, null, 3] }).items).toEqual([]);
  });

  it("the shipped letters are read: every postcard sender can send, every event letter has a sender", () => {
    const real = mailData({ senders: { a: { name_he: "א" } }, letters: { x: { from: "b", variants: [{ text_he: "x" }] }, y: { from: "a", variants: [] }, z: { from: "a", variants: [{ text_he: "ok" }] } } });
    expect(Object.keys(real.letters)).toEqual(["z"]);
  });
});
