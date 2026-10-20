// @vitest-environment node
/**
 * The TS generators against the Python ones: the same seed gives the same
 * question, field by field (canonical JSON hashed per skill and context;
 * the hashes come from `golden/make_golden.py`).
 */
import { describe, expect, it } from "vitest";
import { genContext } from "../../../src/core/learning/generators/common";
import { PyRandom } from "../../../src/core/learning/random";
import golden from "./golden/generators.json";
import { canonical, fnv1a, library } from "./helpers";

interface Golden {
  seeds: number;
  contexts: (Record<string, number | string> | null)[];
  skills: Record<string, { generator: string; hashes: string[] }>;
}

const G = golden as unknown as Golden;

describe("golden: TS generators replay the Python ones", () => {
  const lib = library();
  const ported = Object.keys(G.skills).filter((sid) => lib.skills.has(sid));

  it("covers every skill of the golden file (none dropped)", () => {
    expect(lib.skipped).toEqual([]);
    expect(ported.length).toBe(Object.keys(G.skills).length);
    expect(lib.skills.size).toBe(Object.keys(G.skills).length);
  });

  for (const sid of ported) {
    it(sid, () => {
      const skill = lib.skill(sid);
      const got = G.contexts.map((extra) => {
        let h = 0x811c9dc5;
        for (let seed = 0; seed < G.seeds; seed++) {
          const ctx = extra === null ? undefined : genContext({ skill_id: skill.id, subject: skill.subject, grade: skill.grade, ...extra });
          h = fnv1a(canonical(lib.generate(sid, new PyRandom(seed), ctx)) + "\n", h);
        }
        return h.toString(16).padStart(8, "0");
      });
      expect(got).toEqual(G.skills[sid]!.hashes);
    });
  }
});
