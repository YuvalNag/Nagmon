/**
 * The field log: one short line for each thing a parent needs to read
 * back what a child did (docs/app/SDD.md §9). Questions, map changes,
 * battles, dialogs, purchases and the placement. No names and no family
 * details: ids and numbers only, and any value is cut short.
 */
import { type Crumb, crumb as appCrumb } from "./breadcrumb";

export interface LineSink {
  info(message: string): void;
}

const MAX_VALUE = 48;

/** A value for a line: no spaces or line breaks, and not long. */
function clean(v: string | number): string {
  return String(v).trim().replace(/\s+/g, "_").slice(0, MAX_VALUE);
}

function pairs(p: Record<string, string | number>): string {
  return Object.entries(p)
    .map(([k, v]) => `${k}=${clean(v)}`)
    .join(" ");
}

export interface QuestionLine {
  subject: string;
  skill: string;
  /** The skill's grade. */
  grade: number;
  /** The child's rating on the skill after the answer. */
  theta: number;
  correct: boolean;
  ms: number;
  context: string;
}

export class FieldLog {
  constructor(
    private readonly sink: LineSink,
    private readonly crumb: Crumb = appCrumb,
  ) {}

  private line(kind: string, rest: string): void {
    this.sink.info(rest ? `${kind} ${rest}` : kind);
  }

  question(q: QuestionLine): void {
    this.line(
      "Q",
      pairs({ subject: q.subject, skill: q.skill, grade: q.grade, theta: (Math.round(q.theta * 100) / 100).toFixed(2), ok: q.correct ? 1 : 0, ms: Math.round(q.ms), ctx: q.context }),
    );
  }

  mapChange(from: string | null, to: string): void {
    this.line("MAP", pairs({ from: from ?? "none", to }));
  }

  battleStart(b: { monster: string; level: number; map: string }): void {
    this.line("BATTLE start", pairs(b));
  }

  battleEnd(b: { result: string; questions: number; correct: number; ms: number }): void {
    this.line("BATTLE end", pairs({ ...b, ms: Math.round(b.ms) }));
  }

  dialogStart(id: string): void {
    this.line("DIALOG start", pairs({ id }));
  }

  dialogEnd(id: string, ms: number): void {
    this.line("DIALOG end", pairs({ id, ms: Math.round(ms) }));
  }

  purchase(p: { what: string; price: number; coins: number }): void {
    this.line("BUY", pairs({ what: p.what, price: p.price, coins_left: p.coins }));
  }

  /** An item used (the Bag, a helper): the item's id, where, and whether it worked. No names. */
  item(p: { item: string; where: string; ok: boolean }): void {
    this.line("ITEM use", pairs({ item: p.item, where: p.where, ok: p.ok ? 1 : 0 }));
  }

  /** One go at a net's seal: right or wrong (a wrong one only means another try). No names. */
  capture(p: { species: string; net: string; ok: boolean; left: number; tries: number }): void {
    this.line("CAPTURE try", pairs({ species: p.species, net: p.net, ok: p.ok ? 1 : 0, left: p.left, tries: p.tries }));
  }

  /** The starting level of each subject, in subject order by name. */
  placement(levels: Readonly<Record<string, number>>): void {
    const sorted = Object.fromEntries(Object.entries(levels).sort(([a], [b]) => (a < b ? -1 : 1)));
    this.line("PLACEMENT", pairs(sorted));
  }

  /** Any other game fact: a catch, a growth, a trip. */
  note(kind: string, p: Record<string, string | number>): void {
    this.line(kind.toUpperCase(), pairs(p));
  }

  /** The parent's "something is wrong": where the child was. */
  report(): void {
    this.line("REPORT", pairs(this.crumb.snapshot()));
  }
}
