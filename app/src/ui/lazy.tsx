/**
 * The heavy screens a child meets only now and then (the battle, the shop,
 * the parents' area, ...) are separate chunks of the build: the start script
 * (what who-plays needs) stays small, and the phone parses less before the
 * first screen. The chunks are files of the app itself (Capacitor loads them
 * from the device, nothing remote). `preload` fetches a chunk ahead of its
 * screen, so a fight starts without waiting.
 */
import { type ComponentType, createElement, lazy, type ReactNode, Suspense, useState } from "react";
import { t } from "../i18n";

interface Chunk<P> {
  /** The screen, loaded on first use. */
  Screen: ComponentType<P>;
  /** Starts fetching the chunk now (safe to call again). */
  preload: () => Promise<unknown>;
}

function chunk<P extends object, M>(load: () => Promise<M>, pick: (m: M) => ComponentType<P>): Chunk<P> {
  let loaded: M | null = null;
  let loading: Promise<M> | null = null;
  const once = () =>
    (loading ??= load().then(
      (m) => (loaded = m),
      (e) => {
        // a failed fetch may be tried again
        loading = null;
        throw e;
      },
    ));
  const Lazy = lazy(async () => ({ default: pick(await once()) as ComponentType<any> })); // eslint-disable-line @typescript-eslint/no-explicit-any
  // Once the chunk is in (preloaded, say) the screen is drawn at once, with no
  // fallback in between; before that it suspends until the chunk arrives. Each
  // screen keeps the way it started with, so a re-render never swaps its type
  // (which would restart a fight in the middle).
  const Screen = (props: P) => {
    const [direct] = useState(() => loaded !== null);
    return direct ? createElement(pick(loaded as M), props) : createElement(Lazy, props as never);
  };
  return { Screen, preload: once };
}

export const Battle = chunk(
  () => import("./BattleScreen"),
  (m) => m.BattleScreen,
);
export const Bag = chunk(
  () => import("./BagView"),
  (m) => m.BagView,
);
export const Rest = chunk(
  () => import("./RestScreen"),
  (m) => m.RestScreen,
);
export const Shop = chunk(
  () => import("./ShopScreen"),
  (m) => m.ShopScreen,
);
export const Friends = chunk(
  () => import("./FriendsView"),
  (m) => m.FriendsView,
);
export const Bestiary = chunk(
  () => import("./BestiaryScreen"),
  (m) => m.BestiaryScreen,
);
export const Trips = chunk(
  () => import("./TripScreen"),
  (m) => m.TripScreen,
);
export const Intro = chunk(
  () => import("./IntroScreen"),
  (m) => m.IntroScreen,
);
export const Quiz = chunk(
  () => import("./QuizScreen"),
  (m) => m.QuizScreen,
);
export const Tutor = chunk(
  () => import("./tutor/TutorScreen"),
  (m) => m.TutorScreen,
);
export const Evolution = chunk(
  () => import("./evolution/EvolutionScene"),
  (m) => m.EvolutionScene,
);
export const Parents = chunk(
  () => import("./screens/parents/ParentsArea"),
  (m) => m.ParentsArea,
);

/**
 * What shows while a chunk comes in: at once (no import of its own), with a
 * word on it, never a blank screen. On the map it lies over the map like the
 * screens do; elsewhere it is a screen of its own.
 */
export function Wait({ over = true }: { over?: boolean }) {
  return over ? (
    <div className="map-overlay" data-screen="loading" role="status" aria-busy="true">
      <p className="title">{t("screenLoading")}</p>
    </div>
  ) : (
    <main className="screen" data-screen="loading" role="status" aria-busy="true">
      <p className="title">{t("screenLoading")}</p>
    </main>
  );
}

/** A lazy screen with its instant fallback. */
export function Later({ children, over = true }: { children: ReactNode; over?: boolean }) {
  return <Suspense fallback={<Wait over={over} />}>{children}</Suspense>;
}

const ALL = [Battle, Bag, Friends, Shop, Rest, Quiz, Bestiary, Trips, Tutor, Intro, Evolution, Parents];

/** Every chunk at once (tests: the screens are then there as soon as they are asked for). */
export function preloadAll(): Promise<unknown> {
  return Promise.all(ALL.map((c) => c.preload()));
}

/** The chunks a child is likely to need soon, fetched when the machine is idle (the battle first). */
export function preloadSoon(): () => void {
  const order = [Battle, Bag, Friends, Shop, Rest, Quiz, Bestiary, Trips, Tutor];
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const next = () => {
    const c = order[i++];
    if (!c) return;
    c.preload().catch(() => {}); // a failure here only means it is fetched when needed
    timer = setTimeout(next, 400);
  };
  timer = setTimeout(next, 1200);
  return () => clearTimeout(timer);
}
