import { type MutableRefObject, useRef } from "react";
import type { Play } from "../../app/play";
import type { ObjectDef } from "../../core/game/objects";
import { MailView } from "./MailView";
import { ObjectFrame } from "./ObjectFrame";
import type { InnerBack } from "./useBack";

/** The mailbox at the home door: the Mail view on its own screen (the same letters as the PC's Mail tab). */
export function MailboxScreen({ play, def, onClose, onChanged, backRef }: { play: Play; def: ObjectDef; onClose: () => void; onChanged?: () => void; backRef?: MutableRefObject<(() => void) | null> }) {
  const inner: InnerBack = useRef(null);
  return (
    <ObjectFrame def={def} onClose={onClose} backRef={backRef} inner={inner} className="mailbox">
      <MailView play={play} inner={inner} onChanged={() => onChanged?.()} />
    </ObjectFrame>
  );
}
