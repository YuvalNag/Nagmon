import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fitsAndSharp, touch, typeCode } from "./touch";

/**
 * The parents' area at the phone's size, by touch (docs/app/SDD.md §7):
 * a child's name, grade and hero; the code changed; a token pasted, its
 * check and an upload, against a GitHub that is mocked here (CI never
 * talks to the real one); and "חזרה" on every page. The token is
 * obviously fake, and must never show up in the page's text or its log.
 */

const id = (s: string) => `[data-id="${s}"]`;
const TOKEN = "github_pat_TEST0000000000000000000000000000fake";
const REPO = "YuvalNag/nagmon-data";

interface Seen {
  method: string;
  url: string;
  auth: string | null;
  body: { message?: string; content?: string } | null;
}

/** A GitHub stand-in: the repo private (or public), writable; every request recorded. */
async function mockGitHub(page: Page, { private: isPrivate = true } = {}): Promise<Seen[]> {
  const seen: Seen[] = [];
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, PUT",
  };
  await page.route("https://api.github.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    seen.push({ method: req.method(), url: req.url(), auth: req.headers()["authorization"] ?? null, body: req.postDataJSON() });
    if (req.method() === "GET" && req.url() === `https://api.github.com/repos/${REPO}`) {
      return route.fulfill({ status: 200, headers: cors, json: { full_name: REPO, private: isPrivate, permissions: { push: true } } });
    }
    if (req.method() === "PUT" && req.url().startsWith(`https://api.github.com/repos/${REPO}/contents/devices/`)) {
      return route.fulfill({ status: 201, headers: cors, json: { content: { path: "x" } } });
    }
    return route.fulfill({ status: 404, headers: cors, json: { message: "Not Found" } });
  });
  return seen;
}

/** A made-up child on the phone's disk before the app opens. */
async function seedChild(page: Page, name = "דנה") {
  await page.addInitScript((n) => {
    if (localStorage.getItem("seeded")) return;
    localStorage.setItem("seeded", "1");
    localStorage.setItem("nagmon-fs:d:profiles", "");
    localStorage.setItem("nagmon-fs:d:profiles/p00001", "");
    localStorage.setItem(
      "nagmon-fs:f:profiles/p00001/profile.json",
      JSON.stringify({ id: "p00001", name: n, avatar: "girl_teal", grade: 2, order: 0, schema_version: 2 }),
    );
  }, name);
}

/** The code set the first time, and on into the parents' area. */
async function intoParents(page: Page) {
  await page.goto("/");
  await touch(page, page.locator(id("parents")), 30);
  await typeCode(page, "12341234", { holdMs: 30, gapMs: 60 });
  await expect(page.locator("[data-screen=notice]")).toContainText("באזור ההורים אפשר לחבר את GitHub כדי לשלוח יומן");
  await touch(page, page.locator(id("next")), 30);
  await expect(page.locator("[data-screen=parents]")).toBeVisible();
}

/**
 * Chromium's own line for a request GitHub (here, its stand-in) refused or
 * that never left: the browser's, not the app's, and expected in these tests.
 */
function expectedNetworkErrors(problems: string[], ...what: RegExp[]) {
  const rest = problems.filter((m) => !what.some((w) => w.test(m)));
  problems.splice(0, problems.length, ...rest);
}

const onPage = (page: Page, name: string) => expect(page.locator(`[data-screen=${name}]`)).toBeVisible();

