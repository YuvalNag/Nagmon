import { useCallback, useEffect, useRef, useState } from "react";
import type { Services } from "./app/services";
import { AVATARS, avatarImage } from "./core/family/avatars";
import { defaultsForGrade, GRADE_NAMES_HE } from "./core/family/gradeDefaults";
import {
  MAX_PROFILES,
  ProfileError,
  ProfileLimitError,
  ProfileNameTakenError,
  validateName,
  type Profile,
} from "./core/family/profiles";
import { t } from "./i18n";
import { bindBackButton } from "./platform/backButton";
import { getLogger } from "./platform/appLog";
import { LetterBoard } from "./ui/LetterBoard";
import { PinPad } from "./ui/PinPad";
import { ScreenTime } from "./ui/screenTime";
import { Tap } from "./ui/Tap";
import { Choices } from "./ui/screens/Choices";
import { Notice } from "./ui/screens/Notice";
import { WhoPlays } from "./ui/screens/WhoPlays";

const log = getLogger("nagmon.screens");

/** Where the parent wanted to go when the code was asked for. */
type Goal = "new_child" | "parents";

export type View =
  | { kind: "who" }
  | { kind: "pin-set"; goal: Goal; first?: string; message?: string; attempt?: number }
  | { kind: "pin-check"; goal: Goal; message?: string; attempt?: number }
  | { kind: "name"; initial?: string; message?: string; attempt?: number }
  | { kind: "grade"; name: string }
  | { kind: "avatar"; name: string; grade: number }
  | { kind: "notice"; text: string; next: View; back?: View }
  | { kind: "parents" }
  | { kind: "play"; id: string };

const WHO: View = { kind: "who" };

/**
 * Where Android's back button goes from each screen: one step back in
 * the flow. On who-plays it does nothing, on purpose: the app never
 * closes by itself under a child's finger. A notice never leads forward
 * on back ("code saved" goes on to the name only by "המשך").
 */
export function backStep(v: View): View | null {
  switch (v.kind) {
    case "who":
      return null;
    case "grade":
      return { kind: "name", initial: v.name };
    case "avatar":
      return { kind: "grade", name: v.name };
    case "notice":
      return v.back ?? WHO;
    default:
      return WHO;
  }
}

const locked = (seconds: number): View => ({
  kind: "notice",
  text: t("pinLocked", { seconds: Math.ceil(seconds) }),
  next: WHO,
});

