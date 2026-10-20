import type { Play } from "../app/play";
import { bestiary } from "../core/game/collection";
import { bestiaryZones, OTHER_ZONE } from "../core/game/zones";
import { t } from "../i18n";
import { MonsterPic } from "./MonsterPic";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";

/**
 * The Book: every creature of the game, by zone. Each zone says how many
 * of its creatures were caught and seen. Caught ones show colour and a
 * true fact, met ones a grey picture, the rest a silhouette and a
 * question mark.
 */
export function BestiaryScreen({ play, onClose }: { play: Play; onClose: () => void }) {
  const all = Object.keys(play.monsters).filter((s) => play.monsters[s]!.hasSprite);
  const count = bestiary(play.world, all);
  const zones = bestiaryZones({
    trips: play.trips,
    encounters: play.encounters,
    monsters: play.monsters,
    seen: play.world.seen,
    caught: play.world.caught,
    titles: { nagmon_route1: t("bookRoute1"), [OTHER_ZONE]: t("bookOther") },
  });
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
        {zones.map((z) => (
          <div key={z.id} className="bestiary-zone" data-zone={z.id} data-seen={z.seen} data-caught={z.caught}>
            <h3 className="zone-title" data-id={`zone_${z.id}`}>
              {t("bookZone", { title: z.title, caught: z.caught, seen: z.seen, total: z.species.length })}
            </h3>
            <ul className="bestiary-grid">
              {z.species.map((s) => {
                const caught = play.world.caught.has(s);
                const seen = caught || play.world.seen.has(s);
                return (
                  <li key={s} className={caught ? "beast" : seen ? "beast met" : "beast unknown"} data-caught={caught} data-species={s}>
                    <MonsterPic monsters={play.monsters} species={s} height={0.16} />
                    <span>{seen ? play.text(s) : t("bestiaryUnknown")}</span>
                    {caught && <span className="beast-fact">{play.texts[`${s}_description`] ?? ""}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </ScreenTime>
  );
}
