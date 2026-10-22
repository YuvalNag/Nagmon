import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Services } from "../../../app/services";
import { effectsFrom, withEffects } from "../../../core/family/effects";
import { learningFrom, type LearningPatch, withLearning } from "../../../core/family/learningSettings";
import type { ContentLibrary } from "../../../core/learning";
import { buildChildReport, type ChildReport } from "../../../core/learning/parentReport";
import { localDay, WorldState } from "../../../core/world/worldState";
import { quickBuyAllowed, withQuickBuy } from "../../../core/family/shopSettings";
import { AVATARS, avatarImage } from "../../../core/family/avatars";
import { GRADE_NAMES_HE } from "../../../core/family/gradeDefaults";
import { PinError, PinLockedError } from "../../../core/family/parent";
import { ProfileError, ProfileNameTakenError, type Profile, validateName } from "../../../core/family/profiles";
import type { Check, Upload } from "../../../core/fieldData/github";
import { progressSnapshot } from "../../../core/fieldData/snapshot";
import { FieldData, type Kind } from "../../../core/fieldData/uploads";
import { FieldLog } from "../../../core/game/fieldLog";
import { t } from "../../../i18n";
import { appLogText, buildInfo, currentAppLog, getLogger, saveAppLog } from "../../../platform/appLog";
import { shareText } from "../../../platform/share";
import { LetterBoard } from "../../LetterBoard";
import { PinPad } from "../../PinPad";
import { ScreenTime } from "../../screenTime";
import { Later, Review } from "../../lazy";
import { Choices } from "../Choices";
import { Notice } from "../Notice";
import { ChildPage } from "./ChildPage";
import { ChildrenList } from "./ChildrenList";
import { Confirm } from "./Confirm";
import { CoinsPage, LearningPage, StartGradePage, SubjectsPage } from "./LearningPages";
import { ReportPage } from "./ReportPage";
import { GitHubPage } from "./GitHubPage";
import { PARENTS_HOME, type ParentsPage, githubMessage, parentsBackStep, samePage } from "./pages";
import { ParentsHome } from "./ParentsHome";
import { TokenPage } from "./TokenPage";
import "./parents.css";

const log = getLogger("nagmon.parents");

/** Disk work (a profile, the code's hash) that has not answered by now has failed. */
export const PARENTS_WORK_MS = 15_000;
/**
 * The network: a check and up to three writes with a check between them,
 * each at most 30 s (src/core/fieldData/github.ts). Only then is it late.
 */
