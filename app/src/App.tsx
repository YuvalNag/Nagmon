import { useCallback, useEffect, useState } from "react";
import type { Services } from "./app/services";
import { AVATARS, avatarImage } from "./core/family/avatars";
import { defaultsForGrade, GRADE_NAMES_HE } from "./core/family/gradeDefaults";
import { ProfileError, ProfileLimitError, validateName, type Profile } from "./core/family/profiles";
import { t } from "./i18n";
import { LetterBoard } from "./ui/LetterBoard";
import { PinPad } from "./ui/PinPad";
import { Tap } from "./ui/Tap";
import { Choices } from "./ui/screens/Choices";
import { Notice } from "./ui/screens/Notice";
import { WhoPlays } from "./ui/screens/WhoPlays";

/** Where the parent wanted to go when the code was asked for. */
type Goal = "new_child" | "parents";

type View =
  | { kind: "who" }
  | { kind: "pin-set"; goal: Goal; first?: string; message?: string; attempt?: number }
  | { kind: "pin-check"; goal: Goal; message?: string; attempt?: number }
  | { kind: "name"; initial?: string; message?: string }
  | { kind: "grade"; name: string }
  | { kind: "avatar"; name: string; grade: number }
  | { kind: "notice"; text: string; next: View }
  | { kind: "parents" }
  | { kind: "play"; id: string };

const WHO: View = { kind: "who" };

export function App({ services }: { services: Services }) {
  const { profiles, parent } = services;
  const [view, setView] = useState<View>(WHO);
  const [children, setChildren] = useState<Profile[]>([]);

  const refresh = useCallback(async () => setChildren(await profiles.list()), [profiles]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const goTo = (goal: Goal): View => (goal === "new_child" ? { kind: "name" } : { kind: "parents" });
  const ask = (goal: Goal): View => (parent.hasPin() ? { kind: "pin-check", goal } : { kind: "pin-set", goal });

  async function setPin(v: Extract<View, { kind: "pin-set" }>, pin: string) {
    if (v.first === undefined) {
      setView({ ...v, first: pin, message: undefined, attempt: (v.attempt ?? 0) + 1 });
      return;
    }
    if (v.first !== pin) {
      setView({ kind: "pin-set", goal: v.goal, message: t("pinMismatch"), attempt: (v.attempt ?? 0) + 1 });
      return;
    }
    await parent.setPin(pin);
    setView({ kind: "notice", text: t("pinSaved"), next: goTo(v.goal) });
  }

  async function checkPin(v: Extract<View, { kind: "pin-check" }>, pin: string) {
    const result = await parent.verifyPin(pin);
    if (result.ok) setView(goTo(v.goal));
    else if (result.locked) setView({ kind: "notice", text: t("pinLocked", { seconds: Math.ceil(result.retryAfterS) }), next: WHO });
    else setView({ ...v, message: t("pinWrong"), attempt: (v.attempt ?? 0) + 1 });
  }

  function gotName(text: string) {
    try {
      const name = validateName(text);
      if (children.some((c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        setView({ kind: "name", initial: text, message: t("nameTaken") });
        return;
      }
      setView({ kind: "grade", name });
    } catch {
      setView({ kind: "name", initial: text, message: t("nameInvalid") });
    }
  }

  async function create(name: string, grade: number, avatar: string) {
    try {
      const d = defaultsForGrade(grade);
      await profiles.create({ name, avatar, grade: d.grade, languageLevel: d.languageLevel, settings: d.settings });
      await refresh();
      setView({ kind: "notice", text: t("childCreated", { name }), next: WHO });
    } catch (e) {
      if (e instanceof ProfileLimitError) setView({ kind: "notice", text: t("tooMany"), next: WHO });
      else if (e instanceof ProfileError) setView({ kind: "name", initial: name, message: t("nameInvalid") });
      else throw e;
    }
  }

  switch (view.kind) {
    case "who":
      return (
        <WhoPlays
          children={children}
          onPick={(id) => setView({ kind: "play", id })}
          onNewChild={() => setView(ask("new_child"))}
          onParents={() => setView(ask("parents"))}
        />
      );
    case "pin-set":
      return (
        <PinPad
          // a fresh, empty pad for each step and each new try
          key={`set-${view.attempt ?? 0}`}
          title={t("pinTitle")}
          hint={view.first === undefined ? t("pinSetHint") : t("pinAgainHint")}
          message={view.message}
          attempt={view.attempt}
          onDone={(pin) => void setPin(view, pin)}
          onCancel={() => setView(WHO)}
        />
      );
    case "pin-check":
      return (
        <PinPad
          key={`check-${view.attempt ?? 0}`}
          title={t("pinTitle")}
          hint={t("pinCheckHint")}
          message={view.message}
          attempt={view.attempt}
          onDone={(pin) => void checkPin(view, pin)}
          onCancel={() => setView(WHO)}
        />
      );
    case "name":
      return (
        <LetterBoard
          key={view.message ?? "name"}
          title={t("nameTitle")}
          initial={view.initial}
          message={view.message}
          onDone={gotName}
          onCancel={() => setView(WHO)}
        />
      );
    case "grade":
      return (
        <Choices
          screen="grade"
          title={t("gradeTitle")}
          choices={GRADE_NAMES_HE.map((label, i) => ({ id: String(i), label }))}
          onPick={(id) => setView({ kind: "avatar", name: view.name, grade: Number(id) })}
          onBack={() => setView({ kind: "name", initial: view.name })}
        />
      );
    case "avatar":
      return (
        <Choices
          screen="avatar"
          title={t("avatarTitle")}
          choices={AVATARS.map((a) => ({ id: a.key, label: a.labelHe, image: avatarImage(a.key) }))}
          onPick={(key) => void create(view.name, view.grade, key)}
          onBack={() => setView({ kind: "grade", name: view.name })}
        />
      );
    case "notice":
      return <Notice text={view.text} onNext={() => setView(view.next)} />;
    case "parents":
      return (
        <main className="screen" data-screen="parents">
          <h1 className="title">{t("parentsTitle")}</h1>
          <Tap id="back" onTap={() => setView(WHO)}>
            {t("back")}
          </Tap>
        </main>
      );
    case "play": {
      const child = children.find((c) => c.id === view.id);
      return (
        <main className="screen" data-screen="play">
          <h1 className="title">{t("hello", { name: child?.name ?? "" })}</h1>
          <Tap id="switch_player" onTap={() => setView(WHO)}>
            {t("switchPlayer")}
          </Tap>
        </main>
      );
    }
  }
}
