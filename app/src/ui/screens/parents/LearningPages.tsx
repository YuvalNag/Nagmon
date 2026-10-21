import { GRADE_NAMES_HE } from "../../../core/family/gradeDefaults";
import { COIN_MAX, GRADE_MAX, type LearningPatch, type LearningSettings, QUESTIONS_MAX, QUESTIONS_MIN } from "../../../core/family/learningSettings";
import { SUBJECT_HE } from "../../../core/learning/dashboard";
import { t } from "../../../i18n";
import { Tap } from "../../Tap";
import { Bar } from "./Bar";

const subjectTitle = (s: string) => SUBJECT_HE[s] ?? s;

/** A step down and a step up around a value: "−  5  +". */
function Stepper({ id, label, onLess, onMore, lessOff, moreOff, busy }: { id: string; label: string; onLess: () => void; onMore: () => void; lessOff: boolean; moreOff: boolean; busy: boolean }) {
  return (
    <div className="stepper" data-id={id}>
      <Tap id={`${id}_less`} aria-label={t("learningLess")} disabled={busy || lessOff} onTap={onLess}>
        −
      </Tap>
      <span className="stepper-label" data-id={`${id}_value`} role="status">
        {label}
      </span>
      <Tap id={`${id}_more`} aria-label={t("learningMore")} disabled={busy || moreOff} onTap={onMore}>
        +
      </Tap>
    </div>
  );
}

interface Common {
  settings: LearningSettings;
  /** The child's own grade: where a subject starts when the parent set nothing. */
  grade: number;
  subjects: readonly string[];
  busy: boolean;
  onPatch: (patch: LearningPatch) => void;
  onBack: () => void;
}

/** The learning switches of one child: four doors and the questions in a battle. */
export function LearningPage({ settings, subjects, busy, onPatch, onBack, onSubjects, onStart, onCoins }: Common & { onSubjects: () => void; onStart: () => void; onCoins: () => void }) {
  const on = settings.subjects ? subjects.filter((s) => settings.subjects!.includes(s)).length : subjects.length;
  const q = settings.questionsPerBattle;
  return (
    <main className="screen parents-page" data-screen="parents-learning">
      <Bar title={t("learningTitle")} onBack={onBack} />
      <div className="parents-body">
        <div className="parents-menu">
          <Tap id="learning_subjects" disabled={busy} onTap={onSubjects}>
            {t("learningSubjects", { on, total: subjects.length })}
          </Tap>
          <Tap id="learning_start" disabled={busy} onTap={onStart}>
            {t("learningStart")}
          </Tap>
          <Tap id="learning_levels" disabled={busy} aria-pressed={settings.showLevels} onTap={() => onPatch({ showLevels: !settings.showLevels })}>
            {t("learningLevels", { state: t(settings.showLevels ? "learningLevelsShown" : "learningLevelsHidden") })}
          </Tap>
          <Tap id="learning_coins" disabled={busy} onTap={onCoins}>
            {t("learningCoins")}
          </Tap>
        </div>
        <Stepper
          id="learning_questions"
          label={t("learningQuestions", { n: q })}
          busy={busy}
          lessOff={q <= QUESTIONS_MIN}
          moreOff={q >= QUESTIONS_MAX}
          onLess={() => onPatch({ questionsPerBattle: q - 1 })}
          onMore={() => onPatch({ questionsPerBattle: q + 1 })}
        />
        <p className="hint">{t("learningCap")}</p>
      </div>
    </main>
  );
}

/** Subjects on and off; the last one on stays on. */
export function SubjectsPage({ settings, subjects, busy, onPatch, onBack }: Common) {
  const on = settings.subjects ? subjects.filter((s) => settings.subjects!.includes(s)) : [...subjects];
  return (
    <main className="screen parents-page" data-screen="parents-learning-subjects">
      <Bar title={t("learningSubjectsTitle")} onBack={onBack} />
      <div className="parents-body">
        <div className="parents-menu">
          {subjects.map((s) => {
            const isOn = on.includes(s);
            return (
              <Tap
                key={s}
                id={`subject_${s}`}
                className="toggle"
                aria-pressed={isOn}
                disabled={busy || (isOn && on.length <= 1)}
                onTap={() => onPatch({ subjects: isOn ? on.filter((x) => x !== s) : subjects.filter((x) => x === s || on.includes(x)) })}
              >
                <span aria-hidden="true" className="toggle-mark" data-on={isOn} />
                {subjectTitle(s)}
              </Tap>
            );
          })}
        </div>
        <p className="hint">{t("learningSubjectsHint")}</p>
      </div>
    </main>
  );
}

/** Where each subject starts: a step for each, from kindergarten to grade 9. */
export function StartGradePage({ settings, grade, subjects, busy, onPatch, onBack }: Common) {
  return (
    <main className="screen parents-page" data-screen="parents-learning-start">
      <Bar title={t("learningStartTitle")} onBack={onBack} />
      <div className="parents-body">
        <div className="parents-menu steppers">
          {subjects.map((s) => {
            const set = settings.startGrade[s];
            const g = set ?? grade;
            const name = GRADE_NAMES_HE[g] ?? String(g);
            return (
              <Stepper
                key={s}
                id={`start_${s}`}
                label={t(set === undefined ? "learningStartDefault" : "learningStartRow", { subject: subjectTitle(s), grade: name })}
                busy={busy}
                lessOff={g <= 0}
                moreOff={g >= GRADE_MAX}
                onLess={() => onPatch({ startGrade: { [s]: g - 1 } })}
                onMore={() => onPatch({ startGrade: { [s]: g + 1 } })}
              />
            );
          })}
        </div>
        <p className="hint">{t("learningStartHint")}</p>
      </div>
    </main>
  );
}

/** The two coin amounts of a tutor's lesson. */
export function CoinsPage({ settings, busy, onPatch, onBack }: Common) {
  const first = settings.firstPassCoins;
  const repeat = settings.repeatCoins;
  return (
    <main className="screen parents-page" data-screen="parents-learning-coins">
      <Bar title={t("learningCoinsTitle")} onBack={onBack} />
      <div className="parents-body">
        <Stepper
          id="coins_first"
          label={t("learningCoinsFirst", { n: first })}
          busy={busy}
          lessOff={first <= 0}
          moreOff={first >= COIN_MAX}
          onLess={() => onPatch({ firstPassCoins: first - 10 })}
          onMore={() => onPatch({ firstPassCoins: first + 10 })}
        />
        <Stepper
          id="coins_repeat"
          label={t("learningCoinsRepeat", { n: repeat })}
          busy={busy}
          lessOff={repeat <= 0}
          moreOff={repeat >= COIN_MAX}
          onLess={() => onPatch({ repeatCoins: repeat - 5 })}
          onMore={() => onPatch({ repeatCoins: repeat + 5 })}
        />
        <p className="hint">{t("learningCoinsHint")}</p>
      </div>
    </main>
  );
}
