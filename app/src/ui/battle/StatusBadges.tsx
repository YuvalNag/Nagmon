import type { Badge } from "../../core/game/battleStatus";
import type { StatusId } from "../../core/data/battleTypes";
import { t } from "../../i18n";
import { STATUS_GLYPH, subjectColor } from "./subjects";

/** What the badges need from the data: the Hebrew name and the colour of a status. */
export interface StatusLook {
  name: (id: StatusId) => string;
  hex: (id: StatusId) => string;
  stat: (stat: string) => string;
  subject: (subject: string) => string;
}

interface Props {
  badges: Badge[];
  look: StatusLook;
  side: "mine" | "theirs";
}

/**
 * The status icons beside a bar (4.1): a round badge in the status's colour with a shape that is not colour alone
 * (the emoji), 1 to 3 arrows for a stage, the Mark's subject colour, a small lock when a boss shrugs a kind off.
 * The name is the label; the rounds left are in the title.
 */
export function StatusBadges({ badges, look, side }: Props) {
  if (badges.length === 0) return null;
  return (
    <ul className="badges" data-side={side} data-id={`badges_${side}`} aria-label={t("statusLabel", { name: "" }).trim()}>
      {badges.map((b, i) => {
        const hex = b.id === "mark" && b.variant ? subjectColor(b.variant) : look.hex(b.id);
        const name = look.name(b.id) + (b.variant ? ` (${b.id === "mark" ? look.subject(b.variant) : look.stat(b.variant)})` : "");
        return (
          <li key={`${b.id}-${b.variant ?? ""}-${i}`} className="badge" data-status={b.id} data-n={b.n ?? 0} data-locked={!!b.locked} style={{ ["--badge" as string]: hex }} role="img" aria-label={t("statusLabel", { name })} title={name}>
            <span className="badge-glyph" aria-hidden="true">
              {STATUS_GLYPH[b.id] ?? "•"}
            </span>
            {b.n && b.n > 1 && b.id !== "mark" ? (
              <span className="badge-n" aria-hidden="true">
                {b.n}
              </span>
            ) : null}
            {b.locked && (
              <span className="badge-lock" aria-hidden="true">
                🔒
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
