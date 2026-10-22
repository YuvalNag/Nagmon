import { type MutableRefObject, useCallback, useRef, useState } from "react";
import type { Play } from "../../app/play";
import { factsOf, SUBJECTS } from "../../core/game/facts";
import { BOOKMARK_COINS, booksReadToday, booksToday, BOOKS_PER_DAY, type BookRead, readBook, recallFor, type Recall } from "../../core/game/journal";
import type { ObjectDef } from "../../core/game/objects";
import { BestiaryScreen } from "../BestiaryScreen";
import { Tap } from "../Tap";
import { BookArt, Pic, StampArt } from "./ObjectArt";
import { ObjectFrame } from "./ObjectFrame";
import { RecallCard } from "./Recall";
import { type InnerBack, useInnerBack } from "./useBack";
import { w } from "./words";

/** The six shelves' colours come from the subjects' own (subjects.yaml); this is for a subject with none. */
const FALLBACK = "#9cc7d1";

/**
 * The bookshelf (docs/app/WORLD_V2.md 8, object 3). Home: three books out today, one from each of three
 * subjects; the library has a shelf for each subject. A book is one page, a picture and one fact, read once;
 * an optional recall question follows (practice only). Three different books in a day give a reading stamp
 * (once a day), ten stamps a bookmark charm and 20 coins. The shelf also opens the Book (the bestiary).
 */
export function BookshelfScreen({ play, def, onClose, onChanged, backRef }: { play: Play; def: ObjectDef; onClose: () => void; onChanged?: () => void; backRef?: MutableRefObject<(() => void) | null> }) {
  const library = def.data["mode"] === "library";
  const world = play.world;
  const today = play.today();
  const inner: InnerBack = useRef(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [got, setGot] = useState<BookRead | null>(null);
  const [recall, setRecall] = useState<Recall | null>(null);
  const [bestiary, setBestiary] = useState(false);
  const [, redraw] = useState(0);

  const colorOf = (s: string) => (play.subjects.info[s]?.["color"] as string | undefined) ?? FALLBACK;
  const shelf = library ? (subject ? factsOf(play.facts, subject).slice(0, 6) : []) : booksToday(play.facts, today);
  const open = book !== null;
  const goBack = useCallback(() => {
    if (recall) setRecall(null);
    else if (bestiary) setBestiary(false);
    else if (book) {
      setBook(null);
      setGot(null);
    } else setSubject(null);
  }, [recall, bestiary, book]);
  useInnerBack(inner, open || bestiary || (library && subject !== null), goBack);

  const pick = (id: string) => {
    const r = readBook(world, id, today);
    play.field.note("book", { fact: id, stamp: r.stamp ? 1 : 0, ...(r.bookmark ? { bookmark: 1 } : {}) });
    setBook(id);
    setGot(r);
    void play.saveWorld();
    onChanged?.();
    redraw((n) => n + 1);
  };

  const fact = book ? play.facts[book] : undefined;
  const count = booksReadToday(world, today);

  return (
    <ObjectFrame def={def} onClose={onClose} backRef={backRef} inner={inner} className="bookshelf">
      {bestiary && <BestiaryScreen play={play} onClose={() => setBestiary(false)} />}
      {book && fact ? (
        <div className="book-page" data-id="book_page" data-book={book}>
          {recall ? (
            <RecallCard recall={recall} facts={play.facts} onDone={() => setRecall(null)} />
          ) : (
            <div className="book-open">
              <Pic code={fact.emoji} className="book-pic" />
              <p className="book-fact" data-id="book_fact">
                {fact.text}
              </p>
            </div>
          )}
          {got?.stamp && (
            <p className="obj-said stamp-said" role="status" data-id="book_stamp">
              <StampArt /> {w("shelfStamp")}
              {got.bookmark ? ` ${w("shelfBookmark", { coins: got.coins || BOOKMARK_COINS })}` : ""}
            </p>
          )}
          {!recall && (
            <div className="obj-actions">
              <Tap id="book_recall" onTap={() => setRecall(recallFor(book, play.facts, `book:${today}`))}>
                {w("shelfRecall")}
              </Tap>
              <Tap id="book_back" className="primary" onTap={goBack}>
                {w("shelfBackToShelf")}
              </Tap>
            </div>
          )}
        </div>
      ) : (
        <div className="shelf" data-id="shelf" data-mode={library ? "library" : "daily"}>
          {library && (
            <div className="chip-row" role="group" data-id="shelf_subjects">
              {SUBJECTS.map((s) => (
                <Tap key={s} id={`shelf_subject_${s}`} className="chip" aria-pressed={subject === s} onTap={() => setSubject(s)}>
                  {play.subjects.title(s)}
                </Tap>
              ))}
            </div>
          )}
          <span className="obj-note" data-id="shelf_count" data-count={count}>
            {library && !subject ? w("shelfSubjectsHint") : w("shelfToday")} · {w("shelfCount", { n: Math.min(count, BOOKS_PER_DAY) })}
          </span>
          <ul className="books-row" data-id="books">
            {shelf.map((id) => (
              <li key={id}>
                <Tap id={`book_${id}`} className="book-btn" data-read={world.journal.read[id] !== undefined} aria-label={play.facts[id]?.text ?? id} onTap={() => pick(id)}>
                  <BookArt color={colorOf(play.facts[id]?.subject ?? "")}>
                    <Pic code={play.facts[id]?.emoji ?? "1f4d6"} className="book-cover-pic" />
                  </BookArt>
                  <span className="friend-sub">{play.subjects.title(play.facts[id]?.subject ?? "")}</span>
                </Tap>
              </li>
            ))}
          </ul>
          <div className="obj-actions">
            <Tap id="shelf_bestiary" onTap={() => setBestiary(true)}>
              {w("shelfBestiary")}
            </Tap>
          </div>
        </div>
      )}
    </ObjectFrame>
  );
}
