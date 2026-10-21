import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkedExample } from "../../../src/core/learning/worked_example";
import { QuizExample } from "../../../src/ui/QuizExample";

afterEach(cleanup);

const example: WorkedExample = {
  item_id: "e",
  skill_id: "math.add.within_100",
  kind: "choice",
  prompt_he: "כמה זה 17 + 25?",
  prompt_en: null,
  figure: null,
  answer_he: "42",
  answer_image: null,
  steps_he: "אחדות: 7 + 5 = 12. עשרות: 1 + 2 + 1 = 4.",
  idea_he: "חיבור עד 100",
};

describe("the owl's example card", () => {
  it("shows the idea, the sibling's prompt, its steps and its answer, and says a new question comes", () => {
    const { container } = render(<QuizExample example={example} englishFirst={false} />);
    const text = (id: string) => container.querySelector(`[data-id="${id}"]`)?.textContent ?? "";
    expect(text("quiz_example_idea")).toContain("חיבור עד 100");
    expect(text("quiz_example_prompt")).toContain("17 + 25");
    expect(text("quiz_example")).toContain("7 + 5 = 12");
    expect(text("quiz_example_answer")).toContain("42");
    expect(text("quiz_example_next")).toMatch(/שאלה חדשה/);
  });

  it("a picture-only answer shows no empty 'answer' line", () => {
    const { container } = render(<QuizExample example={{ ...example, answer_he: "" }} englishFirst={false} />);
    expect(container.querySelector('[data-id="quiz_example_answer"]')).toBeNull();
  });
});
