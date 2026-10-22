import { useState } from "react";
import type { Facts } from "../../core/game/facts";
import type { Recall } from "../../core/game/journal";
import { Tap } from "../Tap";
import { Pic } from "./ObjectArt";
import { w } from "./words";

/**
 * A recall question about a fact the child read (a book, a postcard, the journal's Recap): the fact's
 * picture on top and three lines to choose from. Practice only: no score, no rating, no helpers, nothing
 * written to the learner. A wrong line is greyed and the child tries another, as often as they like.
 */
export function RecallCard({ recall, facts, onDone, doneLabel }: { recall: Recall; facts: Facts; onDone: () => void; doneLabel?: string }) {
  const [wrong, setWrong] = useState<string[]>([]);
  const [right, setRight] = useState(false);
  const fact = facts[recall.fact];
  if (!fact) return null;
  return (
    <div className="recall-card" data-id="recall" data-state={right ? "right" : wrong.length ? "wrong" : "ask"}>
      <Pic code={fact.emoji} className="recall-pic" />
      <div className="recall-body">
        <strong className="recall-ask">{w("recallPicture")}</strong>
        <div className="recall-choices">
          {recall.choices.map((id, i) => (
            <Tap
              key={id}
              id={`recall_choice_${i}`}
              className="recall-choice"
              data-right={right && id === recall.fact ? "true" : undefined}
              disabled={right ? id !== recall.fact : wrong.includes(id)}
              onTap={() => (id === recall.fact ? setRight(true) : setWrong((x) => [...x, id]))}
            >
              {facts[id]?.text ?? ""}
            </Tap>
          ))}
        </div>
        <span className="recall-said" role="status" data-id="recall_said">
          {right ? w("journalRecapRight") : wrong.length ? w("journalRecapWrong") : ""}
        </span>
      </div>
      {right && (
        <Tap id="recall_ok" className="primary recall-ok" onTap={onDone}>
          {doneLabel ?? w("journalNext")}
        </Tap>
      )}
    </div>
  );
}
