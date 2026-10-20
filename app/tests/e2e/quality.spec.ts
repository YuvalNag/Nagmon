import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fitsAndSharp, touch, typeCode } from "./touch";

/**
 * Android's quality bar on every screen of the flow (docs/app/SDD.md §10),
 * at the system's normal font size and at 130%, on a Hebrew and on an
 * English phone (the two projects):
 * - axe-core finds nothing (WCAG 2.2 A and AA, best practice), and Hebrew
 *   text has a contrast of at least 4.5:1, large text too;
 * - every button is at least 48dp (48 CSS px) both ways and has a name;
 * - nothing scrolls, sticks out of the screen or is cut off.
 */

const id = (s: string) => `[data-id="${s}"]`;
/** Android's minimum touch target, 48dp = 48 CSS px in the WebView. */
const MIN_TARGET = 48;

/**
 * Text that does not fit inside its box: cut off by it (scrolling
 * content), or drawn over its border (a word wider than its key).
 */
async function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const name = (el: HTMLElement) => el.dataset.id ?? (el.className || el.tagName);
    for (const el of document.querySelectorAll<HTMLElement>(".screen, .screen *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "inline" || cs.display === "contents" || !el.textContent?.trim()) continue;
      const dx = el.scrollWidth - el.clientWidth;
      const dy = el.scrollHeight - el.clientHeight;
      if (dx > 1 || dy > 1) out.push(`${name(el)} scrolls by ${dx}x${dy}px: "${el.textContent.trim().slice(0, 16)}"`);
      // the box's own text, against the inside of its border
      if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const px = (v: string) => parseFloat(v) || 0;
      const inside = {
        left: b.left + px(cs.borderLeftWidth),
        right: b.right - px(cs.borderRightWidth),
        top: b.top + px(cs.borderTopWidth),
        bottom: b.bottom - px(cs.borderBottomWidth),
      };
      if (t.left < inside.left - 0.5 || t.right > inside.right + 0.5 || t.top < inside.top - 0.5 || t.bottom > inside.bottom + 0.5) {
        out.push(`${name(el)}: text ${Math.round(t.width)}x${Math.round(t.height)} over a ${Math.round(inside.right - inside.left)}x${Math.round(inside.bottom - inside.top)} box: "${el.textContent.trim().slice(0, 16)}"`);
      }
    }
    return out;
  });
}