test("a parent changes a child, the code, connects GitHub and sends the log, by touch", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  const seen = await mockGitHub(page);
  await seedChild(page);
  await intoParents(page);
  await fitsAndSharp(page);
  await shot("p01_parents");

  // --- the children
  await touch(page, page.locator(id("parents_children")), 30);
  await onPage(page, "parents-children");
  await expect(page.locator("[data-screen=parents-children] .card")).toHaveText(["דנה"]);
  await fitsAndSharp(page);
  await shot("p02_children");
  await touch(page, page.locator(id("edit_p00001")), 30);
  await onPage(page, "parents-child");
  await fitsAndSharp(page);
  await shot("p03_child");

  // the name, on the letter board: two letters off, two on
  await touch(page, page.locator(id("child_name")), 30);
  await onPage(page, "letters");
  await expect(page.locator(id("typed"))).toHaveText("דנה");
  await touch(page, page.locator(id("board_delete")), 30);
  await touch(page, page.locator(id("board_delete")), 30);
  for (const c of "ור") await touch(page, page.locator(id(`letter_${c}`)), 30);
  await expect(page.locator(id("typed"))).toHaveText("דור");
  await touch(page, page.locator(id("board_done")), 30);
  await onPage(page, "parents-child");
  await expect(page.locator("[data-screen=parents-child] .title")).toHaveText("דור");
  await expect(page.locator("[data-screen=parents-child] [role=status]")).toHaveText("נשמר.");

  // the grade
  await touch(page, page.locator(id("child_grade")), 30);
  await onPage(page, "parents-grade");
  await fitsAndSharp(page);
  await touch(page, page.locator(id("choice_4")), 30);
  await expect(page.locator("[data-screen=parents-child]")).toHaveAttribute("data-grade", "4");
  await expect(page.locator(id("child_grade"))).toContainText("כיתה ד");

  // the hero
  await touch(page, page.locator(id("child_avatar")), 30);
  await onPage(page, "parents-avatar");
  await touch(page, page.locator(id("choice_boy_blue")), 30);
  await onPage(page, "parents-child");
  await shot("p04_child_saved");

  // saved on the disk, atomically: the profile as it now is, after a reload
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nagmon-fs:f:profiles/p00001/profile.json")!));
  expect({ name: saved.name, grade: saved.grade, avatar: saved.avatar }).toEqual({ name: "דור", grade: 4, avatar: "boy_blue" });

  // back through every page: child, children, the area
  await touch(page, page.locator(id("back")), 30);
  await onPage(page, "parents-children");
  await expect(page.locator("[data-screen=parents-children] .card")).toHaveText(["דור"]);
  await touch(page, page.locator(id("back")), 30);
  await onPage(page, "parents");

  // --- the code: the current one, then the new one twice
  await touch(page, page.locator(id("parents_pin")), 30);
  await onPage(page, "pin");
  await expect(page.getByText("הקלידו את הקוד הנוכחי.")).toBeVisible();
  await typeCode(page, "1234", { holdMs: 30, gapMs: 60 });
  await expect(page.getByText("בחרו קוד חדש של 4 ספרות.")).toBeVisible();
  await typeCode(page, "5678", { holdMs: 30, gapMs: 60 });
  await expect(page.getByText("הקלידו את אותן 4 ספרות שוב.")).toBeVisible();
  await typeCode(page, "5678", { holdMs: 30, gapMs: 60 });
  await expect(page.locator("[data-screen=notice]")).toContainText("הקוד החדש נשמר.");
  await touch(page, page.locator(id("next")), 30);
  await onPage(page, "parents");

  // --- GitHub: not connected, then a pasted token
  await touch(page, page.locator(id("parents_github")), 30);
  await onPage(page, "parents-github");
  await expect(page.locator(id("gh_status"))).toContainText("לא מחובר");
  await fitsAndSharp(page);
  await shot("p05_github_none");
  await touch(page, page.locator(id("gh_paste")), 30);
  await onPage(page, "parents-token");
  await touch(page, page.locator(id("gh_token_input")), 30);
  // a long press and "paste": the text arrives as an input, the way Android's paste gives it
  await page.keyboard.insertText(TOKEN);
  await expect(page.locator(id("gh_token_input"))).toHaveAttribute("type", "password");
  await shot("p06_token");
  await touch(page, page.locator(id("gh_token_save")), 30);
  await onPage(page, "parents-github");
  await expect(page.locator(id("gh_status"))).toHaveText(`מחובר: הריפו ${REPO} פרטי, ואפשר לכתוב בו.`);
  await expect(page.locator(id("gh_masked"))).toHaveText("***fake");
  await fitsAndSharp(page);
  await shot("p07_github_connected");

  // "בדיקת חיבור" asks GitHub again
  const gets = seen.filter((s) => s.method === "GET").length;
  await touch(page, page.locator(id("gh_check")), 30);
  await expect.poll(() => seen.filter((s) => s.method === "GET").length).toBe(gets + 1);
  await expect(page.locator(id("gh_status"))).toContainText("מחובר");

  // --- the log: what and where, then "שליחה"
  expect(seen.filter((s) => s.method === "PUT")).toEqual([]);
  await touch(page, page.locator(id("gh_send_logs")), 30);
  await onPage(page, "parents-confirm");
  await expect(page.locator(id("confirm_what"))).toContainText("היומן של המשחק");
  await expect(page.locator("[data-screen=parents-confirm]")).toContainText(REPO);
  const path = (await page.locator(id("confirm_path")).textContent())!;
  expect(path).toMatch(/^devices\/[0-9a-f]{8}\/logs\/\d{8}T\d{6}Z\.txt$/);
  await fitsAndSharp(page);
  await shot("p08_confirm_log");
  // nothing left before the confirmation
  expect(seen.filter((s) => s.method === "PUT")).toEqual([]);
  await touch(page, page.locator(id("confirm_yes")), 30);
  await expect(page.locator("[data-screen=notice]")).toHaveText(/נשלח בהצלחה/);
  await shot("p09_sent");
  const puts = seen.filter((s) => s.method === "PUT");
  expect(puts.map((p) => p.url)).toEqual([`https://api.github.com/repos/${REPO}/contents/${path}`]);
  expect(puts[0]!.auth).toBe(`Bearer ${TOKEN}`);
  expect(puts[0]!.body!.message).toBe("Field data: logs");
  const sent = Buffer.from(puts[0]!.body!.content!, "base64").toString("utf8");
  expect(sent).toContain("=== Nagmon start");
  // no token in what was sent, and no child's name (old or new)
  expect(sent).not.toContain(TOKEN);
  expect(sent).not.toMatch(/דנה|דור/);
  await touch(page, page.locator(id("next")), 30);
  await onPage(page, "parents-github");

  // the token is nowhere in the page, nor in the app's log
  const everywhere = await page.evaluate(async () => {
    const w = window as unknown as { __appLogMark?: (t: string) => void };
    w.__appLogMark?.("end of the parents check");
    return { html: document.documentElement.outerHTML, storage: JSON.stringify({ ...localStorage }) };
  });
  expect(everywhere.html).not.toContain(TOKEN);
  expect(everywhere.storage).not.toContain(TOKEN);
  expect(everywhere.storage).not.toContain("TEST0000");

  // back: the area, then who-plays
  await touch(page, page.locator(id("back")), 30);
  await onPage(page, "parents");
  await touch(page, page.locator(id("back")), 30);
  await onPage(page, "who-plays");
  await expect(page.locator("[data-screen=who-plays] .card")).toHaveText(["דור"]);
});

