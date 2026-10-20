import { type ButtonHTMLAttributes, useContext, useRef } from "react";
import { FRESH_MS, ShownAt } from "./screenTime";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  /** Runs once per tap that began on this button. */
  onTap: () => void;
  /** The id tests and the emulator check find the button by. */
  id?: string;
};

/**
 * A button for a finger (docs/app/SDD.md §4). It acts when the finger
 * that went down on it comes up inside it. Not on `click`: Chromium
 * sends no click while another finger rests on the screen, or after the
 * finger drifted a little, and a child's taps were lost.
 * - A finger that went down before (a dialog that closed under it), or
 *   just as this screen appeared, presses nothing.
 * - A held finger acts once, when it lifts.
 * - Keyboard and switch access still work: their click has no pointer.
 */
export function Tap({ onTap, id, disabled, ...rest }: Props) {
  const shownAt = useContext(ShownAt);
  const down = useRef<number | null>(null);
  return (
    <button
      type="button"
      data-id={id}
      disabled={disabled}
      {...rest}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        const fresh = performance.now() - shownAt < FRESH_MS;
        down.current = disabled || fresh || e.button !== 0 ? null : e.pointerId;
        if (down.current === null) return;
        // the lift comes here even off the button (a mouse too), to be checked
        e.currentTarget.setPointerCapture?.(e.pointerId);
        // the pressed look, only for a press that counts (not :active, which
        // also lights a card that appeared under a lifting finger)
        e.currentTarget.dataset.pressed = "";
      }}
      onPointerCancel={(e) => {
        down.current = null;
        delete e.currentTarget.dataset.pressed;
      }}
      onPointerUp={(e) => {
        if (down.current !== e.pointerId) return;
        down.current = null;
        delete e.currentTarget.dataset.pressed;
        const r = e.currentTarget.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (inside && !disabled) onTap();
      }}
      onClick={(e) => {
        if (e.detail === 0 && !disabled) onTap();
      }}
    />
  );
}
