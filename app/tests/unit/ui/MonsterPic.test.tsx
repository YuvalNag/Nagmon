import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { monsterTable } from "../../../src/core/game/monsters";
import { MonsterPic } from "../../../src/ui/MonsterPic";

afterEach(cleanup);

const table = monsterTable({ heliobud: { stage: "basic", sprites: { sheet: "sprites/monsters/heliobud.png", scale: 3, front: [0, 0, 32, 32], back: [32, 0, 32, 32] } } });

describe("a creature's picture", () => {
  it("is cut from its sheet", () => {
    const { container } = render(<MonsterPic monsters={table} species="heliobud" />);
    expect(container.querySelector("[data-fallback]")).toBeNull();
    expect(container.querySelector(".monster-pic span")).not.toBeNull();
  });

  it("is a drawn friend for a species with no art, never an empty hole (the Friends list showed a blank card)", () => {
    const { container } = render(<MonsterPic monsters={table} species="flaskling" height={0.2} />);
    const pic = container.querySelector(".monster-pic[data-fallback='true']") as HTMLElement | null;
    expect(pic).not.toBeNull();
    expect(pic!.querySelector("svg")).not.toBeNull();
    expect(Number.parseInt(pic!.style.height)).toBeGreaterThanOrEqual(32);
    expect(Number.parseInt(pic!.style.width)).toBeGreaterThanOrEqual(32);
  });
});