/** Slow work that has not answered by now has failed (a stuck disk or hash). */
export const WORK_TIMEOUT_MS = 15_000;

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer after ${ms} ms`)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Screens that are the same screen again: the code's second entry, a new
 * try after a wrong code or a refused name. They keep their ScreenTime,
 * so a parent typing on in one rhythm loses no digit; a new ScreenTime
 * (and its guard against carried-over taps) is only for a different screen.
 */
function sameScreen(a: View, b: View): boolean {
  return a.kind === b.kind && (a.kind === "pin-set" || a.kind === "pin-check" || a.kind === "name");
}

interface Props {
  services: Services;
  /** Binds Android's back button; returns an unbind (tests pass their own). */
  backButton?: (handler: () => void) => () => void;
  workTimeoutMs?: number;
}

export function App({ services, backButton = bindBackButton, workTimeoutMs = WORK_TIMEOUT_MS }: Props) {
  const { profiles, parent } = services;
  // each screen shown gets a number: a new number is a new, fresh screen
  const [shown, setShown] = useState<{ view: View; n: number }>({ view: WHO, n: 0 });
  const current = useRef<View>(WHO);
  const [children, setChildren] = useState<Profile[]>([]);
  // slow work running: its screen's keys wait; `locked` also shuts the ways out
  const [busy, setBusy] = useState<"no" | "keys" | "locked">("no");
  const busyRef = useRef<"no" | "keys" | "locked">("no");
  const job = useRef(0);
  const view = shown.view;

  /** Shows a screen. Any work still running is dropped: its screen is gone. */
  const show = useCallback((v: View) => {
    const same = sameScreen(current.current, v);
    current.current = v;
    job.current++;
    busyRef.current = "no";
    setBusy("no");
    setShown((s) => ({ view: v, n: same ? s.n : s.n + 1 }));
  }, []);

  /**
   * Slow work (the code's hash, the disk) for the screen showing now. Its
   * result is shown only if that screen is still showing. A failure, or no
   * answer within the time limit, is logged and answered with `failed`
   * instead of freezing the screen. `lock` shuts the ways out meanwhile:
   * only for saving a child, where leaving would save them unseen.
   */
  const work = useCallback(
    async (what: string, task: () => Promise<View>, failed: View, { lock = false } = {}) => {
      if (busyRef.current !== "no") return;
      const mine = ++job.current;
      busyRef.current = lock ? "locked" : "keys";
      setBusy(busyRef.current);
      let next: View;
      try {
        next = await within(task(), workTimeoutMs);
      } catch (e) {
        log.error(`Could not ${what}`, e);
        next = failed;
      }
      if (job.current === mine) show(next);
      else log.warning(`Dropped the result of "${what}": the screen changed`);
    },
    [show, workTimeoutMs],
  );

  useEffect(() => {
    profiles.list().then(setChildren, (e) => {
      log.error("Could not read the players", e);
      show({ kind: "notice", text: t("readFailed"), next: WHO });
    });
  }, [profiles, show]);

  useEffect(
    () =>
      backButton(() => {
        if (busyRef.current === "locked") return;
        const next = backStep(current.current);
        if (next) show(next);
      }),
    [backButton, show],
  );

  const goTo = (goal: Goal): View => (goal === "new_child" ? { kind: "name" } : { kind: "parents" });

  function ask(goal: Goal) {
    if (goal === "new_child" && children.length >= MAX_PROFILES) {
      show({ kind: "notice", text: t("tooMany"), next: WHO });
      return;
    }
    if (!parent.hasPin()) {
      show({ kind: "pin-set", goal });
      return;
    }
    // locked from earlier tries: say so now, not after the code is typed
    void work(
      "check the lockout",
      async () => {
        const left = await parent.lockoutRemaining();
        return left > 0 ? locked(left) : { kind: "pin-check", goal };
      },
      { kind: "notice", text: t("errorTryAgain"), next: WHO },
    );
  }

  function setPin(v: Extract<View, { kind: "pin-set" }>, pin: string) {
    const attempt = (v.attempt ?? 0) + 1;
    if (v.first === undefined) {
      show({ ...v, first: pin, message: undefined, attempt });
      return;
    }
    if (v.first !== pin) {
      show({ kind: "pin-set", goal: v.goal, message: t("pinMismatch"), attempt });
      return;
    }
    void work(
      "save the parent code",
      async () => {
        await parent.setPin(pin);
        return { kind: "notice", text: t("pinSaved"), next: goTo(v.goal) };
      },
      { kind: "pin-set", goal: v.goal, message: t("errorTryAgain"), attempt },
    );
  }

  function checkPin(v: Extract<View, { kind: "pin-check" }>, pin: string) {
    const attempt = (v.attempt ?? 0) + 1;
    void work(
      "check the parent code",
      async () => {
        const result = await parent.verifyPin(pin);
        if (result.ok) return goTo(v.goal);
        if (result.locked) return locked(result.retryAfterS);
        const message = result.attemptsLeft === 1 ? t("pinWrongLast") : t("pinWrong", { left: result.attemptsLeft });
        return { ...v, message, attempt };
      },
      { ...v, message: t("errorTryAgain"), attempt },
    );
  }

  function gotName(v: Extract<View, { kind: "name" }>, text: string) {
    const again = (message: string): View => ({ kind: "name", initial: text, message, attempt: (v.attempt ?? 0) + 1 });
    let name: string;
    try {
      name = validateName(text);
    } catch {
      show(again(t("nameInvalid")));
      return;
    }
    if (children.some((c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) show(again(t("nameTaken")));
    else show({ kind: "grade", name });
  }

  function create(v: Extract<View, { kind: "avatar" }>, avatar: string) {
    const { name } = v;
    const nameAgain = (message: string): View => ({ kind: "name", initial: name, message, attempt: 1 });
    void work(
      "save the new child",
      async () => {
        try {
          const d = defaultsForGrade(v.grade);
          await profiles.create({ name, avatar, grade: d.grade, languageLevel: d.languageLevel, settings: d.settings });
        } catch (e) {
          if (e instanceof ProfileLimitError) return { kind: "notice", text: t("tooMany"), next: WHO };
          if (e instanceof ProfileNameTakenError) return nameAgain(t("nameTaken"));
          if (e instanceof ProfileError) return nameAgain(t("nameInvalid"));
          throw e;
        }
        setChildren(await profiles.list());
        return { kind: "notice", text: t("childCreated", { name }), next: WHO };
      },
      // the same heroes again: the child taps once more
      { kind: "notice", text: t("errorTryAgain"), next: v, back: v },
      { lock: true },
    );
  }

  return <ScreenTime key={shown.n}>{screen(view)}</ScreenTime>;

  function screen(view: View) {
    switch (view.kind) {
      case "who":
        return (
          <WhoPlays
            children={children}
            busy={busy !== "no"}
            onPick={(id) => show({ kind: "play", id })}
            onNewChild={() => ask("new_child")}
            onParents={() => ask("parents")}
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
            onDone={(pin) => setPin(view, pin)}
            onCancel={() => show(WHO)}
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
            onDone={(pin) => checkPin(view, pin)}
            onCancel={() => show(WHO)}
          />
        );
      case "name":
        return (
          <LetterBoard
            key={`name-${view.attempt ?? 0}`}
            title={t("nameTitle")}
            initial={view.initial}
            message={view.message}
            onDone={(text) => gotName(view, text)}
            onCancel={() => show(WHO)}
          />
        );
      case "grade":
        return (
          <Choices
            screen="grade"
            title={t("gradeTitle")}
            choices={GRADE_NAMES_HE.map((label, i) => ({ id: String(i), label }))}
            onPick={(id) => show({ kind: "avatar", name: view.name, grade: Number(id) })}
            onBack={() => show({ kind: "name", initial: view.name })}
          />
        );
      case "avatar":
        return (
          <Choices
            screen="avatar"
            title={t("avatarTitle")}
            busy={busy !== "no"}
            choices={AVATARS.map((a) => ({ id: a.key, label: a.labelHe, image: avatarImage(a.key) }))}
            onPick={(key) => create(view, key)}
            onBack={() => show({ kind: "grade", name: view.name })}
          />
        );
      case "notice":
        return <Notice text={view.text} onNext={() => show(view.next)} />;
      case "parents":
        return (
          <main className="screen" data-screen="parents">
            <h1 className="title">{t("parentsTitle")}</h1>
            <Tap id="back" onTap={() => show(WHO)}>
              {t("back")}
            </Tap>
          </main>
        );
      case "play": {
        const child = children.find((c) => c.id === view.id);
        return (
          <main className="screen" data-screen="play">
            <h1 className="title">{t("hello", { name: child?.name ?? "" })}</h1>
            <Tap id="switch_player" onTap={() => show(WHO)}>
              {t("switchPlayer")}
            </Tap>
          </main>
        );
      }
    }
  }
}
