import { type MutableRefObject, useEffect, useState } from "react";
import type { Play } from "../app/play";
import { fainted, nurseHeals } from "../core/game/faint";
import { claimDailyGift, giftTaken, type Prize } from "../core/game/loot";
import { partyOf, setPartner } from "../core/game/party";
import { meadow, swapWithMeadow } from "../core/game/rest";
import type { Creature } from "../core/world/worldState";
import { t } from "../i18n";
import { MonsterPic } from "./MonsterPic";
import { prizeLook } from "./prizeLook";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";
import { DeskArt, GiftArt, MatArt } from "./WorldArt";

interface Props {
  play: Play;
  onClose: () => void;
  /** The party or the wallet changed (saved already). */
  onChanged?: () => void;
  /** Android's back: closes the gift card first, then the screen. */
  backRef?: MutableRefObject<(() => void) | null>;
}

const hearts = (n: number) => "❤️".repeat(n) + "🤍".repeat(5 - n);

/**
 * The Rest Center (docs/app/FEATURES.md 4.4): the nurse's desk. The
 * child's friends rest on mats, cheerful, with their hearts; there is
 * no sickness here and nothing to cure. At the desk the child swaps a
 * friend of the party with one from the Meadow (or makes a friend the
 * partner), and takes the daily gift: one a day for each child, by the
 * phone's local date. Tapping a friend only makes a heart pop.
 */
