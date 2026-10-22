import { act, cleanup, render } from "@testing-library/react";
import { lazy } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../../../src/i18n";
import { Battle, Later, preloadAll, Wait } from "../../../src/ui/lazy";

afterEach(cleanup);

describe("the lazy screens", () => {
  it("show a word at once while their chunk comes in, never a blank screen", () => {
    const Slow = lazy(() => new Promise<{ default: () => null }>(() => {})); // a chunk that is still on its way
    const { container } = render(
      <Later>
        <Slow />
      </Later>,
    );
    const wait = container.querySelector("[data-screen=loading]");
    expect(wait).not.toBeNull();
    expect(wait!.textContent).toBe(t("screenLoading"));
    expect(wait!.getAttribute("aria-busy")).toBe("true");
  });

  it("the fallback has two shapes: over the map, or a screen of its own", () => {
    expect(render(<Wait />).container.querySelector(".map-overlay")).not.toBeNull();
    cleanup();
    expect(render(<Wait over={false} />).container.querySelector("main.screen")).not.toBeNull();
  });

  it("every chunk can be fetched ahead, and again without a second fetch", async () => {
    await act(() => preloadAll());
    const first = Battle.preload();
    expect(Battle.preload()).toBe(first);
  });
});
