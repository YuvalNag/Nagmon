/**
 * The world's working objects (docs/app/WORLD_V2.md section 8): each is a
 * definition (`mods/nagmon/objects/<id>.yaml`, shipped in
 * game/objects.json) with a picture, a place on a map and the kind of
 * screen it opens. The map has one event for each: a prop that is created
 * and a `talk` that runs `open_object <id>` (core/world/events.ts), the
 * way the chest and the nest are made, so the talk button, the resolver
 * and the saving are reused. What an object holds (a TV's news, the
 * fridge's snacks) is in its own definition and read by its own module.
 */

/** The generic screens (ui/pc/ObjectScreen.tsx picks the component by this). */
export const SCREENS = ["pc", "mailbox", "bookshelf", "tv", "fridge", "board"] as const;
export type ObjectScreenKind = (typeof SCREENS)[number];

export interface Place {
  map: string;
  x: number;
  y: number;
}

export interface ObjectDef {
  id: string;
  screen: ObjectScreenKind;
  /** The prop's slug on the map (`nagmon_obj_<id>`): who `talk` events name. */
  slug: string;
  /** What the child calls it. */
  title: string;
  places: Place[];
  /** The rest of the definition, read by the module of the screen. */
  data: Record<string, unknown>;
}

export type ObjectDefs = Record<string, ObjectDef>;

export const objectSlug = (id: string): string => `nagmon_obj_${id}`;

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** From the parsed game/objects.json; a definition that cannot be read is left out. */
export function objectDefs(doc: unknown): ObjectDefs {
  const out: ObjectDefs = {};
  for (const [id, raw] of Object.entries(rec(rec(doc)["objects"]))) {
    const r = rec(raw);
    const screen = (SCREENS as readonly string[]).includes(String(r["screen"])) ? (r["screen"] as ObjectScreenKind) : null;
    if (!screen || typeof r["title_he"] !== "string" || !r["title_he"]) continue;
    const places = (Array.isArray(r["places"]) ? r["places"] : []).flatMap((p): Place[] => {
      const q = rec(p);
      return typeof q["map"] === "string" && Number.isInteger(q["x"]) && Number.isInteger(q["y"]) ? [{ map: q["map"], x: q["x"] as number, y: q["y"] as number }] : [];
    });
    out[id] = { id, screen, slug: objectSlug(id), title: r["title_he"], places, data: r };
  }
  return out;
}

/** The slugs of every object prop, for the allow-list of who may be talked to. */
export const objectSlugs = (defs: ObjectDefs): string[] => Object.values(defs).map((d) => d.slug);
