import type { Play } from "../../app/play";
import { deliver } from "../../core/game/mail";

/**
 * What the post brings by today (the daily postcard, event letters from an earlier day), put in the mail
 * box and saved at once. Safe to call as often as wanted: it brings nothing twice. True when something new came.
 */
export function checkMail(play: Play): boolean {
  const arrived = deliver(play.world, play.mail, play.today());
  if (!arrived.length) return false;
  for (const a of arrived) play.field.note("mail", { arrived: a.id, kind: a.kind });
  void play.saveWorld();
  return true;
}
