import { useState } from "react";
import type { Play } from "../app/play";
import { needFor } from "../core/game/collection";
import { fainted as asleepFriends, wakeWith } from "../core/game/faint";
import { countOf, feed, giveStarterKit, type Item, itemsInTab } from "../core/game/items";
import { itemText, type TextKey, t } from "../i18n";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";
import { ItemIcon } from "./ItemIcon";
import { Journal, Later } from "./lazy";
import { jw } from "./journal/words";

const TAB_TEXT: Record<string, TextKey> = { nets: "tabNets", snacks: "tabSnacks", tools: "tabTools" };
const TAB_ICON: Record<string, string> = { nets: "🥅", snacks: "🍓", tools: "🪶" };

export interface BagBattle {
  /** Befriending is open (a wild creature): a net, a card or a treat goes to the Befriend tray. */
  canBefriend: boolean;
  /** Pick this net, card or treat in the tray (the Bag closes and the tray opens). */
  onTool: (itemId: string) => void;
  /** Medicine for a sleeping friend of the team (the Bag closes); false when it could not be used. */
  onMedicine?: (itemId: string, creatureId: string) => boolean;
  /** The friends of the team a medicine can be used on now (ids): decided by the battle. */
  targets?: (itemId: string) => string[];
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
  // the quest journal opens from here (a screen of its own, fetched when first opened)
  const [journal, setJournal] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [, redraw] = useState(0);

  const items = itemsInTab(play.world, eco, tab);
  // who the picked medicine can be used on: in a battle the battle says; outside one only a wake works, on any sleeping friend
  const targetsOf = (i: Item) => (battle?.targets ? battle.targets(i.id).flatMap((id) => play.world.creatures.filter((c) => c.id === id)) : i.healsDozing ? asleepFriends(play.world) : []).slice(0, 8);
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
    if (i.kind === "medicine") return targetsOf(i).length ? null : battle ? t("bagNoSleeper") : i.healsDozing ? t("bagNoSleeper") : t("bagOnlyInBattle");
    if (battle) {
      if (i.kind === "net" || i.kind === "befriend_tool" || (i.kind === "snack" && i.treatMult > 1)) return battle.canBefriend ? null : t("bagNotInBattle");
      return t("bagNotInBattle");
    }
    if (i.kind === "net" || i.kind === "befriend_tool") return t("bagNeedCalm");
    return play.world.creatures.length ? null : t("bagNoFriend");
  };

  const use = (i: Item) => {
    if (why(i)) return;
    if (battle && (i.kind === "net" || i.kind === "befriend_tool" || (i.kind === "snack" && i.treatMult > 1))) {
      battle.onTool(i.id);
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
      const ok = wakeWith(play.world, eco, creatureId, i.id) > 0;
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
  if (journal) return <Later><Journal.Screen play={play} onClose={() => setJournal(false)} /></Later>;
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
          {!battle && (
            <Tap id="bag_journal" className="bag-journal" aria-label={jw("title")} onTap={() => setJournal(true)}>
              <span aria-hidden="true">📜</span>
              <small>{jw("tab")}</small>
            </Tap>
          )}
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
              <span className="bag-icon" aria-hidden="true"><ItemIcon id={i.id} emoji={i.icon} /></span>
              <span className="bag-count">x{countOf(play.world, i.id)}</span>
            </Tap>
          ))}
        </div>
        <div className="bag-detail" data-id="bag_detail">
          {item && !asking && (
            <>
              <span className="bag-big" aria-hidden="true"><ItemIcon id={item.id} emoji={item.icon} /></span>
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
                {(item.kind === "medicine" ? targetsOf(item) : play.world.creatures.slice(0, 4)).map((c) => (
                  <Tap key={c.id} id={`bag_who_${c.id}`} onTap={() => give(item, c.id)}>
                    {c.name ?? play.text(c.species)} {t("battleLevel", { level: c.level })} {item.kind === "medicine" ? (c.fainted ? "💤" : "") : `${c.xp}/${needFor(c.level)}`}
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
