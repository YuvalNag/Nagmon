import type { WorkedExample } from "../core/learning/worked_example";
import { isolateMath } from "../core/learning/text";
import { t } from "../i18n";
import { Figure } from "./Figure";

/**
 * The owl's worked example: ANOTHER item of the same skill, solved
 * step by step (never the question that comes next). The idea first,
 * then the sibling's prompt, its solution and its answer.
 */
export function QuizExample({ example, englishFirst }: { example: WorkedExample; englishFirst: boolean }) {
  return (
    <>
      {example.idea_he && (
        <p className="quiz-explain" data-id="quiz_example_idea">
          {t("quizExampleIdea", { idea: example.idea_he })}
        </p>
      )}
      <div className="quiz-prompt">
        {example.figure && <Figure figure={example.figure} />}
        <p className="quiz-question" data-id="quiz_example_prompt">
          {isolateMath(example.prompt_he)}
          {example.prompt_en && englishFirst && (
            <span className="quiz-en" lang="en" dir="ltr">
              {example.prompt_en}
            </span>
          )}
        </p>
      </div>
      <p className="quiz-explain" data-id="quiz_example">
        {isolateMath(example.steps_he)}
      </p>
      {example.answer_he && (
        <p className="quiz-explain" data-id="quiz_example_answer">
          {t("quizExampleAnswer", { answer: example.answer_he })}
        </p>
      )}
      <p className="quiz-explain" data-id="quiz_example_next">
        {t("quizExampleNext")}
      </p>
    </>
  );
}
