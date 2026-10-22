import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Hero, type HeroesFile, heroChoices, makeRoster } from "../../../src/core/family/heroes";
import { Choices } from "../../../src/ui/screens/Choices";

afterEach(cleanup);

function roster(n: number) {
  const heroes: Hero[] = Array.from({ length: n }, (_, i) => ({
    id: `h${i}`,
    order: i,
    enabled: true,
    name: { he: `דמות ${i}`, en: `h${i}` },
    colors: { primary: "#112233", secondary: "#445566" },
    art: { map: "m", portrait: "p", face: "f" },
    files: { map: { file: "sprites/npc/nagmon_x.png", frame: [128, 256], scale: 8 }, portrait: { file: "p.png" }, face: { file: `avatars/h${i}.png` } },
  }));
  const data: HeroesFile = { version: 1, max: 12, fallback: "h0", legacy: {}, heroes };
  return makeRoster(data);
}

describe("the hero picker", () => {
  for (const n of [3, 5, 6, 12]) {
    it(`shows ${n} heroes, each tappable, ${n > 5 ? "wrapping in rows" : "in one row"}`, () => {
      const onPick = vi.fn();
      const { container } = render(<Choices screen="avatar" title="מי?" choices={heroChoices(roster(n))} onPick={onPick} onBack={() => {}} />);
      expect(container.querySelectorAll(".card")).toHaveLength(n);
      expect(container.querySelector(".cards")!.classList.contains("wrap")).toBe(n > 5);
      fireEvent.click(container.querySelector('[data-id="choice_h2"]')!, { detail: 0 });
      expect(onPick).toHaveBeenCalledWith("h2");
    });
  }

  it("a text-only question (the grade) keeps its grid", () => {
    const { container } = render(<Choices screen="grade" title="כיתה" choices={Array.from({ length: 10 }, (_, i) => ({ id: String(i), label: String(i) }))} onPick={() => {}} onBack={() => {}} />);
    expect(container.querySelector(".grid")).not.toBeNull();
    expect(container.querySelector(".cards")).toBeNull();
  });
});
