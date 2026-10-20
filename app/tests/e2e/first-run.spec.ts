import { expect, test } from "@playwright/test";
import { fitsAndSharp, responseTimes, touch, typeCode, watchEventTiming } from "./touch";

const id = (s: string) => `[data-id="${s}"]`;

test("a parent sets the code and adds a child with taps only", async ({ page }, info) => {
  const cdp = await page.context().newCDPSession(page);
  // a phone is slower than this machine: check the speed at 4x slower
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await watchEventTiming(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  await page.goto("/");
  await expect(page.locator("[data-screen=who-plays]")).toBeVisible();
  await fitsAndSharp(page);
  await shot("01_who_plays");

  // the code pad, not a name field
  await touch(page, page.locator(id("new_child")));
  await expect(page.locator("[data-screen=pin]")).toBeVisible();
  await expect(page.getByText("בחרו 4 ספרות")).toBeVisible();
  await expect(page.locator("[data-screen=pin] [data-id^=letter_]")).toHaveCount(0);
  await fitsAndSharp(page);
  await shot("02_pin");

  const dots = page.locator(id("pin_dots"));
  for (const [i, d] of ["1", "2", "3"].entries()) {
    await touch(page, page.locator(id(`key_${d}`)));
    await expect(dots).toHaveAttribute("data-count", String(i + 1));
  }
  // delete takes one digit back
  await touch(page, page.locator(id("key_delete")));
  await expect(dots).toHaveAttribute("data-count", "2");
  await touch(page, page.locator(id("key_3")));
  await touch(page, page.locator(id("key_4")));
  // the 4th digit is shown, then the pad waits: no tap can sneak in
  await expect(page.getByText("הקלידו את אותן 4 ספרות שוב")).toBeVisible();
  await expect(dots).toHaveAttribute("data-count", "0");
  // the second entry right away, in the parent's rhythm: no digit lost
  await typeCode(page, "1234", { holdMs: 120, gapMs: 200 });
  await expect(page.locator("[data-screen=notice]")).toContainText("הקוד נשמר");
  await shot("03_pin_saved");
  await touch(page, page.locator(id("next")));

  // the name, one letter at a time: each tap adds exactly its letter
  await expect(page.locator("[data-screen=letters]")).toBeVisible();
  await fitsAndSharp(page);
  const typed = page.locator(id("typed"));
  let expected = "";
  for (const c of "נועה") {
    await touch(page, page.locator(id(`letter_${c}`)));
    expected += c;
    await expect(typed).toHaveText(expected);
  }
  await shot("04_name");
  await touch(page, page.locator(id("board_done")));

  await expect(page.locator("[data-screen=grade]")).toBeVisible();
  await fitsAndSharp(page);
  await shot("05_grade");
  await touch(page, page.locator(id("choice_1")));

  await expect(page.locator("[data-screen=avatar]")).toBeVisible();
  await fitsAndSharp(page);
  await shot("06_avatar");
  await touch(page, page.locator(id("choice_girl_teal")));
  await expect(page.locator("[data-screen=notice]")).toContainText("נועה מוכן לשחק");
  await touch(page, page.locator(id("next")));

  // the child is there, and still there after the app restarts
  await expect(page.locator("[data-screen=who-plays] .card")).toHaveText(["נועה"]);
  const before = await responseTimes(page);
  await page.reload();
  await expect(page.locator("[data-screen=who-plays] .card")).toHaveText(["נועה"]);
  await fitsAndSharp(page);
  await shot("07_who_plays_child");
  await touch(page, page.locator("[data-screen=who-plays] .card"));
  // the map opens, with the child's name on it
  await expect(page.locator("[data-screen=play][data-map=ready]")).toContainText("נועה", { timeout: 20_000 });

  // tap to the next drawn frame, at 4x slower: the app's own measure and
  // the browser's Event Timing (which lists only taps of 16 ms and more)
  const after = await responseTimes(page);
  const app = [...before.app, ...after.app];
  const events = [...before.events, ...after.events];
  console.log("tap to drawn frame, ms (app):", app.map((t) => Math.round(t)).join(" "));
  console.log("tap to drawn frame, ms (Event Timing >= 16):", events.map((t) => Math.round(t)).join(" ") || "none");
  expect(app.length).toBeGreaterThan(15);
  expect(Math.max(...app)).toBeLessThan(100);
  expect(Math.max(0, ...events)).toBeLessThan(100);
});

test("a wrong code goes back to the pad; five lock it", async ({ page }) => {
  await page.goto("/");
  // set the code first
  await touch(page, page.locator(id("parents")));
  await typeCode(page, "12341234", { holdMs: 30, gapMs: 60 });
  await touch(page, page.locator(id("next")), 30);
  await expect(page.locator("[data-screen=parents]")).toBeVisible();
  await touch(page, page.locator(id("back")), 30);

  await touch(page, page.locator(id("parents")), 30);
  for (let i = 1; i <= 4; i++) {
    await typeCode(page, "0000", { holdMs: 30, gapMs: 60 });
    // back on a fresh pad, with the message
    await expect(page.locator("[data-screen=pin]")).toHaveAttribute("data-attempt", String(i));
    await expect(page.locator("[data-screen=pin] .message")).toHaveText(
      i === 4 ? "הקוד לא נכון. נשאר עוד ניסיון אחד." : `הקוד לא נכון. נשארו עוד ${5 - i} ניסיונות.`,
    );
    await expect(page.locator(id("pin_dots"))).toHaveAttribute("data-count", "0");
  }
  await typeCode(page, "0000", { holdMs: 30, gapMs: 60 });
  await expect(page.locator("[data-screen=notice]")).toContainText("יותר מדי ניסיונות");
});

test("a name with a digit or only spaces is refused, kindly", async ({ page }) => {
  await page.goto("/");
  await touch(page, page.locator(id("new_child")), 30);
  for (const d of "12341234") await touch(page, page.locator(id(`key_${d}`)), 30);
  await touch(page, page.locator(id("next")), 30);
  await expect(page.locator(id("board_done"))).toBeDisabled();
  await touch(page, page.locator(id("board_space")), 30);
  await expect(page.locator(id("board_done"))).toBeDisabled();
});
