import { type MutableRefObject, useMemo, useState } from "react";
import type { Play } from "../../app/play";
import { choicesFor, eat, fridgeData, fridgeOpened } from "../../core/game/fridge";
import type { ObjectDef } from "../../core/game/objects";
import { Tap } from "../Tap";
import { FridgeArt, Pic } from "./ObjectArt";
import { MonsterPic } from "../MonsterPic";
import { ObjectFrame } from "./ObjectFrame";
import { w } from "./words";

/**
 * The fridge (docs/app/WORLD_V2.md 8, object 5): once a day the child picks one of three snacks; the partner
 * gets a heart and is happy. Free. The second tap says "tomorrow".
 */
export function FridgeScreen({ play, def, onClose, onChanged, backRef }: { play: Play; def: ObjectDef; onClose: () => void; onChanged?: () => void; backRef?: MutableRefObject<(() => void) | null> }) {
  const today = play.today();
  const data = useMemo(() => fridgeData(def.data), [def]);
  const [said, setSaid] = useState<string | null>(null);
  const [fed, setFed] = useState<{ snack: string; hearts: number } | null>(null);
  const [, redraw] = useState(0);
  const snacks = choicesFor(data, today);
  const partner = play.world.creatures[0];
  const opened = fridgeOpened(play.world, today);

  const pick = (id: string) => {
    const r = eat(play.world, data, id, today);
    if (!r.ok) {
      setSaid(r.reason === "tomorrow" ? w("fridgeTomorrow") : r.reason === "nofriend" ? w("fridgeNoFriend") : null);
      return;
    }
    const name = r.creature.name ?? play.text(r.creature.species);
    play.field.note("fridge", { snack: id, hearts: r.hearts });
    setFed({ snack: id, hearts: r.hearts });
    setSaid(r.gained ? w("fridgeFed", { name }) : w("fridgeFull", { name }));
    void play.saveWorld();
    onChanged?.();
    redraw((n) => n + 1);
  };

  return (
    <ObjectFrame def={def} onClose={onClose} backRef={backRef} className="fridge">
      <div className="fridge-body" data-id="fridge" data-opened={opened}>
        <FridgeArt>
          {snacks.map((s) => (
            <Tap key={s.id} id={`fridge_snack_${s.id}`} className="snack-btn" data-picked={fed?.snack === s.id} aria-label={s.name} onTap={() => pick(s.id)}>
              <Pic code={s.emoji} className="snack-pic" />
              <span className="friend-sub">{s.name}</span>
            </Tap>
          ))}
        </FridgeArt>
        <div className="fridge-side">
          {partner && (
            <span className="fridge-partner" data-id="fridge_partner" data-happy={fed !== null}>
              <MonsterPic monsters={play.monsters} species={partner.species} height={0.2} />
              {fed && (
                <span className="heart-pop" aria-hidden="true">
                  ❤️
                </span>
              )}
            </span>
          )}
          <span className="obj-said" role="status" data-id="fridge_said">
            {said ?? (opened ? w("fridgeTomorrow") : w("fridgePick"))}
          </span>
        </div>
      </div>
    </ObjectFrame>
  );
}
