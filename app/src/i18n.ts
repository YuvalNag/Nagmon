/**
 * Every word the child or the parent sees. The game is Hebrew whatever
 * language the phone is set to (the old app followed its own saved
 * setting and came out in English on a Hebrew phone).
 */
export const he = {
  appName: "נגמון",
  whoPlays: "מי משחק היום?",
  newPlayer: "+ שחקן חדש",
  parents: "הורים",
  pinTitle: "קוד הורים",
  pinSetHint: "בחרו 4 ספרות. הקוד שומר על אזור ההורים ועל הוספת שחקנים.",
  pinAgainHint: "הקלידו את אותן 4 ספרות שוב.",
  pinCheckHint: "הקלידו את קוד ההורים.",
  pinMismatch: "הקודים שונים. מתחילים שוב.",
  pinWrong: "הקוד לא נכון. נשארו עוד {left} ניסיונות.",
  pinWrongLast: "הקוד לא נכון. נשאר עוד ניסיון אחד.",
  pinLocked: "יותר מדי ניסיונות. אפשר לנסות שוב בעוד {seconds} שניות.",
  pinSaved: "הקוד נשמר. את טוקן ה־GitHub מדביקים באזור ההורים.",
  nameTitle: "איך קוראים לשחקן?",
  nameInvalid: "רק אותיות, ורווח אחד בין מילים.",
  nameFull: "עד 16 אותיות בשם.",
  spaceAfterLetter: "רווח בא רק אחרי אות.",
  nameTaken: "כבר יש שחקן בשם הזה.",
  tooMany: "אפשר עד 8 שחקנים.",
  errorTryAgain: "משהו השתבש. נסו שוב.",
  readFailed: "לא הצלחנו לקרוא את רשימת השחקנים. נסו לסגור ולפתוח את המשחק.",
  startFailed: "המשחק לא הצליח להיפתח. סגרו ופתחו אותו שוב.",
  gradeTitle: "באיזו כיתה?",
  avatarTitle: "מי הדמות שלך?",
  childCreated: "{name} מוכן לשחק!",
  parentsTitle: "אזור ההורים",
  shareLog: "שליחת יומן",
  back: "חזרה",
  next: "המשך",
  done: "סיום",
  space: "רווח",
  delete: "מחק",
  switchPlayer: "החלפת שחקן",
  hello: "שלום, {name}!",
  mapLoading: "המפה נפתחת...",
  mapFailed: "המפה לא נפתחה. נסו שוב.",
  mapClosedWay: "הדרך הזאת עוד סגורה. יש עוד הרבה לראות בעיר!",
  mapMenu: "תפריט",
  mapPaused: "המשחק עצר",
  mapContinue: "המשך לשחק",
  mapToWhoPlays: "חזרה למי משחק",
  dpad: "חצים ללכת",
  up: "למעלה",
  down: "למטה",
  left: "שמאלה",
  right: "ימינה",
} as const;

export type TextKey = keyof typeof he;

export function t(key: TextKey, values: Record<string, string | number> = {}): string {
  return he[key].replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}
