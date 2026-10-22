import { type MutableRefObject, type ReactNode, useEffect, useRef } from "react";
import type { ObjectDef } from "../../core/game/objects";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import type { InnerBack } from "./useBack";
import { w } from "./words";

interface Props {
  def: ObjectDef;
  title?: string;
  onClose: () => void;
  backRef?: MutableRefObject<(() => void) | null>;
  /** The screen's own back step (a book open, a letter open): see useInnerBack. */
  inner?: InnerBack;
  children: ReactNode;
  className?: string;
}

/** The generic frame of an object's screen: the title, the way out, and the body; Android's back steps through the screen's nested views first. */
export function ObjectFrame({ def, title, onClose, backRef, inner, children, className = "" }: Props) {
  const own = useRef<(() => boolean) | null>(null);
  const steps = inner ?? own;
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (steps.current?.()) return;
      onClose();
    };
    return () => {
      backRef.current = null;
    };
  }, [backRef, steps, onClose]);
  return (
    <ScreenTime key={def.id}>
      <div className={`sheet obj ${className}`} role="dialog" aria-label={title ?? def.title} data-screen="object" data-object={def.id}>
        <header className="sheet-top">
          <h2 className="sheet-title">{title ?? def.title}</h2>
          <Tap id="obj_close" onTap={onClose}>
            {w("back")}
          </Tap>
        </header>
        <div className="obj-body">{children}</div>
      </div>
    </ScreenTime>
  );
}
