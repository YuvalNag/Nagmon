import { useState } from "react";
import type { Play } from "../app/play";
import { details, meadowCount, partyOf, setPartner } from "../core/game/party";
import type { Creature } from "../core/world/worldState";
import { t } from "../i18n";
import { Sheet } from "./battle/Sheet";
import { MonsterPic } from "./MonsterPic";
import { Tap } from "./Tap";
import { EggRing } from "./WorldArt";

interface Props {
  play: Play;
  onClose: () => void;
  /** The partner changed (saved already). */
  onChanged?: () => void;
}

const hearts = (n: number) => "❤️".repeat(n) + "🤍".repeat(5 - n);

/**
 * The Friends screen (docs/app/FEATURES.md 4.6 and 4.7): the party of
 * four as big cards, and for the one tapped its details: level, the
 * growth bar, what it is good at, paws for power, hearts, and the
 * button that makes it the partner (the first, who answers). The
 * friends in the Meadow are only counted here.
 */
export function FriendsView({ play, onClose, onChanged }: Props) {
  const party = partyOf(play.world);
  const [pickedId, setPickedId] = useState(party[0]?.id ?? "");
  const [said, setSaid] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const chosen: Creature | undefined = party.find((c) => c.id === pickedId) ?? party[0];
  const nameOf = (c: Creature) => c.name ?? play.text(c.species);

  const makePartner = (c: Creature) => {
    if (c.fainted || !setPartner(play.world, c.id)) return;
    play.field.note("partner", { species: c.species });
    void play.saveWorld();
    setSaid(t("friendsSwapped", { name: nameOf(c) }));
    onChanged?.();
    redraw((n) => n + 1);
  };

  const d = chosen ? details(chosen, play.monsters, play.subjects) : null;
  const first = partyOf(play.world)[0];
  return (
    <Sheet title={t("friendsTitle")} onClose={onClose} id="friends">
      <div className="friends" data-id="friends">
        <ul className="friends-grid">
          {party.map((c) => {
            const dd = details(c, play.monsters, play.subjects);
            return (
              <li key={c.id}>
                <Tap id={`friend_${c.id}`} className="friend-card" aria-pressed={c.id === chosen?.id} aria-label={`${nameOf(c)} ${t("battleLevel", { level: c.level })}`} onTap={() => { setPickedId(c.id); setSaid(null); }}>
                  <MonsterPic monsters={play.monsters} species={c.species} height={0.17} />
                  <span className="friend-name">{nameOf(c)}</span>
                  <span className="friend-sub">
                    {t("battleLevel", { level: c.level })} · {play.subjects.title(dd.subject)}
                  </span>
                  {c.fainted && (
                    <span className="friend-first" data-id={`friend_asleep_${c.id}`}>
                      {t("friendsAsleep")}
                    </span>
                  )}
                  {c.id === first?.id && (
                    <span className="friend-first" data-id="friend_first">
                      {t("friendsIsPartner")}
                    </span>
                  )}
                </Tap>
              </li>
            );
          })}
        </ul>
        {chosen && d && (
          <div className="friend-detail" data-id="friend_detail">
            <strong className="friend-title">{nameOf(chosen)}</strong>
            {chosen.name && <span className="friend-species">{play.text(chosen.species)}</span>}
            <span data-id="friend_level">{t("battleLevel", { level: d.level })}</span>
            <div className="meter xp" role="progressbar" aria-label={t("friendsXp", { xp: d.xp, need: d.need })} aria-valuemin={0} aria-valuemax={d.need} aria-valuenow={d.xp}>
              <span style={{ width: `${d.need ? Math.min(100, (100 * d.xp) / d.need) : 100}%` }} />
            </div>
            <span className="friend-sub">{t("friendsXp", { xp: d.xp, need: d.need })}</span>
            <span data-id="friend_good">{t("friendsGoodAt", { subject: play.subjects.title(d.subject) })}</span>
            <span role="img" aria-label={t("friendsPaws", { n: d.paws })}>
              {"🐾".repeat(d.paws)}
            </span>
            <span role="img" aria-label={t("friendsHearts", { n: d.hearts })}>
              {hearts(d.hearts)}
            </span>
            <Tap id="friend_partner" className="primary" disabled={chosen.id === first?.id || chosen.fainted === true} onTap={() => makePartner(chosen)}>
              {t("friendsMakePartner")}
            </Tap>
            {said && (
              <span className="friend-sub" data-id="friend_said" role="status">
                {said}
              </span>
            )}
          </div>
        )}
        {play.world.eggs.length > 0 && (
          <ul className="friends-eggs" data-id="friends_eggs" aria-label={t("eggsTitle")}>
            {play.world.eggs.map((e) => (
              <li key={e.id} data-id={`egg_${e.id}`} data-got={e.got}>
                <EggRing got={e.got} need={e.need} />
                <span>{t("eggProgress", { got: e.got, need: e.need })}</span>
              </li>
            ))}
          </ul>
        )}
        {meadowCount(play.world) > 0 && (
          <p className="friends-meadow" data-id="friends_meadow">
            {t("friendsMeadow", { n: meadowCount(play.world) })}
          </p>
        )}
      </div>
    </Sheet>
  );
}
