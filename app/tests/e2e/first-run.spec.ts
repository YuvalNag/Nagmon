import { expect, test } from "@playwright/test";
import { fitsAndSharp, responseTimes, touch, watchResponseTimes } from "./touch";

const id = (s: string) => `[data-id="${s}"]`;

test("a parent sets the code and adds a child with taps only", async ({ page }, info) => {
  const cdp = await page.context().newCDPSession(page);
  // a phone is slower than this machine: check the speed at 4x slower
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await watchResponseTimes(page);
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
  for (const d of "1234") await touch(page, page.locator(id(`key_${d}`)));
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
  const times = await responseTimes(page);
  await page.reload();
  await expect(page.locator("[data-screen=who-plays] .card")).toHaveText(["נועה"]);
  await fitsAndSharp(page);
  await shot("07_who_plays_child");
  await touch(page, page.locator("[data-screen=who-plays] .card"));
  await expect(page.locator("[data-screen=play]")).toContainText("שלום, נועה!");

  times.push(...(await responseTimes(page)));
  console.log("tap to screen change, ms:", times.map((t) => Math.round(t)).join(" "));
  expect(times.length).toBeGreaterThan(15);
  expect(Math.max(...times)).toBeLessThan(100);
});

test("a wrong code goes back to the pad; five lock it", async ({ page }) => {
  await page.goto("/");
  // set the code first
  await touch(page, page.locator(id("parents")));
  for (const d of "12341234") await touch(page, page.locator(id(`key_${d}`)), 30);
  await touch(page, page.locator(id("next")), 30);
  await expect(page.locator("[data-screen=parents]")).toBeVisible();
  await touch(page, page.locator(id("back")), 30);

  await touch(page, page.locator(id("parents")), 30);
  for (let i = 1; i <= 4; i++) {
    for (const d of "0000") await touch(page, page.locator(id(`key_${d}`)), 30);
    // back on a fresh pad, with the message
    await expect(page.locator("[data-screen=pin]")).toHaveAttribute("data-attempt", String(i));
    await expect(page.locator("[data-screen=pin] .message")).toHaveText("הקוד לא נכון. נסו שוב.");
    await expect(page.locator(id("pin_dots"))).toHaveAttribute("data-count", "0");
  }
  for (const d of "0000") await touch(page, page.locator(id(`key_${d}`)), 30);
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
