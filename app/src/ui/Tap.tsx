import { type ButtonHTMLAttributes, useRef } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  /** Runs once per tap that began on this button. */
  onTap: () => void;
  /** The id tests and the emulator check find the button by. */
  id?: string;
};

/**
 * A button for a finger (docs/app/SDD.md §4). It acts on `click`, which
 * the browser sends only when the press and the release are on the same
 * button, and only when the press began on it: a finger that went down
 * on the screen before (a dialog that closed under it) presses nothing.
 * A held finger acts once. Keyboard and switch access still work
 * (their click has no pointer press).
 */
export function Tap({ onTap, id, ...rest }: Props) {
  const pressed = useRef(false);
  return (
    <button
      type="button"
      data-id={id}
      {...rest}
      onPointerDown={() => {
        pressed.current = true;
      }}
      onPointerCancel={() => {
        pressed.current = false;
      }}
      onClick={(e) => {
        const fromPointer = e.detail > 0;
        if (fromPointer && !pressed.current) return;
        pressed.current = false;
        onTap();
      }}
    />
  );
}
