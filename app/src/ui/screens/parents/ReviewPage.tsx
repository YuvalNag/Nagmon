import { useCallback, useEffect, useRef, useState } from "react";
import { hideNames } from "../../../core/crashReport";
import type { ReportDelivery } from "../../../core/fieldData/uploads";
import {
  decisionFor,
  loadReviewItems,
  placeholderProblem,
  progress,
  queue,
  REVIEW_TYPES,
  type ReviewItem,
  type ReviewStore,
  type ReviewType,
  type StoredDecision,
} from "../../../core/review/review";
import { t, type TextKey } from "../../../i18n";
import { Tap } from "../../Tap";

const FILTER_TEXT: Record<ReviewType | "all", TextKey> = {
  all: "reviewFilterAll",
  quest: "reviewFilterQuest",
  npc: "reviewFilterNpc",
  mail: "reviewFilterMail",
  fact: "reviewFilterFact",
  ui: "reviewFilterUi",
};

interface Props {
  store: ReviewStore;
  /** Sends what waits (FieldData.deliverReview); never rejects. */
  deliver: () => Promise<ReportDelivery>;
  /** Every child's name: a correction with one in it is not kept. */
  names?: () => Promise<Iterable<string>>;
  /** The lines to check (game/review.json by default). */
  loadItems?: () => Promise<ReviewItem[]>;
  onBack: () => void;
}

/**
 * "בדיקת ניסוח" (docs/app/TEXT_REVIEW.md): one line of the game at a time,
 * with who says it, and three big buttons. The decisions are kept on the
 * phone and go to the data repo by themselves when the parents allow it.
 * The buttons sit below the line, outside what scrolls, so they never leave the screen.
 */
