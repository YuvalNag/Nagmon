import type { ChanceWord, Tool, Treat } from "../../core/game/befriend";
import { itemText, t, type TextKey } from "../../i18n";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";

export const WORD_TEXT: Record<ChanceWord, TextKey> = { low: "chanceLow", fair: "chanceFair", good: "chanceGood", great: "chanceGreat" };

export interface TrayProps {
  tools: Tool[];
  treats: Treat[];
  /** The chosen tool and treat (item ids). */
  tool: string | null;
  treat: string | null;
  /** The chance word of the choice now (it changes live as the tiles change). */
  word: ChanceWord;
  /** Mercy: this try cannot fail (shown as Great). */
  mercy: boolean;
  /** The Gift question: null not asked, true right, false missed. */
  gift: boolean | null;
  /** A Gift question can be asked (it is shown only while it is open). */
  canGift: boolean;
  /** The child has befriended this kind: the liked treat shows a heart. */
  likedKnown: boolean;
  /** Changes with each opening, so a finger that lifts as the tray appears presses nothing. */
  turn: number;
  /** Item ids, or null for none (the treat) . */
  onTool: (id: string | null) => void;
  onTreat: (id: string | null) => void;
  onGift: () => void;
  onAuto: () => void;
  onThrow: () => void;
  onClose: () => void;
}

/** "Friendship Card, Math" reads long in a tile: the tile shows "Card, Math". */
export function shortName(name: string): string {
  return name.replace("כרטיס ידידות", "כרטיס").trim();
}

/** The next id in a list after `cur`, going round (null is a place in the list when `withNone`). */
export function cycle(ids: readonly string[], cur: string | null, withNone: boolean): string | null {
  const all: (string | null)[] = withNone ? [null, ...ids] : [...ids];
  if (all.length === 0) return null;
  const i = all.indexOf(cur);
  return all[(i + 1) % all.length] ?? null;
}

/**
 * The Befriend tray (docs/app/BATTLE_V3.md 8.3): the tool, the treat and the Gift question as tiles, the chance as
 * a word (never a number), and one big Throw. A tap on a tile goes to the next thing the child owns. The tray opens
 * on the last choice (or Auto), so the common case is Befriend, Throw.
 */
export function BefriendTray(p: TrayProps) {
  const tool = p.tools.find((x) => x.item.id === p.tool);
  const treat = p.treats.find((x) => x.item.id === p.treat);
  const word = t(WORD_TEXT[p.word]);
  const auto = p.tools.length > 0;
  return (
    <ScreenTime key={`tray-${p.turn}`}>
      <div className="befriend-tray" role="group" aria-label={t("befriendTray")} data-id="befriend_tray" data-word={p.word} data-mercy={p.mercy}>
        <Tap
          id="befriend_tool"
          className="tray-tile"
          aria-label={tool ? `${t("befriendTool")}: ${itemText(tool.item.id, "name")} x${tool.count}${tool.applies ? "" : `, ${t("befriendNotForThis")}`}` : `${t("befriendTool")}: ${t("befriendNoTool")}`}
          data-empty={!tool}
          data-off={!!tool && !tool.applies}
          disabled={p.tools.length === 0}
          onTap={() => p.onTool(cycle(p.tools.map((x) => x.item.id), p.tool, false))}
        >
          <span className="tile-icon" aria-hidden="true">
            {tool ? tool.item.icon : "·"}
            {tool && <span className="tile-count">x{tool.count}</span>}
          </span>
          <span className="tile-name">{tool ? shortName(itemText(tool.item.id, "name")) : t("befriendNoTool")}</span>
        </Tap>
        <Tap
          id="befriend_treat"
          className="tray-tile"
          aria-label={treat ? `${t("befriendTreat")}: ${itemText(treat.item.id, "name")} x${treat.count}${treat.liked && p.likedKnown ? `, ${t("befriendLiked")}` : ""}` : `${t("befriendTreat")}: ${t("befriendNoTreat")}`}
          data-empty={!treat}
          disabled={p.treats.length === 0}
          onTap={() => p.onTreat(cycle(p.treats.map((x) => x.item.id), p.treat, true))}
        >
          <span className="tile-icon" aria-hidden="true">
            {treat ? treat.item.icon : "·"}
            {treat && <span className="tile-count">x{treat.count}</span>}
            {treat?.liked && p.likedKnown && <span className="tile-heart">♥</span>}
          </span>
          <span className="tile-name">{treat ? itemText(treat.item.id, "name") : t("befriendNoTreat")}</span>
        </Tap>
        <Tap
          id="befriend_gift"
          className="tray-tile gift"
          aria-label={`${t("befriendGift")}${p.gift === true ? `, ${t("befriendGiftRight")}` : ""}`}
          data-state={p.gift === null ? "open" : p.gift ? "right" : "missed"}
          disabled={!p.canGift || p.gift !== null}
          onTap={p.onGift}
        >
          <span className="tile-icon" aria-hidden="true">
            {p.gift === true ? "✨" : p.gift === false ? "·" : "🎵"}
          </span>
          <span className="tile-name">{p.gift === true ? t("befriendGiftRight") : p.gift === false ? t("befriendGiftMissed") : t("befriendGiftAsk")}</span>
        </Tap>
        <div className="tray-chance" role="status" aria-live="polite" data-id="befriend_chance" data-word={p.word}>
          <small>{t("befriendChance")}</small>
          <strong>{word}</strong>
        </div>
        <div className="tray-go">
          <Tap id="befriend_throw" className="primary" disabled={!tool} onTap={p.onThrow}>
            <span aria-hidden="true">{tool?.net === false ? "🃏" : "🥅"}</span> {t("befriendThrow")}
          </Tap>
          <Tap id="befriend_auto" className="quiet tray-auto" disabled={!auto} onTap={p.onAuto}>
            {t("befriendAuto")}
          </Tap>
        </div>
        <Tap id="befriend_back" className="tray-back" aria-label={t("befriendBack")} onTap={p.onClose}>
          <span aria-hidden="true">✕</span>
          <small>{t("befriendBack")}</small>
        </Tap>
      </div>
    </ScreenTime>
  );
}
