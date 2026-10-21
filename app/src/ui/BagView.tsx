import { useState } from "react";
import type { Play } from "../app/play";
import { needFor } from "../core/game/collection";
import { fainted as asleepFriends, useMedicine } from "../core/game/faint";
import { countOf, feed, giveStarterKit, type Item, itemsInTab } from "../core/game/items";
import { itemText, type TextKey, t } from "../i18n";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";

const TAB_TEXT: Record<string, TextKey> = { nets: "tabNets", snacks: "tabSnacks", tools: "tabTools" };
const TAB_ICON: Record<string, string> = { nets: "🥅", snacks: "🍓", tools: "🪶" };

export interface BagBattle {
  /** The wild creature is calm: a net can be thrown. */
  calm: boolean;
  /** Throw this net (the Bag closes). */
  onNet: (itemId: string) => void;
  /** Medicine for a sleeping friend of the team (the Bag closes); false when it could not be used. */
  onMedicine?: (itemId: string, creatureId: string) => boolean;
  /** The ids of the team in the battle: only they can be woken here. */
  team?: string[];
}

interface Props {
  play: Play;
  /** Set inside a battle: only a net works there. */
  battle?: BagBattle;
  onClose: () => void;
  /** Something was used (the creatures or the Bag changed and were saved). */
  onChanged?: () => void;
}

/**
 * The Bag (docs/app/FEATURES.md 4.2) for the 873x393 phone: three tabs
 * in a rail at the start edge, a grid of item cards with counts, and a
 * panel at the end with the selected item's picture, name, one line and
 * a big "use". Outside a battle a snack or a tonic goes to a friend;
 * in a battle a net is thrown at a calm creature, and everything else
 * says in one line where it is used. Nothing is lost by a wrong tap.
 */
export function BagView({ play, battle, onClose, onChanged }: Props) {
  const eco = play.economy;
  // the first nets arrive the first time the Bag opens
  useState(() => {
    if (play.world.creatures.length && giveStarterKit(play.world, eco)) void play.saveWorld();
  });
  const [tab, setTab] = useState(eco.tabs[0] ?? "nets");
  const [picked, setPicked] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [, redraw] = useState(0);

  const items = itemsInTab(play.world, eco, tab);
  // who is asleep and can be woken: in a battle, the team; outside, any friend
  const sleepers = asleepFriends(play.world).filter((c) => !battle?.team || battle.team.includes(c.id)).slice(0, 8);
  const item: Item | undefined = picked && countOf(play.world, picked) > 0 ? eco.items[picked] : items[0];

  const changed = () => {
    void play.saveWorld();
    onChanged?.();
    redraw((n) => n + 1);
  };

  /** Why the selected item cannot be used here, or null. */
  const why = (i: Item): string | null => {
    if (i.kind === "key") return t("bagKeyItem");
    if (i.kind === "helper") return t("bagInQuestion");
    if (i.kind === "medicine") return sleepers.length ? null : t("bagNoSleeper");
    if (battle) {
      if (i.kind === "net") return battle.calm ? null : t("bagNeedCalm");
      return t("bagNotInBattle");
    }
    if (i.kind === "net") return t("bagNeedCalm");
    return play.world.creatures.length ? null : t("bagNoFriend");
  };

  const use = (i: Item) => {
    if (why(i)) return;
    if (battle && i.kind === "net") {
      battle.onNet(i.id);
      return;
    }
    setAsking(true);
  };

  const give = (i: Item, creatureId: string) => {
    const c = play.world.creatures.find((x) => x.id === creatureId);
    if (!c) return;
    const name = c.name ?? play.text(c.species);
    if (i.kind === "medicine") {
      setAsking(false);
      if (battle?.onMedicine) {
        if (!battle.onMedicine(i.id, creatureId)) setSaid(t("bagNoSleeper"));
        return;
      }
      const ok = useMedicine(play.world, eco, creatureId, i.id);
      play.field.item({ item: i.id, where: "bag", ok });
      if (!ok) {
        setSaid(t("bagNoSleeper"));
        return;
      }
      setSaid(t("bagWokeUp", { name }));
      changed();
      return;
    }
    const r = feed(play.world, eco, play.monsters, creatureId, i.id);
    play.field.item({ item: i.id, where: "bag", ok: r.ok });
    setAsking(false);
    if (!r.ok) {
      setSaid(t("bagTonicBusy"));
      return;
    }
    setSaid(i.kind === "tonic" ? t("bagTonicOn") : r.growth?.leveled ? t("bagFedLevel", { name, level: r.growth.level }) : t("bagFed", { name }));
    changed();
  };

  const reason = item ? why(item) : null;
  return (
    <ScreenTime>
      <div className="sheet bag" role="dialog" aria-label={t("bagTitle")} data-screen="bag" data-tab={tab}>
        <div className="bag-rail" role="tablist" aria-label={t("bagTitle")}>
          {eco.tabs.map((id) => (
            <Tap key={id} id={`bag_tab_${id}`} className="bag-tab" role="tab" aria-selected={tab === id} aria-label={t(TAB_TEXT[id] ?? "bagTitle")} onTap={() => { setTab(id); setPicked(null); setAsking(false); setSaid(null); }}>
              <span aria-hidden="true">{TAB_ICON[id] ?? "🎒"}</span>
              <small>{t(TAB_TEXT[id] ?? "bagTitle")}</small>
            </Tap>
          ))}
          <Tap id="bag_close" className="bag-back" onTap={onClose}>
            {t("tripsBack")}
          </Tap>
        </div>
        <div className="bag-grid" data-id="bag_grid">
          {items.length === 0 && (
            <p className="bag-empty" data-id="bag_empty">
              <span aria-hidden="true">{TAB_ICON[tab] ?? "🎒"}</span>
              {t("bagEmpty")}
            </p>
          )}
          {items.map((i) => (
            <Tap key={i.id} id={`bag_item_${i.id}`} className="bag-card" aria-pressed={item?.id === i.id} aria-label={`${itemText(i.id, "name")} ${countOf(play.world, i.id)}`} onTap={() => { setPicked(i.id); setAsking(false); setSaid(null); }}>
              <span className="bag-icon" aria-hidden="true">{i.icon}</span>
              <span className="bag-count">x{countOf(play.world, i.id)}</span>
            </Tap>
          ))}
        </div>
        <div className="bag-detail" data-id="bag_detail">
          {item && !asking && (
            <>
              <span className="bag-big" aria-hidden="true">{item.icon}</span>
              <strong data-id="bag_name">{itemText(item.id, "name")}</strong>
              <span className="bag-desc">{itemText(item.id, "desc")}</span>
              {reason && <span className="bag-why" data-id="bag_why">{reason}</span>}
              <Tap id="bag_use" className="primary" disabled={reason !== null} onTap={() => use(item)}>
                {t("bagUse")}
              </Tap>
            </>
          )}
          {item && asking && (
            <>
              <strong>{t("bagWho")}</strong>
              <div className="bag-who">
                {(item.kind === "medicine" ? sleepers : play.world.creatures.slice(0, 4)).map((c) => (
                  <Tap key={c.id} id={`bag_who_${c.id}`} onTap={() => give(item, c.id)}>
                    {c.name ?? play.text(c.species)} {t("battleLevel", { level: c.level })} {item.kind === "medicine" ? "💤" : `${c.xp}/${needFor(c.level)}`}
                  </Tap>
                ))}
              </div>
            </>
          )}
          {said && (
            <span className="bag-said" data-id="bag_said" role="status">
              {said}
            </span>
          )}
        </div>
      </div>
    </ScreenTime>
  );
}