export function ReviewPage({ store, deliver, names, loadItems = () => loadReviewItems(), onBack }: Props) {
  const [items, setItems] = useState<ReviewItem[] | "failed" | null>(null);
  const [decisions, setDecisions] = useState<Record<string, StoredDecision>>({});
  const [filter, setFilter] = useState<ReviewType | "all">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [waiting, setWaiting] = useState(0);
  const [state, setState] = useState<ReportDelivery | null>(null);
  const busy = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadItems(), store.all()]).then(
      ([list, all]) => {
        if (!alive) return;
        setItems(list);
        setDecisions(all);
      },
      () => alive && setItems("failed"),
    );
    store.waiting().then((n) => alive && setWaiting(n), () => undefined);
    return () => {
      alive = false;
    };
    // loadItems is the caller's, read once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const list = Array.isArray(items) ? items : [];
  const todo = queue(list, decisions, filter);
  const item: ReviewItem | undefined = todo[0];
  const seen = progress(list, decisions, filter);
  const skipped = list.filter((i) => decisionFor(i, decisions)?.action === "skip").length;

  const send = useCallback(async () => {
    const result = await deliver();
    setState(result);
    setWaiting(await store.waiting());
  }, [deliver, store]);

  async function decide(action: "approve" | "edit" | "skip", newText?: string) {
    if (!item || busy.current) return;
    busy.current = true;
    try {
      await store.decide({ id: item.id, action, ...(newText !== undefined ? { newText } : {}), baseHash: item.hash });
      setDecisions(await store.all());
      setWaiting(await store.waiting());
      setEditing(null);
      setMessage("");
    } finally {
      busy.current = false;
    }
    void send();
  }

  async function save(text: string) {
    if (!item) return;
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return setMessage(t("reviewEmptyText"));
    if (clean === item.he) return decide("approve");
    const holes = placeholderProblem(item.he, clean);
    if (holes !== null) return setMessage(t("reviewNeedHoles", { holes: holes || "" }));
    const all = [...((await names?.()) ?? [])];
    if (hideNames(clean, all) !== clean && hideNames(item.he, all) === item.he) return setMessage(t("reviewNoNames"));
    return decide("edit", clean);
  }

  function startEdit() {
    if (!item) return;
    setMessage("");
    setEditing(item.id);
    // the keyboard (about half of the landscape phone) opens: the field comes into view
    setTimeout(() => {
      field.current?.focus();
      field.current?.scrollIntoView?.({ block: "center" });
    }, 50);
  }

  const status =
    state === "off" && waiting > 0
      ? t("reviewOff")
      : waiting > 0
        ? t("reviewQueued", { count: waiting })
        : Object.keys(decisions).length > 0
          ? t("reviewSentAll")
          : "";
  const types = REVIEW_TYPES.filter((ty) => list.some((i) => i.type === ty));
  const editingNow = editing !== null && item?.id === editing;

  return (
    <main className="screen parents-page review-page" data-screen="parents-review" data-editing={editingNow}>
      <header className="bar">
        <Tap id="back" className="quiet" onTap={onBack}>
          {t("back")}
        </Tap>
        <h1 className="title">{t("parentsReview")}</h1>
        <div className="review-side">
          <span className="review-progress" data-id="review_progress" role="status">
            {Array.isArray(items) && t("reviewProgress", { done: seen.done, total: seen.total })}
          </span>
          <span className="review-status" data-id="review_status" role="status">
            {status}
          </span>
        </div>
      </header>
      {Array.isArray(items) && items.length > 0 && !editingNow && (
        <div className="review-filters" role="group" aria-label={t("reviewFilterLabel")}>
          {(["all", ...types] as const).map((ty) => (
            <Tap key={ty} id={`review_filter_${ty}`} className="review-chip" aria-pressed={filter === ty} onTap={() => setFilter(ty)}>
              {t(FILTER_TEXT[ty])}
            </Tap>
          ))}
        </div>
      )}
      <div className="review-body">
        {items === null && <p className="hint" role="status">{t("reviewLoading")}</p>}
        {items === "failed" && <p className="message" role="alert">{t("reviewLoadFailed")}</p>}
        {Array.isArray(items) && items.length === 0 && <p className="hint">{t("reviewEmpty")}</p>}
        {Array.isArray(items) && items.length > 0 && !item && (
          <div className="review-done">
            <p className="notice" data-id="review_done">{t("reviewAllDone")}</p>
            {skipped > 0 && (
              <Tap
                id="review_skipped_back"
                onTap={() => {
                  void store.clearSkipped().then(async () => setDecisions(await store.all()));
                }}
              >
                {t("reviewSkippedBack", { count: skipped })}
              </Tap>
            )}
          </div>
        )}
        {item && !editingNow && (
          <article className="review-card" data-id="review_card" data-line={item.id}>
            <p className="review-ctx" data-id="review_ctx">{item.ctx}</p>
            <p className="review-line" data-id="review_line" lang="he" dir="rtl">{item.he}</p>
            {item.en && (
              <p className="review-en" data-id="review_en" lang="en" dir="ltr" aria-label={t("reviewEnglish")}>
                {item.en}
              </p>
            )}
          </article>
        )}
        {item && editingNow && (
          <div className="review-edit">
            <p className="review-ctx">{item.ctx}</p>
            <div className="review-edit-row">
              <textarea
                ref={field}
                className="review-field"
                data-id="review_field"
                aria-label={t("reviewEditLabel")}
                lang="he"
                dir="rtl"
                rows={3}
                defaultValue={item.he}
                autoCapitalize="none"
                autoComplete="off"
                enterKeyHint="done"
                onFocus={(e) => e.currentTarget.scrollIntoView?.({ block: "center" })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void save(e.currentTarget.value);
                  }
                }}
              />
              <div className="review-edit-buttons">
                <Tap id="review_save" className="primary" onTap={() => void save(field.current?.value ?? "")}>
                  {t("reviewSave")}
                </Tap>
                <Tap id="review_cancel" onTap={() => (setEditing(null), setMessage(""))}>
                  {t("reviewCancel")}
                </Tap>
              </div>
            </div>
            <p className="message" role="alert" data-id="review_message">{message}</p>
          </div>
        )}
      </div>
      {item && !editingNow && (
        <div className="review-actions">
          <Tap id="review_approve" className="primary" onTap={() => void decide("approve")}>
            {t("reviewApprove")}
          </Tap>
          <Tap id="review_edit" onTap={startEdit}>
            {t("reviewEdit")}
          </Tap>
          <Tap id="review_skip" className="quiet review-skip" onTap={() => void decide("skip")}>
            {t("reviewSkip")}
          </Tap>
        </div>
      )}
    </main>
  );
}
