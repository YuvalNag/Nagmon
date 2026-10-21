import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeChoice, makeQuestion } from "../../../src/core/learning/model";
import { Passage } from "../../../src/ui/Passage";

const q = (meta: Record<string, unknown>) =>
  makeQuestion({ item_id: "r:1", skill_id: "english.reading.level1", subject: "english", kind: "choice", prompt_he: "איפה נולד לואי?", answer: "a", choices: [makeChoice("a", "בצרפת"), makeChoice("b", "באנגליה")], meta });

describe("the reading passage of a comprehension question", () => {
  it("shows the English text, the title, and the Hebrew behind a tap", () => {
    render(<Passage q={q({ passage_en: "Louis was born in France.", passage_he: "לואי נולד בצרפת.", passage_title: "Louis Braille" })} />);
    expect(screen.getByText("Louis was born in France.")).toBeTruthy();
    expect(screen.getByText("Louis Braille")).toBeTruthy();
    expect(screen.getByText("לואי נולד בצרפת.")).toBeTruthy();
  });

  it("shows nothing for a question with no passage", () => {
    const { container } = render(<Passage q={q({})} />);
    expect(container.innerHTML).toBe("");
  });
});
