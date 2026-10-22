import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";
import { settled, touch, typeCode } from "./touch";

/**
 * The text review (docs/app/TEXT_REVIEW.md) at the family's phone (873x393), by touch, at 100% and 130% text:
 * the parent approves one line and corrects another while GitHub cannot be reached (both wait, queued, on the
 * phone), then a third decision sends all three as devices/<id>/review/<UTC>/decisions.json; after a restart
 * the progress is still there. The keyboard opening (the viewport shrinks) leaves the field and its buttons in view.
 */
test.describe.configure({ timeout: 240_000 });

const scales = [1, 1.3];
const id = (s: string) => `[data-id="${s}"]`;
const TOKEN = "github_pat_TEST0000000000000000000000000000fake";
const REPO = "YuvalNag/nagmon-data";

interface Put {
  url: string;
  body: { message: string; content: string };
}

/** A GitHub stand-in: private and writable; writes refused (503) while `net.down`. */
async function mockGitHub(page: Page, net: { down: boolean }): Promise<Put[]> {
  const puts: Put[] = [];
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, PUT",
  };
  await page.route("https://api.github.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (req.method() === "GET" && req.url() === `https://api.github.com/repos/${REPO}`) {
      return route.fulfill({ status: 200, headers: cors, json: { full_name: REPO, private: true, permissions: { push: true } } });
    }
    if (req.method() === "PUT" && req.url().includes(`/repos/${REPO}/contents/devices/`)) {
      if (net.down) return route.fulfill({ status: 503, headers: cors, json: { message: "down" } });
      puts.push({ url: req.url(), body: req.postDataJSON() });
      return route.fulfill({ status: 201, headers: cors, json: { content: { path: "x" } } });
    }
    return route.fulfill({ status: 404, headers: cors, json: { message: "Not Found" } });
  });
  return puts;
}

async function textScale(page: Page, s: number) {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, s);
}

async function seedChild(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem("seeded")) return;
    localStorage.setItem("seeded", "1");
    localStorage.setItem("nagmon-fs:d:profiles", "");
    localStorage.setItem("nagmon-fs:d:profiles/p00001", "");
    localStorage.setItem(
      "nagmon-fs:f:profiles/p00001/profile.json",
      JSON.stringify({ id: "p00001", name: "נועם", avatar: "girl_teal", grade: 2, order: 0, schema_version: 2 }),
    );
  });
}

/** The code set the first time, GitHub connected with the pasted token, and on to the first page. */
async function intoParentsConnected(page: Page) {
  await page.goto("/");
  await touch(page, page.locator(id("parents")), 30);
  await typeCode(page, "12341234", { holdMs: 30, gapMs: 60 });
  await touch(page, page.locator(id("next")), 30);
  await expect(page.locator("[data-screen=parents]")).toBeVisible();
  await touch(page, page.locator(id("parents_github")), 30);
  await touch(page, page.locator(id("gh_paste")), 30);
  await touch(page, page.locator(id("gh_token_input")), 30);
  await page.keyboard.insertText(TOKEN);
  await touch(page, page.locator(id("gh_token_save")), 30);
  await expect(page.locator(id("gh_status"))).toContainText("מחובר");
  await touch(page, page.locator(id("back")), 30);
  await expect(page.locator("[data-screen=parents]")).toBeVisible();
}

