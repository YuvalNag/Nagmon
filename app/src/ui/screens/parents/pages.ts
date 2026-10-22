import type { Code } from "../../../core/fieldData/github";
import type { Prepared } from "../../../core/fieldData/uploads";
import { t, type TextKey } from "../../../i18n";

/** The pages of the parents' area, after the code. */
export type ParentsPage =
  | { kind: "home" }
  | { kind: "children" }
  | { kind: "child"; id: string; message?: string }
  | { kind: "child-name"; id: string; initial: string; message?: string; attempt?: number }
  | { kind: "child-grade"; id: string }
  | { kind: "child-avatar"; id: string }
  | { kind: "child-delete"; id: string; name: string }
  | { kind: "child-report"; id: string }
  | { kind: "learning"; id: string }
  | { kind: "learning-subjects"; id: string }
  | { kind: "learning-start"; id: string }
  | { kind: "learning-coins"; id: string }
  | { kind: "pin-old"; message?: string; attempt?: number }
  | { kind: "pin-new"; current: string; first?: string; message?: string; attempt?: number }
  | { kind: "review" }
  | { kind: "github" }
  | { kind: "token"; message?: string }
  | { kind: "confirm"; prepared: Prepared; what: string }
  | { kind: "notice"; text: string; next: ParentsPage };

export const PARENTS_HOME: ParentsPage = { kind: "home" };

/**
 * Where Android's back goes from each page: one step back, toward the
 * area's first page; null there, and the app goes back to who-plays.
 * A notice goes on to where its "המשך" leads, which is always back.
 */
export function parentsBackStep(p: ParentsPage): ParentsPage | null {
  switch (p.kind) {
    case "home":
      return null;
    case "child":
      return { kind: "children" };
    case "child-name":
    case "child-grade":
    case "child-avatar":
    case "child-delete":
    case "child-report":
    case "learning":
      return { kind: "child", id: p.id };
    case "learning-subjects":
    case "learning-start":
    case "learning-coins":
      return { kind: "learning", id: p.id };
    case "token":
      return { kind: "github" };
    case "confirm":
      // the reports are sent from the area's first page; the rest from the GitHub page
      return p.prepared.kind === "reports" ? PARENTS_HOME : { kind: "github" };
    case "notice":
      return p.next;
    default:
      return PARENTS_HOME;
  }
}

/** The same page again (the code's second entry, a refused name): it keeps its ScreenTime. */
export function samePage(a: ParentsPage, b: ParentsPage): boolean {
  return (
    a.kind === b.kind &&
    (a.kind === "pin-old" ||
      a.kind === "pin-new" ||
      a.kind === "child-name" ||
      a.kind === "token" ||
      a.kind === "review" ||
      // a switch or a step on the page keeps the page (and the finger's rhythm)
      a.kind === "learning" ||
      a.kind === "learning-subjects" ||
      a.kind === "learning-start" ||
      a.kind === "learning-coins")
  );
}

const MESSAGES: Record<Code, TextKey> = {
  ok: "ghOk",
  public: "ghPublic",
  bad_token: "ghBadToken",
  wrong_token_type: "ghWrongTokenType",
  no_permission: "ghNoPermission",
  not_found: "ghNotFound",
  offline: "ghOffline",
  timeout: "ghTimeout",
  conflict: "ghConflict",
  failed: "ghFailed",
  not_connected: "ghNotConnected",
};

/** The parent's sentence for a result: what happened, and the fix. */
export function githubMessage(code: Code, repo: string): string {
  return t(MESSAGES[code], { repo });
}
