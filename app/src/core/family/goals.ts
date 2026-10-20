/**
 * The weekly practice goal (nagmon/family/goals.py). Only the default
 * target is here so far; the rest of the goals port comes in M9.
 */

/** Practice days a week: 3 for ages 5-7 (or unknown), 4 for older children. */
export function defaultWeeklyDays(age: number | null): number {
  return age === null || age <= 7 ? 3 : 4;
}
