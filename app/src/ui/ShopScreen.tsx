import { type MutableRefObject, useEffect, useState } from "react";
import type { Play } from "../app/play";
import { quickBuyAllowed } from "../core/family/shopSettings";
import { countOf, type Item } from "../core/game/items";
import { affordable, bandOf, buy, type Bought, chargeFor, moneyMastered, type Payment, payPlan, recordPay, type Shelf, SHELVES, shelfItems, startPrice } from "../core/game/shop";
import { itemText, type TextKey, t } from "../i18n";
import { useCalm } from "./battle/useCalm";
import { COUNT_MS, PayStep } from "./PayStep";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";
import { CoinIcon, ShelfArt } from "./WorldArt";

const SHELF_TEXT: Record<Shelf, TextKey> = { nets: "tabNets", snacks: "shelfSnacks", helpers: "shelfHelpers", medicine: "shelfMedicine" };
const SHELF_ICON: Record<Shelf, string> = { nets: "🥅", snacks: "🍓", helpers: "🪶", medicine: "💊" };

interface Props {
  play: Play;
  onClose: () => void;
  /** Coins or the Bag changed (saved already). */
  onChanged?: () => void;
  /** Android's back: from the pay step to the shelves, from the shelves out. */
  backRef?: MutableRefObject<(() => void) | null>;
  /** Counting speed in the pay step; 0 for no animation. */
  stepMs?: number;
}

type Mode = { k: "browse" } | { k: "pay"; item: Item } | { k: "bought"; item: Item; got: Bought };

/**
 * The shop (docs/app/FEATURES.md 4.3) for the 873x393 phone: three
 * shelves in a rail at the start edge (nets, snacks and tonics,
 * helpers), up to six item cards on boards, and at the end the chosen
 * item with its price and "buy". The purchase is the lesson: "buy" opens
 * the pay step (ui/PayStep.tsx). Nothing is taken for a wrong amount;
 * a child who has mastered money may buy at once (a parents' switch
 * turns that off). Prices are the economy table's.
 */
