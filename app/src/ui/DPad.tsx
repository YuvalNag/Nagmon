import { useContext, useEffect, useRef } from "react";
import type { Dir } from "../core/world/grid";
import { t } from "../i18n";
import { dirAt, type DpadState } from "./dpadState";
import { FRESH_MS, ShownAt } from "./screenTime";

const ARROWS: { dir: Dir; label: "up" | "down" | "left" | "right" }[] = [
  { dir: "up", label: "up" },
  { dir: "left", label: "left" },
  { dir: "right", label: "right" },
  { dir: "down", label: "down" },
];

const KEYS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

/** A triangle drawn in SVG: the font has no arrows (INVENTORY §8). */
function Arrow({ dir }: { dir: Dir }) {
  const turn = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${turn}deg)` }}>
      <path d="M12 5 L20 17 H4 Z" />
    </svg>
  );
}

interface Props {
  state: DpadState;
  disabled?: boolean;
}

/**
 * The arrows on the map (docs/app/SDD.md §4). Hold to walk, lift to stop.
 * - The whole pad follows each finger on it by its pointer id: one that
 *   slides to another arrow turns the walk that way; other fingers on the
 *   screen change nothing.
 * - A finger that went down before the map appeared, or within its first
 *   280 ms, walks nowhere (ScreenTime).
 * - The arrows are real buttons with names, for TalkBack and a keyboard;
 *   the keyboard's arrow keys walk too.
 */
export function DPad({ state, disabled = false }: Props) {
  const shownAt = useContext(ShownAt);
  const pad = useRef<HTMLDivElement>(null);

  const dirOf = (e: React.PointerEvent): Dir | null => {
    const r = pad.current!.getBoundingClientRect();
    return dirAt(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width / 2);
  };

  useEffect(() => {
    if (disabled) {
      state.clear();
      return;
    }
    const down = (e: KeyboardEvent) => {
      const dir = KEYS[e.key];
      if (!dir || e.repeat) return;
      e.preventDefault();
      state.down(`key:${e.key}`, dir);
    };
    const up = (e: KeyboardEvent) => {
      if (KEYS[e.key]) state.up(`key:${e.key}`);
    };
    const blur = () => state.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      state.clear();
    };
  }, [state, disabled]);

  return (
    <div
      ref={pad}
      className="dpad"
      data-id="dpad"
      role="group"
      aria-label={t("dpad")}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0 || performance.now() - shownAt < FRESH_MS) return;
        // the lift and the slide come here even off the pad
        e.currentTarget.setPointerCapture?.(e.pointerId);
        state.down(e.pointerId, dirOf(e));
      }}
      onPointerMove={(e) => {
        if (state.has(e.pointerId)) state.move(e.pointerId, dirOf(e));
      }}
      onPointerUp={(e) => state.up(e.pointerId)}
      onPointerCancel={(e) => state.up(e.pointerId)}
      onLostPointerCapture={(e) => {
        // only the pad's own capture: the arrow's implicit touch capture,
        // which moves to the pad on the press, bubbles up here too
        if (e.target === e.currentTarget) state.up(e.pointerId);
      }}
    >
      {ARROWS.map(({ dir, label }) => (
        <button
          key={dir}
          type="button"
          className={`arrow arrow-${dir}`}
          data-id={`dpad_${dir}`}
          aria-label={t(label)}
          disabled={disabled}
          tabIndex={-1}
          onClick={(e) => {
            // a switch or keyboard press (no pointer): one step
            if (e.detail === 0 && !disabled) {
              state.down("click", dir);
              state.up("click");
            }
          }}
        >
          <Arrow dir={dir} />
        </button>
      ))}
    </div>
  );
}
