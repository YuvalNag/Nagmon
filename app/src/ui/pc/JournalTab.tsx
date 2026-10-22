import { useCallback, useMemo, useState } from "react";
import type { Play } from "../../app/play";
import { buildDashboard, SUBJECT_HE } from "../../core/learning/dashboard";
import { bySubject, factsRead, factStamps, progressTier, recap, type Recall } from "../../core/game/journal";
import { SUBJECTS } from "../../core/game/facts";
import { Tap } from "../Tap";
import { Pic } from "./ObjectArt";
import { RecallCard } from "./Recall";
import { type InnerBack, useInnerBack } from "./useBack";
import { w } from "./words";

const TIER = ["journalTier0", "journalTier1", "journalTier2", "journalTier3"] as const;

/** A day as the child reads it: day and month (the year is in the save, not on the page). */
const shortDay = (day: string) => `${Number(day.slice(8, 10))}.${Number(day.slice(5, 7))}`;

/**
 * The PC's Journal tab, "what I learned": for each subject the facts the child has read (with the day) and
 * a line about how it is going in kind words (never a score, a percentage or a "weak" subject), the stamps
 * for every ten facts and the reading stamps, and a Recap button that asks up to three recall questions from
 * the last 7 days. The Recap is practice: it touches neither the learner nor the helpers.
 */
export function JournalTab({ play, inner }: { play: Play; inner: InnerBack }) {
  const world = play.world;
  const today = play.today();
  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [quiz, setQuiz] = useState<{ list: Recall[]; at: number } | null>(null);

  const read = bySubject(world, play.facts);
  const stats = useMemo(() => buildDashboard(play.engine.learner, play.engine.content, Date.now() / 1000), [play]);
  const mine = read[subject] ?? [];
  const s = stats.subjects[subject];
  const tier = progressTier({ answered7d: s?.answered_7d.value ?? 0, mastered: s?.mastered.value ?? 0, factsRead: mine.length });

  const stop = useCallback(() => setQuiz(null), []);
  useInnerBack(inner, quiz !== null, stop);

  if (quiz) {
    const q = quiz.list[quiz.at];
    return (
      <div className="journal-recap" data-id="recap" data-at={quiz.at} data-of={quiz.list.length}>
        <span className="obj-note">{w("journalRecapAsk")}</span>
        {q ? (
          <RecallCard
            key={quiz.at}
            recall={q}
            facts={play.facts}
            doneLabel={quiz.at + 1 < quiz.list.length ? w("journalNext") : w("close")}
            onDone={() => (quiz.at + 1 < quiz.list.length ? setQuiz({ list: quiz.list, at: quiz.at + 1 }) : setQuiz(null))}
          />
        ) : null}
        <span className="obj-said" role="status">
          {quiz.at + 1}/{quiz.list.length}
        </span>
      </div>
    );
  }

  const total = factsRead(world);
  const recapList = recap(world, play.facts, today);
  return (
    <div className="journal" data-id="journal">
      <div className="journal-top">
        <span className="journal-counts" data-id="journal_counts">
          <span>{w("journalFacts", { n: total })}</span>
          <span data-id="journal_stamps">{w("journalStamps", { n: factStamps(world) })}</span>
          <span>{w("journalBook", { n: world.journal.stamps })}</span>
          <span>{w("journalBookmarks", { n: world.journal.bookmarks })}</span>
        </span>
        <Tap id="journal_recap" className={recapList.length ? "primary" : ""} disabled={recapList.length === 0} onTap={() => setQuiz({ list: recapList, at: 0 })}>
          {w("journalRecap")}
        </Tap>
      </div>
      {recapList.length === 0 && <span className="obj-note">{w("journalRecapNone")}</span>}
      <div className="chip-row" role="group" data-id="journal_subjects">
        {SUBJECTS.map((sub) => (
          <Tap key={sub} id={`journal_subject_${sub}`} className="chip" aria-pressed={subject === sub} onTap={() => setSubject(sub)}>
            {play.subjects.title(sub) || SUBJECT_HE[sub] || sub}
          </Tap>
        ))}
      </div>
      <p className="journal-words" data-id="journal_words" data-tier={tier}>
        {w(TIER[tier])}
      </p>
      {total === 0 ? (
        <p className="obj-empty" data-id="journal_none">
          {w("journalNone")}
        </p>
      ) : (
        <ul className="obj-rows journal-list" data-id="journal_list">
          {mine.map((l) => (
            <li key={l.id} className="journal-fact" data-id={`journal_fact_${l.id}`}>
              <Pic code={play.facts[l.id]!.emoji} className="fact-pic-small" />
              <span className="row-text">{play.facts[l.id]!.text}</span>
              <span className="row-sub">{shortDay(l.day)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
