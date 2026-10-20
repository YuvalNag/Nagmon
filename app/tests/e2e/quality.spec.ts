import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { answer, openMap, quiz, readDialog, seedChild, steps, toCashier } from "./cashier";
import { fitsAndSharp, touch, typeCode } from "./touch";

/**
 * Android's quality bar on every screen of the flow, the parents' area too (docs/app/SDD.md §10),
 * at the system's normal font size and at 130%, on a Hebrew and on an
 * English phone (the two projects):
 * - axe-core finds nothing (WCAG 2.2 A and AA, best practice), and Hebrew
 *   text has a contrast of at least 4.5:1, large text too;
 * - every button is at least 48dp (48 CSS px) both ways, has a name, and
 *   its middle and corners are its own (nothing over it, not off the screen);
 * - nothing scrolls, sticks out of the screen or is cut off.
 */

const id = (s: string) => `[data-id="${s}"]`;

// the map projects run only the checks that walk the map (@map); the phone projects run the rest
test.beforeEach(({}, info) => {
  test.skip(info.project.name.startsWith("map") && !info.title.includes("@map"), "a phone project's check");
});
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

async function buttons(page: Page): Promise<{ small: string[]; covered: string[]; count: number }> {
  return page.evaluate((min) => {
    const small: string[] = [];
    const covered: string[] = [];
    const all = [...document.querySelectorAll<HTMLElement>("button")];
    for (const el of all) {
      const b = el.getBoundingClientRect();
      if (b.width < min || b.height < min) small.push(`${el.dataset.id} ${Math.round(b.width)}x${Math.round(b.height)}`);
      // a finger reaches it: the middle and the four corners (inside the
      // rounding) hit this button, not something over it or off the screen
      const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const inset = Math.min(r * 0.4 + 2, b.width / 4, b.height / 4);
      const points: [string, number, number][] = [
        ["middle", b.left + b.width / 2, b.top + b.height / 2],
        ["top start", b.left + inset, b.top + inset],
        ["top end", b.right - inset, b.top + inset],
        ["bottom start", b.left + inset, b.bottom - inset],
        ["bottom end", b.right - inset, b.bottom - inset],
      ];
      for (const [where, x, y] of points) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !el.contains(hit)) {
          covered.push(`${el.dataset.id} ${where}: ${hit ? ((hit as HTMLElement).dataset.id ?? (hit.className || hit.tagName)) : "off the screen"}`);
        }
      }
    }
    return { small, covered, count: all.length };
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
  const { small, covered, count } = await buttons(page);
  expect(count, `${label}: buttons`).toBeGreaterThan(0);
  expect(small, `${label}: buttons under ${MIN_TARGET}dp`).toEqual([]);
  expect(covered, `${label}: buttons covered or cut off`).toEqual([]);
  for (const b of await page.locator("button").all()) await expect(b, `${label}: a button's name`).toHaveAccessibleName(/\S/);
  expect(await clipped(page), `${label}: cut off or spilling over`).toEqual([]);
}

