import { useState } from "react";
import type { Play } from "../../app/play";
import { countOf } from "../../core/game/items";
import { deposit, inBox, storedItems, withdraw } from "../../core/game/pcBox";
import { itemText } from "../../i18n";
import { Tap } from "../Tap";
import { w } from "./words";

/**
 * The PC's Items tab: the item box, which holds as many more of an item as the Bag does (99). Items move
 * between the Bag and the box one at a time or all at once; nothing is sold, thrown away or lost, and what
 * does not fit stays where it was.
 */
export function ItemsTab({ play, onChanged }: { play: Play; onChanged: () => void }) {
  const world = play.world;
  const eco = play.economy;
  const [said, setSaid] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const ids = storedItems(world, eco);

  const move = (id: string, dir: "in" | "out", n: number) => {
    const moved = dir === "in" ? deposit(world, eco, id, n) : withdraw(world, eco, id, n);
    if (moved > 0) {
      play.field.note("pc", { items: dir, item: id, n: moved });
      setSaid(w("itemsMoved", { n: moved }));
      void play.saveWorld();
      onChanged();
      redraw((x) => x + 1);
    } else setSaid(dir === "in" ? w("itemsBoxFull") : w("itemsBagFull"));
  };

  return (
    <div className="items-tab" data-id="items_tab">
      {ids.length === 0 ? (
        <p className="obj-empty" data-id="items_none">
          {w("itemsNone")}
        </p>
      ) : (
        <ul className="obj-rows items-rows">
          {ids.map((id) => {
            const bag = countOf(world, id);
            const box = inBox(world, id);
            return (
              <li key={id} className="item-row" data-id={`items_row_${id}`}>
                <span className="item-icon" aria-hidden="true">
                  {eco.items[id]?.icon}
                </span>
                <span className="row-text">
                  <strong>{itemText(id, "name")}</strong>
                  <span className="row-sub">
                    <span data-id={`items_bag_${id}`}>{w("itemsBag", { n: bag })}</span> · <span data-id={`items_box_${id}`}>{w("itemsBox", { n: box })}</span>
                  </span>
                </span>
                <span className="item-moves">
                  <Tap id={`items_in_${id}`} disabled={bag < 1} onTap={() => move(id, "in", 1)}>
                    {w("itemsDeposit")}
                  </Tap>
                  <Tap id={`items_in_all_${id}`} disabled={bag < 2} onTap={() => move(id, "in", bag)}>
                    {w("itemsDepositAll")}
                  </Tap>
                  <Tap id={`items_out_${id}`} disabled={box < 1} onTap={() => move(id, "out", 1)}>
                    {w("itemsWithdraw")}
                  </Tap>
                  <Tap id={`items_out_all_${id}`} disabled={box < 2} onTap={() => move(id, "out", box)}>
                    {w("itemsWithdrawAll")}
                  </Tap>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <span className="obj-said" role="status" data-id="items_said">
        {said ?? w("itemsHint", { n: eco.stack })}
      </span>
    </div>
  );
}
