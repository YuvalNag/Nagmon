import { type MutableRefObject, useEffect, useState } from "react";
import type { Play } from "../../app/play";
import { type Pin, pinOf, pinText } from "../../core/game/questWhere";
import { phaseOf } from "../../core/world/npcs";
import { Pic } from "../pc/ObjectArt";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import "./journal.css";
import { jw } from "./words";

/** Where the person of a quest stands right now, in words (the resolver's answer: core/game/questWhere.ts). */
export function showMe(play: Play, slug: string, name: string): string {
  const pin: Pin | null = pinOf(slug, {
    npcs: play.npcs,
    rules: play.quests.data.rules,
    day: play.today(),
    phase: phaseOf(play.clock().getHours()),
    seed: play.world.npcSeed ?? 0,
    flags: (f) => play.world.variables.has(f),
    friendship: (s) => play.world.npcs.get(s)?.lvl ?? 0,
  });
  return jw("where", { name, place: pinText(pin, play.quests.data.rules) });
}

/**
 * The quest journal's body (docs/app/WORLD_V2.md 7.3): up to three open quests as cards (a picture, the title, what to do
 * now, dots for the steps, "Show me" which says where the person is now) and the shelf of finished ones. Never timed,
 * never lost, no score. Also the PC's "Quests" tab.
 */
export function QuestJournalBody({ play }: { play: Play }) {
  const [said, setSaid] = useState<{ id: string; text: string } | null>(null);
  const q = play.quests;
  // the cards the board's accepted postings became are taken into the journal when it opens
  useState(() => {
    if (q.syncBoard().length) void play.saveWorld();
  });
  const cards = q.journal();
  const shelf = q.doneShelf();
  const max = q.data.rules.activeMax;
  return (
    <div className="journal-body" data-id="quest_journal" data-open={cards.length} data-done={shelf.length}>
      <h3 className="journal-head">{jw("open")}</h3>
      {cards.length === 0 && (
        <p className="obj-empty" data-id="journal_empty">
          {jw("empty")}
        </p>
      )}
      <ul className="journal-cards">
        {cards.map((c) => (
          <li key={c.id} className="journal-card" data-id={`journal_card_${c.id}`} data-step={c.step} data-steps={c.steps}>
            <div className="journal-top">
              <Pic code={c.emoji} className="card-pic" />
              <strong className="journal-title">{c.title}</strong>
            </div>
            <span className="journal-todo" data-id={`journal_todo_${c.id}`}>
              {c.todo}
            </span>
            <span className="journal-steps" role="img" aria-label={jw("step", { n: c.step, total: c.steps })}>
              {Array.from({ length: c.steps }, (_, i) => (
                <span key={i} className="journal-dot" data-on={i < c.step - 1} data-now={i === c.step - 1} />
              ))}
            </span>
            <Tap id={`journal_show_${c.id}`} className="journal-show" onTap={() => setSaid({ id: c.id, text: showMe(play, c.who, c.whoName || c.title) })}>
              {jw("showMe")}
            </Tap>
          </li>
        ))}
      </ul>
      <p className="obj-said journal-said" role="status" data-id="journal_said" data-for={said?.id ?? ""}>
        {said?.text ?? (cards.length >= max ? jw("room", { n: max }) : "")}
      </p>
      <h3 className="journal-head">{jw("done")}</h3>
      <div className="journal-shelf" data-id="journal_shelf">
        {shelf.length === 0 && <span className="obj-note">{jw("noneDone")}</span>}
        {shelf.map((c) => (
          <span key={c.id} className="journal-done" data-id={`journal_done_${c.id}`}>
            <Pic code={c.emoji} className="done-pic" />
            <span>{c.n > 1 ? jw("times", { title: c.title, n: c.n }) : c.title}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The journal as a screen of its own (from the Bag): a frame, the way back, and the body. */
export function QuestJournal({ play, onClose, backRef }: { play: Play; onClose: () => void; backRef?: MutableRefObject<(() => void) | null> }) {
  useEffect(() => {
    if (!backRef) return;
    backRef.current = onClose;
    return () => {
      backRef.current = null;
    };
  }, [backRef, onClose]);
  return (
    <ScreenTime key="journal">
      <div className="sheet journal" role="dialog" aria-label={jw("title")} data-screen="journal">
        <header className="sheet-top">
          <h2 className="sheet-title">{jw("title")}</h2>
          <Tap id="journal_close" onTap={onClose}>
            {jw("back")}
          </Tap>
        </header>
        <QuestJournalBody play={play} />
      </div>
    </ScreenTime>
  );
}