export function RestScreen({ play, onClose, onChanged, backRef }: Props) {
  const world = play.world;
  const [sel, setSel] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [pop, setPop] = useState<{ id: string; n: number } | null>(null);
  const [gift, setGift] = useState<Prize | null>(null);
  const [, redraw] = useState(0);

  const party = partyOf(world);
  const wait = meadow(world);
  const taken = giftTaken(world, play.today());
  const nameOf = (c: Creature) => c.name ?? play.text(c.species);
  const byId = (id: string | null) => world.creatures.find((c) => c.id === id);
  const inParty = (id: string) => party.some((c) => c.id === id);
  const first = party[0];

  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => (gift ? setGift(null) : onClose());
    return () => {
      backRef.current = null;
    };
  }, [backRef, gift, onClose]);

  const changed = () => {
    void play.saveWorld();
    onChanged?.();
    redraw((n) => n + 1);
  };

  /** A friend tapped (party or Meadow): it cheers, and picks or swaps. */
  const tap = (c: Creature) => {
    setPop((p) => ({ id: c.id, n: (p?.n ?? 0) + 1 }));
    if (!sel || sel === c.id) {
      setSel(sel === c.id ? null : c.id);
      setSaid(sel === c.id ? null : t("restPicked", { name: nameOf(c) }));
      return;
    }
    const other = byId(sel);
    if (other && inParty(other.id) !== inParty(c.id) && swapWithMeadow(world, other.id, c.id)) {
      play.field.note("rest", { swap: 1 });
      setSaid(t("restSwapped", { a: nameOf(other), b: nameOf(c) }));
      setSel(null);
      changed();
      return;
    }
    // the same side: only the choice changes
    setSel(c.id);
    setSaid(t("restPicked", { name: nameOf(c) }));
  };

  const makePartner = () => {
    const c = byId(sel);
    if (!c || !setPartner(world, c.id)) return;
    play.field.note("partner", { species: c.species });
    setSaid(t("friendsSwapped", { name: nameOf(c) }));
    setSel(null);
    changed();
  };

  /** The nurse wakes every friend that fell asleep in a battle, free (the only other way is medicine from the shop). */
  const nurse = () => {
    const n = nurseHeals(world);
    play.field.note("nurse", { woke: n });
    setSaid(n > 0 ? t("restNurseDone", { n }) : t("restNurseNone"));
    if (n > 0) changed();
  };

  const takeGift = () => {
    const r = claimDailyGift(world, play.economy, play.loot, play.today());
    if (!r.claimed || !r.prize) return;
    play.field.note("gift", { where: "rest", ...(r.prize.item ? { item: r.prize.item, n: r.prize.n } : { coins: r.prize.coins }) });
    setGift(r.prize);
    changed();
  };

  const heart = (c: Creature) => (pop?.id === c.id ? <span key={pop.n} className="heart-pop" aria-hidden="true">❤️</span> : null);
  const selected = byId(sel);
  const sleepers = fainted(world).length;

  if (gift) {
    const look = prizeLook(play.economy, gift);
    return (
      <ScreenTime key="gift">
        <div className="sheet rest" role="dialog" aria-label={t("restTitle")} data-screen="rest" data-mode="gift">
          <div className="rest-gift-card" data-id="rest_gift_card">
            <GiftArt open />
            <span className="gift-prize" aria-hidden="true">
              {look.icon}
            </span>
            <strong role="status">{t("restGiftGot", { what: look.words })}</strong>
            <Tap id="rest_gift_ok" className="primary" onTap={() => setGift(null)}>
              {t("restGiftOk")}
            </Tap>
          </div>
        </div>
      </ScreenTime>
    );
  }

  return (
    <ScreenTime key="rest">
      <div className="sheet rest" role="dialog" aria-label={t("restTitle")} data-screen="rest" data-mode="main">
        <header className="sheet-top">
          <h2 className="sheet-title">{t("restTitle")}</h2>
          <Tap id="rest_close" onTap={onClose}>
            {t("tripsBack")}
          </Tap>
        </header>
        <div className="rest-body">
          <div className="rest-main">
            {party.length === 0 ? (
              <p className="rest-none" data-id="rest_none">
                {t("restNone")}
              </p>
            ) : (
              <ul className="rest-party" aria-label={t("restHello")}>
                {party.map((c) => (
                  <li key={c.id}>
                    <Tap id={`rest_friend_${c.id}`} className="rest-card" data-mood={c.fainted ? "asleep" : "cheerful"} data-asleep={c.fainted === true} aria-pressed={sel === c.id} aria-label={`${nameOf(c)} ${t("battleLevel", { level: c.level })}`} onTap={() => tap(c)}>
                      <span className="rest-pic">
                        <MonsterPic monsters={play.monsters} species={c.species} height={0.15} />
                        <span className="zzz" aria-hidden="true">
                          💤
                        </span>
                        {heart(c)}
                      </span>
                      <MatArt />
                      <span className="friend-name">{nameOf(c)}</span>
                      <span className="friend-sub">
                        {t("battleLevel", { level: c.level })}
                        {c.id === first?.id ? ` · ${t("friendsIsPartner")}` : ""}
                        {c.fainted ? ` · ${t("restAsleep")}` : ""}
                      </span>
                      <span className="rest-hearts" role="img" aria-label={t("restHearts", { n: c.hearts ?? 0 })}>
                        {hearts(c.hearts ?? 0)}
                      </span>
                    </Tap>
                  </li>
                ))}
              </ul>
            )}
            {party.length > 0 && (
              <div className="rest-meadow" data-id="rest_meadow">
                <strong className="rest-meadow-title">{t("restMeadow")}</strong>
                {wait.length === 0 && <span className="friend-sub">{t("restMeadowEmpty")}</span>}
                <ul className="rest-meadow-list">
                  {wait.map((c) => (
                    <li key={c.id}>
                      <Tap id={`rest_meadow_${c.id}`} className="rest-small" data-mood="cheerful" aria-pressed={sel === c.id} aria-label={`${nameOf(c)} ${t("battleLevel", { level: c.level })}`} onTap={() => tap(c)}>
                        <MonsterPic monsters={play.monsters} species={c.species} height={0.085} />
                        {heart(c)}
                        <span className="friend-sub">{t("battleLevel", { level: c.level })}</span>
                      </Tap>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <aside className="rest-desk" data-id="rest_desk">
            <DeskArt />
            <Tap id="rest_gift" className={taken ? "" : "primary"} disabled={taken} onTap={takeGift}>
              <GiftArt />
              <span>{taken ? t("restGift") : t("restGiftOpen")}</span>
            </Tap>
            {taken && (
              <span className="friend-sub" data-id="rest_gift_done">
                {t("restGiftDone")}
              </span>
            )}
            <Tap id="rest_nurse" className={sleepers > 0 ? "primary" : ""} data-asleep={sleepers} onTap={nurse}>
              {t("restNurseHeal")}
            </Tap>
            <Tap id="rest_partner" disabled={!selected || !inParty(selected.id) || selected.id === first?.id || selected.fainted === true} onTap={makePartner}>
              {t("friendsMakePartner")}
            </Tap>
            <span className="rest-said" data-id="rest_said" role="status">
              {said ?? (party.length ? t("restHint") : "")}
            </span>
          </aside>
        </div>
      </div>
    </ScreenTime>
  );
}
