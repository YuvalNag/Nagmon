import { type CSSProperties, useState } from "react";
import type { Play } from "../app/play";
import { checkGates, type GateRow, setKeepSmall } from "../core/game/evolution";
import { details, meadowCount, partyOf, setPartner } from "../core/game/party";
import type { Creature } from "../core/world/worldState";
import { t, type TextKey } from "../i18n";
import { Sheet } from "./battle/Sheet";
import { SUBJECT_COLOR } from "./battle/subjects";
import { evolutionScale } from "./evolution/scale";
import { Evolution, Later } from "./lazy";
import { MonsterPic } from "./MonsterPic";
import { Tap } from "./Tap";
import { EggRing } from "./WorldArt";
import "../i18nEvolution";

interface Props {
  play: Play;
  onClose: () => void;
  /** The partner changed (saved already). */
  onChanged?: () => void;
}

const hearts = (n: number) => "❤️".repeat(n) + "🤍".repeat(5 - n);

/** One line of the checklist (7.1): "Know-how in Math 31 of 40". */
function gateText(r: GateRow, subject: string | null, place: string): string {
  const v = { have: r.have, need: r.need, subject: subject ?? "" };
  const key: Record<GateRow["id"], TextKey> = { level: "evoGateLevel", know_how: "evoGateKnow", stars: "evoGateStars", hearts: "evoGateHearts", lesson: "evoGateLesson", place: "evoGatePlace" };
  return r.id === "place" ? t(key.place, { name: place }) : t(key[r.id], v);
}

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
  // an evolution that was just done: the scene plays over the screen
  const [evolving, setEvolving] = useState<{ id: string; from: string; to: string } | null>(null);
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
  const ctx = play.evolveCtx();
  const readyOf = (c: Creature) => (ctx ? (checkGates(c, ctx)?.ready ?? false) : false);
  const check = chosen && ctx ? checkGates(chosen, ctx) : null;
  const zoneTitle = (id: string | null) => (id ? (play.trips?.flatMap((tr) => tr.zones).find((z) => z.id === id)?.title ?? id) : "");

  const evolveNow = (c: Creature) => {
    const r = play.evolveNow(c.id, "learning");
    if (!r) return;
    onChanged?.();
    setEvolving({ id: r.id, from: r.before, to: r.after });
  };
  const keepSmall = (c: Creature) => {
    setKeepSmall(c, c.keepSmall !== true);
    void play.saveWorld();
    redraw((n) => n + 1);
  };

  if (evolving) {
    return (
      <Later>
        <Evolution.Screen
          key={`evolution-${evolving.id}`}
          play={play}
          creatureId={evolving.id}
          from={evolving.from}
          to={evolving.to}
          how="learning"
          scale={evolutionScale()}
          onDone={() => {
            setEvolving(null);
            redraw((n) => n + 1);
          }}
        />
      </Later>
    );
  }
  return (
    <Sheet title={t("friendsTitle")} onClose={onClose} id="friends">
      <div className="friends" data-id="friends">
        <ul className="friends-grid">
          {party.map((c) => {
            const dd = details(c, play.monsters, play.subjects);
            return (
              <li key={c.id}>
                <Tap id={`friend_${c.id}`} className="friend-card" data-ready={readyOf(c) && !c.keepSmall} data-shimmer={c.shimmer === true} style={c.shimmer ? ({ ["--shimmer" as string]: SUBJECT_COLOR[dd.subject] ?? "#ffd54f" } as CSSProperties) : undefined} aria-pressed={c.id === chosen?.id} aria-label={`${nameOf(c)} ${t("battleLevel", { level: c.level })}`} onTap={() => { setPickedId(c.id); setSaid(null); }}>
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
            {check?.ready && (
              <Tap id="friend_evolve" className="primary evolve-now" onTap={() => evolveNow(chosen)}>
                {t("evoGo")}
              </Tap>
            )}
            {chosen.shimmer && (
              <span className="friend-sub friend-shimmer" data-id="friend_shimmer">
                ✨ {t("evoShimmer")}
              </span>
            )}
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
        <div className="friend-checklist friend-gates-strip" data-id="friend_gates" role="group" aria-label={t("evoChecklist")}>
          {check ? (
            <>
              <strong className="friend-sub">{check.ready ? t("evoReady", { name: nameOf(chosen) }) : t("evoChecklist")}</strong>
              <ul>
                {check.rows.map((r) => (
                  <li key={r.id} data-gate={r.id} data-met={r.met}>
                    <span aria-hidden="true">{r.met ? "✅" : "⭕"}</span> {gateText(r, r.subject ? play.subjects.title(r.subject) : null, zoneTitle(check.form.place))}
                  </li>
                ))}
              </ul>
              <Tap id="friend_keep_small" className="keep-small" aria-pressed={chosen.keepSmall === true} onTap={() => keepSmall(chosen)}>
                {chosen.keepSmall ? t("evoKeepSmallOn") : t("evoKeepSmall")}
              </Tap>
            </>
          ) : (
            <span className="friend-sub">{t("evoNoForm")}</span>
          )}
        </div>
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
