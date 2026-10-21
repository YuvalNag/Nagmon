/**
 * A parent's "something is wrong" report, made from inside the game
 * (docs/app/SDD.md §7.2): what the parent tapped and typed, the screen
 * the child was on, and the last lines of the log. Kept on the phone as
 * `profiles/<id>/reports/<UTC>.json` (and a screenshot beside it), and
 * sent only from the parents' area, like the log and the progress.
 *
 * Everything but the text the parent typed has the children's names
 * hidden; the typed text stays as typed.
 */
import { hideNames } from "../crashReport";
import type { JsonObject } from "../../platform/storage";

/** The four one-tap reasons, in the order the sheet shows them. */
export const REPORT_CHIPS = ["unclear", "looks_wrong", "stuck", "other"] as const;
export type ReportChip = (typeof REPORT_CHIPS)[number];
/** The chip of a report sent with none chosen. */
export const NO_CHIP = "none";

/** The log lines a report keeps (its end). */
export const REPORT_LOG_LINES = 60;
/** The typed text is cut here: a note, not an essay. */
export const MAX_TEXT_CHARS = 1000;
export const SCHEMA_VERSION = 1;

export interface MapContext {
  name: string;
  x: number | null;
  y: number | null;
  facing: string | null;
}

export interface QuestionContext {
  item: string;
  skill: string;
  level: number;
  kind: string;
  choices: { id: string; text: string }[];
  figure: string | null;
  phase: string | null;
}

export interface BattleContext {
  species: string;
  phase: string;
}

/** What the screen shows besides its name: only the parts that apply. */
export interface ReportContext {
  map?: MapContext;
  question?: QuestionContext;
  battle?: BattleContext;
  bag?: { tab: string };
}

export interface ReportInput {
  now: Date;
  version: string;
  build: string;
  /** The profile's id (never the name). */
  child: string;
  chip: ReportChip | null;
  text: string;
  /** The `data-screen` of the visible screen. */
  screen: string;
  context: ReportContext;
  screenshot: boolean;
  /** The app's log, the lines up to now. */
  log: string;
  /** Every child's name: hidden everywhere but in `text`. */
  names: Iterable<string>;
}

/** `YYYYMMDDTHHMMSSZ`: the name of a report's files. */
export function reportStamp(now: Date): string {
  return now.toISOString().replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "");
}

/** The last `n` lines of `log`, without empty ones at the end. */
export function lastLines(log: string, n: number = REPORT_LOG_LINES): string[] {
  const lines = log.split("\n");
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.slice(-n);
}

/** The text as the parent typed it: trimmed, and not endless. */
export function typedText(text: string): string {
  return text.trim().slice(0, MAX_TEXT_CHARS);
}

/** A part of the context with its words cleaned of the children's names. */
function hideIn(value: unknown, names: readonly string[]): unknown {
  if (typeof value === "string") return hideNames(value, names);
  if (Array.isArray(value)) return value.map((v) => hideIn(v, names));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hideIn(v, names)]));
  }
  return value;
}

/** The report's JSON, as it is kept on the phone. */
export function buildReport(input: ReportInput): JsonObject {
  const names = [...input.names];
  const clean = (s: string) => hideNames(s, names);
  const report: JsonObject = {
    schema_version: SCHEMA_VERSION,
    time: input.now.toISOString(),
    version: clean(input.version),
    build: clean(input.build),
    child: input.child,
    chip: input.chip ?? NO_CHIP,
    // as typed: the parent chose these words
    text: typedText(input.text),
    screen: clean(input.screen),
    screenshot: input.screenshot,
  };
  for (const [key, value] of Object.entries(input.context)) {
    if (value !== undefined) report[key] = hideIn(value, names) as JsonObject;
  }
  report.log = lastLines(input.log).map(clean);
  return report;
}