test("a public data repo is refused: the token is kept, nothing is sent", async ({ page }) => {
  const seen = await mockGitHub(page, { private: false });
  await intoParents(page);
  await touch(page, page.locator(id("parents_github")), 30);
  await touch(page, page.locator(id("gh_paste")), 30);
  await touch(page, page.locator(id("gh_token_input")), 30);
  await page.keyboard.insertText(TOKEN);
  await touch(page, page.locator(id("gh_token_save")), 30);
  await onPage(page, "parents-github");
  await expect(page.locator(id("gh_status"))).toContainText("ציבורי, ולכן לא נשלח אליו כלום");
  await touch(page, page.locator(id("gh_send_logs")), 30);
  await onPage(page, "parents-confirm");
  await touch(page, page.locator(id("confirm_yes")), 30);
  await expect(page.locator("[data-screen=notice]")).toContainText("ציבורי");
  expect(seen.filter((s) => s.method === "PUT")).toEqual([]);
});

test("a bad token is not kept; no network says so", async ({ page, console: problems }) => {
  await page.route("https://api.github.com/**", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization" } })
      : route.fulfill({ status: 401, headers: { "access-control-allow-origin": "*" }, json: { message: "Bad credentials" } }),
  );
  await intoParents(page);
  await touch(page, page.locator(id("parents_github")), 30);
  await touch(page, page.locator(id("gh_paste")), 30);
  await touch(page, page.locator(id("gh_token_input")), 30);
  await page.keyboard.insertText("github_pat_TESTbadbadbadbadbadbadbadbadbad");
  await touch(page, page.locator(id("gh_token_save")), 30);
  await expect(page.locator("[data-screen=parents-token] .message")).toHaveText("הטוקן שגוי או שפג תוקפו. יוצרים טוקן חדש ומדביקים אותו.");
  await touch(page, page.locator(id("back")), 30);
  await expect(page.locator(id("gh_status"))).toContainText("לא מחובר");

  // no network at all
  await page.unroute("https://api.github.com/**");
  await page.route("https://api.github.com/**", (route) => route.abort("internetdisconnected"));
  await touch(page, page.locator(id("gh_paste")), 30);
  await touch(page, page.locator(id("gh_token_input")), 30);
  await page.keyboard.insertText(TOKEN);
  await touch(page, page.locator(id("gh_token_save")), 30);
  await expect(page.locator("[data-screen=parents-token] .message")).toHaveText("אין אינטרנט. מתחברים לרשת ומנסים שוב.");
  expectedNetworkErrors(problems, /^error: Failed to load resource: (the server responded with a status of 401|net::ERR_INTERNET_DISCONNECTED)/);
});

test("a child is deleted after an in-page question, and stays deleted", async ({ page }) => {
  await seedChild(page, "גלעד");
  await intoParents(page);
  await touch(page, page.locator(id("parents_children")), 30);
  await touch(page, page.locator(id("edit_p00001")), 30);
  await touch(page, page.locator(id("child_delete")), 30);
  await onPage(page, "parents-delete");
  await expect(page.locator("[data-screen=parents-delete]")).toContainText("למחוק את גלעד");
  await fitsAndSharp(page);
  // "ביטול" keeps them
  await touch(page, page.locator(id("confirm_no")), 30);
  await onPage(page, "parents-child");
  await touch(page, page.locator(id("child_delete")), 30);
  await touch(page, page.locator(id("confirm_yes")), 30);
  await expect(page.locator("[data-screen=notice]")).toContainText("גלעד נמחק");
  await touch(page, page.locator(id("next")), 30);
  await onPage(page, "parents-children");
  await expect(page.locator("[data-screen=parents-children] .card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-screen=who-plays] .card")).toHaveCount(0);
});
