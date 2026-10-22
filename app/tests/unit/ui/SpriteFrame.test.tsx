import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ItemIcon } from "../../../src/ui/ItemIcon";
import { Portrait } from "../../../src/ui/SpriteFrame";

afterEach(cleanup);

describe("the picture of an item", () => {
  it("is its icon of the sheet, drawn as a background", () => {
    const { container } = render(<ItemIcon id="magic_net" emoji="🥅" />);
    const el = container.querySelector<HTMLElement>("[data-art=icon\\.items]")!;
    expect(el).not.toBeNull();
    expect(el.dataset["frame"]).toBe("0");
    expect(el.style.backgroundImage).toContain("icon/items.webp");
    expect(container.textContent).toBe("");
  });

  it("is the emoji when the item has no icon", () => {
    const { container } = render(<ItemIcon id="friend_card_math" emoji="🃏" />);
    expect(container.textContent).toBe("🃏");
    expect(container.querySelector("[data-art]")).toBeNull();
  });
});

describe("a person's portrait", () => {
  it("is the front view of their battle picture", () => {
    const { container } = render(<Portrait npc="nagmon_owl" height="5em" />);
    const el = container.querySelector<HTMLElement>("[data-art]")!;
    expect(el.dataset["art"]).toBe("npc.nagmon_owl.battle");
    expect(el.dataset["frame"]).toBe("1");
  });

  it("is nothing for someone with no picture", () => {
    const { container } = render(<Portrait npc="nobody" height="5em" />);
    expect(container.innerHTML).toBe("");
  });
});