export const NETWORK_WORK_MS = 200_000;

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer after ${ms} ms`)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** What the GitHub page shows while nothing is running. */
type GhState = { masked: string | null | undefined; check: Check | null; activity: "idle" | "checking" | "sending" };

interface Props {
  services: Services;
  /** Android's back: one step back inside the area; false on its first page. */
  backRef: RefObject<(() => boolean) | null>;
  onExit: () => void;
  /** The children changed (a name, a grade, a hero, a delete): who-plays shows them so. */
  onChildren: (list: Profile[]) => void;
  workTimeoutMs?: number;
  /** The learning content, for the report and the subjects (loaded on first need; the app's own loader by default). */
  loadContent?: () => Promise<ContentLibrary>;
}

const loadAppContent = async () => (await import("../../../app/play")).loadLibrary();

/**
 * The parents' area, after the code: the children, the code itself, and
 * sending data to the developer. Each page is a screen of its own (a
 * fresh ScreenTime), and Android's back goes one page back.
 */
export function ParentsArea({ services, backRef, onExit, onChildren, workTimeoutMs = PARENTS_WORK_MS, loadContent = loadAppContent }: Props) {
  const { profiles, parent, fieldData } = services;
  const [shown, setShown] = useState<{ page: ParentsPage; n: number }>({ page: PARENTS_HOME, n: 0 });
  const current = useRef<ParentsPage>(PARENTS_HOME);
  const [children, setChildren] = useState<Profile[] | null>(null);
  // the game's "something is wrong" reports waiting on the phone
  const [waiting, setWaiting] = useState(0);
  // the parent's text-review decisions waiting to be sent
  const [reviewWaiting, setReviewWaiting] = useState(0);
  // whether the game's reports go up by themselves (the GitHub page's switch)
  const [auto, setAuto] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const job = useRef(0);
  const [gh, setGh] = useState<GhState>({ masked: undefined, check: null, activity: fieldData.sending ? "sending" : "idle" });
  const page = shown.page;
  // the learning content (once), the subjects it has, and the report being read
  const contentRef = useRef<Promise<ContentLibrary> | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [childReport, setChildReport] = useState<{ id: string; data: ChildReport } | null>(null);

  const go = useCallback((p: ParentsPage) => {
    const same = samePage(current.current, p);
    current.current = p;
    job.current++;
    busyRef.current = false;
    setBusy(false);
    setShown((s) => ({ page: p, n: same ? s.n : s.n + 1 }));
  }, []);

  /**
   * Slow work for the page showing now; its result is shown only if that
   * page still is. A failure, or no answer in time, is logged and answered
   * with `failed`, never a frozen page.
   */
  const work = useCallback(
    async (what: string, task: () => Promise<ParentsPage | null>, failed: ParentsPage, ms = workTimeoutMs) => {
      if (busyRef.current) return;
      const mine = ++job.current;
      busyRef.current = true;
      setBusy(true);
      let next: ParentsPage | null;
      try {
        next = await within(task(), ms);
      } catch (e) {
        log.error(`Could not ${what}`, e);
        next = failed;
      }
      if (job.current !== mine) {
        log.warning(`Dropped the result of "${what}": the page changed`);
        return;
      }
      if (next) go(next);
      else {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [go, workTimeoutMs],
  );

  useEffect(() => {
    backRef.current = () => {
      const back = parentsBackStep(current.current);
      if (!back) return false;
      go(back);
      return true;
    };
    return () => {
      backRef.current = null;
    };
  }, [backRef, go]);

  const readChildren = useCallback(async () => {
    const list = await profiles.list();
    setChildren(list);
    onChildren(list);
    return list;
  }, [profiles, onChildren]);

  // the children's pages read them fresh
  useEffect(() => {
    if (page.kind === "children" || page.kind === "child") {
      readChildren().catch((e) => {
        log.error("Could not read the players", e);
        go({ kind: "notice", text: t("readFailed"), next: PARENTS_HOME });
      });
    }
  }, [page, readChildren, go]);

  // the first page says how many reports wait (read again after a send)
  useEffect(() => {
    if (page.kind !== "home") return;
    let alive = true;
    fieldData.waitingReports().then(
      (n) => alive && setWaiting(n),
      (e) => log.warning("Could not count the waiting reports", e),
    );
    fieldData.waitingReview().then(
      (n) => alive && setReviewWaiting(n),
      (e) => log.warning("Could not count the waiting review decisions", e),
    );
    return () => {
      alive = false;
    };
    fieldData.waitingReview().then(
      (n) => alive && setReviewWaiting(n),
      (e) => log.warning("Could not count the waiting review decisions", e),
    );
    return () => {
      alive = false;
    };
  }, [page, fieldData]);

  const readGithub = useCallback(async () => {
    try {
      const masked = await fieldData.masked();
      const check = masked ? await fieldData.cachedStatus() : null;
      setGh((g) => ({ ...g, masked, check }));
      setAuto(masked ? await fieldData.reportsAuto() : undefined);
    } catch (e) {
      // the secure storage could not be read: as if no token
      log.warning("Could not read the GitHub token", e);
      setGh((g) => ({ ...g, masked: null, check: null }));
    }
  }, [fieldData]);

  useEffect(() => {
    if (page.kind === "github") void readGithub();
  }, [page, readGithub]);

  // ---------------------------------------------------------- children

  const childOf = (id: string) => children?.find((c) => c.id === id) ?? null;

  /** Saves a changed child (atomically, through the store) and shows them. */
  function saveChild(id: string, change: (p: Profile) => void, failed: ParentsPage, taken?: ParentsPage, next?: ParentsPage) {
    void work(
      "save the child",
      async () => {
        try {
          const p = await profiles.get(id);
          change(p);
          await profiles.save(p);
        } catch (e) {
          // another child got the name meanwhile, or the store refused it
          if (e instanceof ProfileNameTakenError && taken) return taken;
          if (e instanceof ProfileError) return failed;
          throw e;
        }
        await readChildren();
        return next ?? { kind: "child", id, message: t("childSaved") };
      },
      failed,
    );
  }

  /** The learning content, read once; a failed read is tried again next time. */
  function content(): Promise<ContentLibrary> {
    if (!contentRef.current) {
      const read = loadContent();
      contentRef.current = read;
      read.catch(() => {
        if (contentRef.current === read) contentRef.current = null;
      });
    }
    return contentRef.current;
  }

  /** "דוח למידה": reads the child's learner, world and the content, builds the report (read only). */
  function openReport(id: string) {
    void work(
      "build the learning report",
      async () => {
        const [lib, child, learnerDict, worldDict, play] = await Promise.all([
          content(),
          profiles.get(id),
          profiles.loadLearnerDict(id),
          profiles.loadWorldDict(id),
          import("../../../app/play"),
        ]);
        const learner = play.learnerFor(child, learnerDict, new Date());
        const world = WorldState.fromDict(worldDict);
        const data = buildChildReport({ learner, content: lib, now: Date.now() / 1000, world, localDay: (ts) => localDay(new Date(ts * 1000)) });
        setChildReport({ id, data });
        return { kind: "child-report", id };
      },
      { kind: "notice", text: t("dashFailed"), next: { kind: "child", id } },
    );
  }

  /** "הגדרות למידה": the subjects the content has, then the page. */
  function openLearning(id: string) {
    void work(
      "read the learning content",
      async () => {
        setSubjects((await content()).subjects());
        return { kind: "learning", id };
      },
      { kind: "notice", text: t("errorTryAgain"), next: { kind: "child", id } },
    );
  }

  /** One learning switch changed: saved, and the same page shown again. */
  function saveLearning(p: ParentsPage & { id: string }, patch: LearningPatch) {
    saveChild(p.id, (c) => (c.settings = withLearning(c.settings, patch, subjects)), { kind: "notice", text: t("errorTryAgain"), next: p }, undefined, p);
  }

  function gotName(p: Extract<ParentsPage, { kind: "child-name" }>, text: string) {
    const again = (message: string): ParentsPage => ({ ...p, initial: text, message, attempt: (p.attempt ?? 0) + 1 });
    let name: string;
    try {
      name = validateName(text);
    } catch {
      go(again(t("nameInvalid")));
      return;
    }
    const others = (children ?? []).filter((c) => c.id !== p.id);
    if (others.some((c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      go(again(t("nameTaken")));
      return;
    }
    if (childOf(p.id)?.name === name) {
      go({ kind: "child", id: p.id });
      return;
    }
    saveChild(p.id, (c) => (c.name = name), again(t("errorTryAgain")), again(t("nameTaken")));
  }

  function remove(p: Extract<ParentsPage, { kind: "child-delete" }>) {
    void work(
      "delete the child",
      async () => {
        await profiles.delete(p.id);
        await readChildren();
        log.info("A child was deleted (moved to the trash)");
        return { kind: "notice", text: t("childDeleted", { name: p.name }), next: { kind: "children" } };
      },
      { kind: "notice", text: t("errorTryAgain"), next: { kind: "child", id: p.id } },
    );
  }

  // ------------------------------------------------------- parent code

  const lockedNotice = (seconds: number): ParentsPage => ({
    kind: "notice",
    text: t("pinLocked", { seconds: Math.ceil(seconds) }),
    next: PARENTS_HOME,
  });

  function askCurrentPin() {
    void work(
      "check the lockout",
      async () => {
        const left = await parent.lockoutRemaining();
        return left > 0 ? lockedNotice(left) : { kind: "pin-old" };
      },
      { kind: "notice", text: t("errorTryAgain"), next: PARENTS_HOME },
    );
  }

  function checkCurrent(p: Extract<ParentsPage, { kind: "pin-old" }>, pin: string) {
    const attempt = (p.attempt ?? 0) + 1;
    void work(
      "check the parent code",
      async () => {
        const result = await parent.verifyPin(pin);
        if (result.ok) return { kind: "pin-new", current: pin };
        if (result.locked) return lockedNotice(result.retryAfterS);
        const message = result.attemptsLeft === 1 ? t("pinWrongLast") : t("pinWrong", { left: result.attemptsLeft });
        return { ...p, message, attempt };
      },
      { ...p, message: t("errorTryAgain"), attempt },
    );
  }

  function setNew(p: Extract<ParentsPage, { kind: "pin-new" }>, pin: string) {
    const attempt = (p.attempt ?? 0) + 1;
    if (p.first === undefined) {
      go({ ...p, first: pin, message: undefined, attempt });
      return;
    }
    if (p.first !== pin) {
      go({ kind: "pin-new", current: p.current, message: t("pinMismatch"), attempt });
      return;
    }
    void work(
      "change the parent code",
      async () => {
        try {
          await parent.setPin(pin, { current: p.current });
        } catch (e) {
          if (e instanceof PinLockedError) return lockedNotice(e.retryAfterS);
          // the current code changed meanwhile (another screen): ask for it again
          if (e instanceof PinError) return { kind: "pin-old", message: t("errorTryAgain"), attempt: 1 };
          throw e;
        }
        log.info("The parent code was changed");
        return { kind: "notice", text: t("pinChanged"), next: PARENTS_HOME };
      },
      { kind: "pin-new", current: p.current, message: t("errorTryAgain"), attempt },
    );
  }

  // -------------------------------------------------------------- GitHub

  function saveToken(token: string) {
    setGh((g) => ({ ...g, activity: "checking" }));
    void work(
      "check the GitHub token",
      async () => {
        let check: Check;
        try {
          check = await fieldData.connect(token);
        } finally {
          setGh((g) => ({ ...g, activity: "idle" }));
        }
        if (check.code !== "ok" && check.code !== "public") {
          return { kind: "token", message: githubMessage(check.code, check.repo) };
        }
        // the log hides the new token from now on, not only after its next read
        await currentAppLog()?.refreshSecrets();
        setGh((g) => ({ ...g, check }));
        return { kind: "github" };
      },
      { kind: "token", message: t("errorTryAgain") },
      NETWORK_WORK_MS,
    );
  }

  function toggleReportsAuto(on: boolean) {
    setAuto(on);
    fieldData.setReportsAuto(on).then(
      // switched on: what is waiting goes now
      () => (on ? void fieldData.deliverReports() : undefined),
      (e) => log.warning("Could not save the reports switch", e),
    );
  }

  function removeToken() {
    void work(
      "remove the GitHub token",
      async () => {
        await fieldData.disconnect();
        setGh({ masked: null, check: null, activity: "idle" });
        return { kind: "notice", text: t("ghRemoved"), next: { kind: "github" } };
      },
      { kind: "notice", text: t("errorTryAgain"), next: { kind: "github" } },
    );
  }

  function checkNow() {
    setGh((g) => ({ ...g, activity: "checking" }));
    void work(
      "check the GitHub connection",
      async () => {
        try {
          const check = await fieldData.status();
          setGh((g) => ({ ...g, check }));
        } finally {
          setGh((g) => ({ ...g, activity: "idle" }));
        }
        return null;
      },
      { kind: "notice", text: t("errorTryAgain"), next: { kind: "github" } },
      NETWORK_WORK_MS,
    );
  }

  /** Gets an upload ready and asks: what, where, then "שליחה". */
  function ask(kind: Exclude<Kind, "reports">) {
    void work(
      `prepare the ${kind}`,
      async () => {
        if (kind === "logs") {
          await saveAppLog();
          const text = appLogText();
          if (!text.trim()) return { kind: "notice", text: t("logEmpty"), next: { kind: "github" } };
          const prepared = await fieldData.prepare("logs", text);
          return { kind: "confirm", prepared, what: t("ghConfirmLog", { lines: prepared.lines }) };
        }
        if (kind === "crashes") {
          const crash = await fieldData.pendingCrash();
          if (crash === null) return { kind: "notice", text: t("ghNoCrash"), next: { kind: "github" } };
          const prepared = await fieldData.prepare("crashes", crash, { crash });
          return { kind: "confirm", prepared, what: t("ghConfirmCrash", { lines: prepared.lines }) };
        }
        const list = await profiles.list();
        const snapshot = await progressSnapshot({
          profiles: list,
          learner: (id) => profiles.loadLearnerDict(id),
          settings: parent.settings,
          build: buildInfo(),
          now: new Date(),
        });
        const prepared = await fieldData.prepare("progress", FieldData.progressText(snapshot));
        const what = list.length === 1 ? t("ghConfirmProgressOne") : t("ghConfirmProgress", { count: list.length });
        return { kind: "confirm", prepared, what };
      },
      { kind: "notice", text: t("errorTryAgain"), next: { kind: "github" } },
    );
  }

  /** "שליחת דיווחים": without a connection to GitHub, the page where it is made; else what and where, then "שליחה". */
  function askReports() {
    void work(
      "prepare the reports",
      async () => {
        if (!(await fieldData.connected())) return { kind: "github" };
        const prepared = await fieldData.prepareReports();
        if (!prepared) {
          setWaiting(0);
          return { kind: "notice", text: t("ghNoReports"), next: PARENTS_HOME };
        }
        const kb = Math.max(1, Math.round(prepared.bytes / 1024));
        return { kind: "confirm", prepared, what: t("ghConfirmReports", { count: prepared.lines, kb }) };
      },
      { kind: "notice", text: t("errorTryAgain"), next: PARENTS_HOME },
    );
  }

  function send(p: Extract<ParentsPage, { kind: "confirm" }>) {
    setGh((g) => ({ ...g, activity: "sending" }));
    void work(
      `send the ${p.prepared.kind}`,
      async () => {
        let code: Upload["code"];
        try {
          code = (await fieldData.send(p.prepared)).code;
        } finally {
          setGh((g) => ({ ...g, activity: "idle" }));
        }
        // what the upload learned about the connection itself
        if (code === "ok" || code === "public" || code === "bad_token" || code === "no_permission" || code === "not_found") {
          setGh((g) => ({ ...g, check: { code, repo: fieldData.repo } }));
        }
        const text = code === "ok" ? t("ghSent") : githubMessage(code, fieldData.repo);
        return { kind: "notice", text, next: p.prepared.kind === "reports" ? PARENTS_HOME : { kind: "github" } };
      },
      { kind: "notice", text: t("errorTryAgain"), next: { kind: "github" } },
      NETWORK_WORK_MS,
    );
  }

  /** "משהו לא עובד": the child's last screen and place go into the log, which is saved. */
  function report() {
    void work(
      "write the report",
      async () => {
        new FieldLog(log).report();
        await saveAppLog();
        return { kind: "notice", text: t("reportDone"), next: PARENTS_HOME };
      },
      { kind: "notice", text: t("errorTryAgain"), next: PARENTS_HOME },
    );
  }

  /** "שליחת יומן" through Android's share sheet: no token, the parent picks where. */
  function shareLog() {
    void work(
      "share the log",
      async () => {
        await saveAppLog();
        const text = appLogText();
        if (!text.trim()) return { kind: "notice", text: t("logEmpty"), next: PARENTS_HOME };
        const outcome = await shareText(await fieldData.shareableLog(text), { title: "Nagmon log", fileName: "nagmon-log.txt" });
        log.info(`Log offered to the share sheet (${outcome})`);
        return null;
      },
      { kind: "notice", text: t("shareFailed"), next: PARENTS_HOME },
    );
  }

  return <ScreenTime key={shown.n}>{render(page)}</ScreenTime>;

  function render(p: ParentsPage) {
    const back = () => {
      const to = parentsBackStep(p);
      if (to) go(to);
      else onExit();
    };
    switch (p.kind) {
      case "home":
        return (
          <ParentsHome
            busy={busy}
            waiting={waiting}
            reviewWaiting={reviewWaiting}
            onSendReports={askReports}
            onChildren={() => go({ kind: "children" })}
            onPin={askCurrentPin}
            onGithub={() => go({ kind: "github" })}
            onShareLog={shareLog}
            onReport={report}
            onReview={() => go({ kind: "review" })}
            onBack={back}
          />
        );
      case "children":
        return <ChildrenList children={children} onPick={(id) => go({ kind: "child", id })} onBack={back} />;
      case "child": {
        const child = childOf(p.id);
        if (!child) return <main className="screen" data-screen="parents-child" aria-busy="true" />;
        return (
          <ChildPage
            child={child}
            message={p.message}
            busy={busy}
            onName={() => go({ kind: "child-name", id: child.id, initial: child.name })}
            onGrade={() => go({ kind: "child-grade", id: child.id })}
            onAvatar={() => go({ kind: "child-avatar", id: child.id })}
            effects={effectsFrom(child.settings)}
            onEffects={(patch) => saveChild(child.id, (c) => (c.settings = withEffects(c.settings, patch)), { kind: "notice", text: t("errorTryAgain"), next: { kind: "child", id: child.id } })}
            quickBuy={quickBuyAllowed(child.settings)}
            onQuickBuy={(on) => saveChild(child.id, (c) => (c.settings = withQuickBuy(c.settings, on)), { kind: "notice", text: t("errorTryAgain"), next: { kind: "child", id: child.id } })}
            onDelete={() => go({ kind: "child-delete", id: child.id, name: child.name })}
            onReport={() => openReport(child.id)}
            onLearning={() => openLearning(child.id)}
            onBack={back}
          />
        );
      }
      case "child-report": {
        const child = childOf(p.id);
        if (!child || childReport?.id !== p.id) return <main className="screen" data-screen="parents-report" aria-busy="true" />;
        return <ReportPage report={childReport.data} name={child.name} onBack={back} />;
      }
      case "learning":
      case "learning-subjects":
      case "learning-start":
      case "learning-coins": {
        const child = childOf(p.id);
        if (!child) return <main className="screen" data-screen="parents-learning" aria-busy="true" />;
        const common = { settings: learningFrom(child.settings, child.grade), grade: child.grade, subjects, busy, onPatch: (patch: LearningPatch) => saveLearning(p, patch), onBack: back };
        if (p.kind === "learning-subjects") return <SubjectsPage {...common} />;
        if (p.kind === "learning-start") return <StartGradePage {...common} />;
        if (p.kind === "learning-coins") return <CoinsPage {...common} />;
        return <LearningPage {...common} onSubjects={() => go({ kind: "learning-subjects", id: p.id })} onStart={() => go({ kind: "learning-start", id: p.id })} onCoins={() => go({ kind: "learning-coins", id: p.id })} />;
      }
      case "child-name":
        return (
          <LetterBoard
            key={`name-${p.attempt ?? 0}`}
            title={t("nameTitle")}
            initial={p.initial}
            message={p.message}
            onDone={(text) => gotName(p, text)}
            onCancel={back}
          />
        );
      case "child-grade":
        return (
          <Choices
            screen="parents-grade"
            title={t("gradeTitle")}
            busy={busy}
            choices={GRADE_NAMES_HE.map((label, i) => ({ id: String(i), label }))}
            onPick={(id) => saveChild(p.id, (c) => (c.grade = Number(id)), { kind: "child", id: p.id, message: t("errorTryAgain") })}
            onBack={back}
          />
        );
      case "child-avatar":
        return (
          <Choices
            screen="parents-avatar"
            title={t("avatarTitle")}
            busy={busy}
            choices={AVATARS.map((a) => ({ id: a.key, label: a.labelHe, image: avatarImage(a.key) }))}
            onPick={(key) => saveChild(p.id, (c) => (c.avatar = key), { kind: "child", id: p.id, message: t("errorTryAgain") })}
            onBack={back}
          />
        );
      case "child-delete":
        return (
          <Confirm screen="parents-delete" yes={t("childDeleteYes")} danger busy={busy} onYes={() => remove(p)} onNo={back}>
            <h1 className="notice">{t("childDeleteAsk", { name: p.name })}</h1>
          </Confirm>
        );
      case "pin-old":
        return (
          <PinPad
            key={`old-${p.attempt ?? 0}`}
            title={t("pinTitle")}
            hint={t("pinCurrentHint")}
            message={p.message}
            attempt={p.attempt}
            onDone={(pin) => checkCurrent(p, pin)}
            onCancel={back}
          />
        );
      case "pin-new":
        return (
          <PinPad
            key={`new-${p.attempt ?? 0}`}
            title={t("pinTitle")}
            hint={p.first === undefined ? t("pinNewHint") : t("pinAgainHint")}
            message={p.message}
            attempt={p.attempt}
            onDone={(pin) => setNew(p, pin)}
            onCancel={back}
          />
        );
      case "review":
        return (
          <Later over={false}>
            <Review.Screen store={services.review} deliver={() => fieldData.deliverReview()} names={() => profiles.allNames()} onBack={back} />
          </Later>
        );
      case "github": {
        const status =
          gh.activity === "checking"
            ? t("ghChecking")
            : gh.activity === "sending" || fieldData.sending
              ? t("ghSending")
              : gh.masked === null
                ? githubMessage("not_connected", fieldData.repo)
                : gh.check
                  ? githubMessage(gh.check.code, gh.check.repo)
                  : t("ghUnchecked");
        const good = gh.activity !== "idle" || gh.check === null || gh.check.code === "ok";
        return (
          <GitHubPage
            masked={gh.masked}
            status={gh.masked === undefined ? "" : status}
            good={good}
            busy={busy || gh.activity !== "idle" || fieldData.sending}
            reportsAuto={auto}
            onReportsAuto={toggleReportsAuto}
            onPaste={() => go({ kind: "token" })}
            onRemove={removeToken}
            onCheck={checkNow}
            onSendLog={() => ask("logs")}
            onSendProgress={() => ask("progress")}
            onSendCrash={() => ask("crashes")}
            onBack={back}
          />
        );
      }
      case "token":
        return <TokenPage repo={fieldData.repo} message={p.message} busy={busy} onSave={saveToken} onBack={back} />;
      case "confirm":
        return (
          <Confirm screen="parents-confirm" yes={t("ghSend")} busy={busy} onYes={() => send(p)} onNo={back}>
            <h1 className="notice" data-id="confirm_what">
              {p.what}
            </h1>
            <p className="hint">{t("ghConfirmWhere", { repo: p.prepared.repo })}</p>
            <p className="confirm-path" data-id="confirm_path">
              {/* a long path breaks after a slash, never inside a name */}
              {p.prepared.path.split("/").map((part, i, all) => (
                <span key={i}>
                  {part}
                  {i < all.length - 1 && (
                    <>
                      /<wbr />
                    </>
                  )}
                </span>
              ))}
            </p>
          </Confirm>
        );
      case "notice":
        return <Notice text={p.text} onNext={() => go(p.next)} />;
    }
  }
}
