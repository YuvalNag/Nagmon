import type { Play } from "../app/play";
import { bestiary } from "../core/game/collection";
import { t } from "../i18n";
import { MonsterPic } from "./MonsterPic";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";

/** Every creature of the game: met ones with their names, caught ones with a true fact, the rest a question mark. */
export function BestiaryScreen({ play, onClose }: { play: Play; onClose: () => void }) {
  const all = Object.keys(play.monsters).filter((s) => play.monsters[s]!.hasSprite);
  const count = bestiary(play.world, all);
  return (
    <ScreenTime>
      <section className="bestiary" data-screen="bestiary">
        <header className="bestiary-top">
          <h2 className="title">{t("bestiaryTitle")}</h2>
          <p data-id="bestiary_count" role="status">
            {t("bestiaryCount", count)}
          </p>
          <Tap id="bestiary_close" onTap={onClose}>
            {t("tripsBack")}
          </Tap>
        </header>
        <ul className="bestiary-grid">
          {all.map((s) => {
            const seen = play.world.seen.has(s) || play.world.caught.has(s);
            const caught = play.world.caught.has(s);
            return (
              <li key={s} className={seen ? "beast" : "beast unknown"} data-caught={caught} data-species={s}>
                <MonsterPic monsters={play.monsters} species={s} height={0.16} />
                <span>{seen ? play.text(s) : t("bestiaryUnknown")}</span>
                {caught && <span className="beast-fact">{play.texts[`${s}_description`] ?? ""}</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </ScreenTime>
  );
}
