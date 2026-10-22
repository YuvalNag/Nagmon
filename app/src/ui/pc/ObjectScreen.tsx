import { type MutableRefObject, useState } from "react";
import type { Play } from "../../app/play";
import type { ObjectDef } from "../../core/game/objects";
import { BoardScreen } from "./BoardScreen";
import { BookshelfScreen } from "./BookshelfScreen";
import { FridgeScreen } from "./FridgeScreen";
import { MailboxScreen } from "./MailboxScreen";
import { PcScreen } from "./PcScreen";
import { TvScreen } from "./TvScreen";
import "./pc.css";

interface Props {
  play: Play;
  def: ObjectDef;
  onClose: () => void;
  /** The wallet, the Bag, a friend or the mail changed (saved already). */
  onChanged?: () => void;
  /** Android's back: one step back inside the screen, or out. */
  backRef?: MutableRefObject<(() => void) | null>;
}

/**
 * The generic screen of a working object (core/game/objects.ts): the definition names the kind of screen
 * (`screen`) and this picks the component. A new object of an existing kind is a new YAML file, not new code.
 */
export function ObjectScreen({ play, def, onClose, onChanged, backRef }: Props) {
  // opening an object is one line for the parents' log, not one for every draw
  useState(() => play.field.note("object", { open: def.id }));
  switch (def.screen) {
    case "pc":
      return <PcScreen play={play} def={def} onClose={onClose} onChanged={onChanged} backRef={backRef} />;
    case "mailbox":
      return <MailboxScreen play={play} def={def} onClose={onClose} onChanged={onChanged} backRef={backRef} />;
    case "bookshelf":
      return <BookshelfScreen play={play} def={def} onClose={onClose} onChanged={onChanged} backRef={backRef} />;
    case "tv":
      return <TvScreen play={play} def={def} onClose={onClose} backRef={backRef} />;
    case "fridge":
      return <FridgeScreen play={play} def={def} onClose={onClose} onChanged={onChanged} backRef={backRef} />;
    case "board":
      return <BoardScreen play={play} def={def} onClose={onClose} onChanged={onChanged} backRef={backRef} />;
  }
}
