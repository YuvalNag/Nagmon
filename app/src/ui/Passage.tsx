import type { Question } from "../core/learning/model";
import { t } from "../i18n";

/** The reading passage a comprehension question is about (`meta.passage_*` of a reading bank): English, with the Hebrew a tap away. Nothing for other questions. */
export function Passage({ q }: { q: Question }) {
  const en = typeof q.meta["passage_en"] === "string" ? q.meta["passage_en"] : "";
  const he = typeof q.meta["passage_he"] === "string" ? q.meta["passage_he"] : "";
  const title = typeof q.meta["passage_title"] === "string" ? q.meta["passage_title"] : "";
  if (!en && !he) return null;
  return (
    <div className="quiz-passage" data-id="quiz_passage">
      {title && <p className="quiz-passage-title">{title}</p>}
      {en ? (
        <p className="quiz-passage-text" lang="en" dir="ltr">
          {en}
        </p>
      ) : (
        <p className="quiz-passage-text">{he}</p>
      )}
      {en && he && (
        <details className="quiz-passage-he">
          <summary>{t("quizPassageHebrew")}</summary>
          <p>{he}</p>
        </details>
      )}
    </div>
  );
}
