import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Charge } from "../../../src/ui/battle/Stage";

afterEach(cleanup);

describe("the charge meter and the combo counter", () => {
  it("the meter is round pips, the filled ones on", () => {
    const { container } = render(<Charge charge={{ filled: 2, size: 3 }} medals={null} />);
    const pips = [...container.querySelectorAll(".pip")];
    expect(pips.map((p) => p.getAttribute("data-on"))).toEqual(["true", "true", "false"]);
    expect(container.querySelector("[data-id=battle_charge]")!.getAttribute("data-full")).toBe("false");
  });

  it("a full meter says so", () => {
    const { container } = render(<Charge charge={{ filled: 3, size: 3 }} medals={null} />);
    expect(container.querySelector("[data-id=battle_charge]")!.getAttribute("data-full")).toBe("true");
  });

  it("a burst shows three round numbered medals: hit, miss, not asked yet", () => {
    const { container } = render(<Charge charge={{ filled: 0, size: 3 }} medals={[true, false, null]} />);
    const medals = [...container.querySelectorAll(".medal")];
    expect(medals.map((m) => m.getAttribute("data-state"))).toEqual(["hit", "miss", "wait"]);
    expect(medals.map((m) => m.textContent)).toEqual(["1", "2", "3"]);
    expect(container.querySelector("[data-id=battle_charge]")).toBeNull();
    expect(container.querySelector("[data-id=battle_combo]")!.getAttribute("aria-label")).toContain("1");
  });

  it("is never drawn as a star (no polygon, no svg)", () => {
    const { container } = render(<Charge charge={{ filled: 1, size: 3 }} medals={[true, null, null]} />);
    expect(container.querySelector("svg, polygon")).toBeNull();
  });
});
