import type { Page } from "@playwright/test";
import { debug, id, openMap, PID, saved, seedChild } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * The working objects of the houses (docs/app/WORLD_V2.md section 8, slice W2), at the family's phone
 * (873x393) at 100% and 130% text: the PC (a friend swapped from a box into the party, the item box, the
 * mail, the journal, the people), the mailbox, the bookshelf, and the TV, the fridge, the library and the
 * notice board. Each screen is measured: nothing cut off, nothing scrolled but its own list, every button a
 * finger (48 dp) wide and tall.
 */

test.describe.configure({ timeout: 240_000 });

const SPECIES = ["heliobud", "lunibble", "terrabub", "rustip", "ringlet", "meteet", "heliolynx", "iobud", "gravip", "probip"];

interface Seed {
  map: string;
  x: number;
  y: number;
  facing: string;
  friends?: number;
  items?: Record<string, number>;
  /** Extra saved fields (mail, journal, met...); `{today}` and `{yesterday}` in a string become the phone's days. */
  extra?: Record<string, unknown>;
  money?: number;
}

/** A child (grade 2, a party and a Meadow) standing at a tile of a map, facing an object. */
async function seed(page: Page, s: Seed) {
  await seedChild(page, { grade: 2 });
  await page.addInitScript(
    ({ pid, s, species }) => {
      if (localStorage.getItem("obj-seeded")) return;
      localStorage.setItem("obj-seeded", "1");
      localStorage.setItem("nagmon.map.start", s.map);
      const p = (n: number) => String(n).padStart(2, "0");
      const day = (back: number) => {
        const d = new Date();
        d.setDate(d.getDate() - back);
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      };
      const fill = (v: unknown): unknown =>
        typeof v === "string" ? v.replace("{today}", day(0)).replace("{yesterday}", day(1)) : Array.isArray(v) ? v.map(fill) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
      const n = s.friends ?? 6;
      const creatures = Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, species: species[i % species.length], level: 4 + i, xp: 0, ...(i === 1 ? { hearts: 3 } : {}) }));
      localStorage.setItem(
        `nagmon-fs:f:profiles/${pid}/saves/world.json`,
        JSON.stringify({
          schema_version: 1,
          money: s.money ?? 40,
          variables: { nagmon_intro_done: "yes", nagmon_kit: "yes" },
          creatures,
          seen: species.slice(0, n),
          caught: species.slice(0, n),
          ...(s.items ? { items: s.items } : {}),
          place: { map: s.map, x: s.x, y: s.y, facing: s.facing },
          ...(fill(s.extra ?? {}) as object),
        }),
      );
    },
    { pid: PID, s, species: SPECIES },
  );
}

/** Large text for the 130% runs. */
async function textScale(page: Page, scale: number) {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, scale);
}

/**
 * Nothing cut off or scrolled, every button a finger's size, no text clipped inside its box. Lists that
 * scroll on purpose (`overflow-y: auto`) are the only thing allowed to be taller than they show.
 */
