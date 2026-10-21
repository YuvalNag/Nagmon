import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Play, PlayOptions } from "../../app/play";
import { TALK_TO, testAlwaysEncounter, testQuizTopic, testSeed, testStartMap } from "../../app/playConfig";
import type { Profile, ProfileStore } from "../../core/family/profiles";
import { crumb } from "../../core/game/breadcrumb";
import { FieldLog } from "../../core/game/fieldLog";
import { pages } from "../../core/world/dialog";
import { EventRunner, type EventHost } from "../../core/world/events";
import type { WorldMap } from "../../core/world/mapData";
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
import { BattleScreen } from "../BattleScreen";
import { BagView } from "../BagView";
import { FriendsView } from "../FriendsView";
import { BestiaryScreen } from "../BestiaryScreen";
import { TripScreen } from "../TripScreen";
import { progressPercent, refreshProgress, tripFor, type Trip } from "../../core/game/trips";
import { START_MAP } from "../../game/startMap";
import { IntroScreen } from "../IntroScreen";
import { QuizScreen } from "../QuizScreen";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";

const log = getLogger("nagmon.map");
const field = new FieldLog(getLogger("nagmon.field"));

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
}

type Shown = { kind: "dialog"; pages: string[]; done: () => void } | { kind: "quiz"; session: QuizSession; done: () => void };
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
export function MapScreen({ profile, profiles, onExit, backRef, lifecycle, load = loadGame, openPlay = loadPlay }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [dpad] = useState(() => new DpadState());
  const [ctl, setCtl] = useState<MapController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [menu, setMenu] = useState(0);
  const [note, setNote] = useState(0);
  const [play, setPlay] = useState<Play | null>(null);
  const [world, setWorld] = useState<WorldMap | null>(null);
  const [runner, setRunner] = useState<EventRunner | null>(null);
  const [facing, setFacing] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
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
  // the runner's own state changed (it started, a talk ended): draw again
  const [, setRunnerTick] = useState(0);
  const seq = useRef(0);
  const lastMap = useRef<string | null>(null);
  const tripsRef = useRef<(map: string) => void>(() => {});
  const shown = useRef<Overlay | null>(null);
  shown.current = overlay;
  const dialogAdvance = useRef<(() => void) | null>(null);
  const menuOpen = menu > 0;
  const { avatar } = profile;

  // the map's code and the child's play load side by side
  useEffect(() => {
    let alive = true;
    openPlay({ profiles, profile, seed: testSeed(), log: getLogger("nagmon.play") }).then(
      (p) => {
        if (!alive) return;
        setPlay(p);
        setCoins(p.world.money);
        setIntro(introNeeded(p.world));
      },
      // the map still walks; nobody talks
      (e) => log.error("Could not open the child's play", e),
    );
    return () => {
      alive = false;
    };
  }, [profiles, profile, openPlay]);

  useEffect(() => {
    let alive = true;
    let controller: MapController | null = null;
    load().then(
      ({ startMap }) => {
        if (!alive || !stage.current) return;
        const edge = (selector: string) => stage.current?.parentElement?.querySelector(selector)?.getBoundingClientRect() ?? null;
        controller = startMap({
          parent: stage.current,
          avatar,
          lifecycle,
          map: testStartMap(),
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
          onFacing: (who) => alive && setFacing(who),
          onMap: (w) => {
            if (!alive) return;
            field.mapChange(lastMap.current, w.name);
            lastMap.current = w.name;
            setMapNow(w.name);
            tripsRef.current(w.name);
            crumb.position(w.name, w.start?.x ?? 0, w.start?.y ?? 0);
            setWorld(w);
          },
          onStep: (x, y) => {
            crumb.position(lastMap.current ?? "none", x, y);
            stepRef.current(x, y);
          },
          onBlocked: () => setNote((n) => n + 1),
          onReady: () => alive && setStatus("ready"),
          onError: () => alive && setStatus("failed"),
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
    return () => {
      alive = false;
      controller?.destroy();
      if (currentMap() === controller) setCurrentMap(null);
      if ((window as Debuggable).__nagmonMap === controller) delete (window as Debuggable).__nagmonMap;
    };
  }, [avatar, dpad, load, lifecycle]);

  // the map's people and their words: a runner for each map entered
  useEffect(() => {
    if (!play || !world || intro) return;
    let alive = true;
    const show = (o: Shown) => setOverlay({ ...o, n: ++seq.current });
    const host: EventHost = {
      say: (msgid) =>
        new Promise<void>((resolve) => {
          if (!alive) return resolve();
          field.dialogStart(msgid);
          const since = performance.now();
          show({
            kind: "dialog",
            pages: pages(play.text(msgid)),
            done: () => {
              field.dialogEnd(msgid, performance.now() - since);
              resolve();
            },
          });
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
      changed: () => {
        if (!alive) return;
        setCoins(play.world.money);
        void play.saveWorld();
      },
      warn: (m) => log.warning(m),
    };
    const r = new EventRunner(world.events, play.world, host, { grade: play.profile.grade, today: () => play.today(), talkTo: TALK_TO });
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
  }, [play, world, intro]);

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
    void runner.talk(facing).finally(() => setTalking(false));
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
    if (!ctl || !held) return;
    ctl.pause("talk");
    return () => ctl.resume("talk");
  }, [ctl, held]);

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
    crumb.screen(menuOpen ? "menu" : intro ? "intro" : battle ? "battle" : overlay ? overlay.kind : "map");
  }, [menuOpen, overlay, intro, battle]);

  // a step in the grass may meet a wild creature (not while the map is held: a talk, the owl, the menu)
  stepRef.current = (x, y) => {
    if (!play || !world || !encounters || held || menuOpen) return;
    const mine = partnerOf(play.world);
    if (!mine) return;
    const wild = encounters.step(world, x, y, mine.level);
    if (!wild) return;
    dpad.clear();
    setBattle({ wild, map: world.name });
  };

  const canTalk = !held && !!facing && !!runner && runner.talkable(facing);

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
          <Tap id="map_back" className="primary" onTap={onExit}>
            {t("mapToWhoPlays")}
          </Tap>
        </div>
      )}
      {status === "ready" && coins !== null && overlay?.kind !== "quiz" && !intro && !battle && (
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
            {canTalk && (
              <Tap id="map_talk" className="map-talk primary" onTap={talk}>
                {t("mapTalk")}
              </Tap>
            )}
          </div>
        </ScreenTime>
      )}
      {intro && play && !menuOpen && status === "ready" && (
        <IntroScreen play={play} advanceRef={dialogAdvance} onChanged={() => setCoins(play.world.money)} onDone={() => setIntro(false)} />
      )}
      {battle && play && !menuOpen && status === "ready" && (
        <BattleScreen
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
        />
      )}
      {/* the pause menu, opened as the map came up, stays on top of a dialog that starts under it */}
      {overlay?.kind === "dialog" && !menuOpen && (
        <ScreenTime key={`dialog-${overlay.n}`}>
          <Dialog pages={overlay.pages} onDone={closeOverlay} advanceRef={dialogAdvance} />
        </ScreenTime>
      )}
      {overlay?.kind === "quiz" && play && !menuOpen && (
        <ScreenTime key={`quiz-${overlay.n}`}>
          <QuizScreen
            session={overlay.session}
            text={(id) => play.text(id)}
            subjectTitle={(s) => play.subjects.title(s)}
            onClose={closeOverlay}
          />
        </ScreenTime>
      )}
      {menuOpen && panel === "trips" && play && (
        <TripScreen
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
        />
      )}
      {menuOpen && panel === "friends" && play && <FriendsView play={play} onClose={() => setPanel(null)} />}
      {menuOpen && panel === "bag" && play && <BagView play={play} onClose={() => setPanel(null)} />}
      {menuOpen && panel === "bestiary" && play && <BestiaryScreen play={play} onClose={() => setPanel(null)} />}
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
