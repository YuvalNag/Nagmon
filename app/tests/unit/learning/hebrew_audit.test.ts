// @vitest-environment node
/**
 * Hebrew question-quality numbers (docs/app/QUESTION_AUDIT.md section Hebrew): a headless child of each grade
 * plays 200 Hebrew battle questions. Prints one JSON line per grade.
 * HEBREW_AUDIT=1 npx vitest run tests/unit/learning/hebrew_audit.test.ts
 */
import { it } from "vitest";
import { simulate } from "./qsim";

it.skipIf(process.env["HEBREW_AUDIT"] !== "1")("hebrew audit", { timeout: 600000 }, () => {
  const rows: unknown[] = [];
  for (let g = 1; g <= 9; g++) {
    const served = simulate({ grade: g, subject: "hebrew", seed: 300 + g, n: 200 }).served;
    const n = served.length;
    const gaps = served.map((s) => s.level - s.skillGrade);
    const choice = served.filter((s) => s.kind === "choice" && s.q.choices.length > 2);
    const text = (s: (typeof served)[number], i: number) => s.q.choices[i]!.text_he.length;
    const longest = choice.filter((s) => {
      const ai = s.q.choices.findIndex((c) => c.id === s.q.answer);
      const lens = s.q.choices.map((_, i) => text(s, i));
      return text(s, ai) === Math.max(...lens) && new Set(lens).size > 1;
    }).length;
    const pos = [0, 0, 0, 0];
    for (const s of choice) pos[s.q.choices.findIndex((c) => c.id === s.q.answer)]!++;
    const grades: Record<number, number> = {};
    for (const s of served) grades[s.skillGrade] = (grades[s.skillGrade] ?? 0) + 1;
    rows.push({
      grade: g,
      n,
      meanGapBelowLevel: +(gaps.reduce((a, b) => a + b, 0) / n).toFixed(2),
      twoOrMoreBelow: +(gaps.filter((d) => d >= 2).length / n).toFixed(2),
      distinctSkills: new Set(served.map((s) => s.skill)).size,
      distinctItems: new Set(served.map((s) => s.item)).size,
      skillGrades: grades,
      longestAnswerShare: +(longest / Math.max(1, choice.length)).toFixed(2),
      answerPos: pos.map((p) => +(p / Math.max(1, choice.length)).toFixed(2)),
    });
  }
  console.log("HEBREW_AUDIT " + JSON.stringify(rows));
});
