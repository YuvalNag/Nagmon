/**
 * The characters a child can be. Only the owner's HD heroes, all modest
 * (docs/kids/SDD_MODESTY.md); Tuxemon's heroine wears a short skirt and
 * is not offered. Profiles from the old app keep their key and are drawn
 * as the nearest hero.
 */
export interface Avatar {
  key: string;
  labelHe: string;
}

export const AVATARS: readonly Avatar[] = [
  { key: "boy_blue", labelHe: "בן" },
  { key: "girl_teal", labelHe: "בת" },
  { key: "girl_curly", labelHe: "בת" },
];

/** Keys the old app stored, and the hero each is drawn as. */
const OLD_KEYS: Readonly<Record<string, string>> = {
  boy_light: "boy_blue",
  boy_dark: "boy_blue",
  girl_light: "girl_teal",
  girl_dark: "girl_curly",
};

/** Every key a profile may hold: the heroes and the old app's keys. */
export const AVATAR_KEYS: ReadonlySet<string> = new Set([
  ...AVATARS.map((a) => a.key),
  ...Object.keys(OLD_KEYS),
]);

/** The picture to draw for a stored key; an unknown key gets the first hero. */
export function avatarImage(key: string): string {
  const hero = AVATARS.some((a) => a.key === key) ? key : (OLD_KEYS[key] ?? AVATARS[0].key);
  return `game/avatars/${hero}.png`;
}
