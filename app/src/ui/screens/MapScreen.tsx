import { lazy, type MutableRefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Play, PlayOptions } from "../../app/play";
import { testAlwaysEncounter, testHour, testQuizTopic, testSeed, testStartMap } from "../../app/playConfig";
import type { Profile, ProfileStore } from "../../core/family/profiles";
import { crumb } from "../../core/game/breadcrumb";
import { FieldLog } from "../../core/game/fieldLog";
import { type Chip, Director } from "../../core/world/director";
import { pages } from "../../core/world/dialog";
import { EventRunner, type EventHost, type Found, type People, type ScreenKind } from "../../core/world/events";
import { inBox, type Placement, type WorldMap } from "../../core/world/mapData";
import { phaseOf } from "../../core/world/npcs";
import { resolve as resolvePeople } from "../../core/world/resolver";
import { QuizSession } from "../../core/world/quiz";
import { currentMap, setCurrentMap } from "../../game/current";
import type { MapController, MapLifecycle } from "../../game/mapGame";
import { gameClock } from "../../platform/lifecycle";
import { t } from "../../i18n";
import { getLogger } from "../../platform/appLog";
import { Dialog } from "../Dialog";
import { DPad } from "../DPad";
import { DpadState } from "../dpadState";
import { partner as partnerOf } from "../../core/game/collection";
import { Encounters, type Wild } from "../../core/game/encounters";
import { introNeeded } from "../../core/game/intro";
import { directoryOf } from "../../core/game/objects";
import { creatureOfDay, CREATURE_BOOST, tvData } from "../../core/game/tv";
import { ChestWrongCard, FactCard, FoundCard, TopicsCard } from "../WorldCards";
import { progressPercent, refreshProgress, tripFor, type Trip } from "../../core/game/trips";
import { PlaceSaver, type Place } from "../../core/world/place";
import { START_MAP } from "../../game/startMap";
import type { Lesson } from "../../core/game/lessons";
import { loadGameLessons } from "../tutor/lessonData";
import { Bag, Battle, Bestiary, Friends, Intro, Later, Quiz, Rest, Shop, Trips, Tutor, preloadSoon } from "../lazy";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";

// the working objects' screens load when the first one is opened: the start script stays small
const ObjectScreen = lazy(() => import("../pc/ObjectScreen").then((m) => ({ default: m.ObjectScreen })));

const log = getLogger("nagmon.map");
const field = new FieldLog(getLogger("nagmon.field"));

/** Where an egg placed on a map with no wild creatures of its own warms: the town's own zone. */
export const DEFAULT_ZONE = "nagmon_route1";

/** How long the "closed way" note stays up. */
export const NOTE_MS = 3500;
/** CSS px kept clear between the d-pad (or the talk button) and the hero. */
export const PAD_GAP = 8;

type Load = () => Promise<typeof import("../../game/mapGame")>;
type LoadPlay = (opts: PlayOptions) => Promise<Play>;

// Phaser is fetched only when a map opens: "who plays" starts without it
const loadGame: Load = () => import("../../game/mapGame");
// so is the learning core, with its content
const loadPlay: LoadPlay = async (opts) => (await import("../../app/play")).openPlay(opts);

interface Props {
  /** The child playing. */
  profile: Profile;
  profiles: ProfileStore;
  /** Back to "who plays". */
  onExit: () => void;
  /** Android's back button on the map: App calls it (the menu, a dialog, a question). */
  backRef: MutableRefObject<(() => void) | null>;
  /** The app's lifecycle: the map pauses in the background. */
  lifecycle?: MapLifecycle;
  load?: Load;
  openPlay?: LoadPlay;
  /** How long the map may take to open before it says so (ms). */
  openWaitMs?: number;
}

/** A map that is not open after this long is stuck: the child gets a message and a button, not a black screen. */
const OPEN_WAIT_MS = 10_000;

type Shown =
  | { kind: "dialog"; pages: string[]; done: () => void }
  | { kind: "quiz"; session: QuizSession; done: () => void }
  | { kind: "tutor"; institute: string; done: () => void }
  /** A whole screen of a place (the shop, the Rest Center), opened by an event. */
  | { kind: "screen"; screen: ScreenKind; arg: string; done: () => void }
  /** The world's small cards: what a chest gave, the choice after a wrong answer at a chest, a sign's fact. */
  | { kind: "found"; found: Found; done: () => void }
  | { kind: "chest-wrong"; choose: (c: "again" | "gift" | "leave") => void; done: () => void }
  | { kind: "fact"; fact: { emoji: string; text: string }; done: () => void }
  /** The topic chips of a person of the world: tapping one answers with its id, "bye" (or back) with null. */
  | { kind: "topics"; speaker: string; chips: readonly Chip[]; choose: (id: string | null) => void; done: () => void };
