import { type MutableRefObject, useEffect, useRef, useState } from "react";
import type { Play } from "../../app/play";
import type { ObjectDef } from "../../core/game/objects";
import { unreadCount } from "../../core/game/mail";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import { BoxesTab } from "./BoxesTab";
import { ItemsTab } from "./ItemsTab";
import { JournalTab } from "./JournalTab";
import { MailView } from "./MailView";
import { checkMail } from "./mailSync";
import { PeopleTab } from "./PeopleTab";
import type { InnerBack } from "./useBack";
import { w } from "./words";

export const TABS = ["boxes", "items", "mail", "journal", "people"] as const;
export type PcTab = (typeof TABS)[number];

const LABEL = { boxes: "tabBoxes", items: "tabItems", mail: "tabMail", journal: "tabJournal", people: "tabPeople" } as const;
const ICON = { boxes: "📦", items: "🎒", mail: "✉️", journal: "📖", people: "👥" } as const;

interface Props {
  play: Play;
  def: ObjectDef;
  onClose: () => void;
  /** The wallet, the Bag or a friend changed (saved already). */
  onChanged?: () => void;
  /** Android's back: a nested view first (a letter, the Recap), then the screen. */
  backRef?: MutableRefObject<(() => void) | null>;
  /** The tab to open on (the mailbox is the PC's Mail tab). */
  start?: PcTab;
}

/**
 * The PC (docs/app/WORLD_V2.md 8, object 1): five tabs. Boxes, Items, Mail, Journal and People, each its own
 * component; the tabs sit in the header beside the way out, so the whole height is the tab's. Nothing here
 * can release a friend, sell an item or take anything away.
 */
export function PcScreen({ play, def, onClose, onChanged, backRef, start = "boxes" }: Props) {
  const [tab, setTab] = useState<PcTab>(start);
  const inner: InnerBack = useRef(null);
  // the post is checked when the PC opens, so the Mail tab shows its new letter at once
  const [, redraw] = useState(0);
  useState(() => checkMail(play));

  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (inner.current?.()) return;
      onClose();
    };
    return () => {
      backRef.current = null;
    };
  }, [backRef, onClose]);

  const changed = () => {
    onChanged?.();
    redraw((n) => n + 1);
  };
  const unread = unreadCount(play.world);

  return (
    <ScreenTime key="pc">
      <div className="sheet obj pc" role="dialog" aria-label={def.title} data-screen="object" data-object={def.id} data-tab={tab}>
        <header className="sheet-top pc-top">
          <div className="pc-tabs" role="tablist" aria-label={def.title}>
            {TABS.map((id) => (
              <Tap key={id} id={`pc_tab_${id}`} className="pc-tab" role="tab" aria-selected={tab === id} data-unread={id === "mail" && unread > 0 ? unread : undefined} onTap={() => setTab(id)}>
                <span aria-hidden="true">{ICON[id]}</span>
                <span>{w(LABEL[id])}</span>
                {id === "mail" && unread > 0 && (
                  <span className="tab-badge" aria-label={`${unread}`}>
                    {unread}
                  </span>
                )}
              </Tap>
            ))}
          </div>
          <Tap id="obj_close" onTap={onClose} aria-label={w("close")}>
            {w("back")}
          </Tap>
        </header>
        <div className="pc-pane" role="tabpanel" data-tab={tab}>
          {tab === "boxes" && <BoxesTab play={play} onChanged={changed} />}
          {tab === "items" && <ItemsTab play={play} onChanged={changed} />}
          {tab === "mail" && <MailView play={play} inner={inner} onChanged={changed} />}
          {tab === "journal" && <JournalTab play={play} inner={inner} />}
          {tab === "people" && <PeopleTab play={play} />}
        </div>
      </div>
    </ScreenTime>
  );
}