async function layout(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const g = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>("[data-screen=object]")!;
    const bad: string[] = [];
    for (const el of sheet.querySelectorAll<HTMLElement>("*")) {
      const st = getComputedStyle(el);
      if (st.display === "inline" || st.display === "contents") continue;
      const scrolls = st.overflowY === "auto" || st.overflowY === "scroll";
      if (!scrolls && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) bad.push(`${el.dataset["id"] ?? el.className} taller inside (${el.scrollHeight} > ${el.clientHeight})`);
      if (!scrolls && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) bad.push(`${el.dataset["id"] ?? el.className} wider inside (${el.scrollWidth} > ${el.clientWidth})`);
    }
    // what shows must be inside the screen, even a list's items that are in view
    return {
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      sheetOverflow: sheet.scrollHeight > sheet.clientHeight + 1 || sheet.scrollWidth > sheet.clientWidth + 1,
      bad,
      buttons: [...sheet.querySelectorAll<HTMLElement>("button")]
        .filter((b) => {
          // a button scrolled out of its list's view is not on screen, so it is not measured as cut off
          let p = b.parentElement;
          const r = b.getBoundingClientRect();
          while (p && p !== sheet) {
            const s = getComputedStyle(p);
            if (s.overflowY === "auto") {
              const pr = p.getBoundingClientRect();
              if (r.bottom > pr.bottom + 0.5 || r.top < pr.top - 0.5) return false;
            }
            p = p.parentElement;
          }
          return true;
        })
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { name: b.dataset["id"] ?? b.textContent ?? "", l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
        }),
    };
  });
  expect([g.scrollW <= g.vw, g.scrollH <= g.vh], `${name}: the page scrolls`).toEqual([true, true]);
  expect(g.sheetOverflow, `${name}: the screen overflows`).toBe(false);
  expect(g.bad, `${name}: text or boxes overflow`).toEqual([]);
  for (const b of g.buttons) {
    expect(b.l, `${name}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${name}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.t, `${name}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.b, `${name}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
    expect(Math.min(b.w, b.h), `${name}: ${b.name} is under 48`).toBeGreaterThanOrEqual(48);
  }
}

/** Facing the object, the talk button opens its screen (the dialog before it, if the event has one). */
async function openObject(page: Page, slug: string) {
  await openMap(page);
  expect((await debug(page))!.inFront).toBe(slug);
  await touch(page, page.locator(id("map_talk")));
  await expect(page.locator("[data-screen=object]")).toBeVisible();
}

for (const scale of [1, 1.3]) {
  test.describe(`at ${scale * 100}% text`, () => {
    test.beforeEach(async ({ page }) => {
      await textScale(page, scale);
    });

    test("the PC: a friend moves from a box into the party, items go to the box, the mail, the journal and the people", async ({ page }, info) => {
      const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
      await seed(page, {
        map: "nagmon_home",
        x: 2,
        y: 3,
        facing: "up",
        friends: 7,
        items: { berry: 12, clover: 2 },
        extra: {
          journal: { read: { owl_night: "{yesterday}", math_zero: "{today}", en_cat: "{today}" }, stamps: 2, bookmarks: 0 },
          met: { nagmon_cashier: { first: "{yesterday}", last: "{today}", hearts: 2 }, nagmon_house_nurse: { first: "{today}", last: "{today}", hearts: 0 } },
        },
      });
      await openObject(page, "nagmon_obj_pc");
      await shot("pc_boxes");
      await expect(page.locator("[data-screen=object][data-tab=boxes]")).toBeVisible();
      await layout(page, "boxes");

      // c5 is in the first box (the Meadow), c2 is in the party: tap one of each and they swap
      const before = ((await saved(page, "saves/world.json")) as { creatures: { id: string }[] }).creatures.map((c) => c.id);
      expect(before.slice(0, 4)).toEqual(["c1", "c2", "c3", "c4"]);
      await touch(page, page.locator(id("box_party_c2")));
      await expect(page.locator(id("box_party_c2"))).toHaveAttribute("aria-pressed", "true");
      await touch(page, page.locator(id("box_friend_c5")));
      await expect(page.locator(id("box_said"))).toContainText("החליפו מקום");
      await expect(page.locator(id("box_party_c5"))).toBeVisible();
      await expect(page.locator(id("box_friend_c2"))).toBeVisible();
      await layout(page, "boxes after the swap");
      await shot("pc_boxes_swapped");
      await expect
        .poll(async () => ((await saved(page, "saves/world.json")) as { creatures: { id: string }[] }).creatures.map((c) => c.id))
        .toEqual(["c1", "c5", "c3", "c4", "c2", "c6", "c7"]);
      // nobody was lost and no friend was deleted
      const after = ((await saved(page, "saves/world.json")) as { creatures: { id: string }[] }).creatures.map((c) => c.id);
      expect([...after].sort()).toEqual([...before].sort());

      // a star, and the sort chips
      await touch(page, page.locator(id("box_star_c7")));
      await expect(page.locator(id("box_star_c7"))).toHaveAttribute("aria-pressed", "true");
      await touch(page, page.locator(id("box_sort_subject")));
      await expect(page.locator(id("box_sort_subject"))).toHaveAttribute("aria-pressed", "true");
      await layout(page, "boxes sorted");

      // the items: 3 berries into the box, then all of the clovers; the Bag and the box agree
      await touch(page, page.locator(id("pc_tab_items")));
      await expect(page.locator(id("items_row_berry"))).toBeVisible();
      await shot("pc_items");
      await layout(page, "items");
      await touch(page, page.locator(id("items_in_berry")));
      await expect(page.locator(id("items_bag_berry"))).toContainText("11");
      await expect(page.locator(id("items_box_berry"))).toContainText("1");
      await touch(page, page.locator(id("items_in_all_clover")));
      await expect(page.locator(id("items_box_clover"))).toContainText("2");
      await expect
        .poll(async () => (await saved(page, "saves/world.json")) as { items?: Record<string, number>; pc?: { box: Record<string, number> } })
        .toMatchObject({ items: { berry: 11 }, pc: { box: { berry: 1, clover: 2 } } });

      // the mail: today's postcard has come (the owl's), unread, with a fact
      await touch(page, page.locator(id("pc_tab_mail")));
      await expect(page.locator(id("mail_list"))).toHaveAttribute("data-count", "1");
      await shot("pc_mail");
      await layout(page, "mail list");
      await touch(page, page.locator("[data-id^=mail_item_]").first());
      await expect(page.locator(id("letter_text"))).toContainText("תמר");
      await shot("pc_letter");
      await layout(page, "a letter");
      await touch(page, page.locator(id("mail_back")));
      await expect(page.locator(id("mail_list"))).toBeVisible();

      // the journal: facts by subject, kind words, a recap with three questions from the week
      await touch(page, page.locator(id("pc_tab_journal")));
      await expect(page.locator(id("journal"))).toBeVisible();
      await shot("pc_journal");
      await layout(page, "journal");
      await expect(page.locator(id("journal_words"))).toHaveAttribute("data-tier", /[0-3]/);
      await touch(page, page.locator(id("journal_subject_math")));
      await expect(page.locator(id("journal_fact_math_zero"))).toBeVisible();
      await touch(page, page.locator(id("journal_recap")));
      await expect(page.locator(id("recap"))).toHaveAttribute("data-of", "3");
      await layout(page, "recap question");
      await shot("pc_recap");
      const learner = await saved(page, "learner.json");

      // wrong lines are greyed, the right one finishes; the learner is untouched by a recap
      const choices = page.locator("[data-id^=recall_choice_]");
      for (let i = 0; i < 3; i++) {
        if (await page.locator(id("recall_ok")).count()) break;
        const c = choices.nth(i);
        if (await c.isEnabled()) await touch(page, c);
      }
      await expect(page.locator(id("recall_ok"))).toBeVisible();
      expect(await saved(page, "learner.json")).toEqual(learner);

      // the people met: two cards
      await touch(page, page.locator(id("obj_close")));
      await expect(page.locator("[data-screen=object]")).toHaveCount(0);
      await touch(page, page.locator(id("map_talk")));
      await touch(page, page.locator(id("pc_tab_people")));
      await expect(page.locator(id("person_nagmon_cashier"))).toHaveAttribute("data-hearts", "2");
      await expect(page.locator(id("person_nagmon_house_nurse"))).toBeVisible();
      await shot("pc_people");
      await layout(page, "people");
    });

    test("the mailbox: a postcard, its fact, a recall question that is never wrong for good, a gift taken once", async ({ page }, info) => {
      const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
      // a letter with a gift is waiting (a coin gift), and today's postcard has come already
      await seed(page, {
        map: "nagmon_home",
        x: 2,
        y: 5,
        facing: "down",
        money: 5,
        extra: {
          mail: {
            items: [{ uid: "old:1", id: "postcard_cashier", v: 1, from: "nagmon_cashier", kind: "postcard", day: "{yesterday}", read: false, claimed: false, gift: { coins: 10 } }],
            lastPostcard: "{today}",
            pending: [],
            serial: 1,
          },
        },
      });
      await openObject(page, "nagmon_obj_mailbox");
      await expect(page.locator("[data-screen=object][data-object=mailbox]")).toBeVisible();
      await expect(page.locator(id("mail_list"))).toHaveAttribute("data-count", "1");
      await shot("mailbox_list");
      await layout(page, "mailbox list");
      await touch(page, page.locator("[data-id^=mail_item_]").first());
      await expect(page.locator(id("letter_fact"))).toBeVisible();
      await expect(page.locator(id("letter_text"))).toContainText("תמר");
      await shot("mailbox_letter");
      await layout(page, "mailbox letter");

      // the gift: coins once
      await touch(page, page.locator(id("mail_take")));
      await expect(page.locator(id("mail_taken"))).toContainText("10");
      await expect(page.locator(id("mail_take"))).toHaveCount(0);
      await expect.poll(async () => ((await saved(page, "saves/world.json")) as { money: number }).money).toBe(15);
      const world = (await saved(page, "saves/world.json")) as { mail: { items: { claimed: boolean; read: boolean }[] } };
      expect(world.mail.items[0]).toMatchObject({ claimed: true, read: true });

      // the recall question: a wrong line first, then the right one; nothing is lost either way
      await touch(page, page.locator(id("mail_recall")));
      await expect(page.locator(id("recall"))).toHaveAttribute("data-state", "ask");
      await layout(page, "mailbox recall");
      await shot("mailbox_recall");
      const choices = page.locator("[data-id^=recall_choice_]");
      for (let i = 0; i < 3; i++) {
        if (await page.locator(id("recall_ok")).count()) break;
        await touch(page, choices.nth(i));
      }
      await expect(page.locator(id("recall"))).toHaveAttribute("data-state", "right");
      await touch(page, page.locator(id("recall_ok")));
      await expect(page.locator(id("letter_fact"))).toBeVisible();
      await touch(page, page.locator(id("mail_back")));
      await touch(page, page.locator(id("obj_close")));
      await expect(page.locator("[data-screen=object]")).toHaveCount(0);
    });

    test("the bookshelf: three books, a stamp for the third, the fact lands in the journal", async ({ page }, info) => {
      const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
      await seed(page, { map: "nagmon_home", x: 5, y: 3, facing: "up" });
      await openObject(page, "nagmon_obj_bookshelf");
      await expect(page.locator(id("books"))).toBeVisible();
      await shot("shelf");
      await layout(page, "shelf");
      const books = page.locator("[data-id^=book_]:not([data-id=book_page]):not([data-id=book_fact]):not([data-id=book_recall]):not([data-id=book_back]):not([data-id=book_stamp])");
      await expect(books).toHaveCount(3);
      const ids = await books.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["id"]!.replace("book_", "")));
      for (const [n, book] of ids.entries()) {
        await touch(page, page.locator(id(`book_${book}`)));
        await expect(page.locator(id("book_page"))).toBeVisible();
        await expect(page.locator(id("book_fact"))).not.toBeEmpty();
        if (n === 0) {
          await shot("book_page");
          await layout(page, "a book");
        }
        if (n === 2) {
          await expect(page.locator(id("book_stamp"))).toBeVisible();
          await shot("book_stamp");
          await layout(page, "the stamp");
        } else await expect(page.locator(id("book_stamp"))).toHaveCount(0);
        if (n === 1) {
          await touch(page, page.locator(id("book_recall")));
          await layout(page, "book recall");
          const choices = page.locator("[data-id^=recall_choice_]");
          for (let i = 0; i < 3; i++) {
            if (await page.locator(id("recall_ok")).count()) break;
            await touch(page, choices.nth(i));
          }
          await touch(page, page.locator(id("recall_ok")));
        }
        await touch(page, page.locator(id("book_back")));
        await expect(page.locator(id("books"))).toBeVisible();
      }
      await expect
        .poll(async () => (await saved(page, "saves/world.json")) as { journal?: { read: Record<string, string>; stamps: number } })
        .toMatchObject({ journal: { stamps: 1 } });
      const world = (await saved(page, "saves/world.json")) as { journal: { read: Record<string, string> } };
      expect(Object.keys(world.journal.read).sort()).toEqual([...ids].sort());
      // the Book (the bestiary) opens from the shelf
      await touch(page, page.locator(id("shelf_bestiary")));
      await expect(page.locator("[data-screen=bestiary]")).toBeVisible();
    });
  });
}

test("the TV: off until a channel is picked, three channels that fit, at 130% text", async ({ page }, info) => {
  await textScale(page, 1.3);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`130-${name}.png`) });
  await seed(page, { map: "nagmon_friend_house", x: 2, y: 3, facing: "up", friends: 3 });
  await openObject(page, "nagmon_obj_tv");
  // nothing plays by itself: the set is off until a channel is picked
  await expect(page.locator(id("tv"))).toHaveAttribute("data-channel", "off");
  await layout(page, "tv off");
  for (const c of ["sky", "news", "creature"]) {
    await touch(page, page.locator(id(`tv_channel_${c}`)));
    await expect(page.locator(id("tv"))).toHaveAttribute("data-channel", c);
    await expect(page.locator(id("tv_timer"))).toBeVisible();
    await layout(page, `tv ${c}`);
    await shot(`tv_${c}`);
  }
});

test("the fridge: a snack, a heart for the partner, the second try says tomorrow, at 130% text", async ({ page }, info) => {
  await textScale(page, 1.3);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`130-${name}.png`) });
  await seed(page, { map: "nagmon_friend_house", x: 7, y: 3, facing: "up", friends: 3 });
  await openObject(page, "nagmon_obj_fridge");
  await expect(page.locator(id("fridge"))).toHaveAttribute("data-opened", "false");
  await layout(page, "fridge");
  await shot("fridge");
  await touch(page, page.locator("[data-id^=fridge_snack_]").first());
  await expect(page.locator(id("fridge_said"))).toContainText("לב");
  await expect.poll(async () => ((await saved(page, "saves/world.json")) as { creatures: { hearts?: number }[] }).creatures[0]!.hearts).toBe(1);
  await touch(page, page.locator("[data-id^=fridge_snack_]").nth(1));
  await expect(page.locator(id("fridge_said"))).toContainText("מחר");
  await layout(page, "fridge tomorrow");
  await shot("fridge_done");
  expect(((await saved(page, "saves/world.json")) as { creatures: { hearts?: number }[] }).creatures[0]!.hearts).toBe(1);
});

test("the library and the notice board open and fit, at 130% text", async ({ page }, info) => {
  await textScale(page, 1.3);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`130-${name}.png`) });
  await seed(page, { map: "nagmon_lab", x: 7, y: 4, facing: "up", friends: 2 });
  await openObject(page, "nagmon_obj_library");
  for (const s of ["math", "english"]) {
    await touch(page, page.locator(id(`shelf_subject_${s}`)));
    await expect(page.locator(id("books")).locator("button").first()).toBeVisible();
    await layout(page, `library ${s}`);
  }
  await shot("library");
});

test("the notice board in the square: cards, accept once, kept for good, at 130% text", async ({ page }, info) => {
  await textScale(page, 1.3);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`130-${name}.png`) });
  await seed(page, { map: "classic_hearthrock_city", x: 21, y: 16, facing: "up", friends: 2 });
  await openMap(page);
  await shot("square_map");
  expect((await debug(page))!.inFront).toBe("nagmon_obj_noticeboard");
  await touch(page, page.locator(id("map_talk")));
  await expect(page.locator(id("board"))).toBeVisible();
  await layout(page, "board");
  await shot("board");
  const accept = page.locator("[data-id^=board_accept_]").first();
  await touch(page, accept);
  await expect(page.locator(id("board_said"))).toContainText("שמור");
  await expect(accept).toBeDisabled();
  await layout(page, "board accepted");
  await expect.poll(async () => Object.keys(((await saved(page, "saves/world.json")) as { board?: { accepted: object } }).board?.accepted ?? {}).length).toBe(1);
});