for (const scale of [1, 1.3]) {
  test(`every screen of the flow passes axe, 48dp and no clipping, at ${scale * 100}% text`, async ({ page }, info) => {
    // the whole flow, the map and the parents' area, two axe runs on each screen
    test.setTimeout(180_000);
    if (scale !== 1) {
      await page.addInitScript((s) => {
        const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
        set();
        document.addEventListener("DOMContentLoaded", set);
      }, scale);
    }
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    const screen = (name: string) => expect(page.locator(`[data-screen=${name}]`)).toBeVisible();

    // the test seed: the question showing can be read (window.__nagmonQuiz), for the owl's intro
    await page.addInitScript(() => localStorage.setItem("nagmon.quiz.seed", "3"));
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
    // the map, once it is up (Phaser loads on demand), and its pause menu
    await expect(page.locator("[data-screen=play][data-map=ready]")).toBeVisible({ timeout: 20_000 });
    // a new child's first minute is the owl's intro (it has its own audit below): its dialog, six questions, one of three creatures
    await readDialog(page);
    for (let i = 0; i < 6; i++) {
      await answer(page, "right");
      await touch(page, page.locator(id("quiz_continue")), 30);
    }
    await readDialog(page);
    await touch(page, page.locator("[data-id^=starter_]").first(), 30);
    await readDialog(page);
    await expect(page.locator(id("dpad"))).toBeVisible();
    await audit(page, "11_play", shot);
    await touch(page, page.locator(id("map_menu")), 30);
    await screen("map-menu");
    await audit(page, "11b_map_menu", shot);
    // out of the map through its menu
    await touch(page, page.locator(id("map_exit")), 30);
    await screen("who-plays");

    await touch(page, page.locator(id("parents")), 30);
    await screen("pin");
    await typeCode(page, "0000", { holdMs: 30, gapMs: 60 });
    await expect(page.locator("[data-screen=pin] .message")).not.toBeEmpty();
    await audit(page, "12_pin_wrong", shot);
    await typeCode(page, "1234", { holdMs: 30, gapMs: 60 });
    await screen("parents");
    await audit(page, "13_parents", shot);

    // the parents' area, every page of it (docs/app/SDD.md §7)
    await touch(page, page.locator(id("parents_children")), 30);
    await screen("parents-children");
    await audit(page, "14_parents_children", shot);
    await touch(page, page.locator("[data-screen=parents-children] .card"), 30);
    await screen("parents-child");
    await audit(page, "15_parents_child", shot);
    await touch(page, page.locator(id("child_grade")), 30);
    await screen("parents-grade");
    await audit(page, "16_parents_grade", shot);
    await touch(page, page.locator(id("choice_4")), 30);
    await expect(page.locator("[data-screen=parents-child] [role=status]")).toHaveText("נשמר.");
    await audit(page, "17_parents_child_saved", shot);
    await touch(page, page.locator(id("child_delete")), 30);
    await screen("parents-delete");
    await audit(page, "18_parents_delete", shot);
    await touch(page, page.locator(id("confirm_no")), 30);
    await touch(page, page.locator(id("back")), 30);
    await touch(page, page.locator(id("back")), 30);
    await screen("parents");

    // a GitHub stand-in: CI never talks to the real one
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type" };
    await page.route("https://api.github.com/**", (route) =>
      route.request().method() === "OPTIONS"
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ status: 200, headers: cors, json: { private: true, permissions: { push: true } } }),
    );
    await touch(page, page.locator(id("parents_github")), 30);
    await screen("parents-github");
    await expect(page.locator(id("gh_status"))).toContainText("לא מחובר");
    await audit(page, "19_parents_github_none", shot);
    await touch(page, page.locator(id("gh_paste")), 30);
    await screen("parents-token");
    await audit(page, "20_parents_token", shot);
    await touch(page, page.locator(id("gh_token_input")), 30);
    await page.keyboard.insertText("github_pat_TEST1111111111111111111111111111fake");
    await touch(page, page.locator(id("gh_token_save")), 30);
    await expect(page.locator(id("gh_status"))).toContainText("מחובר");
    await audit(page, "21_parents_github", shot);
    await touch(page, page.locator(id("gh_send_progress")), 30);
    await screen("parents-confirm");
    await expect(page.locator("[data-screen=parents-confirm]")).toContainText("ילד אחד");
    await audit(page, "22_parents_confirm", shot);
    await touch(page, page.locator(id("confirm_no")), 30);
    await screen("parents-github");
    await touch(page, page.locator(id("back")), 30);
    await touch(page, page.locator(id("parents_pin")), 30);
    await screen("pin");
    await audit(page, "23_parents_pin_current", shot);
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

/**
 * The cashier's screens (M4): the map with the talk button, the dialog,
 * the owl's worked example, the question (choice cards with a picture for
 * a kindergartener, the number pad for an older child), the hint, and the
 * feedback, at 100% and 130% text.
 */
const CHILDREN = [
  { label: "choices", grade: 0, settings: {} },
  { label: "pad", grade: 4, settings: { learning: { answer_mode: "number" } } },
];
for (const scale of [1, 1.3]) {
  for (const child of CHILDREN) {
    test(`the cashier's screens (${child.label}) pass axe, 48dp and no clipping, at ${scale * 100}% text @map`, async ({ page }, info) => {
      // the walk takes real steps on a software-drawn map
      test.setTimeout(240_000);
      await page.addInitScript((s) => {
        const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
        set();
        document.addEventListener("DOMContentLoaded", set);
      }, scale);
      await seedChild(page, { grade: child.grade, settings: child.settings });
      const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${child.label}-${name}.png`) });
      await openMap(page);
      await toCashier(page);
      await audit(page, "20_map_talk", shot);
      await touch(page, page.locator(id("map_talk")), 30);
      const dialog = page.locator("[data-screen=dialog]");
      await expect(dialog).toHaveAttribute("data-full", "true", { timeout: 10_000 });
      await audit(page, "21_dialog", shot);
      while (await dialog.count()) {
        await expect(dialog).toHaveAttribute("data-full", "true", { timeout: 10_000 });
        await touch(page, page.locator(id("dialog")), 30);
      }
      await expect(page.locator("[data-screen=quiz]")).toBeVisible();
      if ((await quiz(page))!.phase === "example") {
        await audit(page, "22_example", shot);
        await touch(page, page.locator(id("quiz_example_done")), 30);
      }
      await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
      expect((await quiz(page))!.kind).toBe(child.label === "pad" ? "number" : "choice");
      await audit(page, "23_question", shot);
      await touch(page, page.locator(id("quiz_hint")), 30);
      await expect(page.locator(id("quiz_hint_text"))).toBeVisible();
      await audit(page, "24_hint", shot);
      await answer(page, "dont_know");
      await audit(page, "25_feedback", shot);
    });
  }
}

/**
 * The owl's intro (M4b): the question with its progress, and the choice
 * of a creature, at 100% and 130% text.
 */
for (const scale of [1, 1.3]) {
  test(`the owl's intro screens pass axe, 48dp and no clipping, at ${scale * 100}% text @map`, async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.addInitScript((s) => {
      const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
      set();
      document.addEventListener("DOMContentLoaded", set);
    }, scale);
    await seedChild(page, { grade: 3, intro: true });
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-intro-${name}.png`) });
    await page.goto("/");
    await touch(page, page.locator(id("child_p00001")), 30);
    await expect(page.locator("[data-screen=play][data-map=ready][data-play=ready]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-screen=dialog]")).toHaveAttribute("data-full", "true", { timeout: 10_000 });
    await audit(page, "30_owl", shot);
    await readDialog(page);
    await expect(page.locator("[data-screen=intro-ask]")).toBeVisible();
    if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")), 30);
    await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
    await audit(page, "31_question", shot);
    for (let i = 0; i < 6; i++) {
      if (i > 0) await expect(page.locator("[data-screen=intro-ask]")).toHaveAttribute("data-n", String(i + 1));
      await answer(page, "right");
      if (i === 0) await audit(page, "32_feedback", shot);
      await touch(page, page.locator(id("quiz_continue")), 30);
    }
    await readDialog(page);
    await expect(page.locator("[data-screen=intro-starters]")).toBeVisible();
    await audit(page, "33_starters", shot);
  });
}

/** The battle's screens: the meeting, the question, the turn and the friend, at 100% and 130% text. */
for (const scale of [1, 1.3]) {
  test(`the battle's screens pass axe, 48dp and no clipping, at ${scale * 100}% text @map`, async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.addInitScript((s) => {
      const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
      set();
      document.addEventListener("DOMContentLoaded", set);
    }, scale);
    await seedChild(page, { grade: 2, battle: true });
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-battle-${name}.png`) });
    await openMap(page);
    await steps(page, "right", 1);
    await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
    await audit(page, "40_meet", shot);
    await touch(page, page.locator(id("battle_fight")), 30);
    if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")), 30);
    await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
    await audit(page, "41_question", shot);
    await answer(page, "right");
    await touch(page, page.locator(id("quiz_continue")), 30);
    await expect(page.locator("[data-screen=battle][data-view=turn]")).toBeVisible();
    await audit(page, "42_turn", shot);
    for (let i = 0; i < 12 && (await page.locator("[data-screen=battle]").getAttribute("data-view")) !== "calm"; i++) {
      await touch(page, page.locator(id("battle_next")), 30);
      await answer(page, "right");
      await touch(page, page.locator(id("quiz_continue")), 30);
      if (await page.locator(id("growth_close")).count()) await touch(page, page.locator(id("growth_close")), 30);
    }
    await expect(page.locator("[data-screen=battle][data-view=calm]")).toBeVisible();
    await audit(page, "43_calm", shot);
    for (let i = 0; i < 3 && !(await page.locator("[data-screen=battle-caught]").count()); i++) {
      await touch(page, page.locator(id("battle_net")), 30);
      await answer(page, "right");
      await touch(page, page.locator(id("quiz_continue")), 30);
    }
    await expect(page.locator("[data-screen=battle-caught]")).toBeVisible();
    await audit(page, "44_new_friend", shot);
  });
}
