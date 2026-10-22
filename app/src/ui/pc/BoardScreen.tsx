import { type MutableRefObject, useMemo, useState } from "react";
import type { Play } from "../../app/play";
import { accept, boardData, isAccepted, type Posting, type PostingSource, staticPostings } from "../../core/game/board";
import type { ObjectDef } from "../../core/game/objects";
import { Tap } from "../Tap";
import { Pic } from "./ObjectArt";
import { ObjectFrame } from "./ObjectFrame";
import { w } from "./words";

const SLOT = { easy: "boardEasy", normal: "boardNormal", learning: "boardLearning", weekly: "boardWeekly" } as const;

/**
 * The notice board (docs/app/WORLD_V2.md 7.3 and 8, object 6): the day's cards, each with a picture, a
 * one-line goal and the giver; accepting is free and kept for good. This is the SHELL of slice W2: the cards
 * come from a {@link PostingSource} (the static one here; the quest generator of W3 replaces it) and an
 * accepted card is saved in `board.accepted` for the quest engine to read. Nothing is timed or lost.
 */
export function BoardScreen({ play, def, onClose, onChanged, backRef, source }: { play: Play; def: ObjectDef; onClose: () => void; onChanged?: () => void; backRef?: MutableRefObject<(() => void) | null>; source?: PostingSource }) {
  const today = play.today();
  const src = useMemo(() => source ?? staticPostings(boardData(def.data)), [source, def]);
  const postings = src.postings(today);
  const [, redraw] = useState(0);
  const [said, setSaid] = useState<string | null>(null);

  const take = (p: Posting) => {
    if (!accept(play.world, p.id, today)) return;
    play.field.note("board", { accepted: p.id, slot: p.slot });
    setSaid(w("boardSaved"));
    void play.saveWorld();
    onChanged?.();
    redraw((n) => n + 1);
  };

  return (
    <ObjectFrame def={def} onClose={onClose} backRef={backRef} className="board">
      <div className="board-body" data-id="board" data-count={postings.length}>
        {postings.length === 0 && <p className="obj-empty">{w("boardNone")}</p>}
        <ul className="board-cards">
          {postings.map((p) => {
            const done = isAccepted(play.world, p.id);
            return (
              <li key={p.id} className="board-card" data-id={`board_card_${p.id}`} data-slot={p.slot} data-accepted={done}>
                <span className="card-slot">{w(SLOT[p.slot])}</span>
                <Pic code={p.emoji} className="card-pic" />
                <strong className="card-goal">{p.goal}</strong>
                <span className="row-sub">{w("boardFrom", { name: p.giver })}</span>
                <Tap id={`board_accept_${p.id}`} className={done ? "" : "primary"} disabled={done} onTap={() => take(p)}>
                  {done ? w("boardAccepted") : w("boardAccept")}
                </Tap>
              </li>
            );
          })}
        </ul>
        <span className="obj-said" role="status" data-id="board_said">
          {said ?? ""}
        </span>
      </div>
    </ObjectFrame>
  );
}
