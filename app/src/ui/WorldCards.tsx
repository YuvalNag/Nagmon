import type { Economy } from "../core/game/items";
import type { Chip } from "../core/world/director";
import type { Found } from "../core/world/events";
import { t } from "../i18n";
import { prizeLook } from "./prizeLook";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";
import { ChestArt, NoticeArt } from "./WorldArt";

/**
 * The small full-screen cards of the world's objects (docs/app/FEATURES.md
 * 5.3), each shown by an event of the map and closed by the child:
 * what a chest or a gift gave, the choice after a wrong answer at a chest,
 * and a sign's fact. Every card is its own screen (ScreenTime).
 */

/** What was found: a chest opened, its small gift, or an item given. */
export function FoundCard({ found, economy, onClose }: { found: Found; economy: Economy; onClose: () => void }) {
  const look = prizeLook(economy, found.prize);
  const key = found.how === "chest" ? "chestFound" : found.how === "consolation" ? "chestGift" : "itemFound";
  return (
    <ScreenTime>
      <div className="map-overlay world-card" data-screen="found" data-how={found.how} role="dialog" aria-label={t(key, { what: look.words })}>
        {found.how !== "item" && <ChestArt open />}
        <span className="found-prize" data-id="found_prize" aria-hidden="true">
          {look.icon}
        </span>
        <strong role="status" data-id="found_text">
          {t(key, { what: look.words })}
        </strong>
        <Tap id="found_ok" className="primary" onTap={onClose}>
          {t("cardContinue")}
        </Tap>
      </div>
    </ScreenTime>
  );
}

/** A wrong answer at a chest: nothing is lost; try again, or take the small gift. */
export function ChestWrongCard({ onChoose }: { onChoose: (c: "again" | "gift") => void }) {
  return (
    <ScreenTime>
      <div className="map-overlay world-card" data-screen="chest-wrong" role="dialog" aria-label={t("chestWrongTitle")}>
        <ChestArt />
        <strong role="status">{t("chestWrongTitle")}</strong>
        <div className="row">
          <Tap id="chest_again" className="primary" onTap={() => onChoose("again")}>
            {t("chestAgain")}
          </Tap>
          <Tap id="chest_gift" onTap={() => onChoose("gift")}>
            {t("chestSmall")}
          </Tap>
        </div>
      </div>
    </ScreenTime>
  );
}

/** A sign or notice board: a picture from the emoji set and one line. */
export function FactCard({ fact, onClose }: { fact: { emoji: string; text: string }; onClose: () => void }) {
  return (
    <ScreenTime>
      <div className="map-overlay world-card" data-screen="fact" role="dialog" aria-label={fact.text}>
        <NoticeArt>
          <img className="fact-pic" data-id="fact_pic" src={`game/emoji/${fact.emoji}.svg`} alt="" draggable={false} />
        </NoticeArt>
        <strong data-id="fact_text">{fact.text}</strong>
        <Tap id="fact_ok" className="primary" onTap={onClose}>
          {t("cardContinue")}
        </Tap>
      </div>
    </ScreenTime>
  );
}

/**
 * What to ask a person of the world (docs/app/WORLD_V2.md 4.4): up to four
 * big chips, each a picture and a few words, so a child who cannot type
 * can still ask. "Bye" ends the talk. Nothing here is typed.
 */
export function TopicsCard({ speaker, chips, onChoose }: { speaker: string; chips: readonly Chip[]; onChoose: (id: string | null) => void }) {
  return (
    <ScreenTime>
      <div className="map-overlay world-card topics-card" data-screen="topics" role="dialog" aria-label={t("topicsTitle", { name: speaker })}>
        <strong role="status">{t("topicsTitle", { name: speaker })}</strong>
        <div className="topic-chips">
          {chips.map((c) => (
            <Tap key={c.id} id={`topic_${c.id}`} className="topic-chip" onTap={() => onChoose(c.id)}>
              <img src={`game/emoji/${c.icon}.svg`} alt="" draggable={false} />
              <span>{c.label}</span>
            </Tap>
          ))}
        </div>
        <Tap id="topic_bye" className="quiet" onTap={() => onChoose(null)}>
          {t("topicsBye")}
        </Tap>
      </div>
    </ScreenTime>
  );
}
