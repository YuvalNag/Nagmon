/**
 * The parents' switches for the battle's effects, kept in the child's
 * settings (`settings.effects`): less movement, sound and vibration.
 * Lenient: anything else in the file reads as the defaults (movement
 * follows the system, sound on at a low volume, vibration on).
 */
import type { JsonObject } from "../../platform/storage";

export type MotionSetting = "system" | "less" | "full";
export const MOTIONS: readonly MotionSetting[] = ["system", "less", "full"];

/** The evolution animation: the whole (about 10.6 s) or the short one the parent can choose (about 6 s, BATTLE_V3 7.4). */
export type EvolutionLength = "long" | "short";

export interface EffectSettings {
  motion: MotionSetting;
  sound: boolean;
  vibration: boolean;
  evolution: EvolutionLength;
}

export const DEFAULT_EFFECTS: Readonly<EffectSettings> = { motion: "system", sound: true, vibration: true, evolution: "long" };

/** The volume of the battle's sounds: low, the parents' switch is on or off. */
export const SFX_VOLUME = 0.35;

function isDict(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function effectsFrom(settings: unknown): EffectSettings {
  const raw = isDict(settings) && isDict(settings["effects"]) ? settings["effects"] : {};
  const motion = (MOTIONS as readonly unknown[]).includes(raw["motion"]) ? (raw["motion"] as MotionSetting) : DEFAULT_EFFECTS.motion;
  return {
    motion,
    sound: typeof raw["sound"] === "boolean" ? raw["sound"] : DEFAULT_EFFECTS.sound,
    vibration: typeof raw["vibration"] === "boolean" ? raw["vibration"] : DEFAULT_EFFECTS.vibration,
    evolution: raw["evolution"] === "short" || raw["evolution"] === "long" ? raw["evolution"] : DEFAULT_EFFECTS.evolution,
  };
}

/** The settings with the effects changed; the rest of the settings stays as it is. */
export function withEffects(settings: JsonObject, patch: Partial<EffectSettings>): JsonObject {
  const now = { ...effectsFrom(settings), ...patch };
  return { ...settings, effects: { motion: now.motion, sound: now.sound, vibration: now.vibration, evolution: now.evolution } };
}

/** The next motion setting, for one button that goes round: system, less, full. */
export function nextMotion(m: MotionSetting): MotionSetting {
  return MOTIONS[(MOTIONS.indexOf(m) + 1) % MOTIONS.length]!;
}

/** Calm effects (no flying, no wobble): the parent's choice, or the system's own when it is "system". */
export function lessMovement(motion: MotionSetting, systemReduced: boolean): boolean {
  return motion === "less" ? true : motion === "full" ? false : systemReduced;
}
