/**
 * The words of the quest journal, in Hebrew (what the child reads) and English (kept for the translators and checked
 * for the same keys and the same `{values}`). The rules are the game's: no score, no "weak", no "you" that needs a
 * gender (the plural, or no one), nothing is lost and nothing is timed.
 */
export const journalWords = {
  he: {
    title: "יומן משימות",
    back: "חזרה",
    close: "סגירה",
    open: "משימות פתוחות",
    done: "משימות שהושלמו",
    empty: "אין משימות פתוחות עכשיו. כדאי להסתכל בלוח המודעות בכיכר או לדבר עם אנשי העיר.",
    noneDone: "עוד לא סיימתם משימה. הראשונה מחכה!",
    step: "שלב {n} מתוך {total}",
    lookFor: "לחפש את {name}",
    showMe: "הראו לי",
    where: "{name}: {place}",
    room: "אפשר להחזיק עד {n} משימות פתוחות. סיימו אחת כדי לקבל עוד.",
    times: "{title} ×{n}",
    tab: "משימות",
  },
  en: {
    title: "Quest journal",
    back: "Back",
    close: "Close",
    open: "Open quests",
    done: "Finished quests",
    empty: "No open quests right now. Look at the notice board in the square or talk to the people of the town.",
    noneDone: "No quest finished yet. The first one is waiting!",
    step: "Step {n} of {total}",
    lookFor: "Look for {name}",
    showMe: "Show me",
    where: "{name}: {place}",
    room: "You can hold up to {n} open quests. Finish one to get another.",
    times: "{title} x{n}",
    tab: "Quests",
  },
} as const;

export type JournalKey = keyof (typeof journalWords)["he"];

/** A word of the journal with its `{values}` put in (Hebrew: the game's language). */
export function jw(key: JournalKey, values: Record<string, string | number> = {}): string {
  return journalWords.he[key].replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}
