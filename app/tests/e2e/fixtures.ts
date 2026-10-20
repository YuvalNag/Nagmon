import { expect, test as base } from "@playwright/test";

/**
 * Every browser test fails on an uncaught error or on any error or
 * warning in the console (docs/app/SDD.md §10). The build is React's
 * production build, which prints no React warnings; those are caught in
 * Vitest, which renders the screens with React's development build.
 */
export const test = base.extend<{ console: string[] }>({
  console: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
      });
      await use(problems);
      expect(problems, "errors or warnings in the console").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
