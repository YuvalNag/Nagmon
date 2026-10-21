import { useEffect, useState } from "react";
import { effectsFrom, lessMovement } from "../../core/family/effects";

const QUERY = "(prefers-reduced-motion: reduce)";

function systemReduced(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** Calm effects for this child: the parents' switch, or the system's own "reduce motion" when it says "system". */
export function useCalm(settings: unknown): boolean {
  const motion = effectsFrom(settings).motion;
  const [system, setSystem] = useState(systemReduced);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(QUERY);
    const on = () => setSystem(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return lessMovement(motion, system);
}