/** What lies over the map: a dialog or a question, each its own screen (`n`). */
type Overlay = Shown & { n: number };

type Debuggable = Window & {
  __nagmonMap?: MapController;
};


/** A small coin, drawn: the font has no coin sign. */
function Coin() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#f4c542" stroke="#9a6b00" strokeWidth="2" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#c99a1c" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * The map (milestones M3, M4): the Phaser scene fills the screen, the
 * d-pad sits at the bottom left, the menu button and the child's name at
 * the top, the coins at the other top corner. Standing in front of
 * someone who has something to say, a "talk" button appears at the
 * bottom right, under the right thumb. A talk (its dialogs and its
 * question) holds the map still; the menu (and Android's back) pauses the
 * game: continue, or back to "who plays".
 */
export function MapScreen({ profile, profiles, onExit, backRef, lifecycle, load = loadGame, openPlay = loadPlay, openWaitMs = OPEN_WAIT_MS }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [dpad] = useState(() => new DpadState());
  const [ctl, setCtl] = useState<MapController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  // "try again" after a map that did not open
  const [attempt, setAttempt] = useState(0);
  const [menu, setMenu] = useState(0);
  const [note, setNote] = useState(0);
  const [play, setPlay] = useState<Play | null>(null);
  const [world, setWorld] = useState<WorldMap | null>(null);
  const [runner, setRunner] = useState<EventRunner | null>(null);
  const [facing, setFacing] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // the tutor's lessons, read once the child's play is open
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const tutorBack = useRef<(() => void) | null>(null);
  const [coins, setCoins] = useState<number | null>(null);
  // the owl's intro, for a child who has not had it: placement, then the choice of a creature
  const [intro, setIntro] = useState(false);
  // a wild creature met in the grass: one friendly battle
  const [battle, setBattle] = useState<{ wild: Wild; map: string; trip?: Trip } | null>(null);
  // the menu's pages: Mila's vehicle and the bestiary; a trip asked for waits until the menu is closed
  const [panel, setPanel] = useState<"trips" | "bestiary" | "bag" | "friends" | null>(null);
  const [pending, setPending] = useState<{ map: string; at: { x: number; y: number } | null } | null>(null);
  const [mapNow, setMapNow] = useState<string | null>(null);
  const battleLeave = useRef<(() => void) | null>(null);
  const stepRef = useRef<(x: number, y: number) => void>(() => {});
  // the people of the world standing on this map now (decided as the map opened) and the one who speaks for them
  const placedRef = useRef<{ map: string; list: Placement[] } | null>(null);
  const placeRef = useRef<(w: WorldMap) => Promise<Placement[]>>(async () => []);
  // the runner's own state changed (it started, a talk ended): draw again
  const [, setRunnerTick] = useState(0);
  const seq = useRef(0);
  const lastMap = useRef<string | null>(null);
  // where the child stands is saved with the world (core/world/place.ts); the map asks for it as it opens
  const playReady = useRef<{ promise: Promise<Play | null>; resolve: (p: Play | null) => void } | null>(null);
  if (!playReady.current) {
    let resolve: (p: Play | null) => void = () => {};
    playReady.current = { promise: new Promise<Play | null>((r) => (resolve = r)), resolve };
  }
  const saver = useRef<PlaceSaver | null>(null);
  const tripsRef = useRef<(map: string) => void>(() => {});
  const shown = useRef<Overlay | null>(null);
  shown.current = overlay;
  const dialogAdvance = useRef<(() => void) | null>(null);
  // Android's back inside a place's screen: one step back, or out
  const screenBack = useRef<(() => void) | null>(null);
  const menuOpen = menu > 0;
  const { avatar } = profile;

  // the child's people: what each remembers, and what they say (core/world/director.ts)
  const director = useMemo(
    () =>
      play
        ? new Director({
            npcs: play.npcs,
            memory: play.world.npcs,
            today: () => play.today(),
            hour: () => play.clock().getHours(),
            hero: () => profile.name,
            // who else is here today, for the "who is in town" topic
            town: () => (placedRef.current?.list ?? []).map((p) => play.npcs[p.slug]?.name ?? "").filter(Boolean),
          })
        : null,
    [play, profile.name],
  );

  // who stands on a map as it opens: the resolver's answer for this day and hour (core/world/resolver.ts)
  placeRef.current = async (w: WorldMap) => {
    const p = await playReady.current?.promise;
    if (!p || !w.placement || !Object.keys(p.npcs).length) return [];
    if (p.world.npcSeed === null) {
      // a number of this child's own, made once: another child's town has other days
      p.world.npcSeed = Math.floor(Math.random() * 0x100000000);
      void p.saveWorld();
    }
    const now = p.clock();
    const list = resolvePeople({
      map: w.name,
      placement: w.placement,
      npcs: p.npcs,
      day: p.today(),
      phase: phaseOf(now.getHours()),
      seed: p.world.npcSeed,
      flags: (f) => p.world.variables.has(f),
      friendship: (s) => p.world.npcs.get(s)?.lvl ?? 0,
    });
    const placed = list.map(({ slug, x, y, facing }) => ({ slug, x, y, facing }));
    placedRef.current = { map: w.name, list: placed };
    return placed;
  };

  // the map's code and the child's play load side by side
  useEffect(() => {
    let alive = true;
    openPlay({ profiles, profile, seed: testSeed(), hour: testHour(), log: getLogger("nagmon.play") }).then(
      (p) => {
        if (!alive) return;
        const saves = new PlaceSaver(
          (place) => {
            // the intro starts over from the start: no place until it is done
            if (introNeeded(p.world)) return;
            p.world.place = place;
            void p.saveWorld();
          },
          () => Date.now(),
        );
        saver.current = saves;
        playReady.current?.resolve(p);
        setPlay(p);
        setCoins(p.world.money);
        setIntro(introNeeded(p.world));
      },
      // the map still walks; nobody talks
      (e) => {
        playReady.current?.resolve(null);
        log.error("Could not open the child's play", e);
      },
    );
    return () => {
      alive = false;
      // leaving (the menu's exit, Android back): what a step held back is written now
      saver.current?.flush();
      saver.current = null;
    };
  }, [profiles, profile, openPlay]);

  useEffect(() => {
    let alive = true;
    let controller: MapController | null = null;
    // a map that never opens (a stuck load) is told, not left black
    const stuck = setTimeout(() => {
      if (!alive) return;
      log.error(`The map did not open within ${openWaitMs / 1000} s (map code ${controller ? "loaded" : "not loaded"}, paused: ${controller ? JSON.stringify(controller.debug()?.paused ?? controller.paused) : "?"})`);
      setStatus("failed");
    }, openWaitMs);
    load().then(
      ({ startMap }) => {
        if (!alive || !stage.current) return;
        const edge = (selector: string) => stage.current?.parentElement?.querySelector(selector)?.getBoundingClientRect() ?? null;
        controller = startMap({
          parent: stage.current,
          avatar,
          lifecycle,
          map: testStartMap(),
          resume: async () => {
            const p = await playReady.current?.promise;
            return p && !introNeeded(p.world) ? p.world.place : null;
          },
          clock: () => gameClock.now(),
          input: () => dpad.take(),
          release: () => dpad.clear(),
          // the camera keeps the hero right of the d-pad (bottom left)
          reservedLeft: () => {
            const pad = edge(".dpad");
            return pad ? pad.right + PAD_GAP : 0;
          },
          // and left of the talk button while it shows (bottom right); with
          // nobody to talk to the camera stops at the map's edge as before
          reservedRight: () => {
            const talk = edge(".map-talk");
            return talk ? window.innerWidth - talk.left + PAD_GAP : 0;
          },
          place: (w) => placeRef.current(w),
          onFacing: (who) => alive && setFacing(who),
          onMap: (w, there) => {
            const at: Place = there ?? { map: w.name, x: w.start?.x ?? 0, y: w.start?.y ?? 0, facing: "up" };
            if (!alive) return;
            field.mapChange(lastMap.current, w.name);
            lastMap.current = w.name;
            setMapNow(w.name);
            tripsRef.current(w.name);
            crumb.position(w.name, at.x, at.y);
            saver.current?.now(at);
            setWorld(w);
          },
          onStep: (x, y, facing) => {
            crumb.position(lastMap.current ?? "none", x, y);
            if (lastMap.current) saver.current?.step({ map: lastMap.current, x, y, facing: facing ?? "down" });
            stepRef.current(x, y);
          },
          onBlocked: () => setNote((n) => n + 1),
          onReady: () => {
            if (!alive) return;
            clearTimeout(stuck);
            setStatus("ready");
          },
          onError: () => {
            if (!alive) return;
            clearTimeout(stuck);
            setStatus("failed");
          },
        });
        setCurrentMap(controller);
        // the browser tests and the emulator check read the map through it
        (window as Debuggable).__nagmonMap = controller;
        setCtl(controller);
      },
      (e) => {
        log.error("Could not load the map's code", e);
        if (alive) setStatus("failed");
      },
    );
    // in the background the app may be ended without a word: write the place now
    const offBackground = lifecycle?.onBackground(() => saver.current?.flush());
    return () => {
      alive = false;
      clearTimeout(stuck);
      offBackground?.();
      controller?.destroy();
      if (currentMap() === controller) setCurrentMap(null);
      if ((window as Debuggable).__nagmonMap === controller) delete (window as Debuggable).__nagmonMap;
    };
  }, [avatar, dpad, load, lifecycle, openWaitMs, attempt]);

  useEffect(() => {
    if (!play) return;
    let alive = true;
    void loadGameLessons().then((l) => alive && setLessons(l));
    return () => {
      alive = false;
    };
  }, [play]);

  // the rarely used screens come in while the map is idle, the battle first
  useEffect(() => (play ? preloadSoon() : undefined), [play]);

  // the map's people and their words: a runner for each map entered
  useEffect(() => {
    if (!play || !world || intro) return;
    let alive = true;
    const show = (o: Shown) => setOverlay({ ...o, n: ++seq.current });
    const host: EventHost = {
      say: (msgid, _speaker, lead) =>
        new Promise<void>((resolve) => {
          if (!alive) return resolve();
          field.dialogStart(msgid);
          const since = performance.now();
          show({
            kind: "dialog",
            // what the person opened with, then the event's own words: one box
            pages: [...(lead ?? []).flatMap((x) => pages(x)), ...pages(play.text(msgid))],
            done: () => {
              field.dialogEnd(msgid, performance.now() - since);
              resolve();
            },
          });
        }),
      line: (text) =>
        new Promise<void>((resolve) => {
          if (!alive) return resolve();
          show({ kind: "dialog", pages: pages(text), done: resolve });
        }),
      topics: (slug, chips) =>
        new Promise<string | null>((resolve) => {
          if (!alive) return resolve(null);
          // closing the card (Android's back) is "bye"
          show({ kind: "topics", speaker: play.npcs[slug]?.name ?? "", chips, choose: resolve, done: () => resolve(null) });
        }),
      quiz: (topic, context, answered) =>
        new Promise<void>((resolve) => {
          if (!alive) return resolve();
          const session = new QuizSession(
            play.engine,
            { topic: testQuizTopic() ?? topic, context, maxChoices: play.maxChoices },
            () => gameClock.now(),
            (_outcome, word) => {
              // the learner first, and at once: a kill now loses nothing
              void play.saveLearner();
              play.logAnswer(session, context);
              answered(word);
            },
            (m) => log.warning(m),
          );
          show({ kind: "quiz", session, done: resolve });
        }),
      openTutor: (institute) =>
        new Promise<void>((resolve) => {
          if (!alive) return resolve();
          show({ kind: "tutor", institute, done: resolve });
        }),
      screen: (kind, arg) =>
        new Promise<void>((resolve) => {
          if (!alive) return resolve();
          play.field.note("screen", { open: kind });
          show({ kind: "screen", screen: kind, arg, done: resolve });
        }),
      found: (found) =>
        new Promise<void>((resolve) => {
          if (!alive) return resolve();
          play.field.note("found", { how: found.how, ...(found.prize.item ? { item: found.prize.item, n: found.prize.n } : { coins: found.prize.coins }) });
          show({ kind: "found", found, done: resolve });
        }),
      chestWrong: (chest) =>
        new Promise((resolve) => {
          if (!alive) return resolve("leave");
          play.field.note("chest", { id: chest, wrong: 1 });
          // closing the card (Android's back) leaves the chest as it is
          show({ kind: "chest-wrong", choose: resolve, done: () => resolve("leave") });
        }),
      fact: (fact) =>
        new Promise<void>((resolve) => {
          if (!alive) return resolve();
          show({ kind: "fact", fact, done: resolve });
        }),
      changed: () => {
        if (!alive) return;
        setCoins(play.world.money);
        void play.saveWorld();
      },
      warn: (m) => log.warning(m),
    };
    // the director speaks for the people of the world; the runner asks it who is on this map
    const people: People | undefined = director
      ? {
          defined: (s) => director.defined(s),
          greet: (s) => director.greet(s),
          chips: (s) => director.chips(s),
          topic: (s, id) => director.topic(s, id),
          farewell: (s) => director.farewell(s),
          level: (s) => director.level(s),
          flags: (s) => director.flags(s),
          placed: () => (placedRef.current?.map === world.name ? placedRef.current.list : []),
        }
      : undefined;
    const r = new EventRunner(world.events, play.world, host, {
      grade: play.profile.grade,
      today: () => play.today(),
      hour: () => play.clock().getHours(),
      ...(people ? { people } : {}),
      objects: {
        economy: play.economy,
        loot: play.loot,
        facts: play.facts,
        pools: play.pools,
        zone: world.encounters[0]?.table ?? DEFAULT_ZONE,
        defs: play.objects,
        mail: play.mail,
        people: new Set(directoryOf(play.objects).map((p) => p.slug)),
      },
    });
    const waiting = r.waiting();
    if (waiting.length) log.info(`${world.name}: ${waiting.length} events wait for later milestones`);
    setRunner(r);
    // the events that hold run now (a reward left from before shows its dialog)
    void r.start().finally(() => alive && setRunnerTick((n) => n + 1));
    return () => {
      alive = false;
      setRunner(null);
      // a talk under way ends: its dialog or question is answered as closed
      const o = shown.current;
      shown.current = null;
      setOverlay(null);
      o?.done();
    };
  }, [play, world, intro, director]);

  const encounters = useMemo(
    () =>
      play
        ? new Encounters({
            tables: play.encounters,
            monsters: play.monsters,
            // by day from six in the morning to six in the evening, by the phone's clock
            daytime: () => {
              const h = new Date().getHours();
              return h >= 6 && h < 18;
            },
            always: testAlwaysEncounter(),
            // the TV's creature of the day is met a little more in the grass that day (a hint, never a prize)
            boost: () => {
              const tv = play.objects["tv"];
              const c = tv ? creatureOfDay(tvData(tv.data), play.monsters, play.today()) : null;
              return c ? { species: c.species, factor: CREATURE_BOOST } : null;
            },
          })
        : null,
    [play],
  );

  /** A short word from the game (a zone done, a badge): shown as a dialog. */
  const tell = useCallback((texts: string[]) => {
    if (!texts.length) return;
    setOverlay({ kind: "dialog", pages: texts.flatMap((x) => pages(x)), done: () => {}, n: ++seq.current });
  }, []);

  /** Marks the zones done by now, and says so. */
  const checkTrips = useCallback(() => {
    if (!play || !play.trips.length) return;
    const r = refreshProgress(play.world, play.trips);
    const say: string[] = [];
    for (const k of r.zonesDone) {
      const [tid, zid] = k.split("/");
      const trip = play.trips.find((x) => x.id === tid);
      play.field.note("zone", { done: k });
      say.push(t("zoneDoneMsg", { zone: trip?.zones.find((z) => z.id === zid)?.title ?? zid! }));
    }
    for (const id of r.masterReady) {
      const trip = play.trips.find((x) => x.id === id)!;
      if (r.zonesDone.some((k) => k.startsWith(`${id}/`))) say.push(t("masterReadyMsg", { badge: trip.master.badgeTitle }));
    }
    if (r.zonesDone.length) void play.saveWorld();
    tell(say);
  }, [play, tell]);

  // entering a zone's map is a visit; the town is no zone
  tripsRef.current = (map) => {
    if (!play) return;
    const found = tripFor(play.trips, map);
    play.world.trips.at = found ? `${found.trip.id}/${found.zone.id}` : null;
    if (found && !play.world.trips.visited.includes(play.world.trips.at!)) play.world.trips.visited.push(play.world.trips.at!);
    if (found) {
      play.field.note("zone", { enter: play.world.trips.at! });
      void play.saveWorld();
    }
  };

  // the vehicle goes once the menu is closed and the map runs again
  useEffect(() => {
    if (!pending || menuOpen || !ctl) return;
    ctl.goTo(pending.map, pending.at);
    setPending(null);
  }, [pending, menuOpen, ctl]);

  const closeOverlay = useCallback(() => {
    const o = shown.current;
    shown.current = null;
    setOverlay(null);
    o?.done();
  }, []);

  const talk = useCallback(() => {
    if (!runner || !facing || !runner.talkable(facing)) return;
    dpad.clear();
    setTalking(true);
    // a mission done in a talk may finish a zone: check the trips after it
    void runner.talk(facing).finally(() => {
      setTalking(false);
      checkTrips();
    });
  }, [runner, facing, dpad, checkTrips]);

  const ask = useCallback(() => {
    if (!runner || !facing || !runner.askable(facing)) return;
    dpad.clear();
    setTalking(true);
    void runner.ask(facing).finally(() => setTalking(false));
  }, [runner, facing, dpad]);

  const openMenu = useCallback(() => {
    dpad.clear();
    setMenu((m) => (m > 0 ? m : m + 1));
  }, [dpad]);

  const closeMenu = useCallback(() => {
    setPanel(null);
    setMenu(0);
  }, []);

  // the menu holds the game still (the loop and the music), even one opened while it loaded
  useEffect(() => {
    if (!ctl || !menuOpen) return;
    ctl.pause("menu");
    return () => ctl.resume("menu");
  }, [ctl, menuOpen]);

  // a talk holds it still too (the d-pad lets go), with the music on
  const held = talking || overlay !== null || intro || battle !== null;
  useEffect(() => {
    // not before the map is open: its loader runs in the game loop, which a pause puts to sleep
    if (!ctl || !held || status !== "ready") return;
    ctl.pause("talk");
    return () => ctl.resume("talk");
  }, [ctl, held, status]);

  // Android's back: the dialog goes on, the question closes, the menu opens and closes
  useEffect(() => {
    backRef.current = () => {
      if (status === "failed") onExit();
      else if (menuOpen && panel) setPanel(null);
      else if (menuOpen) closeMenu();
      else if (battle) battleLeave.current?.();
      else if (intro) dialogAdvance.current?.();
      else if (overlay?.kind === "dialog") dialogAdvance.current?.();
      else if (overlay?.kind === "quiz") closeOverlay();
      else if (overlay?.kind === "tutor") (tutorBack.current ?? closeOverlay)();
      else if (overlay?.kind === "screen") (screenBack.current ?? closeOverlay)();
      else if (overlay) closeOverlay();
      else if (held) return;
      else openMenu();
    };
    return () => {
      backRef.current = null;
    };
  }, [backRef, menuOpen, openMenu, closeMenu, status, onExit, overlay, held, closeOverlay, intro, battle, panel]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(0), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note]);

  // the last screen, for the parent's "something is wrong"
  useEffect(() => {
    crumb.screen(menuOpen ? "menu" : intro ? "intro" : battle ? "battle" : overlay ? (overlay.kind === "screen" ? overlay.screen : overlay.kind) : "map");
  }, [menuOpen, overlay, intro, battle]);

  // and the wild creature, for the report's battle part (a question in a battle hides the battle's own page)
  useEffect(() => {
    crumb.battle(battle ? battle.wild.species : null);
    return () => crumb.battle(null);
  }, [battle]);

  // a step in the grass may meet a wild creature (not while the map is held: a talk, the owl, the menu)
  stepRef.current = (x, y) => {
    if (!play || !world || !encounters || held || menuOpen) return;
    const mine = partnerOf(play.world);
    if (!mine) return;
    // standing in the grass, a fight is likely: its screen is fetched before it is needed
    if (world.encounters.some((a) => inBox(a.box, x, y))) void Battle.preload().catch(() => {});
    const wild = encounters.step(world, x, y, mine.level);
    if (!wild) return;
    dpad.clear();
    setBattle({ wild, map: world.name });
  };

  // a friend hatched from an egg (a right answer anywhere warmed it): told once the map is free
  useEffect(() => {
    if (!play || held || menuOpen || !play.hatched.length) return;
    const names = play.hatched.splice(0).map((h) => t("eggHatched", { name: play.text(h.species) }));
    tell(names);
  }, [play, held, menuOpen, tell, overlay, battle]);

  const canTalk = !held && !!facing && !!runner && runner.talkable(facing);
  const canAsk = !held && !!facing && !!runner && runner.askable(facing);

  return (
    <main
      className="screen map-screen"
      data-screen="play"
      data-map={status}
      data-play={play ? "ready" : "loading"}
      data-talking={held}
      data-facing={facing ?? ""}
    >
      <div ref={stage} className="map-stage" data-id="map_stage" />
      {status === "loading" && <p className="map-loading">{t("mapLoading")}</p>}
      {status === "failed" && (
        <div className="map-overlay" data-screen="map-failed">
          <p className="notice">{t("mapFailed")}</p>
          <Tap
            id="map_retry"
            className="primary"
            onTap={() => {
              setCtl(null);
              setWorld(null);
              setStatus("loading");
              setAttempt((n) => n + 1);
            }}
          >
            {t("mapTryAgain")}
          </Tap>
          <Tap id="map_back" className="quiet" onTap={onExit}>
            {t("mapToWhoPlays")}
          </Tap>
        </div>
      )}
      {status === "ready" && coins !== null && overlay?.kind !== "quiz" && overlay?.kind !== "tutor" && !intro && !battle && (
        <p className="map-coins" data-id="coins" data-coins={coins} role="status" aria-label={t("mapCoins", { coins })}>
          <Coin />
          <span>{coins}</span>
        </p>
      )}
      {status === "ready" && !menuOpen && !held && (
        // a new screen for the fingers: a press from before the map (or on
        // the menu's "continue", or the tap that closed a dialog) counts for
        // nothing. Under the menu and a talk the map's own buttons are gone,
        // not just covered: a finger or TalkBack finds only what is on top.
        <ScreenTime key="map-ready">
          <div className="map-hud">
            <span className="map-name">{profile.name}</span>
            <Tap id="map_menu" className="map-menu" aria-label={t("mapMenu")} onTap={openMenu}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            </Tap>
          </div>
          {note > 0 && (
            <p className="map-note" role="status" data-id="map_note">
              {t("mapClosedWay")}
            </p>
          )}
          <DPad state={dpad} />
          <div className="map-talk-slot">
            {canAsk && (
              <Tap id="map_ask" className="map-ask" onTap={ask}>
                {t("mapAsk")}
              </Tap>
            )}
            {canTalk && (
              <Tap id="map_talk" className="map-talk primary" onTap={talk}>
                {t("mapTalk")}
              </Tap>
            )}
          </div>
        </ScreenTime>
      )}
      {intro && play && !menuOpen && status === "ready" && (
        <Later><Intro.Screen play={play} advanceRef={dialogAdvance} onChanged={() => setCoins(play.world.money)} onDone={() => setIntro(false)} /></Later>
      )}
      {battle && play && !menuOpen && status === "ready" && (
        <Later><Battle.Screen
          play={play}
          wild={battle.wild}
          map={battle.map}
          leaveRef={battleLeave}
          onChanged={() => setCoins(play.world.money)}
          master={battle.trip !== undefined}
          onDone={(won) => {
            encounters?.reset();
            const trip = battle.trip;
            setBattle(null);
            if (trip && won) {
              play.world.trips.badges.push(`${trip.id}/${trip.master.badge}`);
              play.field.note("badge", { trip: trip.id, badge: trip.master.badge });
              void play.saveWorld();
              tell([t("badgeWonMsg", { badge: trip.master.badgeTitle })]);
            } else checkTrips();
          }}
        /></Later>
      )}
      {/* the pause menu, opened as the map came up, stays on top of a dialog that starts under it */}
      {overlay?.kind === "dialog" && !menuOpen && (
        <ScreenTime key={`dialog-${overlay.n}`}>
          <Dialog pages={overlay.pages} onDone={closeOverlay} advanceRef={dialogAdvance} />
        </ScreenTime>
      )}
      {overlay?.kind === "quiz" && play && !menuOpen && (
        <ScreenTime key={`quiz-${overlay.n}`}>
          <Later><Quiz.Screen
            session={overlay.session}
            text={(id) => play.text(id)}
            subjectTitle={(s) => play.subjects.title(s)}
            onClose={closeOverlay}
            notes={{
              lessons,
              save: () => play.world.lessons,
              onUse: (use, skill) => {
                play.world.lessons = use.state;
                play.field.noteUse({ skill, free: use.free, ...(use.free ? {} : { charges: use.state.charges }) });
                void play.saveWorld();
              },
            }}
          /></Later>
        </ScreenTime>
      )}
      {overlay?.kind === "tutor" && play && !menuOpen && (
        <Later><Tutor.Screen
          key={`tutor-${overlay.n}`}
          play={play}
          lessons={lessons}
          institute={overlay.institute}
          backRef={tutorBack}
          onClose={closeOverlay}
          onChanged={() => setCoins(play.world.money)}
        /></Later>
      )}
      {overlay?.kind === "screen" && overlay.screen === "shop" && play && !menuOpen && (
        <Later><Shop.Screen key={`shop-${overlay.n}`} play={play} backRef={screenBack} onClose={closeOverlay} onChanged={() => setCoins(play.world.money)} /></Later>
      )}
      {overlay?.kind === "found" && play && !menuOpen && <FoundCard key={`found-${overlay.n}`} found={overlay.found} economy={play.economy} onClose={closeOverlay} />}
      {overlay?.kind === "chest-wrong" && !menuOpen && (
        <ChestWrongCard
          key={`wrong-${overlay.n}`}
          onChoose={(c) => {
            // the card closes, and the event goes on with the child's choice
            const o = overlay;
            shown.current = null;
            setOverlay(null);
            o.choose(c);
            o.done();
          }}
        />
      )}
      {overlay?.kind === "fact" && !menuOpen && <FactCard key={`fact-${overlay.n}`} fact={overlay.fact} onClose={closeOverlay} />}
      {overlay?.kind === "topics" && !menuOpen && (
        <TopicsCard
          key={`topics-${overlay.n}`}
          speaker={overlay.speaker}
          chips={overlay.chips}
          onChoose={(id) => {
            // the card closes, and the talk goes on with the child's choice
            const o = overlay;
            shown.current = null;
            setOverlay(null);
            o.choose(id);
            o.done();
          }}
        />
      )}
      {overlay?.kind === "screen" && overlay.screen === "object" && play && play.objects[overlay.arg] && !menuOpen && (
        <Suspense fallback={null}>
          <ObjectScreen key={`object-${overlay.n}`} play={play} def={play.objects[overlay.arg]!} backRef={screenBack} onClose={closeOverlay} onChanged={() => setCoins(play.world.money)} />
        </Suspense>
      )}
      {overlay?.kind === "screen" && overlay.screen === "rest" && play && !menuOpen && (
        <Later><Rest.Screen key={`rest-${overlay.n}`} play={play} backRef={screenBack} onClose={closeOverlay} onChanged={() => setCoins(play.world.money)} /></Later>
      )}
      {menuOpen && panel === "trips" && play && (
        <Later><Trips.Screen
          play={play}
          current={mapNow}
          homeMap={START_MAP}
          go={(map, at) => {
            setPanel(null);
            setMenu(0);
            setPending({ map, at });
          }}
          master={(trip) => {
            const species = trip.master.monster && play.monsters[trip.master.monster] ? trip.master.monster : (trip.zones.flatMap((z) => z.monsters).find((m) => play.monsters[m]) ?? null);
            if (!species) return;
            setPanel(null);
            setMenu(0);
            setBattle({ wild: { species, level: trip.master.level, table: "master" }, map: mapNow ?? "none", trip });
          }}
          onClose={() => setPanel(null)}
          onChanged={() => setCoins(play.world.money)}
        /></Later>
      )}
      {menuOpen && panel === "friends" && play && <Later><Friends.Screen play={play} onClose={() => setPanel(null)} /></Later>}
      {menuOpen && panel === "bag" && play && <Later><Bag.Screen play={play} onClose={() => setPanel(null)} /></Later>}
      {menuOpen && panel === "bestiary" && play && <Later><Bestiary.Screen play={play} onClose={() => setPanel(null)} /></Later>}
      {menuOpen && !panel && (
        <ScreenTime key={`menu-${menu}`}>
          <div className="map-overlay" data-screen="map-menu" role="dialog" aria-label={t("mapPaused")}>
            <h2 className="title">{t("mapPaused")}</h2>
            {play && play.trips[0] && (
              <p className="menu-progress" data-id="menu_progress" role="status">
                {t("menuProgress", { percent: progressPercent(play.world, play.trips[0]) })}
              </p>
            )}
            <div className="row">
              <Tap id="map_continue" className="primary" onTap={closeMenu}>
                {t("mapContinue")}
              </Tap>
              {play && play.trips.length > 0 && (
                <Tap id="map_trips" onTap={() => setPanel("trips")}>
                  {t("menuTrips")}
                </Tap>
              )}
              {play && partnerOf(play.world) && (
                <Tap id="map_friends" onTap={() => setPanel("friends")}>
                  {t("friendsTitle")}
                </Tap>
              )}
              {play && partnerOf(play.world) && (
                <Tap id="map_bag" onTap={() => setPanel("bag")}>
                  {t("bagTitle")}
                </Tap>
              )}
              {play && partnerOf(play.world) && (
                <Tap id="map_bestiary" onTap={() => setPanel("bestiary")}>
                  {t("menuBestiary")}
                </Tap>
              )}
              <Tap id="map_exit" onTap={onExit}>
                {t("mapToWhoPlays")}
              </Tap>
            </div>
          </div>
        </ScreenTime>
      )}
    </main>
  );
}
