// @vitest-environment node
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { BATTLE_SUBJECTS, metrics, simulate } from "./qsim";
const S = (process.env["AUDIT_DIR"] ?? ".") + "/";
const tag = process.env["AUDIT_TAG"] ?? "run";
/** Writes the numbers of docs/app/QUESTION_AUDIT.md: AUDIT_DUMP=1 AUDIT_DIR=/some/dir npx vitest run tests/unit/learning/audit_dump.test.ts */
it.skipIf(process.env["AUDIT_DUMP"] !== "1")("audit", { timeout: 900000 }, () => {
  const rows: unknown[] = [];
  const firsts: unknown[] = [];
  const dump: unknown[] = [];
  for (let g = 0; g <= 8; g++) {
    for (const subject of [...BATTLE_SUBJECTS, null]) {
      for (const placement of [false, true]) {
        const seed = 100 + g;
        const r = simulate({ grade: g, subject, seed, n: 300, placement });
        const m = metrics(r.served);
        rows.push({ g, subject: subject ?? "mixed", placement, m, levels: r.placement });
        if (placement && subject === null) {
          firsts.push({ g, levels: r.placement, first: r.served.slice(0, 10).map((x) => [x.subject, x.skill, x.skillGrade, x.level, x.kind, x.prompt]) });
        }
        if (!placement && subject === null) for (const x of r.served) dump.push({ g, subject: x.subject, skill: x.skill, sg: x.skillGrade, kind: x.kind, prompt: x.prompt, choices: x.q.choices.map((c) => c.text_he), answer: x.q.answer, item: x.item, bucket: x.bucket, tpl: x.template });
      }
    }
  }
  writeFileSync(S + `audit_${tag}.json`, JSON.stringify(rows));
  writeFileSync(S + `first_${tag}.json`, JSON.stringify(firsts));
  writeFileSync(S + `dump_${tag}.json`, JSON.stringify(dump));
});