export function ShopScreen({ play, onClose, onChanged, backRef, stepMs }: Props) {
  const eco = play.economy;
  const world = play.world;
  const band = bandOf(play.profile.grade);
  const [shelf, setShelf] = useState<Shelf>("nets");
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ k: "browse" });
  const [said, setSaid] = useState<string | null>(null);
  const [, redraw] = useState(0);
  // calm effects (the parents' switch, or the system's): the count shows at once
  const calm = useCalm(play.profile.settings);

  const items = shelfItems(eco, shelf, world);
  const item = items.find((i) => i.id === picked) ?? items[0];
  const quick = quickBuyAllowed(play.profile.settings) && moneyMastered(play.engine.learner.mastered, band, world.variables);

  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => (mode.k === "browse" ? onClose() : setMode({ k: "browse" }));
    return () => {
      backRef.current = null;
    };
  }, [backRef, mode, onClose]);

  const finish = (i: Item, way: { exact: boolean; helped: boolean; quick: boolean }, tries: number) => {
    const got = buy(world, eco, i.id, { band, ...way });
    if (!got.ok) {
      setSaid(got.reason === "full" ? t("shopFull") : t("shopNeedCoins", { missing: Math.max(0, startPrice(i, band) - world.money) }));
      setMode({ k: "browse" });
      return;
    }
    if (!way.quick) recordPay(world.variables, tries === 0 && !way.helped);
    play.field.purchase({ what: i.id, price: got.charged, coins: world.money });
    play.field.note("pay", { item: i.id, band, tries, helped: way.helped ? 1 : 0, quick: way.quick ? 1 : 0, back: got.back });
    void play.saveWorld();
    onChanged?.();
    setSaid(null);
    setMode({ k: "bought", item: i, got });
    redraw((n) => n + 1);
  };

  const owned = (i: Item) => countOf(world, i.id);
  const can = item ? affordable(world, item, band) : false;
  const full = item ? owned(item) >= eco.stack : false;

  if (mode.k === "pay") {
    const i = mode.item;
    return (
      <ScreenTime key="pay">
        <div className="sheet shop" role="dialog" aria-label={t("shopTitle")} data-screen="shop" data-mode="pay" data-band={band}>
          <PayStep plan={payPlan(i.price, band)} icon={i.icon} name={itemText(i.id, "name")} stepMs={stepMs ?? (calm ? 0 : COUNT_MS)} onPaid={(p: Payment) => finish(i, { exact: true, helped: p.helped, quick: false }, p.wrong)} onCancel={() => setMode({ k: "browse" })} />
        </div>
      </ScreenTime>
    );
  }

  if (mode.k === "bought") {
    const i = mode.item;
    return (
      <ScreenTime key="bought">
        <div className="sheet shop" role="dialog" aria-label={t("shopTitle")} data-screen="shop" data-mode="bought">
          <div className="shop-bought" data-id="shop_bought">
            <span className="bought-icon" aria-hidden="true">
              {i.icon}
            </span>
            <strong role="status">{t("payBought", { name: itemText(i.id, "name") })}</strong>
            {mode.got.back > 0 && (
              <span className="bought-back" data-id="shop_back" data-back={mode.got.back}>
                {t("payBack", { n: mode.got.back })}
              </span>
            )}
            <span className="bought-owned">{t("shopOwned", { n: owned(i) })}</span>
            <Tap id="shop_more" className="primary" onTap={() => setMode({ k: "browse" })}>
              {t("shopMore")}
            </Tap>
          </div>
        </div>
      </ScreenTime>
    );
  }

  return (
    <ScreenTime key="shop">
      <div className="sheet shop" role="dialog" aria-label={t("shopTitle")} data-screen="shop" data-mode="browse" data-shelf={shelf} data-band={band}>
        <div className="bag-rail" role="tablist" aria-label={t("shopTitle")}>
          {SHELVES.map((s) => (
            <Tap
              key={s}
              id={`shop_shelf_${s}`}
              className="bag-tab"
              role="tab"
              aria-selected={shelf === s}
              aria-label={t(SHELF_TEXT[s])}
              onTap={() => {
                setShelf(s);
                setPicked(null);
                setSaid(null);
              }}
            >
              <span aria-hidden="true">{SHELF_ICON[s]}</span>
              <small>{t(SHELF_TEXT[s])}</small>
            </Tap>
          ))}
          <Tap id="shop_close" className="bag-back" onTap={onClose}>
            {t("tripsBack")}
          </Tap>
        </div>
        <ShelfArt>
          <div className="shop-grid" data-id="shop_grid">
            {items.map((i) => (
              <Tap
                key={i.id}
                id={`shop_item_${i.id}`}
                className="shop-card"
                aria-pressed={item?.id === i.id}
                aria-label={`${itemText(i.id, "name")} ${i.price}`}
                onTap={() => {
                  setPicked(i.id);
                  setSaid(null);
                }}
              >
                <span className="bag-icon" aria-hidden="true">
                  {i.icon}
                </span>
                <span className="shop-name">{itemText(i.id, "name")}</span>
                <span className="price-chip" data-price={i.price}>
                  <CoinIcon />
                  <span>{i.price}</span>
                </span>
                {owned(i) > 0 && <span className="bag-count">x{owned(i)}</span>}
              </Tap>
            ))}
          </div>
        </ShelfArt>
        <div className="bag-detail shop-detail" data-id="shop_detail">
          <span className="shop-wallet" data-id="shop_wallet" data-coins={world.money} aria-label={t("tripsCoins", { coins: world.money })}>
            <CoinIcon />
            <span>{world.money}</span>
          </span>
          {item && (
            <>
              <span className="bag-big" aria-hidden="true">
                {item.icon}
              </span>
              <strong data-id="shop_name">{itemText(item.id, "name")}</strong>
              <span className="bag-desc">{itemText(item.id, "desc")}</span>
              <span className="price-chip big" data-id="shop_price" data-price={item.price}>
                <CoinIcon />
                <span>{item.price}</span>
              </span>
              {owned(item) > 0 && <span className="bag-desc">{t("shopOwned", { n: owned(item) })}</span>}
              {!can && !full && (
                <span className="bag-why" data-id="shop_why">
                  {t("shopNeedCoins", { missing: Math.max(0, startPrice(item, band) - world.money) })}
                </span>
              )}
              {full && (
                <span className="bag-why" data-id="shop_why">
                  {t("shopFull")}
                </span>
              )}
              <Tap id="shop_buy" className="primary" disabled={!can || full} onTap={() => setMode({ k: "pay", item })}>
                {t("shopBuy")}
              </Tap>
              {quick && can && !full && (
                <Tap id="shop_quick" onTap={() => finish(item, { exact: false, helped: false, quick: true }, 0)} aria-label={t("shopQuickFor", { price: chargeFor(item, { band, exact: false, helped: false, quick: true }).charged })}>
                  {t("shopQuick")}
                </Tap>
              )}
            </>
          )}
          {said && (
            <span className="bag-said" data-id="shop_said" role="status">
              {said}
            </span>
          )}
        </div>
      </div>
    </ScreenTime>
  );
}