async function buttons(page: Page): Promise<{ small: string[]; count: number }> {
  return page.evaluate((min) => {
    const small: string[] = [];
    const all = [...document.querySelectorAll<HTMLElement>("button")];
    for (const el of all) {
      const b = el.getBoundingClientRect();
      if (b.width < min || b.height < min) small.push(`${el.dataset.id} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return { small, count: all.length };
  }, MIN_TARGET);
}

/** One screen, checked: what is wrong, by kind. */
async function audit(page: Page, label: string, shot: (name: string) => Promise<unknown>) {
  await page.evaluate(() => document.fonts.ready);
  await shot(label);
  await fitsAndSharp(page);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  // 4.5:1 for all text: axe's AAA rule asks that much of large text
  const contrast = await new AxeBuilder({ page }).withRules(["color-contrast-enhanced"]).analyze();
  const found = [...axe.violations, ...contrast.violations].map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}${v.id.startsWith("color") ? ` ${v.nodes[0]?.any[0]?.message ?? ""}` : ""}`,
  );
  expect(found, `${label}: axe`).toEqual([]);
  const { small, count } = await buttons(page);
  expect(count, `${label}: buttons`).toBeGreaterThan(0);
  expect(small, `${label}: buttons under ${MIN_TARGET}dp`).toEqual([]);
  for (const b of await page.locator("button").all()) await expect(b, `${label}: a button's name`).toHaveAccessibleName(/\S/);
  expect(await clipped(page), `${label}: cut off or spilling over`).toEqual([]);
}

for (const scale of [1, 1.3]) {
  test(`every screen of the flow passes axe, 48dp and no clipping, at ${scale * 100}% text`, async ({ page }, info) => {
    if (scale !== 1) {
      await page.addInitScript((s) => {
        const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
        set();
        document.addEventListener("DOMContentLoaded", set);
      }, scale);
    }
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    const screen = (name: string) => expect(page.locator(`[data-screen=${name}]`)).toBeVisible();

    await page.goto("/");
    await screen("who-plays");
    if (scale !== 1) {
      const size = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
      expect(size).toBeGreaterThanOrEqual(24 * scale - 0.5);
    }
    await audit(page, "01_who_plays", shot);

    await touch(page, page.locator(id("new_child")), 30);
    await screen("pin");
    await audit(page, "02_pin_set", shot);
    await typeCode(page, "1234", { holdMs: 30, gapMs: 60 });
    await expect(page.getByText("הקלידו את אותן 4 ספרות שוב")).toBeVisible();
    await audit(page, "03_pin_again", shot);
    await typeCode(page, "1234", { holdMs: 30, gapMs: 60 });
    await screen("notice");
    await audit(page, "04_notice_code_saved", shot);

    await touch(page, page.locator(id("next")), 30);
    await screen("letters");
    for (const c of "דנית") await touch(page, page.locator(id(`letter_${c}`)), 30);
    await audit(page, "05_letters", shot);
    // a refused space shows the message line
    await touch(page, page.locator(id("board_space")), 30);
    await touch(page, page.locator(id("board_space")), 30);
    await expect(page.locator("[data-screen=letters] .message")).not.toBeEmpty();
    await audit(page, "06_letters_message", shot);
    await touch(page, page.locator(id("board_done")), 30);
    await screen("grade");
    await audit(page, "07_grade", shot);
    await touch(page, page.locator(id("choice_3")), 30);
    await screen("avatar");
    await audit(page, "08_avatar", shot);
    await touch(page, page.locator(id("choice_girl_teal")), 30);
    await screen("notice");
    await audit(page, "09_notice_child", shot);
    await touch(page, page.locator(id("next")), 30);
    await expect(page.locator("[data-screen=who-plays] .card")).toHaveCount(1);
    await audit(page, "10_who_plays_child", shot);

    await touch(page, page.locator("[data-screen=who-plays] .card"), 30);
    await screen("play");
    await audit(page, "11_play", shot);
    await touch(page, page.locator(id("switch_player")), 30);

    await touch(page, page.locator(id("parents")), 30);
    await screen("pin");
    await typeCode(page, "0000", { holdMs: 30, gapMs: 60 });
    await expect(page.locator("[data-screen=pin] .message")).not.toBeEmpty();
    await audit(page, "12_pin_wrong", shot);
    await typeCode(page, "1234", { holdMs: 30, gapMs: 60 });
    await screen("parents");
    await audit(page, "13_parents", shot);
  });
}

test("the start loads only what who-plays needs: no game engine, a small script", async ({ page }) => {
  const scripts: { url: string; bytes: number; engine: boolean }[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() !== "script") return;
    const body = await r.text();
    scripts.push({ url: r.url(), bytes: body.length, engine: /Phaser\.Game|phaser@|PHASER/.test(body) });
  });
  await page.goto("/");
  await expect(page.locator("[data-screen=who-plays]")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const total = scripts.reduce((n, s) => n + s.bytes, 0);
  console.log(`scripts at start: ${scripts.length}, ${Math.round(total / 1024)} KiB`);
  // Phaser is about 1.2 MB: the map and battle load it when they open
  expect(scripts.filter((s) => s.engine).map((s) => s.url)).toEqual([]);
  expect(total).toBeLessThan(600 * 1024);
});

test("who-plays with eight children, the longest name among them, at 130% text", async ({ page }, info) => {
  await page.addInitScript(() => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", "1.3");
    set();
    document.addEventListener("DOMContentLoaded", set);
    if (localStorage.getItem("seeded")) return;
    localStorage.setItem("seeded", "1");
    // made-up names
    ["אבגדהוזחטיכלמנסע", "בר", "גל", "דנה", "הדר", "ורד", "זיו", "חן"].forEach((name, i) => {
      const pid = `p0000${i}`;
      localStorage.setItem("nagmon-fs:d:profiles", "");
      localStorage.setItem(`nagmon-fs:d:profiles/${pid}`, "");
      localStorage.setItem(
        `nagmon-fs:f:profiles/${pid}/profile.json`,
        JSON.stringify({ id: pid, name, avatar: ["boy_blue", "girl_teal", "girl_curly"][i % 3], grade: 2, order: i, schema_version: 2 }),
      );
    });
  });
  await page.goto("/");
  await expect(page.locator("[data-screen=who-plays] .card")).toHaveCount(8);
  await audit(page, "who_eight", (name) => page.screenshot({ path: info.outputPath(`130-${name}.png`) }));
});
