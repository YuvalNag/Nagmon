import { addCreature } from "../../../src/core/game/collection";
import { economy } from "../../../src/core/game/items";
import { mailData } from "../../../src/core/game/mail";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "../game/helpers";

export const eco = () => economy(gameJson("economy.json"));

/** A small hand-made letter table, so the rules are tested apart from the authored words. */
export const smallMail = () =>
  mailData({
    senders: {
      nagmon_owl: { name_he: "הינשוף", always: true, emoji: "1f989" },
      nagmon_granny: { name_he: "סבתא", emoji: "1f475" },
    },
    letters: {
      pc_owl: { from: "nagmon_owl", kind: "postcard", variants: [{ text_he: "אחת" }, { text_he: "שתיים" }, { text_he: "שלוש" }] },
      pc_granny: { from: "nagmon_granny", kind: "postcard", variants: [{ text_he: "סבתא אחת" }, { text_he: "סבתא שתיים" }] },
      thanks: { from: "nagmon_granny", kind: "event", variants: [{ text_he: "תודה!" }, { text_he: "תודה רבה!" }] },
      level3: { from: "nagmon_owl", kind: "event", variants: [{ text_he: "מתנה", gift: { item: "berry", n: 1 } }] },
    },
    gifts: [{ coins: 10 }, { item: "berry", n: 1 }],
  });

export function worldWith(friends = 0): WorldState {
  const w = new WorldState();
  const species = ["heliobud", "lunibble", "terrabub", "rustip", "ringlet", "meteet", "heliolynx", "iobud", "gravip", "probip"];
  for (let i = 0; i < friends; i++) addCreature(w, species[i % species.length]!, 3 + i);
  return w;
}

/** The days from `from` on, as `YYYY-MM-DD`. */
export const days = (from: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => {
    const [y, m, d] = from.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d! + i)).toISOString().slice(0, 10);
  });
