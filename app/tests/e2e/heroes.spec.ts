import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { touch, typeCode } from "./touch";

/**
 * The hero picker (docs/app/HEROES.md) at the family's phone (873x393), at 100% and 130% text, with the three
 * shipped heroes and with a roster of 12 (previewed from localStorage): every hero has a card with its name and a
 * finger-sized target, the cards wrap in rows (and scroll when the rows do not fit), the last hero can be reached
 * and picked, and the child is saved with that hero's id.
 */

const id = (s: string) => `[data-id="${s}"]`;
const MIN_TARGET = 48;

/** The shipped three, repeated under new ids to make `n` heroes. */
function roster(n: number) {
  const base = [
    { id: "boy_blue", map: "nagmon_hero_boy", face: "boy_blue", primary: "#305070" },
    { id: "girl_teal", map: "nagmon_hero_girl", face: "girl_teal", primary: "#309090" },
    { id: "girl_curly", map: "nagmon_hero_curly", face: "girl_curly", primary: "#2a9090" },
  ];
  const names = ["כחול", "פרחים", "תלתלים", "כוכב", "ירח", "שמש", "ענן", "גשם", "רוח", "פלג", "הר", "עמק"];
  return {
    version: 1,
    max: 12,
    fallback: "boy_blue",
    legacy: {},
    heroes: Array.from({ length: n }, (_, i) => {
      const b = base[i % 3]!;
      return {
        id: i < 3 ? b.id : `hero_${i}`,
        order: i * 10,
        enabled: true,
        name: { he: names[i]!, en: names[i]! },
        colors: { primary: b.primary, secondary: "#000000" },
        art: { map: "", portrait: "", face: "" },
        files: {
          map: { file: `sprites/npc/${b.map}.png`, frame: [128, 256], scale: 8 },
          portrait: { file: `sprites/portraits/${b.map}.png` },
          face: { file: `avatars/${b.face}.png` },
        },
      };
    }),
  };
}

async function toAvatar(page: Page, scale: number, n: number) {
  await page.addInitScript(
    ({ scale, data }) => {
      const set = () => document.documentElement?.style.setProperty("--font-scale", String(scale));
      set();
      document.addEventListener("DOMContentLoaded", set);
      if (data) localStorage.setItem("nagmon.heroes.preview", JSON.stringify(data));
    },
    { scale, data: n === 3 ? null : roster(n) },
  );
  await page.goto("/");
  await touch(page, page.locator(id("new_child")), 30);
  await typeCode(page, "12341234", { holdMs: 30, gapMs: 60 });
  await touch(page, page.locator(id("next")), 30);
  for (const c of "נועה") await touch(page, page.locator(id(`letter_${c}`)), 20);
  await touch(page, page.locator(id("board_done")), 30);
  await touch(page, page.locator(id("choice_2")), 30);
  await expect(page.locator("[data-screen=avatar]")).toBeVisible();
}

for (const scale of [1, 1.3]) {
  for (const n of [3, 12]) {
    test(`${n} heroes: every one is a finger-sized card, the last is reachable and saved, at ${scale * 100}% text`, async ({ page }, info) => {
      await toAvatar(page, scale, n);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath(`${scale * 100}-${n}-avatar.png`) });
      const cards = page.locator("[data-screen=avatar] .card");
      await expect(cards).toHaveCount(n);
      const m = await page.evaluate(() => ({
        // the page itself does not scroll sideways
        pageX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        vw: innerWidth,
        cards: [...document.querySelectorAll<HTMLElement>("[data-screen=avatar] .card")].map((c) => {
          const r = c.getBoundingClientRect();
          const label = c.querySelector("span")!;
          return { w: r.width, h: r.height, left: r.left, right: r.right, labelCut: label.scrollWidth - label.clientWidth, lines: label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight), text: label.textContent };
        }),
        list: (() => {
          const l = document.querySelector<HTMLElement>("[data-screen=avatar] .cards")!;
          return { scrolls: l.scrollHeight > l.clientHeight + 1, top: l.getBoundingClientRect().top, bottom: l.getBoundingClientRect().bottom, vh: innerHeight };
        })(),
      }));
      expect(m.pageX).toBeLessThanOrEqual(0);
      for (const c of m.cards) {
        expect(c.w, `${c.text} wide`).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(c.h, `${c.text} tall`).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(c.left, c.text!).toBeGreaterThanOrEqual(-1);
        expect(c.right, c.text!).toBeLessThanOrEqual(m.vw + 1);
        // a name of up to 6 letters stays whole on one line
        if ([...(c.text ?? "")].length <= 6) expect(c.lines, `${c.text} broken`).toBeLessThan(1.5);
        expect(c.labelCut, `${c.text} cut off`).toBeLessThanOrEqual(1);
      }
      // the list stays on the screen; if the rows do not fit it scrolls (12 at 130%), else it all shows
      expect(m.list.bottom).toBeLessThanOrEqual(m.list.vh + 1);
      if (n === 3) expect(m.list.scrolls).toBe(false);
      // the last hero: scroll to it, tap it
      const last = page.locator(`[data-screen=avatar] .card`).last();
      const lastId = (await last.getAttribute("data-id"))!.replace("choice_", "");
      await last.scrollIntoViewIfNeeded();
      const box = (await last.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(m.list.vh + 1);
      await touch(page, last, 30);
      await expect(page.locator("[data-screen=notice]")).toContainText("נועה מוכן לשחק");
      const saved = await page.evaluate(() => {
        const k = Object.keys(localStorage).find((k) => /profile\.json$/.test(k))!;
        return JSON.parse(localStorage.getItem(k)!).avatar as string;
      });
      expect(saved).toBe(lastId);
      await touch(page, page.locator(id("next")), 30);
      await expect(page.locator("[data-screen=who-plays] .card")).toHaveText(["נועה"]);
    });
  }
}
