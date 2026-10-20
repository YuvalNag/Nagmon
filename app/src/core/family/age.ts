/**
 * A child's age for the learning engine (the targets, the timer, the
 * choices), from the birth year or else from the grade
 * (nagmon/runtime.py `age_from_profile`).
 */

/** Age assumed for a child in grade N when no birth year is known: N + 6. */
export const SCHOOL_START_AGE = 6;
export const KINDERGARTEN_AGE = 5;

export function ageFromProfile(p: { birthYear: number | null; grade: number }, now: Date): number {
  if (p.birthYear) return Math.max(3, now.getFullYear() - p.birthYear);
  if (p.grade <= 0) return KINDERGARTEN_AGE;
  return p.grade + SCHOOL_START_AGE;
}
