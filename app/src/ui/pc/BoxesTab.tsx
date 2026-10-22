import { useState } from "react";
import type { Play } from "../../app/play";
import { BOX_SIZE, boxesOf, isFav, type SortMode, sortedMeadow, toggleFav } from "../../core/game/pcBox";
import { partyOf } from "../../core/game/party";
import { swapWithMeadow } from "../../core/game/rest";
import type { Creature } from "../../core/world/worldState";
import { t } from "../../i18n";
import { MonsterPic } from "../MonsterPic";
import { Tap } from "../Tap";
import { StarIcon } from "./ObjectArt";
import { w } from "./words";

const SORTS: { mode: SortMode; label: "boxSortZone" | "boxSortSubject" | "boxSortNewest" }[] = [
  { mode: "zone", label: "boxSortZone" },
  { mode: "subject", label: "boxSortSubject" },
  { mode: "newest", label: "boxSortNewest" },
];

/**
 * The PC's Boxes tab: the party (the first four friends) and the Meadow in named boxes of eight, sorted
 * by zone, by subject or newest first with the starred ones leading. A friend of the party and a friend of
 * a box swap places (core/game/rest.ts, the Rest Center's own rule); nothing can be released or deleted, and
 * the order of the party is the only thing that ever changes.
 */
export function BoxesTab({ play, onChanged }: { play: Play; onChanged: () => void }) {
  const world = play.world;
  const [sort, setSort] = useState<SortMode>("newest");
  const [boxNo, setBoxNo] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [, redraw] = useState(0);

  const party = partyOf(world);
  const list = sortedMeadow(world, sort, { monsters: play.monsters, encounters: play.encounters, subjects: play.subjects });
  const boxes = boxesOf(list, BOX_SIZE);
  const box = boxes[Math.min(boxNo, boxes.length - 1)]!;
  const nameOf = (c: Creature) => c.name ?? play.text(c.species);
  const byId = (id: string | null) => world.creatures.find((c) => c.id === id);
  const inParty = (id: string) => party.some((c) => c.id === id);
  const changed = () => {
    void play.saveWorld();
    onChanged();
    redraw((n) => n + 1);
  };

  const tap = (c: Creature) => {
    if (!sel || sel === c.id) {
      setSel(sel === c.id ? null : c.id);
      setSaid(sel === c.id ? null : w("boxPicked", { name: nameOf(c) }));
      return;
    }
    const other = byId(sel);
    if (other && inParty(other.id) !== inParty(c.id) && swapWithMeadow(world, other.id, c.id)) {
      play.field.note("pc", { swap: 1 });
      setSaid(w("boxSwapped", { a: nameOf(other), b: nameOf(c) }));
      setSel(null);
      changed();
      return;
    }
    // the same side: only the choice changes
    setSel(c.id);
    setSaid(w("boxPicked", { name: nameOf(c) }));
  };

  const star = (c: Creature) => {
    if (!toggleFav(world, c.id)) return;
    setSaid(isFav(world, c.id) ? w("boxStarred", { name: nameOf(c) }) : w("boxUnstarred", { name: nameOf(c) }));
    changed();
  };

  if (party.length === 0) {
    return (
      <p className="obj-empty" data-id="box_none">
        {w("boxNoFriends")}
      </p>
    );
  }

  return (
    <div className="boxes" data-id="boxes">
      <div className="boxes-party">
        <strong className="boxes-title">{w("boxParty")}</strong>
        <ul className="boxes-party-list">
          {party.map((c) => (
            <li key={c.id}>
              <Tap id={`box_party_${c.id}`} className="box-friend" aria-pressed={sel === c.id} aria-label={`${nameOf(c)} ${t("battleLevel", { level: c.level })}`} onTap={() => tap(c)}>
                <MonsterPic monsters={play.monsters} species={c.species} height={0.1} />
                <span className="friend-sub">{t("battleLevel", { level: c.level })}</span>
              </Tap>
            </li>
          ))}
        </ul>
        <span className="obj-note">{w("boxSafe")}</span>
      </div>
      <div className="boxes-main">
        <div className="chip-row" role="group" aria-label={w("tabBoxes")}>
          {SORTS.map((s) => (
            <Tap key={s.mode} id={`box_sort_${s.mode}`} className="chip" aria-pressed={sort === s.mode} onTap={() => setSort(s.mode)}>
              {w(s.label)}
            </Tap>
          ))}
        </div>
        {boxes.length > 1 ? (
          <div className="chip-row" role="group" data-id="box_names">
            {boxes.map((_, i) => (
              <Tap key={i} id={`box_name_${i}`} className="chip" aria-pressed={i === Math.min(boxNo, boxes.length - 1)} onTap={() => setBoxNo(i)}>
                {w("boxName", { n: i + 1 })}
              </Tap>
            ))}
          </div>
        ) : (
          <strong className="box-title" data-id="box_names">
            {w("boxName", { n: 1 })}
          </strong>
        )}
        {box.length === 0 ? (
          <p className="obj-empty" data-id="box_empty">
            {w("boxEmpty")}
          </p>
        ) : (
          <ul className="box-grid" data-id="box_grid">
            {box.map((c) => (
              <li key={c.id} className="box-cell">
                <Tap id={`box_friend_${c.id}`} className="box-friend" aria-pressed={sel === c.id} aria-label={`${nameOf(c)} ${t("battleLevel", { level: c.level })}`} onTap={() => tap(c)}>
                  <MonsterPic monsters={play.monsters} species={c.species} height={0.08} />
                  <span className="friend-sub">{t("battleLevel", { level: c.level })}</span>
                </Tap>
                <Tap id={`box_star_${c.id}`} className="box-star" aria-pressed={isFav(world, c.id)} aria-label={w("boxStar", { name: nameOf(c) })} onTap={() => star(c)}>
                  <StarIcon on={isFav(world, c.id)} />
                </Tap>
              </li>
            ))}
          </ul>
        )}
        <span className="obj-said" role="status" data-id="box_said">
          {said ?? w("boxHint")}
        </span>
      </div>
    </div>
  );
}
