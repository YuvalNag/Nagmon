import { type MutableRefObject, useEffect, useMemo, useState } from "react";
import type { Play } from "../../app/play";
import { CHANNEL_SECONDS, CHANNELS, type Channel, creatureOfDay, staticNews, tvData } from "../../core/game/tv";
import type { ObjectDef } from "../../core/game/objects";
import { skyOn } from "../../core/world/sky";
import { MonsterPic } from "../MonsterPic";
import { Tap } from "../Tap";
import { MoonArt, TvFrame } from "./ObjectArt";
import { ObjectFrame } from "./ObjectFrame";
import { w } from "./words";

const LABEL = { sky: "tvSky", news: "tvNews", creature: "tvCreature" } as const;
const ICON = { sky: "🌙", news: "📰", creature: "🐾" } as const;

interface Props {
  play: Play;
  def: ObjectDef;
  onClose: () => void;
  backRef?: MutableRefObject<(() => void) | null>;
  /** Seconds a channel plays; the browser test shortens it, the child gets 25. */
  seconds?: number;
}

/**
 * The TV (docs/app/WORLD_V2.md 8, object 4): three channels, each shown for 25 seconds and switched by a
 * tap; nothing starts by itself. Sky today (the moon from the real date and the sky's event), Town news
 * (three headlines, the static source until the NPC resolver exists) and Creature of the day (a picture
 * and one true line; it is met a little more in the grass that day).
 */
export function TvScreen({ play, def, onClose, backRef, seconds = CHANNEL_SECONDS }: Props) {
  const today = play.today();
  const data = useMemo(() => tvData(def.data), [def]);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [left, setLeft] = useState(seconds);
  const [ended, setEnded] = useState(false);

  // a channel runs for its seconds, then the set rests; picking a channel starts it again
  useEffect(() => {
    if (!channel) return;
    setLeft(seconds);
    setEnded(false);
    const timer = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          setEnded(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [channel, seconds]);

  const sky = skyOn(today);
  const creature = creatureOfDay(data, play.monsters, today);
  const headlines = staticNews(data)(today);

  return (
    <ObjectFrame def={def} onClose={onClose} backRef={backRef} className="tv">
      <div className="tv-body" data-id="tv" data-channel={channel ?? "off"} data-ended={ended}>
        <div className="tv-channels" role="group" aria-label={def.title}>
          {CHANNELS.map((c) => (
            <Tap key={c} id={`tv_channel_${c}`} className="chip" aria-pressed={channel === c} onTap={() => setChannel(c)}>
              <span aria-hidden="true">{ICON[c]}</span> {w(LABEL[c])}
            </Tap>
          ))}
        </div>
        <TvFrame>
          {!channel || ended ? (
            <p className="tv-off" data-id="tv_off">
              {ended ? w("tvEnded") : w("tvOff")}
            </p>
          ) : channel === "sky" ? (
            <div className="tv-sky" data-id="tv_sky" data-phase={sky.moon.phase} data-event={sky.event}>
              <MoonArt phase={sky.moon.phase} lit={sky.moon.lit} />
              <div className="tv-text">
                <strong data-id="tv_moon">{w(`moon_${sky.moon.phase}`)}</strong>
                <span data-id="tv_sky_event">{sky.event === "meteor_shower" ? w("skyShower", { name: w(`shower_${sky.shower ?? "perseids"}` as never) }) : sky.event === "solar_wind" ? w("skySolarWind") : w("skyClear")}</span>
              </div>
            </div>
          ) : channel === "news" ? (
            <ul className="tv-news" data-id="tv_news">
              {headlines.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          ) : creature ? (
            <div className="tv-creature" data-id="tv_creature" data-species={creature.species}>
              <MonsterPic monsters={play.monsters} species={creature.species} height={0.2} />
              <div className="tv-text">
                <strong>{play.text(creature.species)}</strong>
                <span>{creature.fact}</span>
                <span className="row-sub">{w("tvCreatureHint")}</span>
              </div>
            </div>
          ) : (
            <p className="tv-off">{w("tvOff")}</p>
          )}
        </TvFrame>
        {channel && !ended && (
          <span className="obj-note" data-id="tv_timer" data-left={left} role="timer">
            {w("tvSeconds", { s: left })}
          </span>
        )}
      </div>
    </ObjectFrame>
  );
}
