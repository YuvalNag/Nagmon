import { useState } from "react";
import type { Play } from "../app/play";
import { progressPercent, travelTo, zoneState, type Trip, type Zone } from "../core/game/trips";
import { t } from "../i18n";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";
import { Portrait } from "./SpriteFrame";

interface Props {
  play: Play;
  /** The map the child is on. */
  current: string | null;
  homeMap: string;
  /** The vehicle goes: the screen closes and the map changes. */
  go: (map: string, at: { x: number; y: number } | null) => void;
  /** The master's test. */
  master: (trip: Trip) => void;
  onClose: () => void;
  onChanged: () => void;
}

/** Mila's vehicle: where to, what it costs, what is locked and why. Nothing is ever lost here. */
export function TripScreen({ play, current, homeMap, go, master, onClose, onChanged }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const world = play.world;
  const zoneTitle = (trip: Trip, id: string) => trip.zones.find((z) => z.id === id)?.title ?? id;

  const pick = (trip: Trip, zone: Zone) => {
    const r = travelTo(world, trip, zone);
    if (!r.ok) {
      setMessage(r.reason === "coins" ? t("tripsNeedCoins", { missing: r.missing }) : r.reason === "soon" ? t("tripsSoon") : null);
      return;
    }
    play.field.purchase({ what: `trip:${trip.id}/${zone.id}`, price: r.paid, coins: world.money });
    void play.saveWorld();
    onChanged();
    go(zone.map!, zone.start);
  };

  return (
    <ScreenTime>
      <section className="trips" data-screen="trips">
        <h2 className="title">
          <Portrait npc="nagmon_mila" height="1.6em" className="trips-mila" /> {t("tripsTitle")}
        </h2>
        <p className="trips-coins" role="status" data-id="trips_coins">
          {t("tripsCoins", { coins: world.money })}
        </p>
        <div className="trips-list">
          {play.trips.flatMap((trip) =>
            trip.zones.map((zone) => {
              const st = zoneState(trip, zone, world);
              const here = zone.map === current;
              const why = !zone.ready
                ? t("tripsSoon")
                : st.state === "done"
                  ? t("tripsDone")
                  : st.state === "locked"
                    ? st.needLevel
                      ? t("tripsLockedLevel", { level: st.needLevel })
                      : t("tripsLockedZone", { zone: st.needZones.map((id) => zoneTitle(trip, id)).join(", ") })
                    : t("tripsCost", { cost: zone.cost });
              const blocked = !zone.ready || st.state === "locked" || here;
              return (
                <Tap key={`${trip.id}/${zone.id}`} id={`zone_${zone.id}`} className="zone" data-state={zone.ready ? st.state : "soon"} disabled={blocked} onTap={() => pick(trip, zone)}>
                  <span className="zone-title">{zone.title}</span>
                  <span className="zone-why">{st.state === "done" && zone.ready ? `${t("tripsDone")} · ${t("tripsCost", { cost: zone.cost })}` : why}</span>
                </Tap>
              );
            }),
          )}
        </div>
        {message && (
          <p className="trips-message" role="status" data-id="trips_message">
            {message}
          </p>
        )}
        <div className="row">
          {current !== homeMap && (
            <Tap id="trips_home" onTap={() => go(homeMap, null)}>
              {t("tripsHome")}
            </Tap>
          )}
          {play.trips.map((trip) => {
            const allDone = trip.zones.every((z) => world.trips.done.includes(`${trip.id}/${z.id}`));
            const has = world.trips.badges.includes(`${trip.id}/${trip.master.badge}`);
            return allDone && !has ? (
              <Tap key={trip.id} id={`master_${trip.id}`} className="primary" onTap={() => master(trip)}>
                {t("tripsMaster", { badge: trip.master.badgeTitle })}
              </Tap>
            ) : null;
          })}
          <Tap id="trips_close" onTap={onClose}>
            {t("tripsBack")}
          </Tap>
        </div>
        {play.trips.map((trip) => (
          <p key={trip.id} className="trips-percent" data-id="trips_percent">
            {t("menuProgress", { percent: progressPercent(world, trip) })}
          </p>
        ))}
      </section>
    </ScreenTime>
  );
}
