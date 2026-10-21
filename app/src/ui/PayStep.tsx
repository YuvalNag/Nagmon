import { useEffect, useRef, useState } from "react";
import { countSteps, Payment, type PayPlan } from "../core/game/shop";
import { t } from "../i18n";
import { Tap } from "./Tap";
import { CoinArt, CoinIcon, StackArt } from "./WorldArt";

/** How long each coin is counted aloud, in ms. */
export const COUNT_MS = 420;

interface Props {
  plan: PayPlan;
  icon: string;
  name: string;
  /** Counting speed; 0 shows the count at once (calm motion, and the tests). */
  stepMs?: number;
  /** The pile is right (the payment tells whether it was a first try or the shopkeeper helped). */
  onPaid: (p: Payment) => void;
  onCancel: () => void;
}

type Say = "more" | "less" | "help" | "helped" | null;

function Token({ plan, value }: { plan: PayPlan; value: number }) {
  return plan.band === "A" ? <StackArt n={value} unit={plan.unit} /> : <CoinArt value={value} />;
}

const labelOf = (plan: PayPlan, v: number) => (plan.band === "A" ? t("payStack", { n: v, unit: plan.unit }) : v >= 20 ? t("payBill", { value: v }) : t("payCoin", { value: v }));

/**
 * The pay step (docs/app/FEATURES.md 4.3): the price, and coins to tap
 * until the pile makes it. A wrong amount is "a bit more" or "a bit
 * less" and the coins are counted aloud (one by one, with the running
 * number); after two wrong tries the shopkeeper counts with the child.
 * Nothing is taken for a wrong amount, and the way back is always open.
 */
export function PayStep({ plan, icon, name, stepMs = COUNT_MS, onPaid, onCancel }: Props) {
  const pay = useRef(new Payment(plan));
  const [, redraw] = useState(0);
  const [say, setSay] = useState<Say>(null);
  const [run, setRun] = useState<{ steps: number[]; at: number; then: () => void } | null>(null);
  const busy = run !== null;
  const p = pay.current;

  // the count: one more coin each beat, then one beat of calm and what comes after
  useEffect(() => {
    if (!run) return;
    const id = setTimeout(() => {
      if (run.at < run.steps.length) setRun({ ...run, at: run.at + 1 });
      else {
        setRun(null);
        run.then();
      }
    }, stepMs);
    return () => clearTimeout(id);
  }, [run, stepMs]);

  const count = (then: () => void) => {
    const steps = countSteps(p.pile);
    if (stepMs <= 0 || !steps.length) then();
    else setRun({ steps, at: 0, then });
  };

  const add = (v: number) => {
    if (busy) return;
    p.add(v);
    setSay(null);
    redraw((n) => n + 1);
  };
  const remove = (i: number) => {
    if (busy) return;
    p.removeAt(i);
    setSay(null);
    redraw((n) => n + 1);
  };
  const clear = () => {
    if (busy) return;
    p.clear();
    setSay(null);
    redraw((n) => n + 1);
  };

  const go = () => {
    if (busy || !p.pile.length) return;
    const v = p.check();
    count(() => {
      if (v.kind === "exact") {
        onPaid(p);
        return;
      }
      if (p.helpDue) {
        // the shopkeeper counts it with the child: the right pile appears, coin by coin
        setSay("help");
        p.help();
        redraw((n) => n + 1);
        count(() => setSay("helped"));
        return;
      }
      setSay(v.kind === "short" ? "more" : "less");
    });
  };

  const counted = run ? run.at : 0;
  const shown = run ? (run.steps[Math.max(0, run.at - 1)] ?? 0) : null;
  return (
    <div className="shop-pay" data-id="pay" data-band={plan.band} data-say={say ?? ""} data-counting={busy} data-wrong={p.wrong}>
      <div className="pay-info">
        <span className="pay-icon" aria-hidden="true">
          {icon}
        </span>
        <strong className="pay-name">{name}</strong>
        <span className="price-chip" data-id="pay_price" aria-label={t("payPrice", { price: plan.price })}>
          <CoinIcon />
          <span>{plan.price}</span>
        </span>
        {plan.tag && (
          <span className="pay-tag" data-id="pay_tag">
            <b>{t("payOff", { percent: plan.tag.percent })}</b>
            <span className="pay-unit">{t("payUnit", { price: plan.tag.was })}</span>
          </span>
        )}
        {plan.band === "A" && (
          <span className="pay-target" data-id="pay_target" role="img" aria-label={t("payMatch")}>
            {Array.from({ length: plan.target }, (_, i) => (
              <StackArt key={i} n={1} unit={plan.unit} />
            ))}
          </span>
        )}
        <p className="pay-say" data-id="pay_say" role="status">
          {say === "more" && t("payMore")}
          {say === "less" && t("payLess")}
          {say === "help" && t("payHelp")}
          {say === "helped" && t("payHelped")}
          {!say && !busy && t("payTap")}
          {busy && shown !== null && <b className="pay-count" data-id="pay_count">{shown}</b>}
        </p>
      </div>
      <div className="pay-work">
        <div className="pay-coins" role="group" aria-label={t("payChoose")}>
          {plan.denominations.map((v) => (
            <Tap key={v} id={`pay_coin_${v}`} className="pay-coin" disabled={busy} aria-label={labelOf(plan, v)} onTap={() => add(v)}>
              <Token plan={plan} value={v} />
            </Tap>
          ))}
        </div>
        <div className="pay-tray" data-id="pay_tray" aria-label={t("payTray")}>
          {p.pile.map((v, i) => (
            <Tap
              key={i}
              id={`pay_pile_${i}`}
              className="pay-token"
              data-counted={i < counted ? "yes" : "no"}
              data-current={run && i === counted - 1 ? "yes" : "no"}
              disabled={busy}
              aria-label={labelOf(plan, v)}
              onTap={() => remove(i)}
            >
              <Token plan={plan} value={v} />
            </Tap>
          ))}
          {!p.pile.length && <span className="pay-empty" aria-hidden="true" />}
        </div>
        <div className="pay-buttons">
          <Tap id="pay_go" className="primary" disabled={busy || !p.pile.length} onTap={go}>
            {t("payGo")}
          </Tap>
          <Tap id="pay_clear" disabled={busy || !p.pile.length} onTap={clear}>
            {t("payClear")}
          </Tap>
          <Tap id="pay_cancel" className="quiet" disabled={busy} onTap={onCancel}>
            {t("tripsBack")}
          </Tap>
        </div>
      </div>
    </div>
  );
}
