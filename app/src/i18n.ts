/**
 * Every word the child or the parent sees. The game is Hebrew whatever
 * language the phone is set to (the old app followed the system and
 * came out in English on a Hebrew phone).
 */
export const he = {
  appName: "נגמון",
  whoPlays: "מי משחק היום?",
  newPlayer: "+ שחקן חדש",
  parents: "הורים",
} as const;

export type TextKey = keyof typeof he;

export function t(key: TextKey): string {
  return he[key];
}
