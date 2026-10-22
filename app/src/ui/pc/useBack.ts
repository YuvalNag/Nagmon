import { type MutableRefObject, useEffect } from "react";

/** A step of Android's back inside an object's screen: returns true when it went back one step by itself. */
export type InnerBack = MutableRefObject<(() => boolean) | null>;

/** Registers `handler` as the screen's own back step while `active` (the nested view is showing). */
export function useInnerBack(ref: InnerBack, active: boolean, handler: () => void): void {
  useEffect(() => {
    if (!active) return;
    const previous = ref.current;
    ref.current = () => {
      handler();
      return true;
    };
    return () => {
      ref.current = previous;
    };
  }, [ref, active, handler]);
}
