/**
 * Family values: what the game emphasises and how it words things
 * (port of nagmon/family/values.py). Every switch is on by default.
 */
import { type JsonObject, isJsonObject } from "../../platform/storage";

export const DEFAULT_EMPHASIS = ["giving", "respect", "honesty", "responsibility", "helping"] as const;

export interface FamilyValues {
  kindnessQuests: boolean;
  gentleBattleWording: boolean;
  modestyFilter: boolean;
  emphasis: string[];
  /** Keys this version does not know; written back unchanged. */
  extra: JsonObject;
}

const BOOL_KEYS = {
  kindness_quests: "kindnessQuests",
  gentle_battle_wording: "gentleBattleWording",
  modesty_filter: "modestyFilter",
} as const;

/** The defaults: everything on, every value emphasised. */
export function defaultValues(): FamilyValues {
  return {
    kindnessQuests: true,
    gentleBattleWording: true,
    modestyFilter: true,
    emphasis: [...DEFAULT_EMPHASIS],
    extra: {},
  };
}

export function valuesToDict(v: FamilyValues): JsonObject {
  return {
    ...v.extra,
    kindness_quests: v.kindnessQuests,
    gentle_battle_wording: v.gentleBattleWording,
    modesty_filter: v.modestyFilter,
    emphasis: [...v.emphasis],
  };
}

/** Lenient: each bad field keeps its default; unknown emphasis words are dropped. */
export function valuesFromDict(d: unknown): FamilyValues {
  const v = defaultValues();
  if (!isJsonObject(d)) return v;
  for (const [key, field] of Object.entries(BOOL_KEYS)) {
    const value = Object.hasOwn(d, key) ? d[key] : undefined;
    if (typeof value === "boolean") v[field] = value;
  }
  if (Array.isArray(d.emphasis)) {
    const known: readonly string[] = DEFAULT_EMPHASIS;
    v.emphasis = d.emphasis.filter((e): e is string => typeof e === "string" && known.includes(e));
  }
  // hasOwn and fromEntries: keys like "toString" or "__proto__" stay plain data.
  v.extra = Object.fromEntries(Object.entries(d).filter(([k]) => !Object.hasOwn(BOOL_KEYS, k) && k !== "emphasis"));
  return v;
}
