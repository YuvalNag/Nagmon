import type { Play } from "../../app/play";
import { directoryOf } from "../../core/game/objects";
import { MAX_HEARTS, metPeople } from "../../core/game/people";
import { itemText } from "../../i18n";
import { Pic } from "./ObjectArt";
import { w } from "./words";

/** Hearts as pictures, full and empty (three of them). */
const hearts = (n: number) => "❤️".repeat(n) + "🤍".repeat(MAX_HEARTS - n);

/**
 * The PC's People tab: a card for everyone the child has met, with their portrait (the emoji stand-in until
 * the portraits exist), friendship hearts 0 to 3, what they offer, and the gift tastes already found out.
 */
export function PeopleTab({ play }: { play: Play }) {
  const met = metPeople(play.world, directoryOf(play.objects));
  if (met.length === 0) {
    return (
      <p className="obj-empty" data-id="people_none">
        {w("peopleNone")}
      </p>
    );
  }
  return (
    <ul className="obj-rows people-list" data-id="people_list">
      {met.map(({ person, met: m }) => {
        const tastes = Object.entries(m.tastes ?? {});
        return (
          <li key={person.slug} className="person-card" data-id={`person_${person.slug}`} data-hearts={m.hearts}>
            <Pic code={person.emoji} className="person-pic" />
            <span className="row-text">
              <strong>{person.name}</strong>
              <span className="row-sub">{person.offers}</span>
              {tastes.length > 0 && (
                <span className="row-sub" data-id={`person_tastes_${person.slug}`}>
                  {w("peopleTastes", { list: tastes.map(([item, how]) => `${itemText(item, "name")} (${how === "loved" ? w("peopleLoved") : w("peopleLiked")})`).join(", ") })}
                </span>
              )}
            </span>
            <span className="person-hearts" role="img" aria-label={w("peopleHearts", { n: m.hearts })}>
              {hearts(m.hearts)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