/** Everything on the review screen is inside the phone, every target is 48 px and more, nothing sticks out sideways. */
async function reviewFits(page: Page) {
  const bad = await page.evaluate(async () => {
    await document.fonts.ready;
    const out: string[] = [];
    const screen = document.querySelector<HTMLElement>("[data-screen=parents-review]")!;
    for (const b of screen.querySelectorAll<HTMLElement>("button, textarea")) {
      const r = b.getBoundingClientRect();
      const name = b.dataset.id ?? b.tagName;
      if (r.width === 0) continue;
      // a chip row may scroll sideways: its chips are measured by height only
      const chip = b.classList.contains("review-chip");
      if (r.top < -0.5 || r.bottom > innerHeight + 0.5) out.push(`${name} outside vertically: ${Math.round(r.top)}-${Math.round(r.bottom)}`);
      if (!chip && (r.left < -0.5 || r.right > innerWidth + 0.5)) out.push(`${name} outside sideways`);
      if (r.height < 48 || (b.tagName === "BUTTON" && r.width < 48)) out.push(`${name} too small: ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const root = document.documentElement;
    if (root.scrollWidth > innerWidth || root.scrollHeight > innerHeight) out.push("the page scrolls");
    if (screen.scrollWidth > screen.clientWidth + 1) out.push("the screen is wider than the phone");
    if (!document.fonts.check("500 20px Rubik", "שלום")) out.push("the Hebrew font is not drawn");
    return out;
  });
  expect(bad).toEqual([]);
}

for (const scale of scales) {
  test(`text review: approve one, correct one, both queued, then sent; kept after a restart, at ${scale * 100}% text`, async ({ page, console: problems }, info) => {
    await textScale(page, scale);
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    const net = { down: true };
    const puts = await mockGitHub(page, net);
    await seedChild(page);
    await intoParentsConnected(page);

    await touch(page, page.locator(id("parents_review")), 30);
    await expect(page.locator("[data-screen=parents-review]")).toBeVisible();
    await expect(page.locator(id("review_line"))).toBeVisible();
    const total = Number(/מתוך (\d+)/.exec((await page.locator(id("review_progress")).textContent())!)![1]);
    expect(total).toBeGreaterThan(1000);
    await expect(page.locator(id("review_progress"))).toHaveText(`0 מתוך ${total}`);
    await expect(page.locator(id("review_ctx"))).not.toBeEmpty();
    await reviewFits(page);
    await shot("r1_first_line");

    // --- approve the first line
    const first = (await page.locator(id("review_line")).textContent())!;
    await touch(page, page.locator(id("review_approve")), 30);
    await expect(page.locator(id("review_progress"))).toHaveText(`1 מתוך ${total}`);
    await expect(page.locator(id("review_status"))).toHaveText("1 בתור לשליחה");
    const second = (await page.locator(id("review_line")).textContent())!;
    expect(second).not.toBe(first);
    await reviewFits(page);

    // --- correct the second line
    await touch(page, page.locator(id("review_edit")), 30);
    const field = page.locator(id("review_field"));
    await expect(field).toBeVisible();
    await expect(field).toHaveValue(second);
    await expect(field).toHaveAttribute("dir", "rtl");
    await reviewFits(page);
    await shot("r2_edit");

    // the keyboard opens: half of the phone is gone; the field and its buttons stay in reach
    await page.setViewportSize({ width: 873, height: 230 });
    await field.focus();
    await page.waitForTimeout(150);
    await reviewFits(page);
    await shot("r3_edit_keyboard");
    await page.setViewportSize({ width: 873, height: 393 });

    const fixed = second.replace(/[.!?:]?$/, "") + " בדיקה";
    await field.fill(fixed);
    await touch(page, page.locator(id("review_save")), 30);
    await expect(page.locator(id("review_progress"))).toHaveText(`2 מתוך ${total}`);
    await expect(page.locator(id("review_status"))).toHaveText("2 בתור לשליחה");
    await shot("r4_queued");

    // queued on the phone, nothing in the repo
    expect(puts).toEqual([]);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("nagmon-fs:f:review/decisions.json")!));
    const list = Object.values<{ action: string; newText?: string; sent: boolean }>(kept.decisions);
    expect(list.map((d) => d.action).sort()).toEqual(["approve", "edit"]);
    expect(list.every((d) => !d.sent)).toBe(true);
    expect(list.find((d) => d.action === "edit")!.newText).toBe(fixed);

    // --- the repo answers again: the next decision sends all three
    net.down = false;
    await touch(page, page.locator(id("review_skip")), 30);
    await expect(page.locator(id("review_status"))).toHaveText("הכל נשלח");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.url).toMatch(new RegExp(`/repos/${REPO}/contents/devices/[0-9a-f]{8}/review/\\d{8}T\\d{6}Z/decisions.json$`));
    expect(puts[0]!.body.message).toBe("Field data: review");
    const sent = JSON.parse(Buffer.from(puts[0]!.body.content, "base64").toString("utf8"));
    expect(sent.schema_version).toBe(1);
    expect(sent.decisions.map((d: { action: string }) => d.action).sort()).toEqual(["approve", "edit", "skip"]);
    const edit = sent.decisions.find((d: { action: string }) => d.action === "edit");
    expect(edit.newText).toBe(fixed);
    // the hashes are the ones the build shipped
    const shipped: { items: { id: string; hash: string }[] } = await (await page.request.get("/game/review.json")).json();
    for (const d of sent.decisions) {
      expect(Object.keys(d).every((k) => ["id", "action", "newText", "baseHash"].includes(k))).toBe(true);
      expect(shipped.items.find((i) => i.id === d.id)!.hash).toBe(d.baseHash);
    }
    // no child's name, no token, nothing but the lines
    const body = JSON.stringify(sent);
    expect(body).not.toContain("נועם");
    expect(body).not.toContain(TOKEN);
    await shot("r5_sent");

    // --- a filter, then a restart: the progress is still there and the queue is empty
    await touch(page, page.locator(id("review_filter_fact")), 30);
    await expect(page.locator(id("review_progress"))).toContainText("0 מתוך");
    await reviewFits(page);
    await page.reload();
    await touch(page, page.locator(id("parents")), 30);
    await typeCode(page, "1234", { holdMs: 30, gapMs: 60 });
    await expect(page.locator("[data-screen=parents]")).toBeVisible();
    await settled(page);
    await touch(page, page.locator(id("parents_review")), 30);
    await expect(page.locator(id("review_progress"))).toHaveText(`3 מתוך ${total}`);
    await expect(page.locator(id("review_line"))).not.toHaveText(first);

    // what the 503 and the stand-in's refusals wrote to the console is the browser's own line
    const rest = problems.filter((m) => !/^error: Failed to load resource: the server responded with a status of 503/.test(m));
    problems.splice(0, problems.length, ...rest);
  });
}
